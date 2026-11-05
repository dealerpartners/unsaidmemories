// ---------------------------------------------------------------------------
// suppliers/push.ts — POD order submission + tracking sync for Unsaid.
//
// Discipline adapted from UnSaid Memories src/lib/suppliers/cj-sync.ts
// (pushCjSupplierOrder / syncCjSupplierOrderTracking):
//   • Lines are grouped per supplier via variant_fulfillment_routes
//     (priority order) — a multi-supplier order splits into one provider
//     order per supplier, never one mixed order.
//   • A line with NO provider variant id is REFUSED BY NAME before any
//     money moves; a group containing a refused line is not pushed at all.
//   • A designed line with no print file is refused by name too — the
//     provider cannot print what it cannot see.
//   • A fulfillment row is marked `submitted` ONLY with a real provider
//     order id returned by the provider. Failures are recorded as
//     `failed` with the provider's error, never as success.
//     (fulfillment_orders.status check constraint — verified live:
//     draft | submitted | in_production | shipped | delivered | failed |
//     cancelled. The API result vocabulary keeps "ordered"/"push_failed"
//     group statuses; the DB writes use the constrained values.)
//   • Push is idempotent: an order item already on an open fulfillment
//     for the same supplier is skipped, so retries never double-order.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";
import { parseShipTo } from "@/lib/orders/erp";
import {
  printfulCreateDraftOrder, printfulConfirmOrder, printfulGetOrder,
  printfulConfigured, printfulMissingConfig, type PrintfulOrderItem,
} from "@/lib/suppliers/printful";
import { dispatchMappedGroup, claimDraftFulfillment } from "@/lib/fulfillment/dispatch";
import { printfulPackingSlip } from "@/lib/fulfillment/payload-factory";
import { getIntegrationKey } from "@/lib/integrations/keys";

const TENANT_ID = PLATFORM_TENANT_ID;
const db = () => createServerClient();

export type PushRefusal = { itemId: string; description: string; reason: string };
export type PushGroupResult = {
  supplierSlug: string; status: "ordered" | "refused" | "push_failed" | "skipped";
  providerOrderId?: string; error?: string; items: string[];
};
export type PushResult = { orderId: string; groups: PushGroupResult[]; refusals: PushRefusal[] };

type ResolvedLine = {
  itemId: string; description: string; quantity: number;
  supplierId: string; supplierSlug: string;
  catalogVariantId: string | null; externalVariantId: string | null;
  designFileUrl: string | null;
  /** The frozen design data from the order line (canvas node tree) —
   *  carried onto fulfillment_items so fulfillment data is the design
   *  itself, not just the rendered print-file URL. */
  designSnapshot: unknown;
};

async function resolveLines(storefrontOrderId: string): Promise<{ lines: ResolvedLine[]; refusals: PushRefusal[] }> {
  const sb = db();
  const { data: items } = await sb.from("order_items")
    .select("id, product_variant_id, supplier_catalog_variant_id, design_publication_id, design_file_snapshot_url, design_snapshot, quantity, unit_price")
    .eq("order_id", storefrontOrderId).eq("tenant_id", TENANT_ID);
  const lines: ResolvedLine[] = [];
  const refusals: PushRefusal[] = [];
  for (const item of items || []) {
    const description = `order item ${String(item.id).slice(0, 8)}`;
    // Route: explicit fulfillment route by priority, else the item's own
    // supplier catalog variant decides the supplier.
    let supplierId: string | null = null;
    let catalogVariantId: string | null = item.supplier_catalog_variant_id || null;
    if (item.product_variant_id) {
      const { data: routes } = await sb.from("variant_fulfillment_routes")
        .select("supplier_id, supplier_catalog_variant_id")
        .eq("product_variant_id", item.product_variant_id).eq("tenant_id", TENANT_ID)
        .eq("is_active", true).order("priority", { ascending: true }).limit(1);
      if (routes?.length) {
        supplierId = routes[0].supplier_id;
        catalogVariantId = routes[0].supplier_catalog_variant_id || catalogVariantId;
      }
    }
    if (!supplierId && catalogVariantId) {
      const { data: variant } = await sb.from("supplier_catalog_variants")
        .select("supplier_id").eq("id", catalogVariantId).maybeSingle();
      supplierId = variant?.supplier_id || null;
    }
    if (!supplierId || !catalogVariantId) {
      refusals.push({ itemId: item.id, description, reason: "no supplier route and no supplier catalog variant — cannot determine provider variant id" });
      continue;
    }
    const { data: variant } = await sb.from("supplier_catalog_variants")
      .select("id, external_id, supplier_id").eq("id", catalogVariantId).maybeSingle();
    const { data: supplier } = await sb.from("suppliers").select("id, slug").eq("id", supplierId).maybeSingle();
    if (!variant?.external_id) {
      refusals.push({ itemId: item.id, description, reason: "supplier catalog variant has no external (provider) variant id" });
      continue;
    }
    if (item.design_publication_id && !item.design_file_snapshot_url) {
      refusals.push({ itemId: item.id, description, reason: "designed item has no print file snapshot — provider cannot print it" });
      continue;
    }
    lines.push({
      itemId: item.id, description, quantity: Number(item.quantity) || 1,
      supplierId, supplierSlug: supplier?.slug || "unknown",
      catalogVariantId, externalVariantId: variant.external_id,
      designFileUrl: item.design_file_snapshot_url || null,
      designSnapshot: (item as { design_snapshot?: unknown }).design_snapshot ?? null,
    });
  }
  return { lines, refusals };
}

export async function pushOrderToSuppliers(erpOrderId: string): Promise<PushResult> {
  const sb = db();
  const { data: erpOrder } = await sb.from("erp_orders")
    .select("id, order_number, source_order_id, customer_email, status")
    .eq("id", erpOrderId).eq("tenant_id", TENANT_ID).maybeSingle();
  if (!erpOrder) throw new Error("order not found");
  if (!erpOrder.source_order_id) {
    throw new Error("order has no linked storefront order — POD push needs order_items (design + supplier variants live there)");
  }
  const storefrontOrderId = erpOrder.source_order_id;
  const { data: storefront } = await sb.from("orders")
    .select("id, shipping_address, customer_id").eq("id", storefrontOrderId).maybeSingle();
  const { lines, refusals } = await resolveLines(storefrontOrderId);

  // Group per supplier.
  const groups = new Map<string, ResolvedLine[]>();
  for (const line of lines) {
    const list = groups.get(line.supplierSlug) || [];
    list.push(line); groups.set(line.supplierSlug, list);
  }
  // Any refusal poisons only lines that could not resolve; groups that did
  // resolve still push (cj-sync discipline: per-unit failures never fatal
  // to the whole order, but a line is never pushed unresolved).
  const results: PushGroupResult[] = [];

  for (const [slug, groupLines] of groups) {
    const itemIds = groupLines.map((l) => l.itemId);
    // Idempotency: skip items already on an open fulfillment for this supplier.
    const { data: existingItems } = await sb.from("fulfillment_items")
      .select("order_item_id, fulfillment_orders:fulfillment_order_id(status)")
      .in("order_item_id", itemIds).eq("tenant_id", TENANT_ID);
    const alreadyOpen = new Set(
      (existingItems || [])
        .filter((fi: any) => fi.fulfillment_orders && !["cancelled", "failed"].includes(fi.fulfillment_orders.status))
        .map((fi: any) => fi.order_item_id),
    );
    const fresh = groupLines.filter((l) => !alreadyOpen.has(l.itemId));
    if (!fresh.length) {
      results.push({ supplierSlug: slug, status: "skipped", items: itemIds });
      continue;
    }

    if (slug === "gelato" || slug === "prodigi") {
      // Rule C: mapped payload translation + dispatch (Gelato /
      // Prodigi). Groups without complete mappings are refused by
      // name inside the dispatcher; nothing is pushed blind.
      const outcome = await dispatchMappedGroup({
        sb,
        tenantId: TENANT_ID,
        slug,
        supplierId: fresh[0].supplierId,
        lines: fresh.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          catalogVariantId: l.catalogVariantId,
          externalVariantId: l.externalVariantId,
          designFileUrl: l.designFileUrl,
          designSnapshot: l.designSnapshot,
        })),
        storefrontOrderId,
        orderNumber: erpOrder.order_number,
        customerId: storefront?.customer_id ?? null,
        customerEmail: erpOrder.customer_email || "",
        shipTo: parseShipTo(storefront?.shipping_address, "Customer"),
      });
      results.push({
        supplierSlug: slug,
        status: outcome.status,
        providerOrderId: outcome.providerOrderId,
        error: outcome.error,
        items: itemIds,
      });
      continue;
    }
    if (slug !== "printful") {
      results.push({
        supplierSlug: slug, status: "push_failed", items: itemIds,
        error: `no submission adapter for supplier "${slug}" yet — lines held, not pushed`,
      });
      continue;
    }
    if (!(await getIntegrationKey("PRINTFUL_API_KEY"))) {
      results.push({
        supplierSlug: slug, status: "push_failed", items: itemIds,
        error: "Printful not configured (missing: PRINTFUL_API_KEY)",
      });
      continue;
    }

    const shipTo = parseShipTo(storefront?.shipping_address, "Customer");
    if (!shipTo) {
      results.push({ supplierSlug: slug, status: "refused", items: itemIds, error: "shipping address cannot be parsed to a carrier address (no ZIP) — refusing to push" });
      continue;
    }

    const items: PrintfulOrderItem[] = fresh.map((l) => ({
      variant_id: Number(l.externalVariantId),
      quantity: l.quantity,
      ...(l.designFileUrl ? { files: [{ url: l.designFileUrl }] } : {}),
    }));
    if (items.some((i) => !Number.isFinite(i.variant_id))) {
      results.push({ supplierSlug: slug, status: "refused", items: itemIds, error: "a line's provider variant id is not numeric for Printful — refused by name, group not pushed" });
      continue;
    }

    try {
      const created = await printfulCreateDraftOrder({
        packingSlip: printfulPackingSlip(),
        externalId: erpOrder.order_number,
        recipient: {
          name: shipTo.name, address1: shipTo.street1, city: shipTo.city,
          state_code: shipTo.state, zip: shipTo.zip, country_code: shipTo.country,
          email: erpOrder.customer_email || undefined,
        },
        items,
      });
      const providerOrderId = String(created?.id || "");
      if (!providerOrderId) throw new Error("Printful returned no order id — not marking ordered");
      const claimed = await claimDraftFulfillment(sb, TENANT_ID, storefrontOrderId, fresh[0].supplierId, {
        supplier_order_external_id: providerOrderId, status: "submitted",
        cost: created?.costs?.total ? Number(created.costs.total) : null,
      });
      const fo = claimed
        ? { id: claimed }
        : await sb.from("fulfillment_orders").insert({
            tenant_id: TENANT_ID, order_id: storefrontOrderId, supplier_id: fresh[0].supplierId,
            supplier_order_external_id: providerOrderId, status: "submitted",
            cost: created?.costs?.total ? Number(created.costs.total) : null,
          }).select("id").single().then((r: any) => {
            if (r.error) throw new Error(r.error.message);
            return r.data;
          });
      await sb.from("fulfillment_items").insert(fresh.map((l) => ({
        fulfillment_order_id: fo.id, tenant_id: TENANT_ID, order_item_id: l.itemId,
        supplier_catalog_variant_external_id: l.externalVariantId,
        placement_file_urls: l.designFileUrl ? [l.designFileUrl] : [],
        design_snapshot: l.designSnapshot ?? null,
      })));
      results.push({ supplierSlug: slug, status: "ordered", providerOrderId, items: itemIds });
    } catch (e: any) {
      const claimedFail = await claimDraftFulfillment(sb, TENANT_ID, storefrontOrderId, fresh[0].supplierId, {
        status: "failed",
      }).catch(() => null);
      if (!claimedFail) {
        const { error: failRecErr } = await sb.from("fulfillment_orders").insert({
          tenant_id: TENANT_ID, order_id: storefrontOrderId, supplier_id: fresh[0].supplierId,
          supplier_order_external_id: null, status: "failed", cost: null,
        });
        if (failRecErr) console.error("push: could not record failed fulfillment:", failRecErr.message);
      }
      results.push({ supplierSlug: slug, status: "push_failed", items: itemIds, error: e?.message || String(e) });
    }
  }

  await sb.from("erp_order_notes").insert({
    tenant_id: TENANT_ID, order_id: erpOrderId, note_type: "supplier_push",
    body: `POD push: ${results.map((r) => `${r.supplierSlug}=${r.status}${r.providerOrderId ? ` (#${r.providerOrderId})` : ""}${r.error ? ` — ${r.error}` : ""}`).join("; ")}${refusals.length ? ` | refused: ${refusals.map((r) => r.reason).join("; ")}` : ""}`,
  }).then(undefined, () => undefined);

  return { orderId: erpOrderId, groups: results, refusals };
}

export async function confirmSupplierOrder(fulfillmentOrderId: string): Promise<any> {
  const sb = db();
  const { data: fo } = await sb.from("fulfillment_orders")
    .select("id, supplier_order_external_id, status, suppliers(slug)")
    .eq("id", fulfillmentOrderId).eq("tenant_id", TENANT_ID).maybeSingle();
  if (!fo) throw new Error("fulfillment order not found");
  if ((fo as any).suppliers?.slug !== "printful") throw new Error("confirm is only wired for Printful fulfillments");
  if (!fo.supplier_order_external_id) throw new Error("no provider order id — nothing to confirm");
  const confirmed = await printfulConfirmOrder(fo.supplier_order_external_id);
  // fulfillment_orders.status check constraint has no 'confirmed' — a
  // confirmed Printful order is in production at the provider.
  await sb.from("fulfillment_orders").update({ status: "in_production" }).eq("id", fulfillmentOrderId);
  return confirmed;
}

// ── Tracking sync ────────────────────────────────────────────────────────────

export type TrackingSyncResult = { checked: number; shipped: number; delivered: number; errors: { fulfillmentId: string; error: string }[] };

export async function syncPrintfulTracking(limit = 50): Promise<TrackingSyncResult> {
  const sb = db();
  const { data: printful } = await sb.from("suppliers").select("id").eq("slug", "printful").maybeSingle();
  if (!printful) return { checked: 0, shipped: 0, delivered: 0, errors: [] };
  const { data: open } = await sb.from("fulfillment_orders")
    .select("id, order_id, supplier_order_external_id, status")
    .eq("tenant_id", TENANT_ID).eq("supplier_id", printful.id)
    .in("status", ["submitted", "in_production"])
    .not("supplier_order_external_id", "is", null)
    .order("created_at").limit(limit);
  const result: TrackingSyncResult = { checked: 0, shipped: 0, delivered: 0, errors: [] };
  for (const fo of open || []) {
    result.checked++;
    try {
      const remote = await printfulGetOrder(fo.supplier_order_external_id!);
      const shipment = (remote?.shipments || [])[0];
      const remoteStatus = String(remote?.status || "");
      if (shipment?.tracking_number) {
        await sb.from("fulfillment_orders").update({
          status: remoteStatus === "fulfilled" ? "delivered" : "shipped",
          tracking_number: shipment.tracking_number,
          tracking_url: shipment.tracking_url || null,
        }).eq("id", fo.id);
        if (remoteStatus === "fulfilled") result.delivered++; else result.shipped++;
        // Reflect on the ERP twin order.
        const { data: erp } = await sb.from("erp_orders").select("id, status")
          .eq("source_order_id", fo.order_id).eq("tenant_id", TENANT_ID).maybeSingle();
        if (erp && ["confirmed", "in_production", "ready_to_ship"].includes(erp.status)) {
          const to = remoteStatus === "fulfilled" ? "delivered" : "shipped";
          await sb.from("erp_orders").update({ status: to, updated_at: new Date().toISOString() }).eq("id", erp.id);
          await sb.from("erp_order_status_history").insert({
            tenant_id: TENANT_ID, order_id: erp.id, from_status: erp.status, to_status: to,
            reason: `Printful tracking sync (provider order ${fo.supplier_order_external_id})`,
          });
        }
      } else if (remoteStatus === "infulfillment" || remoteStatus === "being_fulfilled") {
        await sb.from("fulfillment_orders").update({ status: "in_production" }).eq("id", fo.id);
      }
    } catch (e: any) {
      result.errors.push({ fulfillmentId: fo.id, error: e?.message || String(e) });
    }
  }
  return result;
}

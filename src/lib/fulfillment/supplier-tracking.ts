// ---------------------------------------------------------------------------
// fulfillment/supplier-tracking.ts — supplier shipment ingest for POD
// fulfillment rows: how tracking gets from Printify / Printful back onto
// fulfillment_orders (and in front of the customer) WITHOUT an admin
// typing it.
//
// WHERE TRACKING COMES FROM — webhook first, payload never trusted:
//   (a) WEBHOOK — POST /api/webhooks/printify receives Printify's
//       order:shipment:created / order:shipment:delivered events
//       (HMAC-verified against PRINTIFY_WEBHOOK_SECRET in that route).
//       The payload is a HINT: the handler re-reads the order from
//       Printify's API and applies what the API says.
//   (b) This module is the single applier both doors feed:
//       applySupplierShipment() advances fulfillment_orders
//       monotonically (a late "shipped" can never regress a delivered
//       row, a replay changes nothing and notifies nobody twice) and
//       writes ONE customer_notifications row per real transition —
//       the account center's Notifications section reads those.
//
// fulfillment_orders is keyed by supplier_order_external_id, written at
// dispatch (lib/fulfillment/dispatch.ts, lib/suppliers/push.ts) — the
// join the webhook resolves on. Rows in failed/cancelled states are
// never advanced by tracking.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/supabase";
import { getIntegrationKey } from "@/lib/integrations/keys";
import { sendEmail } from "@/lib/email";
import { orderShippedHtml, orderDeliveredHtml } from "@/lib/email/templates/commerce";
import { toResendVariables } from "@/lib/email/resend-templates";
import { SITE_URL } from "@/lib/site-url";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";

export interface SupplierShipment {
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  delivered?: boolean;
}

export interface ApplyResult {
  matched: number;
  updated: number;
  notified: number;
  skipped?: string;
}

const STATUS_RANK: Record<string, number> = {
  draft: 0,
  submitted: 1,
  shipped: 2,
  delivered: 3,
};

export async function applySupplierShipment(args: {
  supplierName: string;
  externalOrderId: string;
  shipment: SupplierShipment;
}): Promise<ApplyResult> {
  const supabase = createServerClient();
  const result: ApplyResult = { matched: 0, updated: 0, notified: 0 };
  if (!args.externalOrderId) return { ...result, skipped: "no external order id" };

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id")
    .eq("name", args.supplierName)
    .maybeSingle();

  let query = supabase
    .from("fulfillment_orders")
    .select("id, order_id, tenant_id, status, tracking_number, tracking_url")
    .eq("supplier_order_external_id", args.externalOrderId);
  if (supplier?.id) query = query.eq("supplier_id", supplier.id);
  const { data: rows } = await query;
  const fulfillments = (rows || []) as any[];
  result.matched = fulfillments.length;
  if (!fulfillments.length) return { ...result, skipped: "no matching fulfillment" };

  const targetStatus = args.shipment.delivered ? "delivered" : "shipped";
  const targetRank = STATUS_RANK[targetStatus];

  for (const row of fulfillments) {
    if (row.status === "failed" || row.status === "cancelled") continue;
    const currentRank = STATUS_RANK[String(row.status)] ?? 0;
    const patch: Record<string, unknown> = {};
    if (targetRank > currentRank) patch.status = targetStatus;
    if (
      args.shipment.trackingNumber &&
      args.shipment.trackingNumber !== row.tracking_number
    ) {
      patch.tracking_number = args.shipment.trackingNumber;
    }
    if (args.shipment.trackingUrl && args.shipment.trackingUrl !== row.tracking_url) {
      patch.tracking_url = args.shipment.trackingUrl;
    }
    if (!Object.keys(patch).length) continue;

    const { error } = await supabase
      .from("fulfillment_orders")
      .update(patch)
      .eq("id", row.id);
    if (error) continue;
    result.updated += 1;

    // Notify only on a genuine status transition, once per (customer,
    // order, kind) — replays and refreshes of the same state are silent.
    if (patch.status === "shipped" || patch.status === "delivered") {
      const { data: order } = await supabase
        .from("orders")
        .select("id, customer_id, shipping_address, total")
        .eq("id", row.order_id)
        .maybeSingle();
      const customerId = (order as any)?.customer_id as string | null;
      if (customerId) {
        const type =
          patch.status === "delivered" ? "order_delivered" : "order_shipped";
        const { data: existing } = await supabase
          .from("customer_notifications")
          .select("id")
          .eq("customerId", customerId)
          .eq("relatedId", row.order_id)
          .eq("type", type)
          .limit(1);
        if (!existing?.length) {
          const bits = [
            args.shipment.carrier,
            args.shipment.trackingNumber
              ? `Tracking ${args.shipment.trackingNumber}`
              : null,
          ].filter(Boolean);
          const { error: nErr } = await supabase
            .from("customer_notifications")
            .insert({
              tenant_id: row.tenant_id ?? PLATFORM_TENANT_ID,
              customerId,
              type,
              title:
                patch.status === "delivered"
                  ? "Your order was delivered"
                  : "Your order shipped",
              body: bits.length ? bits.join(" · ") : null,
              link: "/account",
              relatedId: row.order_id,
            });
          if (!nErr) result.notified += 1;
        }
      }

      // The customer's email for the same transition — once, in the
      // same dedupe gate as the in-app notification above. Data comes
      // from the order itself (buyer email + address live on
      // shipping_address), the twin's human order number, and this
      // shipment's real tracking fields. A failed send never un-ships
      // anything; it is logged and the transition stands.
      const addr = ((order as any)?.shipping_address || {}) as Record<string, any>;
      const buyerEmail = typeof addr.email === "string" ? addr.email : null;
      if (buyerEmail) {
        try {
          const { data: twin } = await supabase
            .from("erp_orders")
            .select("order_number")
            .eq("source_order_id", row.order_id)
            .maybeSingle();
          const orderNumber = String((twin as any)?.order_number || row.order_id);
          const firstName =
            String(addr.first_name || "").trim() ||
            String(addr.name || "").trim().split(/\s+/)[0] ||
            buyerEmail.split("@")[0];
          const { data: itemRows } = await supabase
            .from("order_items")
            .select("quantity, supplier_catalog_variant_id, product_variants ( products ( name ) )")
            .eq("order_id", row.order_id);
          const catIds = [...new Set(((itemRows || []) as any[]).map((r) => r.supplier_catalog_variant_id).filter(Boolean))];
          const catNames = new Map<string, string>();
          if (catIds.length) {
            const { data: variants } = await supabase
              .from("supplier_catalog_variants")
              .select("id, supplier_catalog_products ( name )")
              .in("id", catIds as string[]);
            for (const v of (variants || []) as any[]) {
              if (v.supplier_catalog_products?.name) catNames.set(v.id, v.supplier_catalog_products.name);
            }
          }
          const itemNames = ((itemRows || []) as any[]).map(
            (r) => (r.supplier_catalog_variant_id ? catNames.get(r.supplier_catalog_variant_id) : null) || r.product_variants?.products?.name || "Item",
          );
          const itemList = itemNames.join(", ");
          const deliveryAddress =
            [
              [addr.first_name, addr.last_name].filter(Boolean).join(" ") || addr.name,
              addr.address_line1 || addr.line1,
              [addr.city, addr.state].filter(Boolean).join(", "),
              addr.postal_code || addr.zip,
            ]
              .filter(Boolean)
              .join(" · ") || "";
          if (patch.status === "shipped") {
            await sendEmail({
              to: buyerEmail,
              customerId: customerId || undefined,
              template: "order_shipped",
              subject: `Your order has shipped — ${orderNumber}`,
              relatedOrderId: row.order_id,
              html: orderShippedHtml({
                firstName,
                orderNumber,
                carrier: args.shipment.carrier || undefined,
                trackingNumber: args.shipment.trackingNumber || "",
                trackingUrl: args.shipment.trackingUrl || undefined,
                itemNames,
              }),
              variables: toResendVariables({
                firstName,
                orderNumber,
                carrier: args.shipment.carrier || "",
                trackingNumber: args.shipment.trackingNumber || "",
                trackingUrl: args.shipment.trackingUrl || "",
                itemList,
                // No stored estimate exists on the fulfillment; the
                // variable stays empty (template fallback) until a
                // supplier payload carries a real one — never invented.
                estimatedDelivery: "",
              }),
            });
          } else {
            const deliveryDate = new Date().toLocaleDateString("en-US", { dateStyle: "long" });
            await sendEmail({
              to: buyerEmail,
              customerId: customerId || undefined,
              template: "order_delivered",
              subject: `Your order has arrived — ${orderNumber}`,
              relatedOrderId: row.order_id,
              html: orderDeliveredHtml({
                firstName,
                orderNumber,
                carrier: args.shipment.carrier || undefined,
                trackingNumber: args.shipment.trackingNumber || undefined,
                itemNames,
              }),
              variables: toResendVariables({
                firstName,
                orderNumber,
                deliveryAddress,
                deliveryDate,
                reviewUrl: `${SITE_URL}/account/orders`,
                itemList,
              }),
            });
          }
        } catch (e: any) {
          console.error("[supplier-tracking] transition email failed:", e?.message);
        }
      }
    }
  }
  return result;
}

// --- Printify ---------------------------------------------------------------

let printifyShopId: string | null = null;

async function printifyOrder(externalOrderId: string): Promise<any | null> {
  const key = await getIntegrationKey("PRINTIFY_API_KEY");
  if (!key) return null;
  if (!printifyShopId) {
    const shopsRes = await fetch("https://api.printify.com/v1/shops.json", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!shopsRes.ok) return null;
    const shops: any[] = await shopsRes.json();
    printifyShopId = shops?.[0]?.id != null ? String(shops[0].id) : null;
    if (!printifyShopId) return null;
  }
  const res = await fetch(
    `https://api.printify.com/v1/shops/${printifyShopId}/orders/${encodeURIComponent(externalOrderId)}.json`,
    { headers: { Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return null;
  return res.json();
}

// Printify's order resource has carried its parcels under both
// `fulfillments` and `shipments` across API revisions; read either, plus
// carrier spellings (company / carrier / carrier_code).
export function extractPrintifyShipments(order: any): SupplierShipment[] {
  const parcels: any[] = [
    ...((order?.fulfillments as any[]) || []),
    ...((order?.shipments as any[]) || []),
  ];
  const out: SupplierShipment[] = [];
  for (const p of parcels) {
    const trackingNumber = p?.tracking_number ?? p?.trackingNumber ?? null;
    if (!trackingNumber && !p?.tracking_url) continue;
    out.push({
      carrier: p?.company ?? p?.carrier ?? p?.carrier_code ?? null,
      trackingNumber,
      trackingUrl: p?.tracking_url ?? p?.trackingUrl ?? null,
      delivered: Boolean(p?.delivered_at ?? p?.delivery_time ?? p?.is_delivered),
    });
  }
  return out;
}

// Re-read one Printify order and apply whatever shipments it now has.
// deliveredHint comes from the webhook topic (order:shipment:delivered)
// for parcels whose own delivered markers are absent.
export async function syncPrintifyOrder(
  externalOrderId: string,
  deliveredHint = false
): Promise<ApplyResult> {
  const order = await printifyOrder(externalOrderId);
  if (!order) {
    return { matched: 0, updated: 0, notified: 0, skipped: "printify order not readable" };
  }
  const shipments = extractPrintifyShipments(order);
  if (!shipments.length) {
    return { matched: 0, updated: 0, notified: 0, skipped: "no shipments on order yet" };
  }
  const total: ApplyResult = { matched: 0, updated: 0, notified: 0 };
  for (const shipment of shipments) {
    const r = await applySupplierShipment({
      supplierName: "Printify",
      externalOrderId,
      shipment: { ...shipment, delivered: shipment.delivered || deliveredHint },
    });
    total.matched = Math.max(total.matched, r.matched);
    total.updated += r.updated;
    total.notified += r.notified;
  }
  return total;
}

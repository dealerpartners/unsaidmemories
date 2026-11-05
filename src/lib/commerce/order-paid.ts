import { NextResponse } from "next/server";
import { sendOrderConfirmationEmail } from "@/lib/commerce/order-email";
import { sendOrderPlacedAlert } from "@/lib/email";
import { resolveLineSupplier } from "@/lib/commerce/supplier-routing";
import { resolveDesignSnapshot, resolveDesignDataSnapshot } from "@/lib/commerce/design-snapshot";
import { ensureErpTwin } from "@/lib/orders/twin";
import { captureOrderCustomer, postOrderSaleJournal } from "@/lib/commerce/order-ledger";
import { syncEcommerceOrder } from "@/lib/commerce/ecommerce-orders";

/**
 * processPaidOrder — the gateway-neutral "payment confirmed" flow,
 * extracted verbatim from the Stripe webhook (2026-11-03) so the
 * Authorize.net webhook runs the identical path. A gateway calls
 * this ONLY after it has verified the payment itself (Stripe:
 * signature-verified payment_intent.succeeded; Authorize.net:
 * signature-verified authcapture + amount re-checked against the
 * gateway's own transaction record).
 *
 * PAYMENT FIRST, FULFILLMENT SECOND:
 *   1. Mark the order paid (idempotent — an already-paid order takes
 *      the self-heal branch: twin / CRM / journal are re-ensured and
 *      the handler returns already_handled).
 *   2. Carry the design through: every order_item keeps its
 *      design_publication_id, and any missing design_file_snapshot_url
 *      / design_snapshot is resolved and written back.
 *   3. Create fulfillment_orders as DRAFT per supplier — each line's
 *      supplier resolved by variant_fulfillment_routes priority (or
 *      the supplier catalog variant itself), route_id recorded.
 *      Supplier adapters submit from these rows; nothing is ever
 *      submitted before payment.
 *   4. ERP twin, CRM customer capture, sale journal, confirmation
 *      email — each failure-isolated: the payment is real, so a
 *      books failure never fails the caller; the helpers are
 *      idempotent and a redelivery heals a missed record.
 */
async function linkTwinToCustomer(sb: any, tenantId: string, orderId: string, crmCustomerId: string | null) {
  if (!crmCustomerId) return;
  await sb
    .from("erp_orders")
    .update({ crm_customer_id: crmCustomerId })
    .eq("source_order_id", orderId)
    .eq("tenant_id", tenantId)
    .is("crm_customer_id", null)
    .then(undefined, () => undefined);
}

export async function processPaidOrder(sb: any, tenantId: string, orderId: string): Promise<NextResponse> {
  const { data: order } = await sb
    .from("orders")
    .select("id, status, total, shipping_cost, shipping_address, customer_id")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  if (order.status === "paid" || order.status === "fulfilled") {
    // Already paid — but the people + books records are idempotent,
    // so a redelivery still heals them if an earlier pass missed
    // them (e.g. the order was paid before they were wired in).
    const twin = await ensureErpTwin(sb, tenantId, order as any).catch(() => null);
    const crmCustomer = await captureOrderCustomer(sb, tenantId, order as any).catch(() => null);
    await linkTwinToCustomer(sb, tenantId, orderId, crmCustomer);
    await syncEcommerceOrder(sb, tenantId, orderId, crmCustomer).catch(() => null);
    const journalEntry = await postOrderSaleJournal(sb, order as any, twin?.orderNumber ?? null).catch(() => null);
    return NextResponse.json({ received: true, already_handled: true, erp_twin: twin?.orderNumber ?? null, crm_customer: crmCustomer, journal_entry: journalEntry });
  }

  // Double-delivery guard: fulfillment drafts already exist → just ensure paid.
  const { data: existing } = await sb
    .from("fulfillment_orders")
    .select("id")
    .eq("order_id", orderId)
    .limit(1);
  if (existing?.length) {
    await sb.from("orders").update({ status: "paid" }).eq("id", orderId);
    const twin = await ensureErpTwin(sb, tenantId, order as any).catch(() => null);
    // Self-heal the people + books records too (idempotent helpers).
    const crmCustomer = await captureOrderCustomer(sb, tenantId, order as any).catch(() => null);
    await linkTwinToCustomer(sb, tenantId, orderId, crmCustomer);
    await syncEcommerceOrder(sb, tenantId, orderId, crmCustomer).catch(() => null);
    const journalEntry = await postOrderSaleJournal(sb, order as any, twin?.orderNumber ?? null).catch(() => null);
    return NextResponse.json({ received: true, already_handled: true, erp_twin: twin?.orderNumber ?? null, crm_customer: crmCustomer, journal_entry: journalEntry });
  }

  // Mark paid.
  await sb.from("orders").update({ status: "paid" }).eq("id", orderId);

  // Load items WITH their design carriage.
  const { data: items } = await sb
    .from("order_items")
    .select(
      "id, product_variant_id, supplier_catalog_variant_id, design_publication_id, design_file_snapshot_url, design_snapshot, quantity"
    )
    .eq("order_id", orderId);

  // Carry the design file snapshot through: a published design's print file
  // must be reachable from the order item fulfillment works from.
  // Orders placed before the design-data snapshot existed get their
  // design_snapshot backfilled here too, so the payment-time record
  // carries the design data itself — not just the file URL.
  let designSnapshotsFilled = 0;
  for (const item of items ?? []) {
    if (item.design_publication_id && !item.design_file_snapshot_url) {
      const snapshot = await resolveDesignSnapshot(sb, item.design_publication_id);
      if (snapshot) {
        await sb
          .from("order_items")
          .update({ design_file_snapshot_url: snapshot })
          .eq("id", item.id);
        item.design_file_snapshot_url = snapshot;
        designSnapshotsFilled++;
      }
    }
    if (item.design_publication_id && !item.design_snapshot) {
      try {
        const dataSnapshot = await resolveDesignDataSnapshot(sb, item.design_publication_id);
        if (dataSnapshot) {
          await sb
            .from("order_items")
            .update({ design_snapshot: dataSnapshot })
            .eq("id", item.id);
          item.design_snapshot = dataSnapshot;
        }
      } catch {
        /* backfill is best-effort; the payment flow never fails for it */
      }
    }
  }

  // Route every line to its supplier → one DRAFT fulfillment order per supplier.
  const bySupplier = new Map<
    string,
    { route_id: string | null; item_ids: string[] }
  >();
  const unrouted: string[] = [];
  for (const item of items ?? []) {
    const resolved = await resolveLineSupplier(sb, {
      product_variant_id: item.product_variant_id,
      supplier_catalog_variant_id: item.supplier_catalog_variant_id,
      design_publication_id: item.design_publication_id,
      quantity: item.quantity,
    });
    if (!resolved.supplier_id) {
      unrouted.push(item.id);
      continue;
    }
    // Keep the resolved supplier catalog variant on the line so the
    // fulfillment adapter orders exactly what routing decided.
    if (
      resolved.fulfillment_catalog_variant_id &&
      resolved.fulfillment_catalog_variant_id !== item.supplier_catalog_variant_id
    ) {
      await sb
        .from("order_items")
        .update({ supplier_catalog_variant_id: resolved.fulfillment_catalog_variant_id })
        .eq("id", item.id);
    }
    let group = bySupplier.get(resolved.supplier_id);
    if (!group) {
      group = { route_id: resolved.route_id, item_ids: [] };
      bySupplier.set(resolved.supplier_id, group);
    }
    group.item_ids.push(item.id);
  }

  let draftsCreated = 0;
  for (const [supplierId, group] of bySupplier) {
    const { error } = await sb.from("fulfillment_orders").insert({
      tenant_id: tenantId,
      order_id: orderId,
      supplier_id: supplierId,
      route_id: group.route_id,
      status: "draft",
    });
    if (!error) draftsCreated++;
  }

  // The ERP twin: without it the paid order never appears in the
  // Orders module, where supplier submission lives. A twin failure
  // must not fail this webhook (the payment is real and Stripe
  // would retry the whole payment flow) — it is reported in the
  // response and self-heals on any redelivery via the guard above.
  let twin: { orderNumber: string; created: boolean } | null = null;
  try {
    twin = await ensureErpTwin(sb, tenantId, order as any);
  } catch (e) {
    console.error("[stripe webhook] ERP twin creation failed:", e);
  }

  // People + books: the buyer becomes a CRM customer and the sale
  // lands in Accounting. Same discipline as the twin — a failure
  // here never fails the webhook (the payment is real); both
  // helpers are idempotent and self-heal on redelivery.
  let crmCustomer: string | null = null;
  try {
    crmCustomer = await captureOrderCustomer(sb, tenantId, order as any);
    await linkTwinToCustomer(sb, tenantId, orderId, crmCustomer);
    await syncEcommerceOrder(sb, tenantId, orderId, crmCustomer).catch(() => null);
  } catch (e) {
    console.error("[stripe webhook] CRM capture failed:", e);
  }
  let journalEntry: string | null = null;
  try {
    journalEntry = await postOrderSaleJournal(sb, order as any, twin?.orderNumber ?? null);
  } catch (e) {
    console.error("[stripe webhook] sale journal posting failed:", e);
  }

  // The buyer's receipt. Main path only: this block runs exactly
  // once per order (redeliveries take the already-paid branches
  // above), so nobody is emailed twice. sendOrderConfirmationEmail
  // never throws; a mail failure is reported, never fatal.
  const confirmation = await sendOrderConfirmationEmail(order as any, twin?.orderNumber ?? null);
  if (!confirmation.sent) {
    console.error("[stripe webhook] confirmation email not sent:", confirmation.reason);
  }

  // The operator alert: the store's orders inbox hears about every
  // paid order, with the product pictures. Same discipline as the
  // confirmation — failure-isolated, exactly once per order (this
  // block sits on the main path only). Destination is the settings-
  // driven alert inbox (alert_email; orders@unsaidmemories.com).
  let operatorAlertSent = false;
  try {
    const { data: itemRows } = await sb
      .from("order_items")
      .select("id, quantity, unit_price, supplier_catalog_variant_id, product_variants ( products ( name ) )")
      .eq("order_id", orderId);
    const catalogByVariant = new Map<
      string,
      {
        name: string;
        imageUrl?: string;
        supplierId?: string;
        supplierExternalId?: string;
        cost?: number;
        specs?: Record<string, any>;
      }
    >();
    const catalogVariantIds = [
      ...new Set((itemRows || []).map((it: any) => it.supplier_catalog_variant_id).filter(Boolean)),
    ] as string[];
    if (catalogVariantIds.length) {
      const { data: variants } = await sb
        .from("supplier_catalog_variants")
        .select("id, name, supplier_catalog_product_id, external_id, price_snapshot, print_specs, supplier_id")
        .in("id", catalogVariantIds);
      const productIds = [
        ...new Set((variants || []).map((v: any) => v.supplier_catalog_product_id).filter(Boolean)),
      ] as string[];
      const productById = new Map<string, any>();
      if (productIds.length) {
        const { data: prods } = await sb
          .from("supplier_catalog_products")
          .select("id, name, image_url, images, external_id, supplier_id")
          .in("id", productIds);
        for (const p of prods || []) productById.set((p as any).id, p);
      }
      for (const v of variants || []) {
        const p = (v as any).supplier_catalog_product_id
          ? productById.get((v as any).supplier_catalog_product_id)
          : null;
        const images = Array.isArray(p?.images) ? p.images : [];
        catalogByVariant.set((v as any).id, {
          name: p?.name || (v as any).name || "Item",
          imageUrl:
            p?.image_url || images.find((x: any) => typeof x === "string") || undefined,
          supplierId: p?.supplier_id || (v as any).supplier_id || undefined,
          supplierExternalId: (v as any).external_id || p?.external_id || undefined,
          cost:
            (v as any).price_snapshot != null ? Number((v as any).price_snapshot) : undefined,
          specs: (v as any).print_specs || undefined,
        });
      }
    }
    const addr = ((order as any).shipping_address || {}) as Record<string, any>;
    const shipTo =
      [addr.address_line1 || addr.line1, addr.city, addr.state, addr.postal_code || addr.zip]
        .filter(Boolean)
        .join(", ") || undefined;
    const shipCountry = String(addr.country || "US").toUpperCase();
    const { data: supplierRows } = await sb.from("suppliers").select("id, name");
    const supplierNameById = new Map<string, string>(
      (supplierRows || []).map((s: any) => [s.id, s.name]),
    );
    let itemsTotal = 0;
    const alertItems: { name: string; qty: number; price: string; imageUrl?: string }[] = [];
    const supplierLines: { name: string; detail: string }[] = [];
    let etaMin: number | null = null;
    let etaMax: number | null = null;
    let windowedItems = 0;
    for (const it of itemRows || []) {
      const qty = Number((it as any).quantity || 1);
      const line = Number((it as any).unit_price || 0) * qty;
      itemsTotal += line;
      const catalog = (it as any).supplier_catalog_variant_id
        ? catalogByVariant.get((it as any).supplier_catalog_variant_id)
        : null;
      const itemName =
        catalog?.name || (it as any).product_variants?.products?.name || "Item";
      alertItems.push({
        name: itemName,
        qty,
        price: `$${line.toFixed(2)}`,
        imageUrl: catalog?.imageUrl,
      });
      if (!catalog) continue;
      // Supplier economics for the operator alert — internal only.
      // Shipping comes from the item's exact harvested rate card:
      // the (blueprint, provider) pair card when the variant carries
      // Printify specs, else the supplier's generic US card. A card
      // that does not exist leaves shipping/margin/ETA unstated —
      // never estimated.
      let card: any = null;
      const specs = catalog.specs || {};
      if (specs.blueprint_id && specs.provider_id) {
        const { data } = await sb
          .from("shipping_profiles")
          .select("first_item_cost, additional_item_cost, min_days, max_days")
          .eq("profile_name", `PFY-${specs.blueprint_id}-${specs.provider_id}-${shipCountry}`)
          .eq("method_name", "Standard")
          .maybeSingle();
        card = data;
      } else if (catalog.supplierId) {
        const { data } = await sb
          .from("shipping_profiles")
          .select("first_item_cost, additional_item_cost, min_days, max_days")
          .eq("supplier_id", catalog.supplierId)
          .eq("method_name", "Standard")
          .contains("destination_countries", [shipCountry])
          .limit(1);
        card = (data || [])[0] || null;
      }
      const lineCost = catalog.cost != null ? catalog.cost * qty : null;
      const lineShip = card
        ? Number(card.first_item_cost || 0) + Number(card.additional_item_cost || 0) * (qty - 1)
        : null;
      const lineMargin =
        lineCost != null && lineShip != null ? line - lineCost - lineShip : null;
      const parts: string[] = [];
      const supplierName = catalog.supplierId
        ? supplierNameById.get(catalog.supplierId)
        : undefined;
      if (supplierName) parts.push(supplierName);
      if (catalog.supplierExternalId) parts.push(`ID ${catalog.supplierExternalId}`);
      if (lineCost != null) parts.push(`Cost $${lineCost.toFixed(2)}`);
      if (lineShip != null) parts.push(`Shipping $${lineShip.toFixed(2)}`);
      if (lineMargin != null) parts.push(`Margin $${lineMargin.toFixed(2)}`);
      if (parts.length) supplierLines.push({ name: itemName, detail: parts.join(" · ") });
      if (card && card.min_days != null && card.max_days != null) {
        windowedItems += 1;
        etaMin = etaMin == null ? Number(card.min_days) : Math.min(etaMin, Number(card.min_days));
        etaMax = etaMax == null ? Number(card.max_days) : Math.max(etaMax, Number(card.max_days));
      }
    }
    // The expected-delivery window is stated only when EVERY item
    // resolved a real rate-card window.
    let expectedDelivery: string | undefined;
    if (
      (itemRows || []).length > 0 &&
      windowedItems === (itemRows || []).length &&
      etaMin != null &&
      etaMax != null
    ) {
      const base = new Date((order as any).created_at || Date.now());
      const fmtDay = (d: Date) =>
        d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const lo = new Date(base.getTime() + etaMin * 86400000);
      const hi = new Date(base.getTime() + etaMax * 86400000);
      expectedDelivery = lo.getTime() === hi.getTime() ? fmtDay(lo) : `${fmtDay(lo)} – ${fmtDay(hi)}`;
    }
    const shippingCost = Number((order as any).shipping_cost || 0);
    const alert = await sendOrderPlacedAlert({
      customerId: (order as any).customer_id || undefined,
      customerName: [addr.first_name, addr.last_name].filter(Boolean).join(" ") || "Customer",
      email: addr.email || null,
      phone: addr.phone || null,
      orderNumber: twin?.orderNumber ?? orderId,
      orderId,
      items: alertItems,
      subtotal: `$${itemsTotal.toFixed(2)}`,
      shipping: shippingCost > 0 ? `$${shippingCost.toFixed(2)}` : undefined,
      total: `$${Number((order as any).total || 0).toFixed(2)}`,
      shipTo,
      supplierLines,
      expectedDelivery,
    });
    operatorAlertSent = !!(alert as any)?.ok;
    if (!operatorAlertSent) {
      console.error("[stripe webhook] operator alert not sent:", (alert as any)?.error);
    }
  } catch (e) {
    console.error("[stripe webhook] operator alert failed:", e);
  }

  return NextResponse.json({
    received: true,
    order_id: orderId,
    status: "paid",
    fulfillment_drafts: draftsCreated,
    design_snapshots_filled: designSnapshotsFilled,
    unrouted_items: unrouted,
    erp_twin: twin?.orderNumber ?? null,
    crm_customer: crmCustomer,
    journal_entry: journalEntry,
    confirmation_email: confirmation.sent ? confirmation.id : null,
    confirmation_email_error: confirmation.sent ? undefined : confirmation.reason,
    operator_alert: operatorAlertSent,
  });
}

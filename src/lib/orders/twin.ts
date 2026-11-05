import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveItemLabels, type LabelableLine } from "@/lib/commerce/item-labels";

/**
 * The ERP twin: every PAID storefront order gets its working row in
 * the admin Orders module (erp_orders), linked by source_order_id.
 *
 * Why a shell is enough: the supplier push
 * (lib/suppliers/push.ts `pushOrderToSuppliers`) resolves every
 * line from the STOREFRONT order_items — designs and supplier
 * variants live there — and only needs the twin for its order
 * number, buyer email, and a workable status. The Ecommerce Orders
 * page says it in its own subtitle: "Fulfillment, holds and
 * supplier submission live in the Orders module." This helper is
 * the bridge that makes that sentence true for real checkouts.
 *
 * Idempotent: one twin per storefront order, safe on webhook
 * redelivery. Failures are reported to the caller but must never
 * fail the payment webhook itself — the money already moved.
 */
export async function ensureErpTwin(
  sb: SupabaseClient,
  tenantId: string,
  order: {
    id: string;
    total: unknown;
    shipping_cost?: unknown;
    shipping_address?: unknown;
  },
): Promise<{ orderNumber: string; created: boolean } | null> {
  const { data: existing } = await sb
    .from("erp_orders")
    .select("id, order_number")
    .eq("source_order_id", order.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (existing) return { orderNumber: existing.order_number as string, created: false };

  const addr = (order.shipping_address ?? {}) as Record<string, unknown>;
  const total = Number(order.total) || 0;
  const shipping = Number(order.shipping_cost) || 0;
  const orderNumber = `UNS-${Date.now().toString(36).toUpperCase()}`;

  const { data: twin, error } = await sb
    .from("erp_orders")
    .insert({
      tenant_id: tenantId,
      order_number: orderNumber,
      source_order_id: order.id,
      status: "confirmed",
      fulfillment_method: "supplier",
      customer_email: typeof addr.email === "string" ? addr.email : null,
      currency: "USD",
      subtotal: Math.max(total - shipping, 0),
      discount_total: 0,
      tax_total: 0,
      shipping_total: shipping,
      total,
      amount_paid: total,
      balance_due: 0,
      order_date: new Date().toISOString(),
      metadata: { storefront_order_id: order.id, source: "storefront_webhook" },
    })
    .select("id, order_number")
    .single();
  if (error || !twin) return null;

  // ERP lines: the twin used to be a shell with no lines at all, so
  // the settled ledger carried no design link — a paid custom order
  // was invisible as a design order in the Orders module. Copy the
  // storefront lines (with their design_publication_id and the frozen
  // design_snapshot) onto the twin, so erp_order_lines is where the
  // design data is read from the ledger. Best-effort by the same
  // discipline as the twin itself: a lines failure is logged, never
  // fatal to the payment webhook. Idempotent by construction — this
  // runs only on twin creation, and an existing twin returns early
  // above, so redelivery never duplicates lines.
  try {
    const { data: storefrontItems } = await sb
      .from("order_items")
      .select("id, quantity, unit_price, product_variant_id, supplier_catalog_variant_id, design_publication_id, design_snapshot")
      .eq("order_id", order.id);
    if (storefrontItems?.length) {
      const labeled = await resolveItemLabels(sb, storefrontItems as LabelableLine[]);
      const lines = labeled.map((item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unit_price) || 0;
        return {
          tenant_id: tenantId,
          order_id: twin.id,
          sku_id: null,
          description:
            item.label !== "Item"
              ? item.label
              : item.design_publication_id
                ? "Custom design product"
                : "Storefront product",
          quantity: qty,
          unit_price: price,
          discount_amount: 0,
          tax_amount: 0,
          line_total: Math.round(qty * price * 100) / 100,
          quantity_reserved: 0,
          quantity_allocated: 0,
          quantity_picked: 0,
          quantity_packed: 0,
          quantity_shipped: 0,
          quantity_returned: 0,
          status: "confirmed",
          design_publication_id: (item.design_publication_id as string | null) ?? null,
          design_snapshot: (item.design_snapshot as unknown) ?? null,
        };
      });
      const { error: linesError } = await sb.from("erp_order_lines").insert(lines);
      if (linesError) console.error("[erp twin] lines copy failed:", linesError.message);
    }
  } catch (e) {
    console.error("[erp twin] lines copy failed:", e instanceof Error ? e.message : String(e));
  }

  await sb
    .from("erp_order_status_history")
    .insert({
      tenant_id: tenantId,
      order_id: twin.id,
      from_status: null,
      to_status: "confirmed",
      reason: "Storefront order paid — twin created by the Stripe webhook so this order can be worked in the Orders module.",
    })
    .then(undefined, () => undefined);

  return { orderNumber: twin.order_number as string, created: true };
}

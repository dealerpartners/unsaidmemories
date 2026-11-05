/**
 * E-commerce order records — the channel's own order table
 * (public.ecommerce_orders, migration 20261031230000).
 *
 * syncEcommerceOrder is the write hook: the Stripe webhook calls it
 * beside the ERP-twin/CRM-capture steps on every paid storefront
 * order (and on redeliveries, where it self-heals). One row per
 * storefront order, keyed by storefront_order_id, carrying the buyer
 * snapshot, the twin link, and the CRM customer link so the customer
 * profile reads ONE table for web purchases. Idempotent by upsert;
 * never throws into the payment flow (callers also guard).
 */

type DB = any;

export async function syncEcommerceOrder(
  sb: DB,
  tenantId: string,
  storefrontOrderId: string,
  crmCustomerId: string | null,
): Promise<string | null> {
  const { data: order } = await sb
    .from("orders")
    .select(
      "id, tenant_id, status, total, shipping_cost, shipping_address, stripe_payment_intent_id, created_at",
    )
    .eq("id", storefrontOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!order) return null;

  const { data: twin } = await sb
    .from("erp_orders")
    .select(
      "id, order_number, crm_customer_id, customer_email, customer_phone, subtotal, shipping_total, tax_total, currency, created_at",
    )
    .eq("source_order_id", storefrontOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const addr = (order.shipping_address ?? {}) as Record<string, any>;
  const paid = order.status === "paid" || order.status === "fulfilled";
  const row = {
    tenant_id: tenantId,
    order_number:
      twin?.order_number ??
      `WEB-${String(order.id).slice(0, 8).toUpperCase()}`,
    storefront_order_id: order.id,
    erp_order_id: twin?.id ?? null,
    crm_customer_id: crmCustomerId ?? twin?.crm_customer_id ?? null,
    customer_email:
      twin?.customer_email ??
      (typeof addr.email === "string" ? addr.email : null),
    customer_name: typeof addr.name === "string" ? addr.name : null,
    customer_phone:
      twin?.customer_phone ??
      (typeof addr.phone === "string" ? addr.phone : null),
    shipping_address: order.shipping_address ?? null,
    status: order.status,
    payment_status:
      order.status === "pending_payment"
        ? "pending"
        : paid
          ? "paid"
          : order.status,
    fulfillment_status: twin ? "in_progress" : "not_started",
    subtotal: twin?.subtotal ?? null,
    shipping_total: twin?.shipping_total ?? order.shipping_cost ?? null,
    tax_total: twin?.tax_total ?? null,
    total: order.total ?? null,
    currency: twin?.currency ?? "USD",
    stripe_payment_intent_id: order.stripe_payment_intent_id ?? null,
    placed_at: order.created_at,
    paid_at: paid ? (twin?.created_at ?? new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("ecommerce_orders")
    .upsert(row, { onConflict: "storefront_order_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

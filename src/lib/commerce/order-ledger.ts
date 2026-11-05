import { createServerClient } from "@/lib/supabase";
import { postJournal, round2 } from "@/lib/accounting";

type DB = ReturnType<typeof createServerClient>;

/**
 * Order → people + books. When a storefront order is PAID, two
 * records must exist outside the order itself:
 *
 *   1. A CRM customer for the buyer (crm_customers), keyed by the
 *      checkout email — the same table the accounting customers
 *      screen and the CRM module read (see the manual create in
 *      /api/admin/accounting/customers for the row shape).
 *   2. A balanced journal entry for the sale in Accounting:
 *      Dr 1010 Stripe Clearing (the money is at Stripe until
 *      payout) / Cr 4000 Sales Revenue (goods) / Cr 4900 Other
 *      Income (shipping charged). Only amounts the order itself
 *      carries are posted — no invented tax, fees, or COGS.
 *
 * Both helpers are idempotent and safe to re-run on webhook
 * redelivery. Callers wrap them so a failure here never fails the
 * payment webhook — the money already moved; the records can be
 * healed on the next delivery.
 */

interface OrderLike {
  id: string;
  total: unknown;
  shipping_cost?: unknown;
  shipping_address?: unknown;
  customer_id?: string | null;
}

export async function captureOrderCustomer(
  sb: DB,
  tenantId: string,
  order: OrderLike,
): Promise<string | null> {
  const addr = (order.shipping_address ?? {}) as Record<string, any>;
  const email = typeof addr.email === "string" ? addr.email.trim() : "";
  if (!email) return null;

  const total = round2(Number(order.total) || 0);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const { data: existing } = await sb
    .from("crm_customers")
    .select("id, lifetime_value, lifecycle_stage, total_spend_30d, total_spend_365d")
    .eq("tenant_id", tenantId)
    .ilike("email", email)
    .is("merged_into_customer_id", null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Per-order idempotency: an order counts toward lifetime value
    // exactly once. The marker is the order's ERP twin — once the
    // twin is linked to this customer (the webhook links it right
    // after capture), the spend has been counted.
    const { data: twin } = await sb
      .from("erp_orders")
      .select("crm_customer_id")
      .eq("source_order_id", order.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const { data: posted } = await sb
      .from("acct_journal_entries")
      .select("id")
      .eq("source", "order")
      .eq("source_id", order.id)
      .limit(1)
      .maybeSingle();
    if (twin?.crm_customer_id === existing.id || posted) {
      await sb
        .from("crm_customers")
        .update({ last_activity_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", existing.id);
      return existing.id as string;
    }
    const priorValue = Number(existing.lifetime_value || 0);
    const patch: Record<string, unknown> = {
      lifetime_value: round2(priorValue + total),
      total_spend_30d: round2(Number((existing as any).total_spend_30d || 0) + total),
      total_spend_365d: round2(Number((existing as any).total_spend_365d || 0) + total),
      last_activity_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    // A buyer with prior spend is returning; a first purchase makes
    // them a customer. Never demote a stage staff already set
    // (vip / at_risk / active stay as they are).
    if (priorValue > 0 && ["new", "new_lead", "new_customer"].includes(String(existing.lifecycle_stage))) {
      patch.lifecycle_stage = "returning";
    } else if (priorValue <= 0 && ["new", "new_lead"].includes(String(existing.lifecycle_stage))) {
      patch.lifecycle_stage = "new_customer";
    }
    await sb.from("crm_customers").update(patch).eq("id", existing.id);
    return existing.id as string;
  }

  const fullName = typeof addr.name === "string" ? addr.name.trim() : "";
  const parts = fullName.split(/\s+/).filter(Boolean);
  const { data: created, error } = await sb
    .from("crm_customers")
    .insert({
      tenant_id: tenantId,
      customer_type: "Retail",
      lifecycle_stage: "new_customer",
      lifecycle_status: "active",
      first_name: parts[0] ?? null,
      last_name: parts.slice(1).join(" ") || null,
      email,
      phone: typeof addr.phone === "string" ? addr.phone : null,
      address_line1: typeof addr.line1 === "string" ? addr.line1 : null,
      address_line2: typeof addr.line2 === "string" ? addr.line2 : null,
      city: typeof addr.city === "string" ? addr.city : null,
      state: typeof addr.state === "string" ? addr.state : null,
      postal_code: typeof addr.postal_code === "string" ? addr.postal_code : null,
      country: typeof addr.country === "string" ? addr.country : "US",
      customer_since: today,
      first_contact_at: now.toISOString(),
      last_activity_at: now.toISOString(),
      lifetime_value: total,
      average_ticket: total,
      outstanding_balance: 0,
      total_spend_30d: total,
      total_spend_365d: total,
      // A purchase is not marketing consent — transactional only.
      marketing_email_opt_in: false,
      marketing_sms_opt_in: false,
      transactional_email_opt_in: true,
      transactional_sms_opt_in: false,
      do_not_call: false,
      do_not_contact: false,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw new Error("CRM capture failed: " + error.message);
  return created.id as string;
}

export async function postOrderSaleJournal(
  sb: DB,
  order: OrderLike,
  reference?: string | null,
): Promise<string | null> {
  const { data: prior } = await sb
    .from("acct_journal_entries")
    .select("id")
    .eq("source", "order")
    .eq("source_id", order.id)
    .limit(1)
    .maybeSingle();
  if (prior) return prior.id as string;

  const total = round2(Number(order.total) || 0);
  const shipping = round2(Number(order.shipping_cost) || 0);
  const goods = round2(total - shipping);
  if (total <= 0) return null;

  return postJournal(sb, {
    source: "order",
    sourceId: order.id,
    reference: reference ?? null,
    memo: `Online sale — order ${order.id.slice(0, 8)}`,
    lines: [
      { accountCode: "1010", debit: total, credit: 0, memo: "Stripe clearing — payment received" },
      { accountCode: "4000", debit: 0, credit: goods, memo: "Merchandise revenue" },
      ...(shipping > 0
        ? [{ accountCode: "4900", debit: 0, credit: shipping, memo: "Shipping charged to customer" }]
        : []),
    ],
  });
}

import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import Stripe from "stripe";

function num(v: any): number { return Math.round((parseFloat(String(v ?? "0")) || 0) * 100) / 100; }

let _stripe: Stripe | null = null;
function getStripe(): Stripe | null {
  try {
    if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    return _stripe;
  } catch { return null; }
}

// Human-readable Stripe failure reasons
const FAILURE_REASONS: Record<string, string> = {
  card_declined: "Card declined",
  insufficient_funds: "Insufficient funds",
  expired_card: "Expired card",
  incorrect_cvc: "Incorrect security code",
  incorrect_number: "Incorrect card number",
  incorrect_zip: "Incorrect ZIP code",
  processing_error: "Processing error — try again",
  authentication_failed: "3D Secure authentication failed",
  authentication_required: "Bank requires additional authentication",
  do_not_honor: "Bank declined (do not honor)",
  do_not_try_again: "Bank declined — do not retry",
  fraudulent: "Flagged as potentially fraudulent",
  lost_card: "Reported lost card",
  stolen_card: "Reported stolen card",
  pickup_card: "Card flagged for pickup",
  restricted_card: "Restricted card",
  generic_decline: "Card declined",
  invalid_account: "Invalid account",
  issuer_not_available: "Issuer unavailable — try again later",
  new_account_information_available: "Updated card info available",
  no_action_taken: "No action taken",
  not_permitted: "Transaction not permitted",
  offline_pin_required: "PIN required",
  online_or_offline_pin_required: "PIN required",
  pin_try_exceeded: "PIN attempts exceeded",
  reenter_transaction: "Re-enter transaction",
  refer_to_issuer: "Refer to card issuer",
  testmode_decline: "Test mode decline",
  try_again_later: "Try again later",
  withdrawal_count_limit_exceeded: "Withdrawal limit exceeded",
  payment_intent_authentication_failure: "Authentication failed",
  setup_intent_authentication_failure: "Setup authentication failed",
};

function humanReason(code: string | null | undefined, fallback?: string | null): string {
  if (!code) return fallback || "Payment failed";
  return FAILURE_REASONS[code] || code.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function methodLabel(pi: Stripe.PaymentIntent): string {
  const pm = pi.payment_method as Stripe.PaymentMethod | null;
  if (typeof pm === "object" && pm?.type) {
    const t = pm.type;
    if (t === "card" && pm.card) return `Card •• ${pm.card.last4 || "••••"} ${pm.card.brand || ""}`.trim();
    return t.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  return pi.payment_method_types?.[0]?.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "Unknown";
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("payments", "read"); if (gate) return gate;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "200") || 200, 500);

  // --- Failed payments view ---
  if (searchParams.get("status") === "failed") {
    return getFailedPayments(limit, resolveTenantId(req));
  }

  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    const r = await client.query(
      `SELECT cp.id::text, cp.payment_number, cp.amount, cp.tip_amount, cp.currency, cp.status,
              cp.processor_transaction_id, cp.external_reference, cp.created_at, cp.location_id,
              cp.customer_id::text AS customer_id,
              cc.first_name AS customer_first_name, cc.last_name AS customer_last_name, cc.email AS customer_email,
              COALESCE(pm.name, 'Other') AS tender_name,
              s.display_name AS staff_name,
              NULL::text AS pet_name
       FROM public.commerce_payments cp
       LEFT JOIN public.crm_customers cc ON cc.id = cp.customer_id
       LEFT JOIN public.commerce_payment_methods pm ON pm.id = cp.payment_method_id
       LEFT JOIN public.crm_staff s ON s.id = cp.staff_id
       WHERE cp.tenant_id = $1
       ORDER BY cp.created_at DESC LIMIT $2`,
      [tenant, limit],
    );
    return NextResponse.json({
      payments: r.rows.map((row: any) => ({
        id: row.payment_number || row.id,
        dbId: row.id,
        customerId: row.customer_id || null,
        customer: [row.customer_first_name, row.customer_last_name].filter(Boolean).join(" ").trim() || row.customer_email || "Walk-in",
        amount: num(row.amount),
        tips: num(row.tip_amount),
        tender: row.tender_name,
        status: String(row.status || "").toLowerCase() === "succeeded" || String(row.status || "").toLowerCase() === "captured" ? "PAID" : String(row.status || "").toUpperCase(),
        date: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : null,
        time: row.created_at ? new Date(row.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null,
        reference: row.processor_transaction_id || row.external_reference || row.tender_name,
        pet: row.pet_name || null,
        staff: row.staff_name || "—",
        locationId: row.location_id || null,
      })),
      total: r.rows.length,
    });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}

// ---------------------------------------------------------------------------
// GET ?status=failed — failed payment visibility for the owner.
// Sources: (1) internal commerce_payments with failure statuses,
//          (2) Stripe PaymentIntents that failed in the last 30 days.
// ---------------------------------------------------------------------------
async function getFailedPayments(limit: number, tenant: string) {
  const failed: any[] = [];
  const errors: string[] = [];

  // --- 1. Internal failures ---
  try {
    await withPg(async (client) => {
      const r = await client.query(
        `SELECT cp.id::text, cp.payment_number, cp.amount, cp.currency, cp.status,
                cp.processor_transaction_id, cp.external_reference, cp.created_at,
                cp.sale_id, cp.customer_id,
                cc.first_name AS customer_first_name, cc.last_name AS customer_last_name,
                cc.email AS customer_email, cc.phone AS customer_phone,
                COALESCE(pm.name, 'Other') AS tender_name
         FROM public.commerce_payments cp
         LEFT JOIN public.crm_customers cc ON cc.id = cp.customer_id
         LEFT JOIN public.commerce_payment_methods pm ON pm.id = cp.payment_method_id
         WHERE cp.tenant_id = $1
           AND LOWER(cp.status) IN ('failed', 'declined', 'cancelled', 'error', 'canceled')
         ORDER BY cp.created_at DESC LIMIT $2`,
        [tenant, limit],
      );
      for (const row of r.rows) {
        // Broken-pipe diagnostics: check downstream records
        let webhookReceived: boolean | null = null;
        let orderCreated: boolean | null = null;
        try {
          if (row.processor_transaction_id) {
            const w = await client.query(
              `SELECT 1 FROM public.commerce_webhook_events WHERE payload::text LIKE $1 LIMIT 1`,
              [`%${row.processor_transaction_id}%`]
            );
            webhookReceived = w.rows.length > 0;
          }
          if (row.sale_id) {
            const o = await client.query(`SELECT 1 FROM public.commerce_sales WHERE id = $1::uuid LIMIT 1`, [row.sale_id]);
            orderCreated = o.rows.length > 0;
          }
        } catch { /* diagnostics best-effort */ }
        failed.push({
          id: `internal-${row.id}`,
          source: "internal",
          customer_name: [row.customer_first_name, row.customer_last_name].filter(Boolean).join(" ").trim() || "Walk-in",
          customer_email: row.customer_email || null,
          customer_phone: row.customer_phone || null,
          customer_id: row.customer_id || null,
          amount: num(row.amount),
          currency: (row.currency || "USD").toUpperCase(),
          method: row.tender_name,
          failure_reason: humanReason(null, String(row.status || "failed")),
          failure_code: String(row.status || "failed"),
          stripe_payment_intent_id: row.processor_transaction_id || null,
          created_at: row.created_at,
          date: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : null,
          time: row.created_at ? new Date(row.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null,
          diagnostics: {
            payment_attempt: true,
            stripe_response: row.processor_transaction_id ? "recorded" : "missing",
            webhook_received: webhookReceived,
            order_created: orderCreated,
          },
          raw: { payment_number: row.payment_number, external_reference: row.external_reference },
        });
      }
    });
  } catch (e: any) {
    errors.push(`Internal DB: ${e?.message || "unavailable"}`);
  }

  // --- 2. Stripe failures (last 30 days) ---
  const stripe = getStripe();
  if (!stripe) {
    errors.push("Stripe: STRIPE_SECRET_KEY not configured");
  } else {
    try {
      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
      const intents = await stripe.paymentIntents.list({ limit: 100, created: { gte: thirtyDaysAgo } });
      // Also check the internal ledger to correlate
      const stripeIds = new Set<string>();
      try {
        await withPg(async (client) => {
          const r = await client.query(
            `SELECT provider_transaction_id FROM public.payment_transactions WHERE provider = 'stripe' AND tenant_id = $1`,
            [tenant]
          );
          for (const row of r.rows) if (row.provider_transaction_id) stripeIds.add(row.provider_transaction_id);
        });
      } catch { /* best-effort */ }

      for (const pi of intents.data) {
        if (pi.status !== "requires_payment_method" && pi.status !== "canceled") continue;
        const lastErr = pi.last_payment_error;
        const code = lastErr?.code || (pi.status === "canceled" ? "canceled" : "failed");
        // Customer details
        let custEmail: string | null = (pi.receipt_email as string) || null;
        let custName: string | null = null;
        let custPhone: string | null = null;
        if (typeof pi.customer === "string" && pi.customer) {
          try {
            const c = await stripe.customers.retrieve(pi.customer) as Stripe.Customer;
            if (!c.deleted) { custEmail = c.email || custEmail; custName = c.name || null; custPhone = c.phone || null; }
          } catch { /* best-effort */ }
        }
        // Broken-pipe diagnostics
        const inLedger = stripeIds.has(pi.id);
        failed.push({
          id: `stripe-${pi.id}`,
          source: "stripe",
          customer_name: custName || pi.metadata?.customer_name || "Unknown",
          customer_email: custEmail || pi.metadata?.customer_email || null,
          customer_phone: custPhone || null,
          customer_id: typeof pi.customer === "string" ? pi.customer : null,
          amount: (pi.amount || 0) / 100,
          currency: (pi.currency || "usd").toUpperCase(),
          method: methodLabel(pi),
          failure_reason: humanReason(code, lastErr?.message),
          failure_code: code,
          failure_message: lastErr?.message || null,
          stripe_payment_intent_id: pi.id,
          created_at: new Date(pi.created * 1000).toISOString(),
          date: new Date(pi.created * 1000).toISOString().slice(0, 10),
          time: new Date(pi.created * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
          diagnostics: {
            payment_attempt: true,
            stripe_response: code,
            webhook_received: inLedger,
            order_created: inLedger ? "check orders" : false,
          },
          raw: {
            status: pi.status,
            decline_code: (lastErr as any)?.decline_code || null,
            payment_method_types: pi.payment_method_types,
          },
        });
        if (failed.length >= limit) break;
      }
    } catch (e: any) {
      errors.push(`Stripe API: ${e?.message || "unavailable"}`);
    }
  }

  // Sort newest first
  failed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return NextResponse.json({ failed_payments: failed.slice(0, limit), total: failed.length, errors: errors.length > 0 ? errors : undefined });
}

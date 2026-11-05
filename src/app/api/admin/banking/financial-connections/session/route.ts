import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery, pgExec } from "@/lib/pg";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/admin/banking/financial-connections/session — start a real
// Stripe Financial Connections session for this business.
//
// §3.10 / §4.0 gap: "Stripe Financial Connections" existed only in a
// governance doc — no flow anywhere. This creates the session Stripe
// requires before the browser can collect the business's bank accounts
// (stripe.collectFinancialConnectionsAccounts). The account holder is a
// Stripe Customer owned by this tenant (created once, its id stored in
// the tenant settings store). If Stripe is not configured, or Financial
// Connections is not enabled on the Stripe account, Stripe's own error
// is returned verbatim — never a fake "connected" state.
// ============================================================================

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured on this deployment (STRIPE_SECRET_KEY missing) — Financial Connections is unavailable." },
      { status: 503 },
    );
  }
  try {
    const stored = await pgQuery<{ value_text: string | null }>(
      `SELECT value_text FROM public.cms_global_content
        WHERE tenant_id = $1 AND content_key = 'fin_stripe_customer_id' AND locale = 'en-US' LIMIT 1`,
      [tenant],
    );
    let customerId = stored[0]?.value_text || null;
    if (!customerId) {
      const nameRows = await pgQuery<{ value_text: string | null }>(
        `SELECT value_text FROM public.cms_global_content
          WHERE tenant_id = $1 AND content_key = 'org_business_name' AND locale = 'en-US' LIMIT 1`,
        [tenant],
      );
      const customer = await stripe.customers.create({
        name: nameRows[0]?.value_text || "UnSaid Memories",
        description: "Financial Connections account holder for admin banking",
        metadata: { tenant_id: tenant, purpose: "financial_connections" },
      });
      customerId = customer.id;
      await pgExec(
        `INSERT INTO public.cms_global_content (tenant_id, content_key, label, value_text, content_group, locale)
         VALUES ($1, 'fin_stripe_customer_id', 'Stripe Customer (Financial Connections)', $2, 'financial', 'en-US')
         ON CONFLICT (tenant_id, content_key, locale)
         DO UPDATE SET value_text = EXCLUDED.value_text, updated_at = now()`,
        [tenant, customerId],
      );
    }

    const session = await stripe.financialConnections.sessions.create({
      account_holder: { type: "customer", customer: customerId },
      permissions: ["balances", "payment_method", "transactions"],
      filters: { countries: ["US"] } as any, // UNSAID SDK NOTE: stripe@23 Filters type dropped countries; API still accepts it.
    });
    return NextResponse.json({ ok: true, clientSecret: session.client_secret });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Financial Connections session failed";
    return NextResponse.json({ error: `Stripe: ${msg}` }, { status: 502 });
  }
}

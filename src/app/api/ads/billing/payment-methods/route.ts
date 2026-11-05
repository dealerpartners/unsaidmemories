import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { MASTER_TENANT_ID } from "@/lib/site-tenant";
import { getCurrentUser } from "@/lib/auth/server";
import { getStripe } from "@/lib/stripe";
import { ensureDeveloperContext } from "@/lib/devportal-server";
import {
  ensureAdAccount,
  ensureAdAccountStripeCustomer,
  orgIdForUser,
  type AdAccount,
} from "@/lib/ads-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/ads/billing/payment-methods — the ad account's saved cards
 * (ad_payment_methods, AB8). Before BL-5 the table was referenced in
 * zero source files and no payment was ever collected for advertising.
 *
 * GET: the org's ad-account methods (active), default first.
 * POST { payment_method_id }: save a card the browser just confirmed
 *      through the setup-intent — the id is retrieved from Stripe,
 *      verified against the ACCOUNT's Stripe customer (attached if it
 *      isn't yet), and only Stripe's summary (brand/last4) is stored.
 *      Cards themselves never live in our database.
 */

async function accountForOrg(organizationId: string): Promise<AdAccount | null> {
  const rows = await pgQueryStrict<AdAccount>(
    `SELECT id, organization_id, tenant_id, name, status, verified, tier, stripe_customer_id
       FROM public.ad_accounts WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [organizationId],
  );
  return rows[0] ?? null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const organizationId = await orgIdForUser(user.id);
    if (!organizationId) return NextResponse.json({ payment_methods: [], account: null });
    const account = await accountForOrg(organizationId);
    if (!account) return NextResponse.json({ payment_methods: [], account: null });
    const methods = await pgQueryStrict(
      `SELECT id, provider, provider_ref, method_type, brand, last4, is_default, status, created_at
         FROM public.ad_payment_methods
        WHERE account_id = $1 AND status = 'active'
        ORDER BY is_default DESC, created_at ASC`,
      [account.id],
    );
    return NextResponse.json({ payment_methods: methods, account });
  } catch {
    return NextResponse.json({ error: "payment_methods_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Card management is unavailable right now.", state: "stripe_not_configured" },
      { status: 503 },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const paymentMethodId = String(body.payment_method_id ?? "").trim();
  if (!paymentMethodId.startsWith("pm_")) {
    return NextResponse.json({ error: "payment_method_required" }, { status: 400 });
  }
  try {
    const ctx = await ensureDeveloperContext(user);
    const account = await ensureAdAccount(
      ctx.organizationId,
      ctx.tenantId ?? MASTER_TENANT_ID,
      ctx.organizationName,
    );
    const customerId = await ensureAdAccountStripeCustomer(account, user.email ?? null);
    if (!customerId) {
      return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
    }

    let pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer && pm.customer !== customerId) {
      return NextResponse.json({ error: "payment_method_belongs_elsewhere" }, { status: 409 });
    }
    if (!pm.customer) {
      pm = await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    }

    const existing = await pgQueryStrict<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.ad_payment_methods
        WHERE account_id = $1 AND status = 'active'`,
      [account.id],
    );
    const saved = await pgQueryStrict(
      `INSERT INTO public.ad_payment_methods
         (account_id, provider, provider_ref, method_type, brand, last4, is_default, status)
       VALUES ($1, 'stripe', $2, $3, $4, $5, $6, 'active')
       RETURNING id, provider, provider_ref, method_type, brand, last4, is_default, status, created_at`,
      [
        account.id,
        pm.id,
        pm.type,
        pm.card?.brand ?? null,
        pm.card?.last4 ?? null,
        (existing[0]?.n ?? 0) === 0,
      ],
    );
    return NextResponse.json({ payment_method: saved[0] });
  } catch {
    return NextResponse.json({ error: "payment_method_save_unavailable" }, { status: 503 });
  }
}

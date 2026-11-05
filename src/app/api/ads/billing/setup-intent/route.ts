import { NextResponse } from "next/server";
import { MASTER_TENANT_ID } from "@/lib/site-tenant";
import { getCurrentUser } from "@/lib/auth/server";
import { getStripe } from "@/lib/stripe";
import { ensureDeveloperContext } from "@/lib/devportal-server";
import { ensureAdAccount, ensureAdAccountStripeCustomer } from "@/lib/ads-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ads/billing/setup-intent — starts an add-a-card for the
 * advertiser's AD ACCOUNT (AB8). Mirrors the customer portal's
 * setup-intent discipline: the Stripe customer is resolved from the
 * session (the organization's ad account, attach-or-create), never from
 * the request body; the browser confirms the SetupIntent with Stripe
 * Elements, so card numbers never touch our servers; the confirmed
 * payment method is then saved via POST /api/ads/billing/payment-methods.
 *
 * Honest states: no session → 401; Stripe unconfigured → 503
 * stripe_not_configured.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Card management is unavailable right now.", state: "stripe_not_configured" },
      { status: 503 },
    );
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
      return NextResponse.json(
        { error: "We couldn't start card setup for your account.", state: "stripe_not_configured" },
        { status: 503 },
      );
    }
    const intent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { ad_account_id: account.id, source: "ads_billing_payment_methods" },
      // UNSAID SDK NOTE (transplant lane 2): Unsaid's stripe@23 types dropped
      // payment_method_types (the Stripe API still accepts it); the cast
      // keeps UnSaid Memories's runtime params byte-identical.
    } as any);
    if (!intent.client_secret) {
      return NextResponse.json({ error: "We couldn't start card setup." }, { status: 500 });
    }
    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch {
    return NextResponse.json({ error: "setup_unavailable" }, { status: 503 });
  }
}

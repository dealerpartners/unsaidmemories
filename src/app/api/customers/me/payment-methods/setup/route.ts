import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { getOrCreateStripeCustomer, getStripeFromVault } from "@/lib/stripe-customer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — start saving a card: creates (or reuses) the customer's
 * Stripe Customer and returns a SetupIntent client secret for the
 * browser's Stripe form. The card itself goes straight to Stripe.
 */
export async function POST() {
  const auth = await requireCustomer();
  if (auth.error) return auth.error;
  try {
    const customerId = await getOrCreateStripeCustomer({ id: auth.user.id, email: auth.user.email });
    const stripe = await getStripeFromVault();
    const intent = await stripe.setupIntents.create({
      customer: customerId,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      usage: "off_session",
    });
    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not start card setup." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { createServerClient } from "@/lib/supabase";
import { getStripeFromVault } from "@/lib/stripe-customer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE — remove one saved card. Verified against the customer's own Stripe Customer first. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCustomer();
  if (auth.error) return auth.error;
  const { id } = await params;
  try {
    const db = createServerClient();
    const { data: profile } = await db
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: "No saved cards on this account." }, { status: 404 });
    }
    const stripe = await getStripeFromVault();
    const pm = await stripe.paymentMethods.retrieve(id);
    if (pm.customer !== profile.stripe_customer_id) {
      return NextResponse.json({ error: "That card does not belong to this account." }, { status: 403 });
    }
    await stripe.paymentMethods.detach(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not remove that card." }, { status: 500 });
  }
}

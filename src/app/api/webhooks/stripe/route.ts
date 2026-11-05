import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getStripeFromVault } from "@/lib/stripe-customer";
import { getIntegrationKey } from "@/lib/integrations/keys";
import Stripe from "stripe";
import { getTenantId } from "@/lib/tenant";
import { processPaidOrder } from "@/lib/commerce/order-paid";
import {
  postStripePayout,
  postStripeChargeRefunds,
  postStripeDisputeCreated,
  postStripeDisputeClosed,
} from "@/lib/commerce/stripe-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

// POST /api/webhooks/stripe — Stripe payment confirmation.
// Signature verification is MANDATORY: no webhook secret configured → 500,
// no stripe-signature header → 400, bad signature → 400. There is no
// unauthenticated parsing fallback.
//
// On payment_intent.succeeded (PAYMENT FIRST, FULFILLMENT SECOND):
//   1. Mark the order paid (idempotent — skip if already paid).
//   2. Carry the design through: every order_item keeps its
//      design_publication_id, and any missing design_file_snapshot_url is
//      resolved from the design_publications row and written back.
//   3. Create fulfillment_orders as DRAFT per supplier — each order line's
//      supplier is resolved by variant_fulfillment_routes priority (or the
//      supplier catalog variant itself), and the winning route_id is
//      recorded on the fulfillment row. Supplier adapters (Orders module)
//      submit from these rows; nothing is ever submitted before payment.
export async function POST(req: NextRequest) {
  // Signing secret resolves Connections-vault-first (env fallback)
  // so the Connections page tells the truth for Stripe. Signature
  // verification stays mandatory either way.
  const webhookSecret = (await getIntegrationKey("STRIPE_WEBHOOK_SECRET")) || undefined;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured — webhook refused" },
      { status: 500 }
    );
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing stripe-signature header" }, { status: 400 });
  }

  let stripe: Stripe;
  try {
    stripe = await getStripeFromVault();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (e: any) {
    return NextResponse.json({ error: `webhook verification failed: ${e.message}` }, { status: 400 });
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = intent.metadata?.order_id;
    if (orderId) {
      const sb = createServerClient();
      await sb
        .from("orders")
        .update({ status: "payment_failed" })
        .eq("id", orderId)
        .eq("tenant_id", PLATFORM_TENANT_ID)
        .eq("status", "pending_payment");
    }
    return NextResponse.json({ received: true, handled: true });
  }

  // Money-movement events → Accounting (stripe-ledger). Same
  // discipline as the sale path: a books failure never fails the
  // webhook — the money already moved and the posters are
  // idempotent, so a redelivery heals a missed record.
  if (event.type === "payout.paid") {
    const payout = event.data.object as Stripe.Payout;
    let payoutRow: string | null = null;
    try {
      payoutRow = await postStripePayout(createServerClient(), stripe, PLATFORM_TENANT_ID, payout);
    } catch (e) {
      console.error("[stripe webhook] payout posting failed:", e);
    }
    return NextResponse.json({ received: true, handled: true, payout_row: payoutRow });
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    let refunds: string[] = [];
    try {
      refunds = (await postStripeChargeRefunds(createServerClient(), PLATFORM_TENANT_ID, charge)).recorded;
    } catch (e) {
      console.error("[stripe webhook] refund posting failed:", e);
    }
    return NextResponse.json({ received: true, handled: true, refund_rows: refunds });
  }

  if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
    const dispute = event.data.object as Stripe.Dispute;
    let disputeRow: string | null = null;
    try {
      disputeRow =
        event.type === "charge.dispute.created"
          ? await postStripeDisputeCreated(createServerClient(), PLATFORM_TENANT_ID, dispute)
          : await postStripeDisputeClosed(createServerClient(), PLATFORM_TENANT_ID, dispute);
    } catch (e) {
      console.error("[stripe webhook] dispute posting failed:", e);
    }
    return NextResponse.json({ received: true, handled: true, dispute_row: disputeRow });
  }

  if (event.type !== "payment_intent.succeeded") {
    return NextResponse.json({ received: true, handled: false });
  }

  const intent = event.data.object as Stripe.PaymentIntent;
  const orderId = intent.metadata?.order_id;
  if (!orderId) return NextResponse.json({ error: "no order_id in metadata" }, { status: 400 });

  const sb = createServerClient();
  return processPaidOrder(sb, PLATFORM_TENANT_ID, orderId);
}

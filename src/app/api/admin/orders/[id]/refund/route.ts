import { SITE_URL } from "@/lib/site-url";
import { toResendVariables } from "@/lib/email/resend-templates";
import { renderHostedEmail } from "@/lib/email/hosted-render";
import { sendEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import Stripe from "stripe";
import { getTenantId } from "@/lib/tenant";
import { requireAdminApi } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

// POST /api/admin/orders/[id]/refund — refund via Stripe.
// Body: { amount? } (partial refund in dollars; omit for full refund)
// Petstore finance-spine pattern: money moves ONLY here, never in cancel.
// Guards: must have a Stripe payment intent, not already refunded.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const amount = body.amount != null ? Number(body.amount) : null;
  if (amount != null && (!Number.isFinite(amount) || amount <= 0)) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });

  const sb = createServerClient();
  const { data: order } = await sb.from("orders")
    .select("id, status, total, stripe_payment_intent_id, customer_id, shipping_address")
    .eq("id", id).eq("tenant_id", PLATFORM_TENANT_ID).maybeSingle();
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  if (order.status === "refunded") return NextResponse.json({ error: "order already refunded" }, { status: 409 });
  if (!order.stripe_payment_intent_id) return NextResponse.json({ error: "no Stripe payment on this order" }, { status: 409 });

  const stripe = new Stripe(stripeKey);
  let refund;
  try {
    refund = await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      amount: amount != null ? Math.round(amount * 100) : undefined,
      metadata: { order_id: id, tenant_id: PLATFORM_TENANT_ID },
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Stripe refund failed: ${e.message}` }, { status: 502 });
  }

  const isFull = amount == null || amount >= Number(order.total);
  const { data: updated } = await sb.from("orders")
    .update({ status: isFull ? "refunded" : order.status })
    .eq("id", id).select().single();

  // The customer hears the refund is on its way (Sunny's design).
  // Card last4 comes from the charge behind the payment intent;
  // the buyer email + name live on the order's shipping address.
  try {
    const addr = ((order as any).shipping_address || {}) as Record<string, any>;
    const buyerEmail = typeof addr.email === "string" ? addr.email : null;
    if (buyerEmail) {
      let last4 = "";
      try {
        const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, { expand: ["latest_charge"] });
        const charge: any = (pi as any).latest_charge;
        last4 = charge?.payment_method_details?.card?.last4 || "";
      } catch { /* last4 stays empty — the template tolerates it */ }
      const { data: twin } = await sb.from("erp_orders").select("order_number").eq("source_order_id", id).maybeSingle();
      const orderNumber = String((twin as any)?.order_number || id.slice(0, 8));
      const vars = toResendVariables({
        firstName: String(addr.first_name || "").trim() || String(addr.name || "").trim().split(/\s+/)[0] || "there",
        orderNumber,
        refundAmount: `$${(refund.amount / 100).toFixed(2)}`,
        last4,
        orderUrl: `${SITE_URL}/account/orders`,
      });
      await sendEmail({
        to: buyerEmail,
        template: "refund_issued",
        subject: `Your refund is on its way — ${orderNumber}`,
        relatedOrderId: id,
        html: renderHostedEmail("refund_issued", vars) || "",
        variables: vars,
      });
    }
  } catch (e: any) {
    console.error("[refund] customer email failed:", e?.message);
  }

  return NextResponse.json({
    order: updated,
    refund: { id: refund.id, amount: refund.amount / 100, status: refund.status },
  });
}

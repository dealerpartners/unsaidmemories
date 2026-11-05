import { NextRequest, NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/gift-cards/purchase
// Creates a Stripe Checkout Session for a gift card purchase.
// Body: { amount, recipientName, recipientEmail, senderName, message, cardColor }
// Returns: { url } — the Stripe Checkout URL to redirect to.
//
// The gift card details are stored in the session metadata so the success
// page can create the gift card record + send the delivery email after
// payment is confirmed.
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured. Set STRIPE_SECRET_KEY in the environment." },
      { status: 503 },
    );
  }

  let body: {
    amount?: number;
    recipientName?: string;
    recipientEmail?: string;
    senderName?: string;
    message?: string;
    cardColor?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const amount = Math.max(10, Math.min(500, Number(body.amount) || 0));
  if (amount < 10) {
    return NextResponse.json({ error: "Minimum gift card amount is $10" }, { status: 400 });
  }

  const recipientEmail = String(body.recipientEmail || "").trim();
  const recipientName = String(body.recipientName || "").trim();
  const senderName = String(body.senderName || "").trim();
  const message = String(body.message || "").trim();
  const cardColor = String(body.cardColor || "#7254d6").trim();

  if (!recipientEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
    return NextResponse.json({ error: "A valid recipient email is required" }, { status: 400 });
  }
  if (!senderName) {
    return NextResponse.json({ error: "Your name is required" }, { status: 400 });
  }

  const base = SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://unsaid-theta.vercel.app";

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: "UnSaid Memories Gift Card",
              description: `$${amount} digital gift card for ${recipientName || recipientEmail}`,
            },
          },
        },
      ],
      metadata: {
        type: "gift_card",
        amount: String(amount),
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        sender_name: senderName,
        message,
        card_color: cardColor,
      },
      success_url: `${base}/gift-cards/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/gift-cards`,
      automatic_tax: { enabled: false },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create checkout session";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

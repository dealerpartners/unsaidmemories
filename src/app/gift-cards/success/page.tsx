import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { pgQuery } from "@/lib/pg";
import { getTenantId } from "@/lib/tenant";
import { sendEmail } from "@/lib/email";
import { toResendVariables } from "@/lib/email/resend-templates";
import { giftCardDeliveryHtml, giftCardPurchaseHtml } from "@/lib/email/templates/gift-cards";
import "../gift-cards.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generate a human-readable gift card number: US-XXXX-XXXX-XXXX
function generateCardNumber(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous O/0/I/1
  const group = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `US-${group()}-${group()}-${group()}`;
}

type FulfillmentResult = {
  ok: boolean;
  cardNumber: string;
  amount: string;
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  message: string;
  cardColor: string;
  dbSaved: boolean;
  emailSent: boolean;
  error?: string;
};

async function fulfillGiftCard(session: {
  id: string;
  payment_status: string;
  metadata?: Record<string, string> | null;
  amount_total?: number | null;
  customer_details?: { email?: string | null } | null;
}): Promise<FulfillmentResult> {
  const meta = session.metadata || {};
  const amount = Number(meta.amount || (session.amount_total ? session.amount_total / 100 : 0)) || 0;
  const amountStr = `$${amount}`;
  const recipientName = meta.recipient_name || "";
  const recipientEmail = meta.recipient_email || "";
  const senderName = meta.sender_name || "";
  const message = meta.message || "";
  const cardColor = meta.card_color || "#7254d6";
  const buyerEmail = session.customer_details?.email || "";
  const cardNumber = generateCardNumber();

  let dbSaved = false;
  let emailSent = false;

  // 1. Persist the gift card record (best-effort — DB may be unreachable in sandbox)
  try {
    const tenantId = getTenantId();
    await pgQuery(
      `INSERT INTO public.commerce_gift_cards
         (card_number, initial_value, balance, status, card_format,
          recipient_name, recipient_email, sender_name, buyer_email,
          message, card_color, stripe_session_id, tenant_id, issued_at)
       VALUES ($1, $2, $2, 'active', 'digital', $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (card_number) DO NOTHING`,
      [
        cardNumber,
        amount,
        recipientName,
        recipientEmail,
        senderName,
        buyerEmail,
        message,
        cardColor,
        session.id,
        tenantId,
      ],
    );
    dbSaved = true;
  } catch (err) {
    // DB unreachable or table missing — the payment still went through.
    // The card number is shown on-screen; the admin can reconcile manually.
    console.error("[gift-cards/success] DB insert failed:", err instanceof Error ? err.message : String(err));
  }

  // 2. Send the delivery email to the recipient (best-effort)
  try {
    if (recipientEmail) {
      await sendEmail({
        to: recipientEmail,
        template: "gift_card_delivery",
        subject: `${senderName || "Someone"} sent you a ${amountStr} gift card`,
        html: giftCardDeliveryHtml({
          recipientName: recipientName || undefined,
          senderName: senderName || "Someone",
          amount: amountStr,
          cardNumber,
          message: message || undefined,
        }),
        category: "transactional",
        variables: toResendVariables({
          recipientName: recipientName || "",
          senderName: senderName || "Someone",
          amount: amountStr,
          cardNumber,
          message: message || "",
        }),
      });
    }
    // 3. Send the purchase receipt to the buyer
    if (buyerEmail) {
      await sendEmail({
        to: buyerEmail,
        template: "gift_card_purchase",
        subject: `Your ${amountStr} gift card purchase`,
        html: giftCardPurchaseHtml({
          amount: amountStr,
          recipientName: recipientName || undefined,
          recipientEmail,
          cardNumber,
        }),
        category: "transactional",
        variables: toResendVariables({
          amount: amountStr,
          recipientName: recipientName || "",
          recipientEmail,
          cardNumber,
        }),
      });
    }
    emailSent = true;
  } catch (err) {
    console.error("[gift-cards/success] email send failed:", err instanceof Error ? err.message : String(err));
  }

  return {
    ok: true,
    cardNumber,
    amount: amountStr,
    recipientName,
    recipientEmail,
    senderName,
    message,
    cardColor,
    dbSaved,
    emailSent,
  };
}

export default async function GiftCardSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  if (!session_id) {
    return (
      <div className="gc-page">
        <main className="gc-container" style={{ padding: "80px 0", textAlign: "center" }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 42, margin: "0 0 12px" }}>
            No session found
          </h1>
          <p style={{ color: "#706d7c", marginBottom: 24 }}>
            We couldn&apos;t find a checkout session. If you just completed a purchase, please check your email.
          </p>
          <Link className="gc-btn primary" href="/gift-cards">
            Back to gift cards <ArrowRight size={15} />
          </Link>
        </main>
      </div>
    );
  }

  if (!isStripeConfigured()) {
    return (
      <div className="gc-page">
        <main className="gc-container" style={{ padding: "80px 0", textAlign: "center" }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 42, margin: "0 0 12px" }}>
            Stripe not configured
          </h1>
          <p style={{ color: "#706d7c", marginBottom: 24 }}>
            Set STRIPE_SECRET_KEY in the environment to process gift card purchases.
          </p>
          <Link className="gc-btn primary" href="/gift-cards">
            Back to gift cards <ArrowRight size={15} />
          </Link>
        </main>
      </div>
    );
  }

  let fulfillment: FulfillmentResult | null = null;
  let stripeError = "";

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      return (
        <div className="gc-page">
          <main className="gc-container" style={{ padding: "80px 0", textAlign: "center" }}>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 42, margin: "0 0 12px" }}>
              Payment not completed
            </h1>
            <p style={{ color: "#706d7c", marginBottom: 24 }}>
              This checkout session hasn&apos;t been paid yet. Please try again.
            </p>
            <Link className="gc-btn primary" href="/gift-cards">
              Try again <ArrowRight size={15} />
            </Link>
          </main>
        </div>
      );
    }

    fulfillment = await fulfillGiftCard(session);
  } catch (err) {
    stripeError = err instanceof Error ? err.message : "Failed to verify payment";
  }

  if (stripeError || !fulfillment) {
    return (
      <div className="gc-page">
        <main className="gc-container" style={{ padding: "80px 0", textAlign: "center" }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 42, margin: "0 0 12px" }}>
            Verification issue
          </h1>
          <p style={{ color: "#706d7c", marginBottom: 24 }}>
            {stripeError || "We couldn&apos;t verify your payment. If you were charged, please contact support."}
          </p>
          <Link className="gc-btn primary" href="/help/contact-us">
            Contact support <ArrowRight size={15} />
          </Link>
        </main>
      </div>
    );
  }

  const { cardNumber, amount, recipientName, recipientEmail, senderName, message, dbSaved, emailSent } = fulfillment;

  return (
    <div className="gc-page">
      <main>
        {/* HERO */}
        <section className="gc-hero" style={{ background: "#fff", padding: "70px 0 50px" }}>
          <div className="gc-container" style={{ textAlign: "center", maxWidth: 640 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "linear-gradient(145deg, #8d73ed, #5037b6)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 20px",
              }}
            >
              <Check size={28} color="#fff" />
            </div>
            <p className="gc-eyebrow" style={{ color: "#4f35ad" }}>
              Gift card confirmed
            </p>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(36px,5vw,52px)", lineHeight: 1, margin: "8px 0 0", letterSpacing: "-.03em" }}>
              Your {amount} gift card is on its way.
            </h1>
            <p className="gc-hero-copy" style={{ margin: "20px auto 0", maxWidth: 480 }}>
              {emailSent
                ? `We've emailed the gift card to ${recipientEmail || "the recipient"}. They can use it at checkout.`
                : "Your payment was processed. The gift card details are below — share them with the recipient."}
            </p>
          </div>
        </section>

        {/* CARD PREVIEW */}
        <section style={{ background: "#f7f5fb", padding: "40px 0 60px" }}>
          <div className="gc-container" style={{ maxWidth: 520 }}>
            <div className="gc-card" style={{ margin: "0 auto", width: "100%", maxWidth: 410 }}>
              <div className="gc-card-top">
                <span className="gc-card-brand">Unsaid Memories</span>
                <span className="gc-card-mark">p</span>
              </div>
              <div className="gc-card-middle">
                <div className="gc-card-label">Gift Card</div>
                <div className="gc-card-value">{amount}</div>
              </div>
              <div className="gc-card-bottom">
                <span style={{ letterSpacing: ".12em", fontFamily: "monospace" }}>{cardNumber}</span>
              </div>
            </div>

            {/* DETAILS */}
            <div style={{ marginTop: 28, background: "#fff", border: "1px solid #e9e6f0", borderRadius: 18, padding: 24 }}>
              <div style={{ display: "grid", gap: 14, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "#706d7c", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase" }}>Card number</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{cardNumber}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "#706d7c", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase" }}>Value</span>
                  <span style={{ fontWeight: 600 }}>{amount}</span>
                </div>
                {recipientName && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <span style={{ color: "#706d7c", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase" }}>Recipient</span>
                    <span>{recipientName}</span>
                  </div>
                )}
                {recipientEmail && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <span style={{ color: "#706d7c", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase" }}>Delivered to</span>
                    <span style={{ overflowWrap: "anywhere" }}>{recipientEmail}</span>
                  </div>
                )}
                {senderName && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <span style={{ color: "#706d7c", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase" }}>From</span>
                    <span>{senderName}</span>
                  </div>
                )}
                {message && (
                  <div style={{ borderTop: "1px solid #e9e6f0", paddingTop: 14, marginTop: 4 }}>
                    <span style={{ color: "#706d7c", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Message</span>
                    <span style={{ fontStyle: "italic", color: "#5e596d" }}>&ldquo;{message}&rdquo;</span>
                  </div>
                )}
              </div>
            </div>

            {/* STATUS */}
            {!dbSaved && (
              <div className="gc-builder-note" style={{ marginTop: 16 }}>
                Note: the gift card record couldn&apos;t be saved to the database in this environment. The payment was processed — share the card number above with the recipient, and an admin can reconcile manually.
              </div>
            )}
            {!emailSent && (
              <div className="gc-builder-note" style={{ marginTop: 8 }}>
                The delivery email couldn&apos;t be sent in this environment. The card number above is valid — share it directly with the recipient.
              </div>
            )}

            {/* CTAs */}
            <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "center", flexWrap: "wrap" }}>
              <Link className="gc-btn primary" href="/shop">
                Shop the collection <ArrowRight size={15} />
              </Link>
              <Link className="gc-btn secondary" href="/gift-cards">
                Buy another card <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

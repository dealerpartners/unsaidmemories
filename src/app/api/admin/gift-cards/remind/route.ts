import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";
import { sendEmail } from "@/lib/email";
import { toResendVariables } from "@/lib/email/resend-templates";
import { giftCardReminderHtml } from "@/lib/email/templates/gift-cards";
import { getEmailProviderSettings } from "@/lib/email/provider-settings";

export const runtime = "nodejs";

// POST /api/admin/gift-cards/remind
// Body: { card_id: string }
// Sends a balance reminder email to the cardholder via Resend.
export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("gift_cards_credits", "write");
  if (gate) return gate;

  try {
    const body = await req.json();
    const cardId = String(body.card_id || "");
    if (!cardId) {
      return NextResponse.json({ ok: false, error: "card_id required" }, { status: 400 });
    }

    const tenant = resolveTenantId(req);

    // Check email is configured before doing the work
    const provider = await getEmailProviderSettings(tenant);
    if (!provider.hasSendingKey) {
      return NextResponse.json(
        { ok: false, error: "Email not configured", detail: "Set an email provider key at Admin → Connections & Keys (Resend or Brevo)" },
        { status: 503 }
      );
    }

    // Load the gift card
    const cardRows = await pgQuery<{
      id: string; card_number: string; balance: string; expires_at: string | null;
      recipient_email: string | null; recipient_name: string | null; holder_customer_id: string | null;
    }>(
      `SELECT id, card_number, balance::text, expires_at::text, recipient_email, recipient_name, holder_customer_id::text
       FROM public.commerce_gift_cards WHERE id = $1::uuid AND tenant_id = $2`,
      [cardId, tenant]
    );
    if (cardRows.length === 0) {
      return NextResponse.json({ ok: false, error: "Gift card not found" }, { status: 404 });
    }
    const card = cardRows[0];

    // Resolve recipient email: card's recipient_email, else holder customer's email
    let toEmail = card.recipient_email;
    let toName = card.recipient_name || undefined;
    let customerIdForNotif: string | undefined;
    if (!toEmail && card.holder_customer_id) {
      const cRows = await pgQuery<{ email: string | null; first_name: string | null }>(
        `SELECT email, first_name FROM public.crm_customers WHERE id = $1::uuid`,
        [card.holder_customer_id]
      );
      if (cRows.length > 0) {
        toEmail = cRows[0].email;
        if (!toName && cRows[0].first_name) toName = cRows[0].first_name;
        customerIdForNotif = card.holder_customer_id;
      }
    }
    if (!toEmail) {
      return NextResponse.json({ ok: false, error: "Cardholder has no email address" }, { status: 422 });
    }

    const balance = `$${Number(card.balance || 0).toFixed(2)}`;
    const html = giftCardReminderHtml({
      recipientName: toName,
      cardNumber: card.card_number,
      balance,
      expiresAt: card.expires_at,
    });

    const result = await sendEmail({
      to: toEmail,
      template: "gift_card_reminder",
      subject: `Don't forget your ${balance} UnSaid Memories gift card`,
      html,
      customerId: customerIdForNotif,
      tenantId: tenant,
      variables: toResendVariables({ recipientName: toName, cardNumber: card.card_number, balance, expiresAt: card.expires_at || "" }),
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error || "Send failed" }, { status: 502 });
    }

    // Record reminder_sent_at
    await pgQuery(`UPDATE public.commerce_gift_cards SET reminder_sent_at = now() WHERE id = $1::uuid`, [cardId]);

    return NextResponse.json({ ok: true, cardId, messageId: result.messageId });
  } catch (e: any) {
    console.error("[api/admin/gift-cards/remind]", e);
    return NextResponse.json({ ok: false, error: e.message || "Send failed" }, { status: 500 });
  }
}

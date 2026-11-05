import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, platformAudit } from "@/lib/crm/enterprise";
import { sendSalonMessage } from "@/lib/email";

// ---------------------------------------------------------------------------
// POST /api/admin/payments/[id]/notify
// Sends a "your payment failed" email to the customer with a retry link.
// Body: { payment_link?: string, amount?: number, customer_name?: string,
//         customer_email?: string, failure_reason?: string, customer_id?: string }
// Logs to crm_messages.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("payments", "write"); if (gate) return gate;
  const { id } = await params;

  let body: any = {};
  try { body = await req.json(); } catch { /* optional body */ }

  const customerEmail = String(body.customer_email || "").trim();
  const customerName = String(body.customer_name || "there").trim() || "there";
  const amount = body.amount != null ? `$${Number(body.amount).toFixed(2)}` : "your recent payment";
  const failureReason = String(body.failure_reason || "it didn't go through").trim();
  const paymentLink = String(body.payment_link || "").trim();
  const customerId = String(body.customer_id || "").trim() || null;

  if (!customerEmail) {
    return NextResponse.json({ error: "No customer email — cannot send notification" }, { status: 400 });
  }

  const subject = "Your UnSaid Memories payment didn't go through";
  const message = [
    `Hi ${customerName},`,
    ``,
    `We wanted to let you know that ${amount === "your recent payment" ? amount : `your payment of ${amount}`} ${failureReason.toLowerCase().startsWith("card") || failureReason.toLowerCase().startsWith("insufficient") ? `— ${failureReason.toLowerCase()}` : "didn't go through"}.`,
    ``,
    paymentLink
      ? `You can retry securely here: ${paymentLink}\n\nIf you'd rather pay another way, just reply to this email or call us and we'll take care of it.`
      : `If you'd like to retry, just reply to this email or call us and we'll take care of it right away.`,
    ``,
    `— The UnSaid Memories family`,
  ].join("\n");

  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    await client.query("BEGIN");
    try {
      // Log to crm_messages
      await client.query(
        `INSERT INTO public.crm_messages (tenant_id, customer_id, channel, direction, status, subject, body, provider, sent_at)
         VALUES ($1, $2::uuid, 'email', 'outbound', 'sent', $3, $4, 'resend', now())`,
        [tenant, customerId, subject, message]
      );
      try {
        await client.query("SAVEPOINT audit_sp");
        await platformAudit(client, {
          action: "payment.failed.notify",
          targetType: "payment",
          targetId: id,
          actorRole: "admin",
          metadata: { customerEmail, paymentLink: !!paymentLink },
        });
        await client.query("RELEASE SAVEPOINT audit_sp");
      } catch { await client.query("ROLLBACK TO SAVEPOINT audit_sp").catch(() => {}); }
      await client.query("COMMIT");

      // Send via branded Resend pipeline (non-fatal if it fails)
      let sendError: string | null = null;
      try {
        const res = await sendSalonMessage({
          to: customerEmail,
          customerId: customerId || undefined,
          subject,
          message,
        });
        if (!res.ok) sendError = res.error || "send failed";
      } catch (e: any) {
        sendError = e?.message || "send failed";
      }

      return NextResponse.json({
        sent: !sendError,
        to: customerEmail,
        ...(sendError ? { warning: `Logged but email send failed: ${sendError}` } : {}),
      });
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      return NextResponse.json({ error: e?.message }, { status: 500 });
    }
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}

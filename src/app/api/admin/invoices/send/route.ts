import { toResendVariables } from "@/lib/email/resend-templates";
import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";
import { sendEmail } from "@/lib/email";
import { invoiceEmailHtml } from "@/lib/email/templates/invoices";
import { getEmailProviderSettings } from "@/lib/email/provider-settings";

export const runtime = "nodejs";

// POST /api/admin/invoices/send
// Body: { invoice_id: string, is_reminder?: boolean }
// Renders the invoice email template with live data and sends via Resend.
export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("invoices", "write");
  if (gate) return gate;

  try {
    const body = await req.json();
    const invoiceId = String(body.invoice_id || "");
    const isReminder = Boolean(body.is_reminder);
    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: "invoice_id required" }, { status: 400 });
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

    // Load the invoice (single invoice record: acct_ar_invoices) with
    // customer email. Balance is derived from the disjoint counters.
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(invoiceId)) {
      return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
    }
    const invRows = await pgQuery<{
      id: string; number: string; total: string; subtotal: string; balanceDue: string;
      depositPaid: string; dueDate: string | null; notes: string | null; sentAt: string | null;
      customerId: string | null;
    }>(
      `SELECT id::text AS id, invoice_number AS number, total::text, subtotal::text,
              (total - amount_paid - amount_credited - deposit_paid)::text AS "balanceDue",
              deposit_paid::text AS "depositPaid",
              due_date::text AS "dueDate", notes, sent_at::text AS "sentAt",
              source_customer_id AS "customerId"
       FROM public.acct_ar_invoices WHERE id = $1::uuid AND tenant_id = $2`,
      [invoiceId, tenant]
    );
    if (invRows.length === 0) {
      return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
    }
    const inv = invRows[0];

    // Load line items
    const itemRows = await pgQuery<{ description: string; quantity: number; unitPrice: string; totalPrice: string }>(
      `SELECT description, quantity, unit_price::text AS "unitPrice", line_subtotal::text AS "totalPrice"
       FROM public.acct_ar_invoice_lines WHERE invoice_id = $1::uuid ORDER BY line_no`,
      [invoiceId]
    );

    // Load customer email + name
    let customerEmail: string | null = null;
    let customerName = "there";
    let customerIdForNotif: string | undefined;
    if (inv.customerId) {
      const cRows = await pgQuery<{ email: string | null; first_name: string | null; last_name: string | null }>(
        `SELECT email, first_name, last_name FROM public.crm_customers WHERE id = $1::uuid`,
        [inv.customerId]
      );
      if (cRows.length > 0) {
        customerEmail = cRows[0].email;
        const fn = cRows[0].first_name || "";
        if (fn) customerName = fn;
        customerIdForNotif = inv.customerId;
      }
      // source_customer_id is a mixed id space — booking-created
      // invoices carry salon `customers` ids, not CRM ids. Fall back to
      // the salon record so those invoices can be sent too.
      if (!customerEmail) {
        const sRows = await pgQuery<{ email: string | null; first_name: string | null }>(
          `SELECT email, "firstName" AS first_name FROM public.customers WHERE id = $1`,
          [inv.customerId]
        ).catch(() => [] as { email: string | null; first_name: string | null }[]);
        if (sRows.length > 0 && sRows[0].email) {
          customerEmail = sRows[0].email;
          if (sRows[0].first_name) customerName = sRows[0].first_name;
          customerIdForNotif = undefined;
        }
      }
    }
    if (!customerEmail) {
      return NextResponse.json({ ok: false, error: "Customer has no email address" }, { status: 422 });
    }

    const fmt = (v: string | null) => {
      const n = Number(v || 0);
      return `$${n.toFixed(2)}`;
    };

    const html = invoiceEmailHtml({
      invoiceNumber: inv.number,
      customerName,
      amountDue: fmt(inv.balanceDue),
      total: fmt(inv.total),
      subtotal: fmt(inv.subtotal),
      depositPaid: Number(inv.depositPaid || 0) > 0 ? fmt(inv.depositPaid) : undefined,
      dueDate: inv.dueDate,
      notes: inv.notes,
      lineItems: itemRows.map((r) => ({
        description: r.description,
        quantity: r.quantity,
        unitPrice: fmt(r.unitPrice),
        total: fmt(r.totalPrice),
      })),
      paymentUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.unsaidmemories.com"}/pay/invoice/${inv.id}`,
      isReminder,
    });

    const result = await sendEmail({
      to: customerEmail,
      template: isReminder ? "invoice_reminder" : "invoice_send",
      subject: isReminder
        ? `Reminder: invoice ${inv.number} — ${fmt(inv.balanceDue)} due`
        : `Invoice ${inv.number} — ${fmt(inv.balanceDue)} due`,
      html,
      relatedInvoiceId: inv.id,
      customerId: customerIdForNotif,
      tenantId: tenant,
      variables: toResendVariables({
        invoiceNumber: inv.number,
        customerName,
        itemList: itemRows.map((r) => `${r.quantity} × ${r.description} — ${fmt(r.totalPrice)}`).join("\n"),
        subtotal: fmt(inv.subtotal),
        depositPaid: Number(inv.depositPaid || 0) > 0 ? fmt(inv.depositPaid) : "$0.00",
        total: fmt(inv.total),
        amountDue: fmt(inv.balanceDue),
        dueDate: inv.dueDate || "",
        notes: inv.notes || "",
        paymentUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.unsaidmemories.com"}/pay/invoice/${inv.id}`,
      }),
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error || "Send failed" }, { status: 502 });
    }

    // Mark sent_at; reminders also advance the reminder bookkeeping the
    // enterprise table carries (reminder_count / last_reminder_at).
    await pgQuery(
      `UPDATE public.acct_ar_invoices
          SET sent_at = now(), updated_at = now(),
              reminder_count = CASE WHEN $2 THEN COALESCE(reminder_count, 0) + 1 ELSE reminder_count END,
              last_reminder_at = CASE WHEN $2 THEN now() ELSE last_reminder_at END
        WHERE id = $1::uuid`,
      [invoiceId, isReminder]
    );

    return NextResponse.json({ ok: true, invoiceId, messageId: result.messageId });
  } catch (e: any) {
    console.error("[api/admin/invoices/send]", e);
    return NextResponse.json({ ok: false, error: e.message || "Send failed" }, { status: 500 });
  }
}

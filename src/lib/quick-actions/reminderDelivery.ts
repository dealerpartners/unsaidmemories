// ---------------------------------------------------------------------------
// reminderDelivery.ts — real email delivery for the admin "reminder" quick
// actions (finance + system routes).
//
// Before this module, accts-send-reminder(s), accts-send-reminder-gc,
// sys-run-rebooking, sys-run-vaccine and sys-run-birthday only wrote
// internal crm_notes rows while reporting "Sent N ..." to the admin. These
// helpers do the actual work through the app's email pipeline
// (sendEmail() → Resend, which also writes the email_messages outbox row
// and the customer-facing `communications` audit row), and tally HONEST
// outcomes: sent / skipped_no_email / skipped_recent / failed.
// ---------------------------------------------------------------------------

import { pgExec, pgQuery } from "@/lib/pg";
import { sendEmail } from "@/lib/email";
import { invoiceEmailHtml } from "@/lib/email/templates/invoices";

export interface ReminderTally {
  sent: number;
  skipped_no_email: number;
  skipped_recent: number;
  failed: number;
  failures: string[];
}

export function emptyTally(): ReminderTally {
  return { sent: 0, skipped_no_email: 0, skipped_recent: 0, failed: 0, failures: [] };
}

/** True when a SENT email with this template already went to this customer
 *  within `days` — checked against the pipeline's own outbox
 *  (email_messages), so re-running an automation doesn't spam. */
export async function recentlyEmailed(opts: {
  tenantId: string;
  customerId: string;
  template: string;
  days: number;
  relatedInvoiceId?: string;
}): Promise<boolean> {
  const rows = await pgQuery<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM public.email_messages
      WHERE tenant_id = $1
        AND "customerId" = $2
        AND template = $3
        AND status = 'SENT'
        AND "createdAt" > now() - ($4 || ' days')::interval
        AND ($5::text IS NULL OR "relatedInvoiceId" = $5)`,
    [opts.tenantId, opts.customerId, opts.template, opts.days, opts.relatedInvoiceId ?? null],
  );
  return Number(rows[0]?.n || 0) > 0;
}

/** Send one email through the pipeline and fold the result into the tally.
 *  Applies the dedupe window first when dedupeDays is set. */
export async function deliverReminderEmail(
  tally: ReminderTally,
  opts: {
    tenantId: string;
    customerId: string;
    to: string;
    template: string;
    subject: string;
    html: string;
    dedupeDays?: number;
    relatedInvoiceId?: string;
    /** Count as would-send without touching Resend (selection proof). */
    dryRun?: boolean;
  },
): Promise<"sent" | "skipped_recent" | "failed"> {
  if (opts.dedupeDays) {
    const dup = await recentlyEmailed({
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      template: opts.template,
      days: opts.dedupeDays,
      relatedInvoiceId: opts.relatedInvoiceId,
    });
    if (dup) {
      tally.skipped_recent++;
      return "skipped_recent";
    }
  }
  if (opts.dryRun) {
    tally.sent++;
    return "sent";
  }
  const result = await sendEmail({
    to: opts.to,
    template: opts.template,
    subject: opts.subject,
    html: opts.html,
    customerId: opts.customerId,
    tenantId: opts.tenantId,
    relatedInvoiceId: opts.relatedInvoiceId,
  });
  if (result.ok) {
    tally.sent++;
    return "sent";
  }
  tally.failed++;
  if (result.error) tally.failures.push(result.error);
  return "failed";
}

// ─── Invoice payment reminders ──────────────────────────────────────────────

export interface OverdueInvoiceRow {
  id: string;
  number: string;
  status: string;
  customerId: string | null;
  total: string;
  subtotal: string;
  balanceDue: string;
  depositPaid: string;
  dueDate: string | null;
  notes: string | null;
}

// Invoice rows come from the single invoice record (acct_ar_invoices),
// aliased to this module's long-standing row shape; the enum status is
// translated to the legacy labels consumers compare against, and the
// balance is the canonical total − paid − credited − deposit.
const INVOICE_COLS = `id::text AS id, invoice_number AS number,
  CASE status WHEN 'paid' THEN 'PAID' WHEN 'partially_paid' THEN 'PARTIAL'
              WHEN 'void' THEN 'VOID' WHEN 'cancelled' THEN 'CANCELLED'
              WHEN 'draft' THEN 'DRAFT' ELSE 'OPEN' END AS status,
  total::text, subtotal::text,
  (total - amount_paid - amount_credited - deposit_paid)::text AS "balanceDue",
  deposit_paid::text AS "depositPaid", due_date::text AS "dueDate",
  notes, source_customer_id AS "customerId"`;

const BALANCE_EXPR = `(total - amount_paid - amount_credited - deposit_paid)`;

/** Overdue = open status, balance owed, due date passed. Optionally
 *  scoped to one customer. Ordered oldest due first. */
export async function selectOverdueInvoices(
  tenantId: string,
  customerId?: string | null,
  limit = 100,
): Promise<OverdueInvoiceRow[]> {
  return pgQuery<OverdueInvoiceRow>(
    `SELECT ${INVOICE_COLS}
       FROM public.acct_ar_invoices
      WHERE tenant_id = $1
        AND status IN ('posted', 'partially_paid')
        AND ${BALANCE_EXPR} > 0
        AND due_date < CURRENT_DATE
        AND ($2::text IS NULL OR source_customer_id = $2)
      ORDER BY due_date ASC
      LIMIT $3`,
    [tenantId, customerId ?? null, limit],
  );
}

export async function loadInvoice(tenantId: string, invoiceId: string): Promise<OverdueInvoiceRow | null> {
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(invoiceId)) {
    return null;
  }
  const rows = await pgQuery<OverdueInvoiceRow>(
    `SELECT ${INVOICE_COLS} FROM public.acct_ar_invoices WHERE id = $1::uuid AND tenant_id = $2`,
    [invoiceId, tenantId],
  );
  return rows[0] ?? null;
}

/** Deliver ONE invoice payment reminder for an already-loaded invoice row.
 *  Resolves the customer's email from crm_customers (source_customer_id),
 *  renders the branded invoice reminder template with live line items, and
 *  sends via sendEmail(). skipDedupe is for explicit single-invoice sends
 *  (an admin clicked THIS invoice's reminder on purpose). */
export async function deliverInvoiceReminder(
  tenantId: string,
  inv: OverdueInvoiceRow,
  tally: ReminderTally,
  opts?: { skipDedupe?: boolean; dryRun?: boolean },
): Promise<"sent" | "skipped_no_email" | "skipped_recent" | "failed"> {
  if (!inv.customerId) {
    tally.skipped_no_email++;
    return "skipped_no_email";
  }
  const cRows = await pgQuery<{ email: string | null; first_name: string | null }>(
    `SELECT email, first_name FROM public.crm_customers WHERE id = $1::uuid`,
    [inv.customerId],
  );
  const email = cRows[0]?.email;
  if (!email) {
    tally.skipped_no_email++;
    return "skipped_no_email";
  }

  const itemRows = await pgQuery<{ description: string; quantity: number; unitPrice: string; totalPrice: string }>(
    `SELECT description, quantity, unit_price::text AS "unitPrice", line_subtotal::text AS "totalPrice"
       FROM public.acct_ar_invoice_lines WHERE invoice_id = $1::uuid ORDER BY line_no`,
    [inv.id],
  );

  const fmt = (v: string | number | null) => `$${Number(v || 0).toFixed(2)}`;
  const html = invoiceEmailHtml({
    invoiceNumber: inv.number,
    customerName: cRows[0]?.first_name || "there",
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
    isReminder: true,
  });

  const outcome = await deliverReminderEmail(tally, {
    tenantId,
    customerId: inv.customerId,
    to: email,
    template: "invoice_reminder",
    subject: `Reminder: invoice ${inv.number} — ${fmt(inv.balanceDue)} due`,
    html,
    relatedInvoiceId: inv.id,
    dedupeDays: opts?.skipDedupe ? undefined : 7,
    dryRun: opts?.dryRun,
  });
  if (outcome === "sent" && !opts?.dryRun) {
    await pgExec(
      `UPDATE public.acct_ar_invoices
          SET sent_at = now(), updated_at = now(),
              reminder_count = COALESCE(reminder_count, 0) + 1, last_reminder_at = now()
        WHERE id = $1::uuid`,
      [inv.id],
    );
  }
  return outcome === "skipped_recent" ? "skipped_recent" : outcome === "failed" ? "failed" : "sent";
}

/** One honest sentence summarizing a tally for the admin UI. */
export function tallyMessage(tally: ReminderTally, sentWhat: string): string {
  const parts = [`Emailed ${tally.sent} ${sentWhat}`];
  if (tally.skipped_no_email > 0) parts.push(`${tally.skipped_no_email} skipped (no email on file)`);
  if (tally.skipped_recent > 0) parts.push(`${tally.skipped_recent} skipped (already reminded recently)`);
  if (tally.failed > 0) parts.push(`${tally.failed} failed${tally.failures[0] ? `: ${tally.failures[0]}` : ""}`);
  return parts.join(" · ");
}

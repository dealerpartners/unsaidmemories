// ---------------------------------------------------------------------------
// lib/admin/automation-executor.ts — the §1.21 Automation Center executors.
//
// The CRM automation handlers (sys_run_*) extracted VERBATIM from
// /api/admin/system/actions/route.ts on 2026-10-23 for BL-9 (the scheduler),
// so the manual Run buttons in the Automation Center and the scheduler
// (/api/cron/crm-automations) execute the identical code — there is one
// executor, not two copies. The only changes from the route originals are
// mechanical: the tenant/payload/action/actor/ip arrive via the context
// object instead of the request scope, and each handler returns a
// { status, body } result the caller wraps in NextResponse.
//
// Every handler delivers for real via Resend through
// lib/quick-actions/reminderDelivery, deduped against the email outbox,
// and stamps its source rows so a re-run never double-sends.
//
// FIX-AE (2026-10-31): the five pet-salon automations (appointment
// reminders, rebooking win-back, vaccine reminders, pet birthday,
// 90-day win-back) were removed when the pet email templates were
// deleted. The two remaining handlers serve the store's real
// commerce/operations needs: overdue invoice payment reminders and
// unsigned-document signature reminders. Unknown run_* labels fall
// through to the 400 default so the route surface is unchanged.
// ---------------------------------------------------------------------------

import { pgQuery } from "@/lib/pg";
import { auditAction, logCustomerNote } from "@/lib/quick-actions/audit";
import { getEmailProviderSettings } from "@/lib/email/provider-settings";
import { unsignedDocReminderHtml } from "@/lib/email/templates/documents";
import { deliverInvoiceReminder, deliverReminderEmail, emptyTally, selectOverdueInvoices, tallyMessage } from "@/lib/quick-actions/reminderDelivery";

export interface SystemAutomationContext {
  tenant: string;
  payload: Record<string, unknown>;
  /** The full registry action name, e.g. "sys_run_unsigned_docs" (audit trail). */
  action: string;
  actorId: string | null;
  ip: string | null;
}

export interface SystemAutomationResult {
  status: number;
  body: Record<string, unknown>;
}

function respond(body: Record<string, unknown>, init?: { status?: number }): SystemAutomationResult {
  return { status: init?.status ?? 200, body };
}

/**
 * Execute one §1.21 automation by its prefix-stripped action name
 * (run_payment_reminders, run_unsigned_docs, …). Unknown names return a
 * 400 result; the manual route delegates every run_* label here and the
 * executor sorts out which are still supported.
 */
export async function executeSystemAutomation(
  shortAction: string,
  ctx: SystemAutomationContext,
): Promise<SystemAutomationResult> {
  switch (shortAction) {
      case "run_payment_reminders": {
        // sys_run_payment_reminders → run_payment_reminders
        // REAL delivery via Resend (invoice_reminder template), reusing
        // the exact selection + sender as accts_send_reminders in the
        // finance route: overdue invoices from public.acct_ar_invoices —
        // the single invoice record every invoice surface reads since
        // the 2026-10-13 consolidation (the selection lives in
        // reminderDelivery.selectOverdueInvoices). The 7-day outbox
        // dedupe is shared with the finance batch, so running both
        // never double-sends. (Previously: note-only.)
        const tenant = ctx.tenant;
        const dryRun = ctx.payload.dry_run === true;
        const provider = await getEmailProviderSettings(tenant);
        if (!provider.hasSendingKey) {
          return respond({ ok: false, error: "Email not configured", detail: "Set an email provider key at Admin → Connections & Keys (Resend or Brevo)" }, { status: 503 });
        }
        const tally = emptyTally();
        const invoices = await selectOverdueInvoices(tenant, null);
        for (const inv of invoices) {
          const outcome = await deliverInvoiceReminder(tenant, inv, tally, { dryRun });
          if (outcome === "sent" && !dryRun && inv.customerId) {
            await logCustomerNote({
              customerId: inv.customerId,
              body: `Payment reminder emailed for invoice ${inv.number} (balance $${Number(inv.balanceDue || 0).toFixed(2)}).`,
              noteType: "payment_reminder",
            });
          }
        }
        await auditAction({ action: ctx.action, domain: "acct", tableName: "invoices", recordId: null, afterData: { candidates: invoices.length, dryRun, ...tally }, actorUserId: ctx.actorId, ipAddress: ctx.ip });
        return respond({
          ok: true, ...tally, count: tally.sent, dryRun,
          message: invoices.length === 0
            ? "No overdue invoices — nothing sent"
            : dryRun
              ? `Dry run — no emails sent. Would email ${tally.sent} payment reminder(s); ${tally.skipped_no_email} skipped (no email on file); ${tally.skipped_recent} skipped (already reminded this week)`
              : tallyMessage(tally, tally.sent === 1 ? "payment reminder" : "payment reminders"),
        });
      }

      case "run_unsigned_docs": {
        // sys_run_unsigned_docs → run_unsigned_docs
        // REAL delivery via Resend (unsigned_doc_reminder template).
        // Source: crm_unsigned_documents — a VIEW over crm_documents
        // (status pending/submitted, or signature required and still
        // unsigned). We remind on status='pending' — awaiting the
        // customer; 'submitted' docs are awaiting staff review, not the
        // customer. The view has no reminder_sent_at column (the old
        // handler's UPDATE targeted that nonexistent column and
        // silently failed), so the 7-day cadence is enforced by the
        // email-outbox dedupe instead. One email per customer listing
        // all their pending documents. (Previously: note-only.)
        const tenant = ctx.tenant;
        const dryRun = ctx.payload.dry_run === true;
        const provider = await getEmailProviderSettings(tenant);
        if (!provider.hasSendingKey) {
          return respond({ ok: false, error: "Email not configured", detail: "Set an email provider key at Admin → Connections & Keys (Resend or Brevo)" }, { status: 503 });
        }
        const tally = emptyTally();
        const rows = await pgQuery<{ id: string; customer_id: string | null; name: string; document_type: string | null; first_name: string | null; email: string | null }>(
          `SELECT d.id, d.customer_id, d.name, d.document_type, c.first_name, c.email
             FROM public.crm_unsigned_documents d
             LEFT JOIN public.crm_customers c ON c.id = d.customer_id
            WHERE d.tenant_id = $1
              AND d.status = 'pending'
            ORDER BY d.name
            LIMIT 100`,
          [tenant],
        );
        const groups = new Map<string, { first_name: string | null; email: string | null; items: { name: string; documentType?: string }[] }>();
        let orphanDocs = 0;
        for (const r of rows) {
          if (!r.customer_id) {
            orphanDocs++;
            continue;
          }
          const g = groups.get(r.customer_id) ?? { first_name: r.first_name, email: r.email, items: [] };
          g.items.push({ name: r.name, documentType: r.document_type || undefined });
          groups.set(r.customer_id, g);
        }
        tally.skipped_no_email += orphanDocs;
        for (const [customerId, g] of groups) {
          if (!g.email) {
            tally.skipped_no_email++;
            continue;
          }
          const outcome = await deliverReminderEmail(tally, {
            tenantId: tenant,
            customerId,
            to: g.email,
            template: "unsigned_doc_reminder",
            subject: "A document is waiting for your signature",
            html: unsignedDocReminderHtml({ customerName: g.first_name || undefined, items: g.items }),
            dedupeDays: 7,
            dryRun,
          });
          if (outcome === "sent" && !dryRun) {
            await logCustomerNote({
              customerId,
              body: `Document reminder emailed — waiting on: ${g.items.map((i) => i.name).join(", ")}.`,
              noteType: "document_reminder",
            });
          }
        }
        await auditAction({ action: ctx.action, domain: "crm", tableName: "crm_unsigned_documents", recordId: null, afterData: { documents: rows.length, customers: groups.size, dryRun, ...tally }, actorUserId: ctx.actorId, ipAddress: ctx.ip });
        return respond({
          ok: true, ...tally, count: tally.sent, documents: rows.length, dryRun,
          message: rows.length === 0
            ? "No unsigned documents pending — nothing sent"
            : dryRun
              ? `Dry run — no emails sent. Would email ${tally.sent} document reminder(s) covering ${rows.length} document(s); ${tally.skipped_no_email} skipped (no email on file); ${tally.skipped_recent} skipped (already reminded this week)`
              : tallyMessage(tally, tally.sent === 1 ? "document reminder" : "document reminders"),
        });
      }
    default:
      return respond({ ok: false, error: `Unknown automation: ${shortAction}` }, { status: 400 });
  }
}

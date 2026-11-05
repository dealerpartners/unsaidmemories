// ---------------------------------------------------------------------------
// /api/admin/accounting/actions/route.ts
//
// Accounting quick actions — follows FULL_FEATURE_TREE.txt Section 7.
// Every action performs a REAL write against the acct_* tables.
//
// Actions:
//   INVOICES: send, resend, mark_paid, void, duplicate, delete
//   PAYMENTS: send_reminder, batch_export
//   DEPOSITS: collect, apply_to_invoice, release, refund, forfeit, transfer
//   REFUNDS: issue, approve, reject, dispute
//   GIFT CARDS: issue, issue_store_credit, add_value, redeem, transfer,
//               deactivate, reactivate, expire, check_balance
//   PAYROLL (owner-facing): run_payroll, add_employee
//
// Tables: acct_ar_invoices, acct_ar_receipts, acct_ar_deposits (fallback:
// deposits), acct_ar_refunds, commerce_gift_cards. Payroll writes the REAL
// payroll tables (payroll_runs / payroll_run_items via the shared engine,
// crm_staff for employees) — acct_payroll_* is a legacy roster nothing reads.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { guardPayloadIds, guardRequiredFields } from "@/lib/quick-actions/validate";
import { requireAdminApi } from "@/lib/admin/gate";
import { adminGet, adminCreate, adminUpdate, resolveTenantId} from "@/lib/admin-api";
import { getPg, getPgWithRetry } from "@/lib/pg";
import { postBalancedJournalEntry, clientQuery, type JournalLineInput } from "@/lib/accounting/journal";
import { createPayrollRun } from "@/lib/payroll/runPayroll";
import { PAY_TYPES } from "@/lib/crm/commissions";
import { sendEmail } from "@/lib/email";
import { invoiceEmailHtml } from "@/lib/email/templates/invoices";
import { getEmailProviderSettings } from "@/lib/email/provider-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Best-effort GL posting. Logs the failure and returns null — never blocks
 * the business action. Every entry is balance-checked by postBalancedJournalEntry.
 */
async function postGl(
  tenantId: string,
  input: {
    source: string;
    sourceId?: string | null;
    reference?: string | null;
    memo: string;
    lines: JournalLineInput[];
  },
): Promise<string | null> {
  try {
    const client = await getPgWithRetry();
    try {
      return await postBalancedJournalEntry(clientQuery(client), tenantId, input);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(
      `[accounting/actions] GL post failed (non-blocking) [${input.source}]:`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

/** Cents → dollars, rounded to 2dp for the GL. */
const c2d = (cents: number) => Math.round(Number(cents || 0)) / 100;

const T = {
  invoices: "acct_ar_invoices",
  receipts: "acct_ar_receipts",
  deposits: "acct_ar_deposits",
  refunds: "acct_ar_refunds",
  giftCards: "commerce_gift_cards",
  payrollRuns: "acct_payroll_runs",
  payrollEmployees: "acct_payroll_employees",
};

async function tableExists(table: string): Promise<boolean> {
  const res = await adminGet(table, "__probe__", { noTenant: true });
  // 404 probe that hits "Not found" (not table-missing) means table exists
  const j = await res.json().catch(() => ({}));
  return !(j && j._empty);
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = String(body.action || "");
  const p = body.payload ?? body;
  const idGuard = guardPayloadIds(p);
  if (idGuard) return idGuard;
  const reqGuard = guardRequiredFields(action, p);
  if (reqGuard) return reqGuard;

  try {
    switch (action) {
      // ── INVOICES ──────────────────────────────────────────────────
      case "invoice_send":
      case "invoice_resend": {
        // SA-51: REAL delivery via Resend. The old handler only flipped
        // status to "sent" — a value the acct_document_status enum does
        // not even allow — and never sent anything. Now: load the AR
        // invoice + customer email, send the invoice template, and only
        // then stamp sent_at / resent_count. Status stays as-is (the
        // enum has no "sent"; "posted" already means issued).
        const id = String(p.invoice_id || "");
        if (!id) return NextResponse.json({ error: "invoice_id required" }, { status: 400 });
        const tenantId = resolveTenantId(req);
        const invRes = await adminGet(T.invoices, id, { tenantId });
        const invJson = await invRes.json().catch(() => null);
        const inv = invJson?.data;
        if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        const invStatus = String(inv.status || "").toLowerCase();
        if (invStatus === "paid" || invStatus === "void" || invStatus === "cancelled") {
          return NextResponse.json({ error: `Invoice ${inv.invoice_number || id} is ${invStatus} and cannot be sent` }, { status: 422 });
        }
        const provider = await getEmailProviderSettings(tenantId);
        if (!provider.hasSendingKey) {
          return NextResponse.json({ ok: false, error: "Email not configured", detail: "Set an email provider key at Admin → Connections & Keys (Resend or Brevo)" }, { status: 503 });
        }
        // Customer email: acct_customers.email, falling back to the CRM
        // customer linked by external_customer_id.
        let customerEmail: string | null = null;
        let customerName = "there";
        let crmCustomerId: string | undefined;
        if (inv.customer_id) {
          const custRes = await adminGet("acct_customers", String(inv.customer_id), { tenantId });
          const custJson = await custRes.json().catch(() => null);
          const cust = custJson?.data;
          if (cust) {
            customerEmail = cust.email || null;
            if (cust.legal_name) customerName = String(cust.legal_name).split(" ")[0] || customerName;
            if (!customerEmail && cust.external_customer_id) {
              const crmRes = await adminGet("crm_customers", String(cust.external_customer_id), { tenantId });
              const crmJson = crmRes ? await crmRes.json().catch(() => null) : null;
              if (crmJson?.data?.email) {
                customerEmail = crmJson.data.email;
                crmCustomerId = String(cust.external_customer_id);
                if (crmJson.data.first_name) customerName = crmJson.data.first_name;
              }
            } else if (cust.external_customer_id) {
              crmCustomerId = String(cust.external_customer_id);
            }
          }
        }
        if (!customerEmail) {
          return NextResponse.json({ ok: false, error: "Customer has no email address on file — invoice not sent" }, { status: 422 });
        }
        const total = Number(inv.total || 0);
        const balance = Math.max(0, total - Number(inv.amount_paid || 0) - Number(inv.amount_credited || 0));
        const fmt = (n: number) => `$${n.toFixed(2)}`;
        const isResend = action === "invoice_resend" || Boolean(inv.sent_at);
        const html = invoiceEmailHtml({
          invoiceNumber: String(inv.invoice_number || id),
          customerName,
          amountDue: fmt(balance),
          total: fmt(total),
          subtotal: fmt(Number(inv.subtotal || total)),
          dueDate: inv.due_date ? String(inv.due_date).slice(0, 10) : null,
          notes: inv.notes || null,
          lineItems: [],
          paymentUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.unsaidmemories.com"}/pay/invoice/${id}`,
          isReminder: false,
        });
        const result = await sendEmail({
          to: customerEmail,
          template: "invoice_send",
          subject: `Invoice ${inv.invoice_number || id} — ${fmt(balance)} due`,
          html,
          customerId: crmCustomerId,
          tenantId,
        });
        if (!result.ok) {
          return NextResponse.json({ ok: false, error: result.error || "Send failed" }, { status: 502 });
        }
        const upd = await adminUpdate(T.invoices, id, {
          sent_at: new Date().toISOString(),
          resent_count: isResend ? Number(inv.resent_count || 0) + 1 : Number(inv.resent_count || 0),
        }, { tenantId });
        const updJson = await upd.json().catch(() => ({}));
        if (updJson?.error) {
          return NextResponse.json({ ok: true, messageId: result.messageId, warning: `Email sent but sent_at could not be stamped: ${updJson.error}` });
        }
        return NextResponse.json({ ok: true, invoice_id: id, messageId: result.messageId, resent: isResend });
      }
      case "invoice_mark_paid": {
        const id = String(p.invoice_id || "");
        const amount = Number(p.amount_cents ?? p.amount ?? 0);
        if (!id) return NextResponse.json({ error: "invoice_id required" }, { status: 400 });
        // SA-52 guards: no double-pay JE, no paying a void invoice.
        const priorRes = await adminGet(T.invoices, id, { tenantId: resolveTenantId(req) });
        const priorJson = await priorRes.json().catch(() => null);
        if (!priorJson?.data) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        const priorStatus = String(priorJson.data.status || "").toLowerCase();
        if (priorStatus === "paid") return NextResponse.json({ error: `Invoice ${id} is already paid — no second journal entry was posted` }, { status: 409 });
        if (priorStatus === "void" || priorStatus === "cancelled") return NextResponse.json({ error: `Invoice ${id} is ${priorStatus} and cannot be marked paid` }, { status: 422 });
        // Mark invoice paid + record a receipt row (live schema: amount, amount_paid, payment_method, receipt_date)
        const paidDollars = c2d(p.amount_cents != null ? amount : amount * 100);
        const inv = await adminUpdate(T.invoices, id, { status: "paid", amount_paid: paidDollars }, { tenantId: resolveTenantId(req) });
        const invJson = await inv.json().catch(() => null);
        if (invJson?.error) return inv;
        const receipt = await adminCreate(T.receipts, {
          reference: id,
          customer_id: p.customer_id || invJson?.data?.customer_id || null,
          amount: paidDollars,
          payment_method: p.method || "manual",
          receipt_date: new Date().toISOString().slice(0, 10),
          status: "posted",
        }, { tenantId: resolveTenantId(req) });
        const rcJson = await receipt.json().catch(() => ({}));
        if (rcJson?.error) return NextResponse.json({ error: `Invoice marked paid but the receipt could not be recorded: ${rcJson.error}` }, { status: 502 });
        // GL: debit cash (1000) / checking (1010), credit AR (1200)
        const method = String(p.method || "manual").toLowerCase();
        const debitCode = method === "cash" || method === "check" ? "1000" : "1010";
        let journalEntryId: string | null = null;
        if (paidDollars > 0) {
          journalEntryId = await postGl(resolveTenantId(req), {
            source: "invoice_paid",
            sourceId: String(rcJson?.data?.id || id),
            reference: id,
            memo: `Invoice ${id} marked paid — $${paidDollars.toFixed(2)} via ${p.method || "manual"}`,
            lines: [
              { accountCode: debitCode, debit: paidDollars, credit: 0, memo: `Payment (${p.method || "manual"})` },
              { accountCode: "1200", debit: 0, credit: paidDollars, memo: "Accounts receivable" },
            ],
          });
        }
        return NextResponse.json({ data: invJson?.data, receipt: rcJson?.data ?? null, journalEntryId }, { status: 200 });
      }
      case "invoice_void": {
        // SA-53: void + REVERSAL entry when money was actually received
        // (amount_paid > 0): debit AR (1200) / credit cash (1000) undoing
        // the invoice_mark_paid receipt entry. Unpaid invoices post no
        // reversal — no receipt entry exists to reverse.
        const id = String(p.invoice_id || "");
        if (!id) return NextResponse.json({ error: "invoice_id required" }, { status: 400 });
        const tenantId = resolveTenantId(req);
        const priorRes = await adminGet(T.invoices, id, { tenantId });
        const priorJson = await priorRes.json().catch(() => null);
        if (!priorJson?.data) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        const priorStatus = String(priorJson.data.status || "").toLowerCase();
        if (priorStatus === "void") return NextResponse.json({ error: `Invoice ${id} is already void` }, { status: 409 });
        const paidAmt = Number(priorJson.data.amount_paid || 0);
        const upd = await adminUpdate(T.invoices, id, { status: "void", voided_at: new Date().toISOString(), void_reason: p.reason || null }, { tenantId });
        const updJson = await upd.json().catch(() => ({}));
        if (updJson?.error) return upd;
        let reversalEntryId: string | null = null;
        if (priorStatus === "paid" && paidAmt > 0) {
          reversalEntryId = await postGl(tenantId, {
            source: "invoice_paid",
            sourceId: id,
            reference: "invoice_void_reversal",
            memo: `Reversal — AR invoice ${priorJson.data.invoice_number || id} voided after payment of $${paidAmt.toFixed(2)}`,
            lines: [
              { accountCode: "1200", debit: paidAmt, credit: 0, memo: "Accounts receivable" },
              { accountCode: "1000", debit: 0, credit: paidAmt, memo: "Cash reversal" },
            ],
          });
        }
        return NextResponse.json({ data: updJson?.data ?? null, reversalEntryId }, { status: 200 });
      }
      case "invoice_duplicate": {
        // SA-54: copy header + line items under a fresh, unique number.
        const id = String(p.invoice_id || "");
        if (!id) return NextResponse.json({ error: "invoice_id required" }, { status: 400 });
        const tenantId = resolveTenantId(req);
        const src = await adminGet(T.invoices, id, { tenantId });
        const sj = await src.json().catch(() => null);
        if (!sj?.data) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        const { id: _x, created_at: _y, updated_at: _u, invoice_number: _z, sent_at: _s, viewed_at: _v, posted_journal_id: _pj, voided_at: _va, voided_by: _vb, void_reason: _vr, resent_count: _rc, reminder_count: _rmc, last_reminder_at: _lr, ...rest } = sj.data;
        const newNumber = `${_z || "INV"}-COPY-${Date.now().toString(36).toUpperCase()}`;
        const created = await adminCreate(T.invoices, { ...rest, status: "draft", invoice_number: newNumber, amount_paid: 0, amount_credited: 0, sent_at: null, resent_count: 0, reminder_count: 0 }, { tenantId });
        const cj = await created.json().catch(() => ({}));
        if (cj?.error || !cj?.data?.id) return created;
        const newId = String(cj.data.id);
        // Copy the AR line items onto the duplicate.
        let copiedItems = 0;
        try {
          const client = await getPgWithRetry();
          try {
            const lines = await client.query(
              `SELECT line_no, description, quantity, unit_price, discount_amount, line_subtotal, tax_code_id, tax_amount, revenue_account_id, item_ref, service_date, dimensions
                 FROM public.acct_ar_invoice_lines WHERE invoice_id = $1::uuid ORDER BY line_no`,
              [id],
            );
            for (const l of lines.rows) {
              await client.query(
                `INSERT INTO public.acct_ar_invoice_lines
                   (id, invoice_id, line_no, description, quantity, unit_price, discount_amount, line_subtotal, tax_code_id, tax_amount, revenue_account_id, item_ref, service_date, dimensions)
                 VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                [newId, l.line_no, l.description, l.quantity, l.unit_price, l.discount_amount, l.line_subtotal, l.tax_code_id, l.tax_amount, l.revenue_account_id, l.item_ref, l.service_date, l.dimensions],
              );
              copiedItems++;
            }
          } finally {
            client.release();
          }
        } catch (e) {
          console.error("[accounting/actions] invoice_duplicate line copy failed:", e instanceof Error ? e.message : e);
          // Failed-insert honesty: a failed line copy must surface as an
          // error (outer catch -> 500), never a 201 claiming the
          // duplicate is complete.
          throw e;
        }
        return NextResponse.json({ data: cj.data, copiedItems }, { status: 201 });
      }
      case "invoice_delete": {
        // SA-55: ONLY drafts may be deleted (hard delete — a draft never
        // posted, was never sent, and holds no money). Everything else
        // must go through invoice_void so the record + reversal survive.
        const id = String(p.invoice_id || "");
        if (!id) return NextResponse.json({ error: "invoice_id required" }, { status: 400 });
        const tenantId = resolveTenantId(req);
        const priorRes = await adminGet(T.invoices, id, { tenantId });
        const priorJson = await priorRes.json().catch(() => null);
        if (!priorJson?.data) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        if (String(priorJson.data.status || "").toLowerCase() !== "draft") {
          return NextResponse.json({ error: `Only draft invoices can be deleted — this invoice is ${priorJson.data.status}. Use invoice_void instead.` }, { status: 422 });
        }
        try {
          const client = await getPgWithRetry();
          try {
            await client.query(`DELETE FROM public.acct_ar_invoice_lines WHERE invoice_id = $1::uuid`, [id]);
            const del = await client.query(`DELETE FROM public.acct_ar_invoices WHERE id = $1::uuid AND tenant_id = $2`, [id, tenantId]);
            if (!del.rowCount) return NextResponse.json({ error: "Draft invoice could not be deleted — the delete did not land" }, { status: 500 });
          } finally {
            client.release();
          }
        } catch (e: any) {
          return NextResponse.json({ error: e?.message || "delete failed" }, { status: 500 });
        }
        return NextResponse.json({ ok: true, invoice_id: id, deleted: true });
      }

      // ── PAYMENTS ──────────────────────────────────────────────────
      case "payment_send_reminder": {
        // SA-48: WIRED to the real reminder engine (reminderDelivery via
        // Resend, with the 7-day throttle) — the same delivery path the
        // finance route uses. The id is a legacy `invoices` id (the UI
        // table the reminders are about); anything else is a 404.
        const id = String(p.payment_id || p.invoice_id || "");
        if (!id) return NextResponse.json({ error: "payment_id or invoice_id required" }, { status: 400 });
        const tenantId = resolveTenantId(req);
        const { deliverInvoiceReminder, emptyTally, loadInvoice } = await import("@/lib/quick-actions/reminderDelivery");
        const provider = await getEmailProviderSettings(tenantId);
        if (!provider.hasSendingKey) {
          return NextResponse.json({ ok: false, error: "Email not configured", detail: "Set an email provider key at Admin → Connections & Keys (Resend or Brevo)" }, { status: 503 });
        }
        const inv = await loadInvoice(tenantId, id);
        if (!inv) return NextResponse.json({ ok: false, error: "Invoice not found for that payment/invoice id" }, { status: 404 });
        if (inv.status === "PAID" || inv.status === "VOID" || Number(inv.balanceDue || 0) <= 0) {
          return NextResponse.json({ ok: true, invoiceId: id, message: `Invoice ${inv.number} has no outstanding balance — no reminder sent` });
        }
        const tally = emptyTally();
        const dryRun = p.dry_run === true;
        const outcome = await deliverInvoiceReminder(tenantId, inv, tally, { skipDedupe: true, dryRun });
        if (outcome === "failed") {
          return NextResponse.json({ ok: false, ...tally, invoiceId: id, error: `Reminder failed: ${tally.failures[0] || "send failed"}` }, { status: 502 });
        }
        if (outcome === "skipped_no_email") {
          return NextResponse.json({ ok: false, ...tally, invoiceId: id, error: "Customer has no email address on file — reminder not sent" }, { status: 422 });
        }
        if (outcome === "skipped_recent") {
          return NextResponse.json({ ok: true, ...tally, invoiceId: id, message: `Invoice ${inv.number} was already reminded recently — throttled, nothing sent` });
        }
        return NextResponse.json({ ok: true, ...tally, invoiceId: id, message: dryRun ? `Dry run — would email a payment reminder for invoice ${inv.number}` : `Payment reminder emailed for invoice ${inv.number}` });
      }
      case "payment_batch_export": {
        // SA-49: real server-side CSV generation over commerce_payments
        // (the same rows /api/admin/accounting/payments lists come from
        // the AR receipts table, but a payments export is the payment
        // ledger — commerce_payments is the system of record for it).
        const tenantId = resolveTenantId(req);
        const fromDate = p.from_date ? String(p.from_date) : null;
        const toDate = p.to_date ? String(p.to_date) : null;
        try {
          const client = await getPgWithRetry();
          try {
            const rows = await client.query(
              `SELECT cp.payment_number, cp.amount::text, cp.tip_amount::text, cp.currency, cp.status,
                      cp.created_at::text, cp.external_reference,
                      NULLIF(TRIM(COALESCE(cc.first_name, '') || ' ' || COALESCE(cc.last_name, '')), '') AS customer_name,
                      cc.email AS customer_email, COALESCE(pm.name, 'Other') AS tender
                 FROM public.commerce_payments cp
                 LEFT JOIN public.crm_customers cc ON cc.id = cp.customer_id
                 LEFT JOIN public.commerce_payment_methods pm ON pm.id = cp.payment_method_id
                WHERE cp.tenant_id = $1
                  AND ($2::date IS NULL OR cp.created_at >= $2::date)
                  AND ($3::date IS NULL OR cp.created_at < ($3::date + interval '1 day'))
                ORDER BY cp.created_at DESC LIMIT 5000`,
              [tenantId, fromDate, toDate],
            );
            const esc = (v: unknown) => {
              const s = v == null ? "" : String(v);
              return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const header = "payment_number,date,customer,customer_email,tender,amount,tip,currency,status,reference";
            const lines = rows.rows.map((r: any) => [
              r.payment_number, r.created_at, r.customer_name || "Walk-in", r.customer_email || "",
              r.tender || "", Number(r.amount || 0).toFixed(2), Number(r.tip_amount || 0).toFixed(2),
              String(r.currency || "USD").toUpperCase(), r.status, r.external_reference || "",
            ].map(esc).join(","));
            const totalAmount = rows.rows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
            return NextResponse.json({
              ok: true,
              filename: `payments-export-${new Date().toISOString().slice(0, 10)}.csv`,
              csv: [header, ...lines].join("\n"),
              count: rows.rows.length,
              totalAmount: Math.round(totalAmount * 100) / 100,
            });
          } finally {
            client.release();
          }
        } catch (e: any) {
          return NextResponse.json({ error: e?.message || "batch export failed" }, { status: 500 });
        }
      }

      case "export_ledger": {
        // SA-38: EXPORT THE GENERAL LEDGER as CSV — every posted journal
        // line in the range (optional single-account filter), with
        // debit/credit totals that must tie to the trial balance. The
        // Books surface downloads the returned CSV as a file.
        const tenantId = resolveTenantId(req);
        const fromDate = p.from_date ? String(p.from_date) : null;
        const toDate = p.to_date ? String(p.to_date) : null;
        const accountCode = p.account_code ? String(p.account_code) : null;
        try {
          const client = await getPgWithRetry();
          try {
            const rows = await client.query(
              `SELECT je.entry_no::text AS entry_no, je.entry_date::text AS entry_date,
                      je.source, je.reference, je.memo,
                      a.code AS account_code, a.name AS account_name,
                      l.debit::text AS debit, l.credit::text AS credit
                 FROM public.acct_journal_lines l
                 JOIN public.acct_journal_entries je ON je.id = l.journal_entry_id
                 JOIN public.acct_chart_of_accounts a ON a.id = l.account_id
                WHERE l.tenant_id = $1 AND je.status = 'posted'
                  AND ($2::date IS NULL OR je.entry_date >= $2::date)
                  AND ($3::date IS NULL OR je.entry_date <= $3::date)
                  AND ($4::text IS NULL OR a.code = $4)
                ORDER BY je.entry_date, je.entry_no, l.line_no
                LIMIT 10000`,
              [tenantId, fromDate, toDate, accountCode],
            );
            const esc = (v: unknown) => {
              const s = v == null ? "" : String(v);
              return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const header = "entry_no,entry_date,source,reference,memo,account_code,account_name,debit,credit";
            const lines = rows.rows.map((r: any) => [
              r.entry_no, r.entry_date, r.source, r.reference || "", r.memo || "",
              r.account_code, r.account_name,
              Number(r.debit || 0).toFixed(2), Number(r.credit || 0).toFixed(2),
            ].map(esc).join(","));
            const totalDebit = rows.rows.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
            const totalCredit = rows.rows.reduce((s: number, r: any) => s + Number(r.credit || 0), 0);
            return NextResponse.json({
              ok: true,
              filename: `general-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
              csv: [header, ...lines].join("\n"),
              count: rows.rows.length,
              totalDebit: Math.round(totalDebit * 100) / 100,
              totalCredit: Math.round(totalCredit * 100) / 100,
            });
          } finally {
            client.release();
          }
        } catch (e: any) {
          return NextResponse.json({ error: e?.message || "ledger export failed" }, { status: 500 });
        }
      }

      // ── DEPOSITS ──────────────────────────────────────────────────
      case "deposit_collect": {
        const depDollars = c2d(p.amount_cents != null ? p.amount_cents : (p.amount ?? 0) * 100);
        const r = await adminCreate(T.deposits, {
          customer_id: p.customer_id || null,
          order_id: p.order_id || null,
          amount: depDollars,
          status: "collected",
          collected_at: new Date().toISOString(),
          notes: p.note || null,
        }, { tenantId: resolveTenantId(req) });
        const j = await r.json().catch(() => ({}));
        if (j?.error) return NextResponse.json({ error: j.error }, { status: 502 });
        // GL: debit cash (1000), credit customer deposits liability (2300)
        let depJe: string | null = null;
        if (depDollars > 0) {
          const depId = String(j?.data?.id || "");
          depJe = await postGl(resolveTenantId(req), {
            source: "deposit_collected",
            sourceId: depId || null,
            memo: `Deposit collected — $${depDollars.toFixed(2)}${p.customer_id ? ` (customer ${p.customer_id})` : ""}`,
            lines: [
              { accountCode: "1000", debit: depDollars, credit: 0, memo: "Cash received" },
              { accountCode: "2300", debit: 0, credit: depDollars, memo: "Customer deposit liability" },
            ],
          });
        }
        return NextResponse.json({ data: j?.data ?? null, journalEntryId: depJe }, { status: r.status });
      }
      case "deposit_apply_to_invoice": {
        const depId = String(p.deposit_id || "");
        const invId = String(p.invoice_id || "");
        if (!depId || !invId) return NextResponse.json({ error: "deposit_id and invoice_id required" }, { status: 400 });
        const dep = await adminGet(T.deposits, depId, { tenantId: resolveTenantId(req) });
        const dj = await dep.json().catch(() => null);
        if (dj?._empty) return NextResponse.json({ error: "Deposits table not available" }, { status: 501 });
        if (!dj?.data) return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
        const upd = await adminUpdate(T.deposits, depId, { status: "applied", applied_to_invoice_id: invId, applied_at: new Date().toISOString() }, { tenantId: resolveTenantId(req) });
        const updJ = await upd.json().catch(() => ({}));
        if ((updJ as any)?.error || (updJ as any)?._empty || !(updJ as any)?.data) {
          return NextResponse.json({ error: "Deposit could not be marked applied — the deposit update did not land" }, { status: 502 });
        }
        // GL: debit customer deposits liability (2300), credit AR (1200)
        const appliedDollars = Number(dj.data.amount || 0);
        let appliedJe: string | null = null;
        if (appliedDollars > 0) {
          appliedJe = await postGl(resolveTenantId(req), {
            source: "deposit_applied",
            sourceId: depId,
            reference: invId,
            memo: `Deposit ${depId} applied to invoice ${invId} — $${appliedDollars.toFixed(2)}`,
            lines: [
              { accountCode: "2300", debit: appliedDollars, credit: 0, memo: "Customer deposit liability" },
              { accountCode: "1200", debit: 0, credit: appliedDollars, memo: "Accounts receivable" },
            ],
          });
        }
        return NextResponse.json({ ok: true, deposit_id: depId, invoice_id: invId, applied_amount: appliedDollars, journalEntryId: appliedJe });
      }
      case "deposit_release":
      case "deposit_refund":
      case "deposit_forfeit": {
        const depId = String(p.deposit_id || "");
        if (!depId) return NextResponse.json({ error: "deposit_id required" }, { status: 400 });
        const status = action === "deposit_release" ? "released" : action === "deposit_refund" ? "refunded" : "forfeited";
        const tenant = resolveTenantId(req);
        const dep = await adminGet(T.deposits, depId, { tenantId: tenant });
        const dj = await dep.json().catch(() => null);
        if (!dj?.data) return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
        if (["released", "refunded", "forfeited", "applied"].includes(String(dj.data.status))) {
          return NextResponse.json({ error: `Deposit is '${dj.data.status}' — only a collected/held deposit can be ${status}` }, { status: 400 });
        }
        // acct_ar_deposits has released_at / refunded_at columns but NO
        // forfeited_at — the old computed-key update wrote a nonexistent
        // column for forfeits and the update died. Forfeit stamps `notes`.
        const patch: Record<string, unknown> = { status };
        if (status === "released") patch.released_at = new Date().toISOString();
        if (status === "refunded") patch.refunded_at = new Date().toISOString();
        if (p.note) patch.notes = String(p.note);
        if (status === "forfeited" && !p.note) patch.notes = `Forfeited ${new Date().toISOString()}`;
        const upd = await adminUpdate(T.deposits, depId, patch, { tenantId: tenant });
        const uj = await upd.json().catch(() => ({}));
        if ((uj as any)?.error || !(uj as any)?.data) {
          return NextResponse.json({ error: "Deposit update did not land" }, { status: 502 });
        }
        // GL: release/refund returns the money (Dr 2300 / Cr 1000);
        // forfeit converts the liability to revenue (Dr 2300 / Cr 4000).
        const amt = Number(dj.data.amount || 0);
        let journalEntryId: string | null = null;
        if (amt > 0) {
          journalEntryId = await postGl(tenant, {
            source: status === "forfeited" ? "deposit_forfeited" : "deposit_released",
            sourceId: depId,
            memo: `Deposit ${depId} ${status} — $${amt.toFixed(2)}`,
            lines: status === "forfeited"
              ? [
                  { accountCode: "2300", debit: amt, credit: 0, memo: "Customer deposit liability" },
                  { accountCode: "4000", debit: 0, credit: amt, memo: "Forfeit revenue" },
                ]
              : [
                  { accountCode: "2300", debit: amt, credit: 0, memo: "Customer deposit liability" },
                  { accountCode: "1000", debit: 0, credit: amt, memo: "Cash returned to customer" },
                ],
          });
        }
        return NextResponse.json({ ok: true, deposit_id: depId, status, journalEntryId });
      }
      case "deposit_transfer": {
        const depId = String(p.deposit_id || "");
        const toCustomer = String(p.to_customer_id || p.new_customer_id || "");
        if (!depId || !toCustomer) return NextResponse.json({ error: "deposit_id and to_customer_id required" }, { status: 400 });
        // acct_ar_deposits has no transferred_at column (the old update
        // wrote one and died) — the transfer is stamped in notes/metadata.
        // No GL: the 2300 liability is unchanged, only its owner.
        return adminUpdate(T.deposits, depId, {
          customer_id: toCustomer,
          notes: p.note || `Transferred to customer ${toCustomer} at ${new Date().toISOString()}`,
          metadata: { transferred_to: toCustomer, transferred_at: new Date().toISOString() },
        }, { tenantId: resolveTenantId(req) });
      }

      // ── REFUNDS ───────────────────────────────────────────────────
      case "refund_issue": {
        const refundDollars = c2d(p.amount_cents != null ? p.amount_cents : (p.amount ?? 0) * 100);
        const refundRes = await adminCreate(T.refunds, {
          order_id: p.order_id || null,
          payment_id: p.payment_id || null,
          customer_id: p.customer_id || null,
          amount: refundDollars,
          reason: p.reason || null,
          status: "issued",
          issued_at: new Date().toISOString(),
        }, { tenantId: resolveTenantId(req) });
        const rj = await refundRes.json().catch(() => ({}));
        if (rj?.error) return NextResponse.json({ error: rj.error }, { status: 502 });
        // GL: reverse the sale — debit revenue (4000), credit cash (1000)
        let refundJe: string | null = null;
        if (refundDollars > 0) {
          refundJe = await postGl(resolveTenantId(req), {
            source: "refund",
            sourceId: String(rj?.data?.id || ""),
            reference: String(p.order_id || p.payment_id || ""),
            memo: `Refund issued — $${refundDollars.toFixed(2)}${p.reason ? ` (${p.reason})` : ""}`,
            lines: [
              { accountCode: "4000", debit: refundDollars, credit: 0, memo: "Revenue reversal" },
              { accountCode: "1000", debit: 0, credit: refundDollars, memo: "Cash refunded" },
            ],
          });
        }
        return NextResponse.json({ data: rj?.data ?? null, journalEntryId: refundJe }, { status: refundRes.status });
      }
      case "refund_approve":
      case "refund_reject": {
        const id = String(p.refund_id || "");
        if (!id) return NextResponse.json({ error: "refund_id required" }, { status: 400 });
        const tenant = resolveTenantId(req);
        const isApprove = action === "refund_approve";
        // SA-64: rejection requires a reason.
        const note = String(p.note || p.reason || "");
        if (!isApprove && !note) return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });
        const cur = await adminGet(T.refunds, id, { tenantId: tenant });
        const cj = await cur.json().catch(() => null);
        if (!cj?.data) return NextResponse.json({ error: "Refund not found" }, { status: 404 });
        if (["approved", "rejected", "disputed", "issued"].includes(String(cj.data.status)) && isApprove && cj.data.status !== "issued") {
          return NextResponse.json({ error: `Refund is '${cj.data.status}' — it cannot be approved` }, { status: 400 });
        }
        // acct_ar_refunds has approved_at but NO decided_at / decision_note /
        // rejected_at columns (the old update wrote them and died). The
        // decision note rides in metadata.
        const patch: Record<string, unknown> = isApprove
          ? { status: "approved", approved_at: new Date().toISOString(), metadata: { ...(cj.data.metadata || {}), decision_note: note || null, decided_at: new Date().toISOString() } }
          : { status: "rejected", metadata: { ...(cj.data.metadata || {}), decision_note: note, decided_at: new Date().toISOString(), rejected_at: new Date().toISOString() } };
        const upd = await adminUpdate(T.refunds, id, patch, { tenantId: tenant });
        const uj = await upd.json().catch(() => ({}));
        if ((uj as any)?.error || !(uj as any)?.data) {
          return NextResponse.json({ error: "Refund decision did not land" }, { status: 502 });
        }
        // SA-63 → SA-29: approval triggers the refund's GL
        // (Dr 4000 revenue reversal / Cr 1000 cash).
        let journalEntryId: string | null = null;
        if (isApprove) {
          const amt = Number(cj.data.amount || 0);
          if (amt > 0) {
            journalEntryId = await postGl(tenant, {
              source: "refund",
              sourceId: id,
              memo: `Refund ${id} approved and issued — $${amt.toFixed(2)}`,
              lines: [
                { accountCode: "4000", debit: amt, credit: 0, memo: "Revenue reversal" },
                { accountCode: "1000", debit: 0, credit: amt, memo: "Cash refunded" },
              ],
            });
          }
        }
        return NextResponse.json({ ok: true, refund_id: id, status: isApprove ? "approved" : "rejected", journalEntryId });
      }
      case "refund_dispute": {
        const id = String(p.refund_id || "");
        if (!id) return NextResponse.json({ error: "refund_id required" }, { status: 400 });
        const tenant = resolveTenantId(req);
        const cur = await adminGet(T.refunds, id, { tenantId: tenant });
        const cj = await cur.json().catch(() => null);
        if (!cj?.data) return NextResponse.json({ error: "Refund not found" }, { status: 404 });
        // acct_ar_refunds has no disputed_at / dispute_note columns — the
        // dispute stamps ride in metadata. (The dispute RECORD itself is
        // created by the finance route's dispute_refund case in
        // commerce_disputes, which plugs B.10.7.)
        return adminUpdate(T.refunds, id, {
          status: "disputed",
          metadata: { ...(cj.data.metadata || {}), dispute_note: p.note || null, disputed_at: new Date().toISOString() },
        }, { tenantId: tenant });
      }

      // ── GIFT CARDS & STORE CREDIT ─────────────────────────────────
      case "giftcard_check_balance": {
        const code = String(p.code || "");
        if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
        const r = await adminGet(T.giftCards, code, { tenantId: resolveTenantId(req),  pk: "card_number", noTenant: false });
        return r;
      }
      case "giftcard_issue_store_credit": {
        // SA-71: store credit is its own instrument — a row in
        // commerce_store_credits attached to a customer (customer_id is
        // NOT NULL there). This case previously created a gift-card row
        // instead, so "store credit" issued here never appeared as credit.
        const scDollars = c2d(p.amount_cents != null ? p.amount_cents : (p.amount ?? 0) * 100);
        if (!p.customer_id) return NextResponse.json({ error: "customer_id required — store credit attaches to a customer" }, { status: 400 });
        if (!(scDollars > 0)) return NextResponse.json({ error: "amount required" }, { status: 400 });
        const creditNumber = `SC-${Date.now().toString(36).toUpperCase()}`;
        const scRes = await adminCreate("commerce_store_credits", {
          credit_number: creditNumber,
          customer_id: p.customer_id,
          original_amount: scDollars,
          balance: scDollars,
          currency: "USD",
          status: "active",
          expires_at: p.expires_at || null,
        }, { tenantId: resolveTenantId(req) });
        const scj = await scRes.json().catch(() => ({}));
        if (scj?.error) return NextResponse.json({ error: scj.error }, { status: 502 });
        // GL: debit cash (1000), credit gift card LIABILITY (2310 carries
        // store credits too) — not revenue
        const scJe = await postGl(resolveTenantId(req), {
          source: "store_credit_issued",
          sourceId: String(scj?.data?.id || ""),
          reference: creditNumber,
          memo: `Store credit issued — $${scDollars.toFixed(2)}`,
          lines: [
            { accountCode: "1000", debit: scDollars, credit: 0, memo: "Cash received" },
            { accountCode: "2310", debit: 0, credit: scDollars, memo: "Gift card liability" },
          ],
        });
        return NextResponse.json({ data: scj?.data ?? null, journalEntryId: scJe }, { status: scRes.status });
      }
      case "giftcard_issue": {
        const isCredit = false;
        const gcDollars = c2d(p.amount_cents != null ? p.amount_cents : (p.amount ?? 0) * 100);
        const gcRes = await adminCreate(T.giftCards, {
          card_number: p.code || `GC-${Date.now().toString(36).toUpperCase()}`,
          initial_value: gcDollars,
          balance: gcDollars,
          currency: "USD",
          status: "active",
          recipient_email: p.email || null,
          customer_id: p.customer_id || null,
          expires_at: p.expires_at || null,
        }, { tenantId: resolveTenantId(req) });
        const gcj = await gcRes.json().catch(() => ({}));
        if (gcj?.error) return NextResponse.json({ error: gcj.error }, { status: 502 });
        // GL: debit cash (1000), credit gift card LIABILITY (2310) — not revenue
        let gcJe: string | null = null;
        if (gcDollars > 0) {
          gcJe = await postGl(resolveTenantId(req), {
            source: isCredit ? "store_credit_issued" : "gift_card_issued",
            sourceId: String(gcj?.data?.id || ""),
            reference: String(gcj?.data?.card_number || ""),
            memo: `${isCredit ? "Store credit" : "Gift card"} issued — $${gcDollars.toFixed(2)}`,
            lines: [
              { accountCode: "1000", debit: gcDollars, credit: 0, memo: "Cash received" },
              { accountCode: "2310", debit: 0, credit: gcDollars, memo: "Gift card liability" },
            ],
          });
        }
        return NextResponse.json({ data: gcj?.data ?? null, journalEntryId: gcJe }, { status: gcRes.status });
      }
      case "giftcard_add_value": {
        const id = String(p.giftcard_id || "");
        const addDollars = c2d(p.amount_cents != null ? p.amount_cents : (p.amount ?? 0) * 100);
        if (!id || !(addDollars > 0)) return NextResponse.json({ error: "giftcard_id and amount required" }, { status: 400 });
        const cur = await adminGet(T.giftCards, id, { tenantId: resolveTenantId(req) });
        const cj = await cur.json().catch(() => null);
        if (!cj?.data) return NextResponse.json({ error: "Gift card not found" }, { status: 404 });
        if (!["active", "partially_redeemed"].includes(String(cj.data.status || ""))) {
          return NextResponse.json({ error: `Cannot add value to a ${cj.data.status} gift card` }, { status: 422 });
        }
        const updRes = await adminUpdate(T.giftCards, id, { balance: Number(cj.data.balance || 0) + addDollars }, { tenantId: resolveTenantId(req) });
        // GL: debit cash (1000), credit gift card liability (2310)
        await postGl(resolveTenantId(req), {
          source: "gift_card_value_added",
          sourceId: id,
          memo: `Gift card value added — $${addDollars.toFixed(2)}`,
          lines: [
            { accountCode: "1000", debit: addDollars, credit: 0, memo: "Cash received" },
            { accountCode: "2310", debit: 0, credit: addDollars, memo: "Gift card liability" },
          ],
        });
        return updRes;
      }
      case "giftcard_redeem": {
        const id = String(p.giftcard_id || "");
        const useDollars = c2d(p.amount_cents != null ? p.amount_cents : (p.amount ?? 0) * 100);
        if (!id || !(useDollars > 0)) return NextResponse.json({ error: "giftcard_id and amount required" }, { status: 400 });
        const cur = await adminGet(T.giftCards, id, { tenantId: resolveTenantId(req) });
        const cj = await cur.json().catch(() => null);
        if (!cj?.data) return NextResponse.json({ error: "Gift card not found" }, { status: 404 });
        if (!["active", "partially_redeemed"].includes(String(cj.data.status || ""))) {
          return NextResponse.json({ error: `Cannot redeem a ${cj.data.status} gift card` }, { status: 422 });
        }
        const bal = Number(cj.data.balance || 0);
        if (bal < useDollars) return NextResponse.json({ error: "Insufficient balance" }, { status: 422 });
        const remaining = Math.round((bal - useDollars) * 100) / 100;
        const redeemRes = await adminUpdate(T.giftCards, id, { balance: remaining, status: remaining === 0 ? "redeemed" : "partially_redeemed", last_used_at: new Date().toISOString() }, { tenantId: resolveTenantId(req) });
        // GL: debit gift card liability (2310), credit product revenue (4000) — earned now
        const redeemJe = await postGl(resolveTenantId(req), {
          source: "gift_card_redeemed",
          sourceId: id,
          memo: `Gift card redeemed — $${useDollars.toFixed(2)}`,
          lines: [
            { accountCode: "2310", debit: useDollars, credit: 0, memo: "Gift card liability" },
            { accountCode: "4000", debit: 0, credit: useDollars, memo: "Product sales revenue" },
          ],
        });
        const rj = await redeemRes.json().catch(() => ({}));
        return NextResponse.json({ data: rj?.data ?? null, journalEntryId: redeemJe }, { status: redeemRes.status });
      }
      case "giftcard_deactivate":
      case "giftcard_reactivate":
      case "giftcard_expire": {
        const id = String(p.giftcard_id || "");
        if (!id) return NextResponse.json({ error: "giftcard_id required" }, { status: 400 });
        // NOTE: the commerce_gift_cards status CHECK has no 'deactivated'
        // value — deactivation lands on 'cancelled' (the finance route's
        // deactivate_gift_card does the same and preserves the balance;
        // adminUpdate here only sets status, so the balance survives too).
        const status = action === "giftcard_deactivate" ? "cancelled" : action === "giftcard_reactivate" ? "active" : "expired";
        return adminUpdate(T.giftCards, id, { status }, { tenantId: resolveTenantId(req) });
      }

      // ── PAYROLL (owner-facing) ────────────────────────────────────
      case "payroll_run": {
        // SA-87 — REAL run via the shared engine (@/lib/payroll/runPayroll),
        // identical to POST /api/admin/payroll/runs and fin_run_payroll.
        // The old handler wrote to acct_payroll_runs with columns that
        // table does not have (period_start / run_at), so it could only
        // fail; and a $0 shell run is not payroll. Draft run → no JE (see
        // the engine header for the design reason). tax_withheld stays 0.
        const periodStart = String(p.period_start || p.pay_period_start || "");
        const periodEnd = String(p.period_end || p.pay_period_end || "");
        const payDate = String(p.pay_date || periodEnd);
        if (!periodStart || !periodEnd) {
          return NextResponse.json({ error: "period_start and period_end are required (YYYY-MM-DD)" }, { status: 400 });
        }
        const startMs = Date.parse(`${periodStart}T00:00:00Z`);
        const endMs = Date.parse(`${periodEnd}T00:00:00Z`);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
          return NextResponse.json({ error: "period_start and period_end must be valid dates (YYYY-MM-DD), end on or after start" }, { status: 400 });
        }
        const client = await getPgWithRetry();
        try {
          const result = await createPayrollRun(client, resolveTenantId(req), { payPeriodStart: periodStart, payPeriodEnd: periodEnd, payDate });
          return NextResponse.json({
            ok: true,
            data: { id: result.runId, number: result.runNumber, status: result.status, pay_period_start: periodStart, pay_period_end: periodEnd, pay_date: payDate, gross_wages: result.summary.totalGrossWages, tax_withheld: 0, net_paid: result.summary.totalNetPaid },
            summary: result.summary,
            missingRates: result.missingRates,
            lines: result.lines,
          }, { status: 201 });
        } finally {
          client.release();
        }
      }
      case "payroll_add_employee": {
        // SA-88 — add an employee to payroll. The payroll roster IS
        // crm_staff (PayrollView reads it, payroll runs pay from its pay
        // profile, commissions accrue against it). The old handler wrote
        // to acct_payroll_employees with a pay_rate_cents column that
        // table does not have, into a roster nothing reads. This creates
        // the real crm_staff record with the pay-profile fields from the
        // commissions build: pay_type, hourly_rate, salary_amount +
        // salary_period, commission_rate (percent).
        const firstName = String(p.first_name || "").trim();
        const lastName = String(p.last_name || "").trim();
        const fullName = String(p.employee_name || p.name || "").trim();
        const displayName = fullName || `${firstName} ${lastName}`.trim();
        if (!displayName) {
          return NextResponse.json({ error: "employee_name (or first_name + last_name) is required" }, { status: 400 });
        }
        const payType = String(p.pay_type || "hourly").trim().toLowerCase();
        if (!(PAY_TYPES as readonly string[]).includes(payType)) {
          return NextResponse.json({ error: `pay_type must be one of: ${PAY_TYPES.join(", ")}` }, { status: 400 });
        }
        // Rate inputs: explicit dollars win; pay_rate_cents is the legacy
        // cents spelling of the hourly rate and is converted, never stored raw.
        const hourlyRate = p.hourly_rate != null ? Number(p.hourly_rate)
          : p.pay_rate_cents != null ? Number(p.pay_rate_cents) / 100 : null;
        const salaryAmount = p.salary_amount != null ? Number(p.salary_amount) : null;
        const commissionRate = p.commission_rate != null ? Number(p.commission_rate) : null;
        for (const [label, v] of [["hourly_rate", hourlyRate], ["salary_amount", salaryAmount], ["commission_rate", commissionRate]] as const) {
          if (v != null && (!Number.isFinite(v) || v < 0)) {
            return NextResponse.json({ error: `${label} must be a non-negative number` }, { status: 400 });
          }
        }
        if (commissionRate != null && commissionRate > 100) {
          return NextResponse.json({ error: "commission_rate must be a percent between 0 and 100" }, { status: 400 });
        }
        const salaryPeriod = p.salary_period ? String(p.salary_period).trim().toLowerCase() : null;
        if (salaryPeriod != null && !["annual", "monthly", "biweekly", "weekly"].includes(salaryPeriod)) {
          return NextResponse.json({ error: "salary_period must be 'annual', 'monthly', 'biweekly' or 'weekly'" }, { status: 400 });
        }
        const tenantId = resolveTenantId(req);
        const client = await getPgWithRetry();
        try {
          const r = await client.query(
            `INSERT INTO public.crm_staff
               (id, tenant_id, display_name, first_name, last_name, email, phone, role,
                is_service_staff, is_active, hire_date, pay_type, hourly_rate, salary_amount,
                commission_rate, salary_period)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, true, $9::date, $10, $11, $12, $13, $14)
             RETURNING id::text AS id, display_name, pay_type,
                       hourly_rate::numeric AS hourly_rate, salary_amount::numeric AS salary_amount,
                       commission_rate::numeric AS commission_rate, salary_period`,
            [tenantId, displayName, firstName || displayName.split(" ")[0], lastName || displayName.split(" ").slice(1).join(" ") || null,
             p.email ? String(p.email).trim() : null, p.phone ? String(p.phone).trim() : null,
             p.role ? String(p.role).trim() : "Staff", !!p.is_service_staff,
             p.hire_date ? String(p.hire_date) : null, payType, hourlyRate, salaryAmount, commissionRate, salaryPeriod],
          );
          if (!r.rows[0]) return NextResponse.json({ error: "Payroll employee insert did not land" }, { status: 500 });
          return NextResponse.json({ ok: true, data: r.rows[0] }, { status: 201 });
        } finally {
          client.release();
        }
      }

      default:
        return NextResponse.json({ error: `Unknown accounting action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "accounting action failed", action }, { status: 500 });
  }
}

// Silence unused-var lint for the probe helper (used by future actions)
void tableExists;

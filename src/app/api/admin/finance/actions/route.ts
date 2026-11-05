// ---------------------------------------------------------------------------
// /api/admin/finance/actions/route.ts
//
// All accounting / invoicing / deposits / gift-card / store-credit / payroll
// quick actions. Each handler:
//   1. Strips the module prefix from the action_code (accts_* / apt_* / order_*)
//      so the switch matches what the registry sends.
//   2. Performs a real transactional write (pgExec) against the live Supabase
//      tables — never a console.log stub.
//   3. Appends a row to acct_audit_log via the shared auditAction() helper
//      so every mutation is forensically traceable.
//   4. Returns a structured JSON payload that TanStack Query hooks can use to
//      invalidate the affected cache slices (e.g. { ok: true, invoiceId }).
//
// Tables touched (verified schema):
//   acct_ar_invoices (status: acct_document_status enum)
//   commerce_gift_cards (initial_value, balance, converted_store_credit_id, reminder_sent_at)
//   commerce_deposits (deposit_number, applied_invoice_id)
//   commerce_store_credits (credit_number, original_amount, balance)
//   commerce_payments (payment_number, status text)
//   commerce_orders (status, payment_status)
//   payroll_runs (number, pay_period_start, pay_period_end, status: payroll_run_state)
//   payroll_timesheets (employee_id, week_start, hours_regular, status)
//   acct_reconciliations (bank_account_id, as_of_date, statement_balance, status: acct_reconciliation_status)
//   invoices (camelCase table — number, customerId, total, balanceDue, status, dueDate, notes)
//   crm_notes (system reminders log)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { guardPayloadIds, guardRequiredFields } from "@/lib/quick-actions/validate";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgExec, pgQuery, getPgWithRetry } from "@/lib/pg";
import { auditAction, getActorIdFromRequest, issueStoreCredit, logCustomerNote } from "@/lib/quick-actions/audit";
import { postBalancedJournalEntry } from "@/lib/accounting/journal";
import {
  ensureAcctCustomer,
  resolveEntityId,
  resolveRevenueAccountId,
  type SqlFn,
} from "@/lib/accounting/invoice-store";
import { getStripe } from "@/lib/stripe";
import { getTenantStripeAccount, insertTenantStripeAccount } from "@/lib/stripe-connect";
import { createPayrollRun } from "@/lib/payroll/runPayroll";
import { sendEmail } from "@/lib/email";
import { toResendVariables } from "@/lib/email/resend-templates";
import { giftCardReminderHtml, giftCardDeliveryHtml } from "@/lib/email/templates/gift-cards";
import { getEmailProviderSettings } from "@/lib/email/provider-settings";
import {
  deliverInvoiceReminder,
  emptyTally,
  loadInvoice,
  selectOverdueInvoices,
  tallyMessage,
} from "@/lib/quick-actions/reminderDelivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("payments", "write");
  if (gate) return gate;

  let action = "";
  let payload: Record<string, unknown> = {};
  let actorId: string | null = null;
  let ip: string | null = null;

  try {
    const body = await req.json();
    action = String(body.action || "");
    payload = body.payload ?? body;
    delete (payload as Record<string, unknown>).action;
    const idGuard = guardPayloadIds(payload);
    if (idGuard) return idGuard;
    const reqGuard = guardRequiredFields(action, payload);
    if (reqGuard) return reqGuard;
    actorId = await getActorIdFromRequest(req);
    ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch (e) {
    return NextResponse.json({ error: `Invalid request body: ${e instanceof Error ? e.message : "unknown"}` }, { status: 400 });
  }

  // Strip the FIRST module prefix (accts_add_value → add_value; apt_take_payment → take_payment;
  // order_export_ledger → export_ledger). The regex matches the first [a-z]+_ run, so multi-segment
  // names like apply_to_invoice and apply_deposit_to_invoice survive intact.
  // Palette-alias map: the command-palette registry abbreviates some action
  // codes (accts_reactivate_gc → reactivate_gc, rpt_pnl → pnl, reg_refunds →
  // refunds) while the handlers below use the full names the useActions hooks
  // send (fin_reactivate_gift_card → reactivate_gift_card). Normalize the
  // palette spellings to the handler names so BOTH surfaces reach the same
  // real handlers instead of the palette hitting "Unknown action".
  const PALETTE_ALIASES: Record<string, string> = {
    deactivate_gc: "deactivate_gift_card",
    reactivate_gc: "reactivate_gift_card",
    expire_gc: "expire_gift_card",
    transfer_gc: "transfer_gift_card",
    edit_gc: "edit_gift_card",
    replace_gc: "replace_gift_card",
    void_gc: "void_gift_card",
    send_gc_receipt: "send_gift_card_receipt",
    reissue_gc: "reissue_gift_card",
    pnl: "run_pnl",
    balance_sheet: "run_balance_sheet",
    trial_balance: "run_trial_balance",
    general_ledger: "run_general_ledger",
    print_receipts: "print_receipt",
    payment_batch_export: "batch_export",
    refunds: "register_refunds",
    credits: "register_credits",
    gift_card: "issue_gift_card",
  };
  const strippedAction = action.replace(/^[a-z]+_/, "");
  const shortAction = PALETTE_ALIASES[strippedAction] ?? strippedAction;

  try {
    switch (shortAction) {
      // ───────────────────────────────────────────────────────────────────
      // EXISTING REAL HANDLERS (fixed for schema correctness)
      // ───────────────────────────────────────────────────────────────────

      case "mark_paid": {
        const invoiceId = String(payload.invoice_id || "");
        if (!invoiceId) {
          return NextResponse.json({ ok: false, error: "invoice_id is required" }, { status: 400 });
        }
        // Guards (SA-52): never double-post the receipt JE for an invoice
        // that is already paid, and never "pay" a voided invoice.
        // (Single invoice record: acct_ar_invoices; invoice_id must be
        // its uuid — a non-uuid id is simply not found.)
        if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(invoiceId)) {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} not found` }, { status: 404 });
        }
        const existing = await pgQuery<{ status: string; amount_paid: string; amount_credited: string; deposit_paid: string }>(
          `SELECT status::text AS status, amount_paid::text, amount_credited::text, deposit_paid::text FROM public.acct_ar_invoices WHERE id = $1::uuid AND tenant_id = $2`,
          [invoiceId, resolveTenantId(req)],
        );
        if (existing.length === 0) {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} not found` }, { status: 404 });
        }
        if (String(existing[0].status).toLowerCase() === "paid") {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} is already paid — no second journal entry was posted` }, { status: 409 });
        }
        if (String(existing[0].status).toLowerCase() === "void") {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} is void and cannot be marked paid` }, { status: 422 });
        }
        // Mark paid: amount_paid tops up so paid + credited + deposit
        // equals the total exactly (the disjoint-counter balance rule).
        const updated = await pgExec(
          `UPDATE public.acct_ar_invoices
              SET status = 'paid', amount_paid = total - amount_credited - deposit_paid,
                  paid_at = now(), updated_at = now()
            WHERE id = $1::uuid AND tenant_id = $2`,
          [invoiceId, resolveTenantId(req)],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} could not be marked paid — no matching invoice was updated` }, { status: 500 });
        }
        // GL posting: debit cash, credit AR (best-effort). Only the
        // REMAINDER is posted here — amounts already collected through
        // Record Payment posted their own Dr cash / Cr AR entries when
        // they landed, so posting the full total would double-count them.
        try {
          const inv = await pgQuery<{ total: string }>(
            `SELECT total::text FROM public.acct_ar_invoices WHERE id = $1::uuid AND tenant_id = $2`,
            [invoiceId, resolveTenantId(req)]
          );
          const alreadySettled = Number(existing[0]?.amount_paid || 0) + Number(existing[0]?.amount_credited || 0) + Number(existing[0]?.deposit_paid || 0);
          const amt = Math.max(0, Math.round((Number(inv[0]?.total || 0) - alreadySettled) * 100) / 100);
          if (amt > 0) {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            await postBalancedJournalEntry(q, resolveTenantId(req), {
              source: "invoice_paid",
              sourceId: invoiceId,
              memo: `Invoice ${invoiceId} marked paid`,
              lines: [
                { accountCode: "1000", debit: amt, credit: 0 },
                { accountCode: "1200", debit: 0, credit: amt },
              ],
            });
          }
        } catch (e) { console.error("[GL] mark_paid failed:", e); }
        await auditAction({ action, domain: "acct", tableName: "invoices", recordId: invoiceId, afterData: payload, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, invoiceId, status: "paid" });
      }

      case "void_invoice": {
        const invoiceId = String(payload.invoice_id || "");
        if (!invoiceId) {
          return NextResponse.json({ ok: false, error: "invoice_id is required" }, { status: 400 });
        }
        // SA-53: voiding a PAID invoice posts a REVERSAL journal entry
        // (debit AR / credit cash) undoing the mark_paid receipt entry.
        // Voiding an unpaid invoice posts nothing — creating an invoice
        // never posted a journal entry, so there is nothing to reverse.
        if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(invoiceId)) {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} not found` }, { status: 404 });
        }
        const prior = await pgQuery<{ status: string; total: string; amount_paid: string; amount_credited: string; deposit_paid: string }>(
          `SELECT status::text AS status, total::text, amount_paid::text, amount_credited::text, deposit_paid::text FROM public.acct_ar_invoices WHERE id = $1::uuid AND tenant_id = $2`,
          [invoiceId, resolveTenantId(req)],
        );
        if (prior.length === 0) {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} not found` }, { status: 404 });
        }
        if (String(prior[0].status).toLowerCase() === "void") {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} is already void` }, { status: 409 });
        }
        const wasPaid = String(prior[0].status).toLowerCase() === "paid";
        const paidAmt = Number(prior[0].amount_paid || 0) + Number(prior[0].amount_credited || 0) + Number(prior[0].deposit_paid || 0) || Number(prior[0].total || 0);
        const updated = await pgExec(
          `UPDATE public.acct_ar_invoices SET status = 'void', voided_at = now(), updated_at = now()
            WHERE id = $1::uuid AND tenant_id = $2`,
          [invoiceId, resolveTenantId(req)],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} could not be voided — no matching invoice was updated` }, { status: 500 });
        }
        let reversalEntryId: string | null = null;
        if (wasPaid && paidAmt > 0) {
          try {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            reversalEntryId = await postBalancedJournalEntry(q, resolveTenantId(req), {
              source: "invoice_paid",
              sourceId: invoiceId,
              reference: "invoice_void_reversal",
              memo: `Reversal — invoice ${invoiceId} voided after payment of $${paidAmt.toFixed(2)}`,
              lines: [
                { accountCode: "1200", debit: paidAmt, credit: 0 },
                { accountCode: "1000", debit: 0, credit: paidAmt },
              ],
            });
          } catch (e) { console.error("[GL] void_invoice reversal failed:", e); }
        }
        await auditAction({ action, domain: "acct", tableName: "invoices", recordId: invoiceId, beforeData: { status: prior[0].status }, afterData: { ...payload, status: "VOID", reversalEntryId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, invoiceId, status: "void", reversalEntryId });
      }

      case "issue_refund": {
        // SA-29: issue a refund against an order. Creates the refunds-ledger
        // row (commerce_refunds) in addition to flipping the order, posts the
        // balanced GL (Dr 4000 revenue reversal / Cr 1000 cash), and is
        // idempotent per order: a repeat call returns the existing refund
        // row instead of double-refunding.
        const tenant = resolveTenantId(req);
        const orderId = String(payload.order_id || "");
        const amount = Number(payload.amount || 0);
        const reason = String(payload.reason || "customer_request");
        if (!orderId) return NextResponse.json({ ok: false, error: "order_id is required to issue a refund" }, { status: 400 });
        if (!(amount > 0)) return NextResponse.json({ ok: false, error: "A positive refund amount is required" }, { status: 400 });
        const idemRef = `fin_issue_${orderId}`;
        const existing = await pgQuery<{ id: string; refund_number: string }>(
          `SELECT id::text AS id, refund_number FROM public.commerce_refunds
            WHERE tenant_id = $1 AND processor_reference = $2 LIMIT 1`,
          [tenant, idemRef],
        );
        if (existing[0]) {
          return NextResponse.json({ ok: true, orderId, refundId: existing[0].id, refundNumber: existing[0].refund_number, amount, reason, idempotent: true, message: `Refund ${existing[0].refund_number} already issued for this order` });
        }
        const updated = await pgExec(
          `UPDATE public.commerce_orders
              SET status = 'refunded', payment_status = 'refunded', updated_at = now()
            WHERE id = $1 AND tenant_id = $2`,
          [orderId, tenant],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: `Refund for order ${orderId} could not be recorded — no matching order was updated` }, { status: 500 });
        }
        const refundNumber = `RFN-${Date.now().toString(36).toUpperCase()}`;
        const refRows = await pgQuery<{ id: string }>(
          `INSERT INTO public.commerce_refunds
             (id, tenant_id, refund_number, amount, reason, status, processor_reference, refund_method, created_at, processed_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'completed', $5, 'original_payment', now(), now())
           RETURNING id`,
          [tenant, refundNumber, amount, reason, idemRef],
        );
        const refundId = refRows[0]?.id ?? null;
        // GL posting: debit revenue, credit cash (best-effort)
        let journalEntryId: string | null = null;
        try {
          const q = async (text: string, params?: unknown[]) => {
            const r = await pgQuery(text, params);
            return { rows: r as Record<string, unknown>[] };
          };
          journalEntryId = await postBalancedJournalEntry(q, tenant, {
            source: "refund",
            sourceId: refundId || orderId,
            memo: `Refund for order ${orderId}: ${reason}`,
            lines: [
              { accountCode: "4000", debit: amount, credit: 0 },
              { accountCode: "1000", debit: 0, credit: amount },
            ],
          });
        } catch (e) { console.error("[GL] issue_refund failed:", e); }
        await auditAction({ action, domain: "commerce", tableName: "commerce_refunds", recordId: refundId, afterData: { orderId, amount, reason, refundNumber, journalEntryId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, orderId, refundId, refundNumber, amount, reason, journalEntryId, message: `Refund of $${amount} processed` });
      }

      case "issue_gift_card": {
        const initialBalance = Number(payload.initial_balance ?? payload.initial_value ?? 0);
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        const recipientEmail = payload.recipient_email ? String(payload.recipient_email) : null;
        const cardNumber = `GC-${Date.now().toString(36).toUpperCase()}`;
        const inserted = await pgExec(
          `INSERT INTO public.commerce_gift_cards
             (id, tenant_id, card_number, customer_id, initial_value, balance, currency, status,
              issued_at, recipient_email)
           VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4, $4, 'USD', 'active', now(), $5)`,
          [resolveTenantId(req), cardNumber, customerId, initialBalance, recipientEmail],
        );
        if (!inserted) {
          return NextResponse.json({ ok: false, error: `Gift card ${cardNumber} could not be issued — the card was not saved` }, { status: 500 });
        }
        // GL posting: debit cash, credit gift card liability (best-effort)
        try {
          if (initialBalance > 0) {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            await postBalancedJournalEntry(q, resolveTenantId(req), {
              source: "giftcard_issue",
              sourceId: cardNumber,
              memo: `Gift card ${cardNumber} issued: $${initialBalance}`,
              lines: [
                { accountCode: "1000", debit: initialBalance, credit: 0 },
                { accountCode: "2310", debit: 0, credit: initialBalance },
              ],
            });
          }
        } catch (e) { console.error("[GL] issue_gift_card failed:", e); }
        await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: cardNumber, afterData: { initialBalance, customerId, recipientEmail }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, cardNumber, initialBalance });
      }

      case "redeem_gift_card": {
        const cardNumber = String(payload.card_number || "");
        const amount = Number(payload.amount || 0);
        const updated = await pgExec(
          `UPDATE public.commerce_gift_cards
              SET balance = balance - $1, last_used_at = now(),
                  status = CASE WHEN balance - $1 = 0 THEN 'redeemed' ELSE 'partially_redeemed' END
            WHERE card_number = $2 AND tenant_id = $3 AND status IN ('active','partially_redeemed') AND balance >= $1`,
          [amount, cardNumber, resolveTenantId(req)],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: "No active gift card with sufficient balance for that card number" }, { status: 422 });
        }
        // GL posting: debit gift card liability, credit revenue (best-effort)
        try {
          if (amount > 0 && updated > 0) {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            await postBalancedJournalEntry(q, resolveTenantId(req), {
              source: "giftcard_redeem",
              sourceId: cardNumber,
              memo: `Gift card ${cardNumber} redeemed: $${amount}`,
              lines: [
                { accountCode: "2310", debit: amount, credit: 0 },
                { accountCode: "4000", debit: 0, credit: amount },
              ],
            });
          }
        } catch (e) { console.error("[GL] redeem_gift_card failed:", e); }
        await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: cardNumber, afterData: { amount, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, cardNumber, amount, updated, message: "Redeemed" });
      }

      case "take_payment": {
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        const amount = Number(payload.amount || 0);
        if (!(amount > 0)) {
          return NextResponse.json({ error: "An amount greater than zero is required" }, { status: 400 });
        }
        const reference = payload.reference ? String(payload.reference) : null;
        // commerce_payments.payment_method_id is NOT NULL — when the caller
        // doesn't supply one, fall back to the tenant's active "manual_cash"
        // method, then to any active method, then to the lowest-id method.
        let methodId = payload.payment_method_id ? String(payload.payment_method_id) : null;
        if (!methodId) {
          const fallback = await pgQuery<{ id: string }>(
            `SELECT id FROM public.commerce_payment_methods
              WHERE tenant_id = $1 AND active = true
              ORDER BY (code = 'manual_cash') DESC,
                       (method_type = 'cash') DESC,
                       id
              LIMIT 1`,
            [resolveTenantId(req)],
          );
          methodId = fallback[0]?.id ?? null;
        }
        if (!methodId) {
          return NextResponse.json({ ok: false, error: "No payment method available — configure one in /admin/financial-settings" }, { status: 400 });
        }
        const payNum = `PAY-${Date.now().toString(36).toUpperCase()}`;
        const inserted = await pgExec(
          `INSERT INTO public.commerce_payments
             (id, tenant_id, payment_number, customer_id, payment_method_id, amount, currency, status, external_reference, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4::uuid, $5, 'USD', 'succeeded', $6, now())`,
          [resolveTenantId(req), payNum, customerId, methodId, amount, reference],
        );
        if (!inserted) {
          return NextResponse.json({ ok: false, error: `Payment ${payNum} could not be recorded — the payment was not saved` }, { status: 500 });
        }
        await auditAction({ action, domain: "commerce", tableName: "commerce_payments", recordId: payNum, afterData: { amount, customerId, methodId, reference }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, paymentNumber: payNum, amount, methodId });
      }

      case "create_invoice": {
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        // Normalize every line-item shape the callers send:
        //   { amount } | { quantity, unit_price } | { quantity, unit_price_cents }
        const rawItems = (payload.line_items as Array<Record<string, unknown>>) || [];
        const lineItems = rawItems.map((i) => {
          const qty = Math.max(1, Number(i.quantity ?? 1) || 1);
          const unit = i.unit_price_cents != null
            ? Number(i.unit_price_cents) / 100
            : i.unit_price != null
              ? Number(i.unit_price)
              : i.unitPrice != null
                ? Number(i.unitPrice)
                : 0;
          const amount = i.amount != null ? Number(i.amount) : Math.round(qty * unit * 100) / 100;
          return {
            description: String(i.description || "Item"),
            quantity: qty,
            unitPrice: Math.round((qty > 0 ? amount / qty : amount) * 100) / 100,
            amount: Math.round(amount * 100) / 100,
          };
        }).filter((i) => i.amount > 0);
        const dueDate = payload.due_date ? String(payload.due_date) : null;
        const notes = payload.notes ? String(payload.notes) : null;
        // SA-06 tax: explicit tax_amount wins; otherwise tax_rate (0–1 or %)
        // applied to the subtotal. Tax is included in the invoice total.
        const subtotal = lineItems.reduce((s, i) => s + i.amount, 0);
        const taxRateRaw = payload.tax_rate != null ? Number(payload.tax_rate) : null;
        const taxAmount = payload.tax_amount != null
          ? Math.round(Number(payload.tax_amount) * 100) / 100
          : taxRateRaw != null
            ? Math.round(subtotal * (taxRateRaw > 1 ? taxRateRaw / 100 : taxRateRaw) * 100) / 100
            : 0;
        const total = Math.round((subtotal + taxAmount) * 100) / 100;
        const invNum = `INV-${Date.now().toString(36).toUpperCase()}`;
        if (!customerId) {
          return NextResponse.json({ ok: false, error: "customer_id is required to create an invoice" }, { status: 400 });
        }
        // Single invoice record: acct_ar_invoices (the enterprise AR
        // table) — the table the Invoices UI, send path, payments /
        // mark-paid (with their GL postings) and statements all run on
        // since the 2026-10-13 consolidation dropped the duplicate
        // storefront invoices table. The caller's customer id is kept in
        // source_customer_id; customer_id is the tenant's AR customer.
        const tenantId = resolveTenantId(req);
        const q: SqlFn = async (text, params) => pgQuery(text, params as any);
        const entityId = await resolveEntityId(q, tenantId);
        if (!entityId) {
          return NextResponse.json({ ok: false, error: "No accounting entity configured for this tenant" }, { status: 500 });
        }
        const acctCustomerId = await ensureAcctCustomer(q, tenantId, { sourceId: customerId });
        const revenueAccountId = await resolveRevenueAccountId(q, tenantId);
        if (!revenueAccountId) {
          return NextResponse.json({ ok: false, error: "No revenue account configured for this tenant" }, { status: 500 });
        }
        const inserted = await pgQuery<{ id: string }>(
          `INSERT INTO public.acct_ar_invoices
             (tenant_id, entity_id, customer_id, source_customer_id, invoice_number,
              status, invoice_date, due_date, subtotal, tax_total, discount_total,
              total, amount_paid, amount_credited, deposit_paid, notes)
           VALUES ($1, $2, $3, $4, $5, 'posted', CURRENT_DATE, COALESCE($6::date, CURRENT_DATE + 30),
                   $7, $8, 0, $9, 0, 0, 0, $10)
           RETURNING id::text AS id`,
          [tenantId, entityId, acctCustomerId, customerId, invNum, dueDate, subtotal, taxAmount, total, notes],
        );
        const invoiceId = inserted[0]?.id;
        if (!invoiceId) {
          return NextResponse.json({ ok: false, error: `Invoice ${invNum} could not be created — the invoice was not saved` }, { status: 500 });
        }
        // Persist the line items on the invoice so the Invoices UI,
        // the send-email template, and Duplicate all see the real lines.
        let lineNo = 0;
        for (const li of lineItems) {
          lineNo += 1;
          await pgExec(
            `INSERT INTO public.acct_ar_invoice_lines
               (invoice_id, line_no, description, quantity, unit_price, discount_amount, line_subtotal, tax_amount, revenue_account_id)
             VALUES ($1::uuid, $2, $3, $4, $5, 0, $6, 0, $7)`,
            [invoiceId, lineNo, li.description, li.quantity, li.unitPrice, li.amount, revenueAccountId],
          );
        }
        if (taxAmount > 0) {
          lineNo += 1;
          await pgExec(
            `INSERT INTO public.acct_ar_invoice_lines
               (invoice_id, line_no, description, quantity, unit_price, discount_amount, line_subtotal, tax_amount, revenue_account_id)
             VALUES ($1::uuid, $2, 'Tax', 1, $3, 0, $3, 0, $4)`,
            [invoiceId, lineNo, taxAmount, revenueAccountId],
          );
        }
        await auditAction({ action, domain: "acct", tableName: "acct_ar_invoices", recordId: invoiceId, afterData: { invoiceNumber: invNum, customerId, total, lineItems: lineItems.length, legacyId: invoiceId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, invoiceId, invoiceNumber: invNum, subtotal, tax: taxAmount, total, legacyId: invoiceId });
      }

      case "send_reminder": {
        // accts_send_reminder — REAL delivery via Resend (sendEmail +
        // invoice_reminder template). With invoice_id: remind that invoice.
        // Otherwise: every overdue invoice belonging to customer_id.
        // (Previously this only wrote a crm_notes row and claimed success.)
        const tenant = resolveTenantId(req);
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        const invoiceId = payload.invoice_id ? String(payload.invoice_id) : null;
        const dryRun = payload.dry_run === true;
        const provider = await getEmailProviderSettings(tenant);
        if (!provider.hasSendingKey) {
          return NextResponse.json({ ok: false, error: "Email not configured", detail: "Set an email provider key at Admin → Connections & Keys (Resend or Brevo)" }, { status: 503 });
        }
        const tally = emptyTally();
        if (invoiceId) {
          const inv = await loadInvoice(tenant, invoiceId);
          if (!inv) return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
          if (inv.status === "PAID" || inv.status === "VOID" || Number(inv.balanceDue || 0) <= 0) {
            return NextResponse.json({ ok: true, ...tally, invoiceId, message: `Invoice ${inv.number} has no outstanding balance — no reminder sent` });
          }
          // Explicit single-invoice send: no dedupe window.
          const outcome = await deliverInvoiceReminder(tenant, inv, tally, { skipDedupe: true, dryRun });
          if (outcome === "sent" && !dryRun && inv.customerId) {
            await logCustomerNote({ customerId: inv.customerId, body: `Payment reminder emailed for invoice ${inv.number} (balance $${Number(inv.balanceDue || 0).toFixed(2)}).`, noteType: "payment_reminder" });
          }
          await auditAction({ action, domain: "acct", tableName: "invoices", recordId: invoiceId, afterData: { customerId, invoiceId, dryRun, ...tally }, actorUserId: actorId, ipAddress: ip });
          if (outcome === "failed") {
            return NextResponse.json({ ok: false, ...tally, invoiceId, message: `Reminder failed: ${tally.failures[0] || "send failed"}` }, { status: 502 });
          }
          if (outcome === "skipped_no_email") {
            return NextResponse.json({ ok: false, ...tally, invoiceId, message: "Customer has no email address on file — reminder not sent" }, { status: 422 });
          }
          return NextResponse.json({ ok: true, ...tally, invoiceId, message: dryRun ? `Dry run — would email a payment reminder for invoice ${inv.number}` : `Payment reminder emailed for invoice ${inv.number}` });
        }
        if (!customerId) {
          return NextResponse.json({ ok: false, error: "customer_id or invoice_id required" }, { status: 400 });
        }
        const invs = await selectOverdueInvoices(tenant, customerId);
        for (const inv of invs) {
          const outcome = await deliverInvoiceReminder(tenant, inv, tally, { dryRun });
          if (outcome === "sent" && !dryRun && inv.customerId) {
            await logCustomerNote({ customerId: inv.customerId, body: `Payment reminder emailed for invoice ${inv.number} (balance $${Number(inv.balanceDue || 0).toFixed(2)}).`, noteType: "payment_reminder" });
          }
        }
        await auditAction({ action, domain: "acct", tableName: "invoices", recordId: customerId, afterData: { customerId, candidates: invs.length, dryRun, ...tally }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({
          ok: true, ...tally, count: tally.sent, customerId, dryRun,
          message: invs.length === 0
            ? "No overdue invoices for this customer — nothing sent"
            : dryRun
              ? `Dry run — no emails sent. Would email ${tally.sent} payment reminder(s); ${tally.skipped_no_email} skipped (no email on file); ${tally.skipped_recent} skipped (already reminded this week)`
              : tallyMessage(tally, tally.sent === 1 ? "payment reminder" : "payment reminders"),
        });
      }

      case "collect_deposit": {
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        const appointmentId = payload.appointment_id ? String(payload.appointment_id) : null;
        // UI sends amount_cents; accept either, store dollars (matches existing rows).
        const amountCents = payload.amount_cents !== undefined ? Number(payload.amount_cents) : null;
        const amount = amountCents != null && amountCents > 0
          ? amountCents / 100
          : Number(payload.amount || 0);
        const method = payload.method ? String(payload.method) : "card";
        if (!customerId) return NextResponse.json({ ok: false, error: "customer_id is required to collect a deposit" }, { status: 400 });
        if (!(amount > 0)) return NextResponse.json({ ok: false, error: "A positive deposit amount is required" }, { status: 400 });
        const depNum = `DEP-${Date.now().toString(36).toUpperCase()}`;
        const inserted = await pgExec(
          `INSERT INTO public.commerce_deposits
             (id, tenant_id, deposit_number, customer_id, appointment_id, amount, currency,
              collected_at, method, status, deposit_type)
           VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4::uuid, $5, 'USD', now(), $6, 'held', 'booking')`,
          [resolveTenantId(req), depNum, customerId, appointmentId, amount, method],
        );
        if (!inserted) {
          return NextResponse.json({ ok: false, error: `Deposit ${depNum} could not be recorded — the deposit was not saved` }, { status: 500 });
        }
        // GL posting: debit cash, credit deposit liability (best-effort)
        try {
          if (amount > 0) {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            await postBalancedJournalEntry(q, resolveTenantId(req), {
              source: "deposit_collect",
              sourceId: depNum,
              memo: `Deposit ${depNum} collected: $${amount}`,
              lines: [
                { accountCode: "1000", debit: amount, credit: 0 },
                { accountCode: "2300", debit: 0, credit: amount },
              ],
            });
          }
        } catch (e) { console.error("[GL] collect_deposit failed:", e); }
        await auditAction({ action, domain: "acct", tableName: "commerce_deposits", recordId: depNum, afterData: { amount, customerId, appointmentId, method }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, depositNumber: depNum, amount, status: "held" });
      }

      case "release_deposit": {
        // SA-58: releasing a held deposit returns the money to the customer —
        // GL Dr 2300 Customer Deposits / Cr 1000 Cash. Only 'held' deposits
        // can be released; anything else is an honest 400, not silent success.
        const tenant = resolveTenantId(req);
        const rawId = String(payload.deposit_id || "").trim();
        const depRows = await pgQuery<{ id: string; amount: string; status: string }>(
          `SELECT id::text AS id, amount::text, status FROM public.commerce_deposits
            WHERE tenant_id = $1 AND (id::text = $2 OR UPPER(deposit_number) = UPPER($2)) LIMIT 1`,
          [tenant, rawId],
        );
        if (!depRows[0]) return NextResponse.json({ ok: false, error: `Deposit ${rawId || "(blank)"} not found` }, { status: 404 });
        const dep = depRows[0];
        if (dep.status !== "held") return NextResponse.json({ ok: false, error: `Deposit is '${dep.status}' — only held deposits can be released` }, { status: 400 });
        const updated = await pgExec(
          `UPDATE public.commerce_deposits SET status = 'released', updated_at = now()
            WHERE id = $1::uuid AND tenant_id = $2 AND status = 'held'`,
          [dep.id, tenant],
        );
        if (!updated) return NextResponse.json({ ok: false, error: "Deposit release did not land" }, { status: 500 });
        let journalEntryId: string | null = null;
        try {
          const amt = Number(dep.amount || 0);
          if (amt > 0) {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            journalEntryId = await postBalancedJournalEntry(q, tenant, {
              source: "deposit_release",
              sourceId: dep.id,
              memo: `Deposit ${dep.id} released to customer: $${amt}`,
              lines: [
                { accountCode: "2300", debit: amt, credit: 0 },
                { accountCode: "1000", debit: 0, credit: amt },
              ],
            });
          }
        } catch (e) { console.error("[GL] release_deposit failed:", e); }
        await auditAction({ action, domain: "acct", tableName: "commerce_deposits", recordId: dep.id, afterData: { status: "released", journalEntryId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, depositId: dep.id, updated, status: "released", journalEntryId });
      }

      case "forfeit_deposit": {
        // SA-59: forfeiture per policy converts the held liability to revenue —
        // GL Dr 2300 Customer Deposits / Cr 4000 Revenue. Held deposits only.
        const tenant = resolveTenantId(req);
        const rawId = String(payload.deposit_id || "").trim();
        const reason = payload.reason ? String(payload.reason) : "Forfeited per policy";
        const depRows = await pgQuery<{ id: string; amount: string; status: string }>(
          `SELECT id::text AS id, amount::text, status FROM public.commerce_deposits
            WHERE tenant_id = $1 AND (id::text = $2 OR UPPER(deposit_number) = UPPER($2)) LIMIT 1`,
          [tenant, rawId],
        );
        if (!depRows[0]) return NextResponse.json({ ok: false, error: `Deposit ${rawId || "(blank)"} not found` }, { status: 404 });
        const dep = depRows[0];
        if (dep.status !== "held") return NextResponse.json({ ok: false, error: `Deposit is '${dep.status}' — only held deposits can be forfeited` }, { status: 400 });
        const updated = await pgExec(
          `UPDATE public.commerce_deposits SET status = 'forfeited', updated_at = now()
            WHERE id = $1::uuid AND tenant_id = $2 AND status = 'held'`,
          [dep.id, tenant],
        );
        if (!updated) return NextResponse.json({ ok: false, error: "Deposit forfeit did not land" }, { status: 500 });
        let journalEntryId: string | null = null;
        try {
          const amt = Number(dep.amount || 0);
          if (amt > 0) {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            journalEntryId = await postBalancedJournalEntry(q, tenant, {
              source: "deposit_forfeit",
              sourceId: dep.id,
              memo: `Deposit ${dep.id} forfeited (${reason}): $${amt}`,
              lines: [
                { accountCode: "2300", debit: amt, credit: 0 },
                { accountCode: "4000", debit: 0, credit: amt },
              ],
            });
          }
        } catch (e) { console.error("[GL] forfeit_deposit failed:", e); }
        await auditAction({ action, domain: "acct", tableName: "commerce_deposits", recordId: dep.id, afterData: { status: "forfeited", reason, journalEntryId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, depositId: dep.id, updated, status: "forfeited", journalEntryId });
      }

      case "apply_deposit_to_invoice": {
        const tenant = resolveTenantId(req);
        const rawDeposit = String(payload.deposit_id || "").trim();
        const rawInvoice = String(payload.invoice_id || "").trim();
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        // The top-level "Apply to Invoice" button asks the user to TYPE the
        // deposit's display number (DEP-XXXX) — casting that straight to
        // uuid threw a Postgres error and 500'd. Resolve display
        // identifiers to real rows first; unknown identifiers get an
        // honest 400, not a 500.
        let depositId = "";
        if (UUID_RE.test(rawDeposit)) {
          depositId = rawDeposit;
        } else if (rawDeposit) {
          const depRows = await pgQuery<{ id: string }>(
            `SELECT id::text AS id FROM public.commerce_deposits
              WHERE tenant_id = $1 AND UPPER(deposit_number) = UPPER($2) LIMIT 1`,
            [tenant, rawDeposit],
          );
          depositId = depRows[0]?.id || "";
        }
        if (!depositId) {
          return NextResponse.json({ ok: false, error: `Deposit ${rawDeposit || "(blank)"} not found` }, { status: 400 });
        }
        // The invoice identifier may be an AR invoice UUID or an AR
        // invoice number (INV-XXXX). Since the 2026-10-13 consolidation
        // every real invoice lives in acct_ar_invoices with a uuid id,
        // so the resolved uuid always lands in applied_invoice_id.
        // SA-57 guard: only a HELD deposit can be applied. Re-applying an
        // already applied/released/forfeited/refunded deposit would flip
        // its state again and double-post the Dr 2300 / Cr 1200 entry.
        const depStatus = await pgQuery<{ status: string }>(
          `SELECT status FROM public.commerce_deposits
            WHERE id = $1::uuid AND tenant_id = $2 LIMIT 1`,
          [depositId, tenant],
        );
        if (!depStatus[0]) {
          return NextResponse.json({ ok: false, error: `Deposit ${rawDeposit} not found` }, { status: 400 });
        }
        if (depStatus[0].status !== "held") {
          return NextResponse.json({ ok: false, error: `Deposit is '${depStatus[0].status}' — only held deposits can be applied to an invoice` }, { status: 400 });
        }
        let invoiceUuid: string | null = null;
        let invoiceRef = rawInvoice;
        if (UUID_RE.test(rawInvoice)) {
          // A bare UUID is only usable if it is a real AR invoice — writing
          // an unverified UUID into applied_invoice_id died on the FK.
          const arCheck = await pgQuery<{ id: string }>(
            `SELECT id::text AS id FROM public.acct_ar_invoices
              WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
            [tenant, rawInvoice],
          );
          if (!arCheck[0]?.id) {
            return NextResponse.json({ ok: false, error: `Invoice ${rawInvoice} not found` }, { status: 400 });
          }
          invoiceUuid = rawInvoice;
        } else if (rawInvoice) {
          const arRows = await pgQuery<{ id: string }>(
            `SELECT id::text AS id FROM public.acct_ar_invoices
              WHERE tenant_id = $1 AND UPPER(invoice_number) = UPPER($2) LIMIT 1`,
            [tenant, rawInvoice],
          );
          if (!arRows[0]?.id) {
            return NextResponse.json({ ok: false, error: `Invoice ${rawInvoice} not found` }, { status: 400 });
          }
          invoiceUuid = arRows[0].id;
        }
        const updated = await pgExec(
          `UPDATE public.commerce_deposits
              SET status = 'applied', applied_invoice_id = $1::uuid, updated_at = now()
            WHERE id = $2::uuid AND tenant_id = $3 AND status = 'held'`,
          [invoiceUuid, depositId, tenant],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: `Deposit ${rawDeposit} could not be applied — the deposit update did not land` }, { status: 500 });
        }
        // GL posting: debit deposit liability, credit AR (best-effort)
        try {
          const dep = await pgQuery<{ amount: string }>(
            `SELECT amount::text FROM public.commerce_deposits WHERE id = $1::uuid AND tenant_id = $2`,
            [depositId, resolveTenantId(req)]
          );
          const amt = Number(dep[0]?.amount || 0);
          if (amt > 0 && updated > 0) {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            await postBalancedJournalEntry(q, resolveTenantId(req), {
              source: "deposit_apply",
              sourceId: depositId,
              memo: `Deposit ${depositId} applied to invoice ${invoiceUuid ?? invoiceRef}`,
              lines: [
                { accountCode: "2300", debit: amt, credit: 0 },
                { accountCode: "1200", debit: 0, credit: amt },
              ],
            });
          }
        } catch (e) { console.error("[GL] apply_deposit_to_invoice failed:", e); }
        await auditAction({ action, domain: "acct", tableName: "commerce_deposits", recordId: depositId, afterData: { invoiceId: invoiceUuid ?? invoiceRef, status: "applied" }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, depositId, invoiceId: invoiceUuid ?? invoiceRef, updated, status: "applied" });
      }

      case "refund_deposit": {
        // SA-29: refund a held deposit. Idempotent — the held→refunded
        // transition can only fire once (status guard + a repeat call gets an
        // honest 400). When the deposit is linked to a Stripe PaymentIntent,
        // the processor refund runs FIRST (idempotency key per deposit) and
        // the state only flips on success. GL: Dr 2300 / Cr 1000.
        const tenant = resolveTenantId(req);
        const rawId = String(payload.deposit_id || "").trim();
        const depRows = await pgQuery<{ id: string; amount: string; status: string; payment_id: string | null }>(
          `SELECT cd.id::text AS id, cd.amount::text, cd.status, cd.payment_id::text,
                  cp.processor_transaction_id
             FROM public.commerce_deposits cd
             LEFT JOIN public.commerce_payments cp ON cp.id = cd.payment_id
            WHERE cd.tenant_id = $1 AND (cd.id::text = $2 OR UPPER(cd.deposit_number) = UPPER($2)) LIMIT 1`,
          [tenant, rawId],
        );
        if (!depRows[0]) return NextResponse.json({ ok: false, error: `Deposit ${rawId || "(blank)"} not found` }, { status: 404 });
        const dep = depRows[0] as any;
        if (dep.status !== "held") return NextResponse.json({ ok: false, error: `Deposit is '${dep.status}' — only held deposits can be refunded (idempotency guard)` }, { status: 400 });
        const amt = Number(dep.amount || 0);
        let processorRefundId: string | null = null;
        const pi = dep.processor_transaction_id ? String(dep.processor_transaction_id) : "";
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (pi.startsWith("pi_") && stripeKey) {
          try {
            const Stripe = (await import("stripe")).default;
            const stripe = new Stripe(stripeKey);
            const refund = await stripe.refunds.create(
              { payment_intent: pi, amount: Math.round(amt * 100), reason: "requested_by_customer" },
              { idempotencyKey: `deposit-refund-${dep.id}` },
            );
            processorRefundId = refund.id;
          } catch (e: any) {
            return NextResponse.json({ ok: false, error: `Stripe deposit refund failed: ${e?.message || "processor error"} — deposit left held` }, { status: 502 });
          }
        }
        const updated = await pgExec(
          `UPDATE public.commerce_deposits SET status = 'refunded', updated_at = now()
            WHERE id = $1::uuid AND tenant_id = $2 AND status = 'held'`,
          [dep.id, tenant],
        );
        if (!updated) return NextResponse.json({ ok: false, error: "Deposit refund did not land" }, { status: 500 });
        let journalEntryId: string | null = null;
        try {
          if (amt > 0) {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            journalEntryId = await postBalancedJournalEntry(q, tenant, {
              source: "deposit_refund",
              sourceId: dep.id,
              memo: `Deposit ${dep.id} refunded: $${amt}${processorRefundId ? ` (Stripe ${processorRefundId})` : " (manual — no Stripe payment linked)"}`,
              lines: [
                { accountCode: "2300", debit: amt, credit: 0 },
                { accountCode: "1000", debit: 0, credit: amt },
              ],
            });
          }
        } catch (e) { console.error("[GL] refund_deposit failed:", e); }
        await auditAction({ action, domain: "acct", tableName: "commerce_deposits", recordId: dep.id, afterData: { status: "refunded", processorRefundId, journalEntryId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, depositId: dep.id, updated, status: "refunded", processorRefundId, journalEntryId });
      }

      case "export_deposits": {
        // SA-62: server-built CSV of the deposit registry for a date range
        // (payload.from / payload.to, ISO dates; collected_at range).
        // Mirrors the orders/inventory CSV export pattern: the server reads
        // the real rows and returns the CSV text; the view downloads it.
        const tenant = resolveTenantId(req);
        const from = payload.from ? String(payload.from) : null;
        const to = payload.to ? String(payload.to) : null;
        const statusFilter = payload.status ? String(payload.status) : null;
        const rows = await pgQuery<{ deposit_number: string; customer: string; amount: string; status: string; method: string | null; collected_at: string; deposit_type: string | null }>(
          `SELECT cd.deposit_number,
                  COALESCE(NULLIF(TRIM(cc.first_name || ' ' || cc.last_name), ''), cc.email, '') AS customer,
                  cd.amount::text, cd.status, cd.method, cd.collected_at::text, cd.deposit_type
             FROM public.commerce_deposits cd
             LEFT JOIN public.crm_customers cc ON cc.id = cd.customer_id
            WHERE cd.tenant_id = $1
              AND ($2::timestamptz IS NULL OR cd.collected_at >= $2::timestamptz)
              AND ($3::timestamptz IS NULL OR cd.collected_at < $3::timestamptz)
              AND ($4::text IS NULL OR cd.status = $4)
            ORDER BY cd.collected_at DESC`,
          [tenant, from, to, statusFilter],
        );
        const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const header = ["Deposit Number", "Customer", "Amount", "Status", "Method", "Collected At", "Type"];
        const lines = rows.map((r) => [r.deposit_number, r.customer, Number(r.amount || 0).toFixed(2), r.status, r.method || "", r.collected_at || "", r.deposit_type || ""].map(esc).join(","));
        const csv = [header.join(","), ...lines].join("\n");
        const filename = `deposits-export-${new Date().toISOString().slice(0, 10)}.csv`;
        await auditAction({ action, domain: "acct", tableName: "commerce_deposits", recordId: null, afterData: { count: rows.length, from, to, statusFilter }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, filename, csv, count: rows.length });
      }

      case "run_payroll": {
        // SA-87 — REAL payroll run via the shared engine (@/lib/payroll/
        // runPayroll), the same computation as POST /api/admin/payroll/runs:
        // gross from approved timesheets × the crm_staff pay profile plus
        // accrued commissions (flipped to 'paid'), tax_withheld stays 0
        // (no withholding engine), and a draft run posts NO journal entry —
        // nothing has been disbursed and the chart has no wage-expense /
        // payroll-payable account. The old handler inserted an empty $0
        // shell run and called it payroll; that was fiction.
        const periodStart = payload.period_start ? String(payload.period_start) : "";
        const periodEnd = payload.period_end ? String(payload.period_end) : "";
        const payDate = payload.pay_date ? String(payload.pay_date) : periodEnd;
        if (!periodStart || !periodEnd) {
          return NextResponse.json({ ok: false, error: "period_start and period_end are required (YYYY-MM-DD)" }, { status: 400 });
        }
        const startMs = Date.parse(`${periodStart}T00:00:00Z`);
        const endMs = Date.parse(`${periodEnd}T00:00:00Z`);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
          return NextResponse.json({ ok: false, error: "period_start and period_end must be valid dates (YYYY-MM-DD), end on or after start" }, { status: 400 });
        }
        const client = await getPgWithRetry();
        try {
          const result = await createPayrollRun(client, resolveTenantId(req), { payPeriodStart: periodStart, payPeriodEnd: periodEnd, payDate });
          await auditAction({ action, domain: "acct", tableName: "payroll_runs", recordId: result.runId, afterData: { runNumber: result.runNumber, periodStart, periodEnd, payDate, status: result.status, summary: result.summary }, actorUserId: actorId, ipAddress: ip });
          return NextResponse.json({ ok: true, runId: result.runId, runNumber: result.runNumber, status: result.status, summary: result.summary, missingRates: result.missingRates, lines: result.lines });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return NextResponse.json({ ok: false, error: `Payroll run could not be created — ${msg}` }, { status: 500 });
        } finally {
          client.release();
        }
      }

      case "edit_timesheet": {
        // SA-89 — edit/approve a real payroll_timesheets row, with audit.
        // Approving stamps approved_at/approved_by. A timesheet already
        // consumed by a payroll run ('processed') is locked — editing it
        // would rewrite history the run was computed from.
        const timesheetId = String(payload.timesheet_id || "");
        if (!timesheetId) {
          return NextResponse.json({ ok: false, error: "timesheet_id is required" }, { status: 400 });
        }
        const parseHours = (v: unknown): number | null => {
          if (v === undefined) return null;
          const n = Number(v);
          return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
        };
        const hoursRegular = parseHours(payload.hours_regular);
        const hoursOvertime = parseHours(payload.hours_overtime);
        const hoursPto = parseHours(payload.hours_pto);
        const hoursSick = parseHours(payload.hours_sick);
        if ([hoursRegular, hoursOvertime, hoursPto, hoursSick].some((n) => n !== null && Number.isNaN(n))) {
          return NextResponse.json({ ok: false, error: "Hours must be non-negative numbers" }, { status: 400 });
        }
        const notes = payload.notes !== undefined ? String(payload.notes) : null;
        const status = payload.status ? String(payload.status) : null;
        const ALLOWED_TS_STATUSES = ["draft", "pending", "submitted", "approved"];
        if (status && !ALLOWED_TS_STATUSES.includes(status)) {
          return NextResponse.json({ ok: false, error: `status must be one of: ${ALLOWED_TS_STATUSES.join(", ")} (processed timesheets are locked)` }, { status: 400 });
        }
        const existing = await pgQuery<{ status: string }>(
          `SELECT status FROM public.payroll_timesheets WHERE id = $1::uuid AND tenant_id = $2`,
          [timesheetId, resolveTenantId(req)],
        );
        if (existing.length === 0) {
          return NextResponse.json({ ok: false, error: `Timesheet ${timesheetId} not found` }, { status: 404 });
        }
        if (existing[0].status === "processed") {
          return NextResponse.json({ ok: false, error: "Timesheet has already been processed into a payroll run and can no longer be edited" }, { status: 409 });
        }
        const updated = await pgExec(
          `UPDATE public.payroll_timesheets
              SET hours_regular = COALESCE($1, hours_regular),
                  hours_overtime = COALESCE($2, hours_overtime),
                  hours_pto = COALESCE($3, hours_pto),
                  hours_sick = COALESCE($4, hours_sick),
                  notes = COALESCE($5, notes),
                  status = COALESCE($6, status),
                  approved_at = CASE WHEN $6 = 'approved' THEN now() ELSE approved_at END,
                  approved_by = CASE WHEN $6 = 'approved' THEN COALESCE($9, approved_by) ELSE approved_by END
            WHERE id = $7::uuid AND tenant_id = $8`,
          [hoursRegular, hoursOvertime, hoursPto, hoursSick, notes, status, timesheetId, resolveTenantId(req), actorId],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: `Timesheet ${timesheetId} could not be updated — no matching timesheet was updated` }, { status: 500 });
        }
        await auditAction({ action, domain: "acct", tableName: "payroll_timesheets", recordId: timesheetId, beforeData: { status: existing[0].status }, afterData: payload, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, timesheetId, updated });
      }

      case "reconcile": {
        // SA-85 — record a reconciliation against REAL ledger figures.
        // gl_balance is the sum of the account's bank transactions through
        // as_of_date; outstanding deposits/payments are the still-unmatched
        // amounts; difference = statement − ledger. The row is only marked
        // 'reconciled' when the difference is exactly zero — otherwise it
        // stays 'open' with the difference visible. (The old handler copied
        // the statement balance into gl_balance and declared every reconcile
        // balanced; that was fiction.) Per-transaction matching lives in
        // POST /api/admin/banking/reconcile (BankingView).
        const tenant = resolveTenantId(req);
        const bankAccountId = payload.bank_account_id ? String(payload.bank_account_id) : null;
        const periodId = payload.period_id ? String(payload.period_id) : null;
        const asOfDate = payload.as_of_date ? String(payload.as_of_date) : null;
        if (!bankAccountId) {
          return NextResponse.json({ ok: false, error: "bank_account_id is required" }, { status: 400 });
        }
        if (!asOfDate) {
          return NextResponse.json({ ok: false, error: "as_of_date is required" }, { status: 400 });
        }
        if (payload.statement_balance === undefined || !Number.isFinite(Number(payload.statement_balance))) {
          return NextResponse.json({ ok: false, error: "statement_balance must be a number" }, { status: 400 });
        }
        const statementBalance = Number(payload.statement_balance);
        const acctRows = await pgQuery<{ id: string }>(
          `SELECT id FROM public.acct_bank_accounts WHERE id = $1::uuid AND tenant_id = $2`,
          [bankAccountId, tenant],
        );
        if (acctRows.length === 0) {
          return NextResponse.json({ ok: false, error: `Bank account ${bankAccountId} not found` }, { status: 404 });
        }
        const sums = await pgQuery<{ ledger: string; out_dep: string; out_pay: string }>(
          `SELECT COALESCE(SUM(amount), 0)::text AS ledger,
                  COALESCE(SUM(amount) FILTER (WHERE COALESCE(match_status, 'unmatched') <> 'reconciled' AND amount > 0), 0)::text AS out_dep,
                  COALESCE(-SUM(amount) FILTER (WHERE COALESCE(match_status, 'unmatched') <> 'reconciled' AND amount < 0), 0)::text AS out_pay
             FROM public.acct_bank_transactions
            WHERE tenant_id = $1 AND bank_account_id = $2::uuid AND transaction_date <= $3::date`,
          [tenant, bankAccountId, asOfDate],
        );
        const glBalance = Math.round(Number(sums[0]?.ledger || 0) * 100) / 100;
        const outstandingDeposits = Math.round(Number(sums[0]?.out_dep || 0) * 100) / 100;
        const outstandingPayments = Math.round(Number(sums[0]?.out_pay || 0) * 100) / 100;
        // acct_reconciliations.difference is a GENERATED column:
        //   (statement_balance − gl_balance) + outstanding_deposits
        //     − outstanding_payments + adjustments
        // It must NOT be inserted (the original handler's INSERT named it
        // and could only ever fail), and the status decision must use the
        // same formula the database will generate.
        const difference = Math.round(((statementBalance - glBalance) + outstandingDeposits - outstandingPayments) * 100) / 100;
        const status = difference === 0 ? "reconciled" : "open";
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.acct_reconciliations
             (id, tenant_id, bank_account_id, period_id, as_of_date, statement_balance, gl_balance,
              outstanding_deposits, outstanding_payments, adjustments, status, completed_at)
           VALUES (gen_random_uuid(), $1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, 0, $9::acct_reconciliation_status, CASE WHEN $9 = 'reconciled' THEN now() ELSE NULL END)
           RETURNING id`,
          [tenant, bankAccountId, periodId, asOfDate, statementBalance, glBalance, outstandingDeposits, outstandingPayments, status],
        );
        const recId = rows[0]?.id ?? null;
        if (!recId) {
          return NextResponse.json({ ok: false, error: "Reconciliation could not be recorded — the reconciliation was not saved" }, { status: 500 });
        }
        await auditAction({ action, domain: "acct", tableName: "acct_reconciliations", recordId: recId, afterData: { bankAccountId, asOfDate, statementBalance, glBalance, outstandingDeposits, outstandingPayments, difference, status }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, reconciliationId: recId, status, glBalance, outstandingDeposits, outstandingPayments, difference });
      }

      case "remind": {
        // fin_remind — REAL delivery, same engine as send_reminder:
        // invoice_id → that invoice; customer_id → that customer's overdue
        // invoices; neither → the full overdue batch.
        const tenant = resolveTenantId(req);
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        const invoiceId = payload.invoice_id ? String(payload.invoice_id) : null;
        const dryRun = payload.dry_run === true;
        const provider = await getEmailProviderSettings(tenant);
        if (!provider.hasSendingKey) {
          return NextResponse.json({ ok: false, error: "Email not configured", detail: "Set an email provider key at Admin → Connections & Keys (Resend or Brevo)" }, { status: 503 });
        }
        const tally = emptyTally();
        if (invoiceId) {
          const inv = await loadInvoice(tenant, invoiceId);
          if (!inv) return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
          if (inv.status === "PAID" || inv.status === "VOID" || Number(inv.balanceDue || 0) <= 0) {
            return NextResponse.json({ ok: true, ...tally, invoiceId, message: `Invoice ${inv.number} has no outstanding balance — no reminder sent` });
          }
          const outcome = await deliverInvoiceReminder(tenant, inv, tally, { skipDedupe: true, dryRun });
          if (outcome === "sent" && !dryRun && inv.customerId) {
            await logCustomerNote({ customerId: inv.customerId, body: `Payment reminder emailed for invoice ${inv.number} (balance $${Number(inv.balanceDue || 0).toFixed(2)}).`, noteType: "payment_reminder" });
          }
          await auditAction({ action, domain: "acct", tableName: "invoices", recordId: invoiceId, afterData: { customerId, invoiceId, dryRun, ...tally }, actorUserId: actorId, ipAddress: ip });
          if (outcome === "failed") {
            return NextResponse.json({ ok: false, ...tally, invoiceId, message: `Reminder failed: ${tally.failures[0] || "send failed"}` }, { status: 502 });
          }
          if (outcome === "skipped_no_email") {
            return NextResponse.json({ ok: false, ...tally, invoiceId, message: "Customer has no email address on file — reminder not sent" }, { status: 422 });
          }
          return NextResponse.json({ ok: true, ...tally, invoiceId, message: dryRun ? `Dry run — would email a payment reminder for invoice ${inv.number}` : `Payment reminder emailed for invoice ${inv.number}` });
        }
        const invs = await selectOverdueInvoices(tenant, customerId);
        for (const inv of invs) {
          const outcome = await deliverInvoiceReminder(tenant, inv, tally, { dryRun });
          if (outcome === "sent" && !dryRun && inv.customerId) {
            await logCustomerNote({ customerId: inv.customerId, body: `Payment reminder emailed for invoice ${inv.number} (balance $${Number(inv.balanceDue || 0).toFixed(2)}).`, noteType: "payment_reminder" });
          }
        }
        await auditAction({ action, domain: "acct", tableName: "invoices", recordId: customerId, afterData: { customerId, candidates: invs.length, dryRun, ...tally }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({
          ok: true, ...tally, count: tally.sent, customerId, dryRun,
          message: invs.length === 0
            ? "No overdue invoices found — nothing sent"
            : dryRun
              ? `Dry run — no emails sent. Would email ${tally.sent} payment reminder(s); ${tally.skipped_no_email} skipped (no email on file); ${tally.skipped_recent} skipped (already reminded this week)`
              : tallyMessage(tally, tally.sent === 1 ? "payment reminder" : "payment reminders"),
        });
      }

      // ───────────────────────────────────────────────────────────────────
      // NEW REAL HANDLERS — replacing the 18 broken stubs with the
      // CORRECT prefix-stripped short names. The old stubs used the last
      // underscore-segment as the case key, which never matched because
      // the prefix-stripping regex only strips the FIRST [a-z]+_ occurrence.
      // ───────────────────────────────────────────────────────────────────

      case "add_value": {
        // accts_add_value → add_value — add value to a gift card OR store-credit value to a customer account.
        // If card_id is present, top up the gift card's balance. Otherwise, issue store credit as before.
        const topUpCardId = payload.card_id ? String(payload.card_id) : null;
        const topUpCents = Number(payload.amount_cents || 0);
        const topUpDollars = Number(payload.amount || 0);
        const topUpAmount = topUpCents > 0 ? topUpCents / 100 : topUpDollars;
        if (topUpCardId && topUpAmount > 0) {
          const topped = await pgExec(
            `UPDATE public.commerce_gift_cards
                SET balance = balance + $1, last_used_at = now()
              WHERE id = $2::uuid AND tenant_id = $3 AND status IN ('active','partially_redeemed')`,
            [topUpAmount, topUpCardId, resolveTenantId(req)],
          );
          if (!topped) {
            return NextResponse.json({ ok: false, error: "Card not found or not active — no value was added" }, { status: 422 });
          }
          // GL posting (SA-73 ledger entry): debit cash, credit gift card liability (best-effort)
          try {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            await postBalancedJournalEntry(q, resolveTenantId(req), {
              source: "giftcard_add_value",
              sourceId: topUpCardId,
              memo: `Gift card ${topUpCardId} topped up: $${topUpAmount}`,
              lines: [
                { accountCode: "1000", debit: topUpAmount, credit: 0 },
                { accountCode: "2310", debit: 0, credit: topUpAmount },
              ],
            });
          } catch (e) { console.error("[GL] add_value failed:", e); }
          await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: topUpCardId, afterData: { amountAdded: topUpAmount, updated: topped }, actorUserId: actorId, ipAddress: ip });
          return NextResponse.json({ ok: true, cardId: topUpCardId, amountAdded: topUpAmount, updated: topped, message: `Added $${topUpAmount.toFixed(2)} to gift card` });
        }
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        const amount = Number(payload.amount || 0);
        const reason = payload.reason ? String(payload.reason) : "manual_adjustment";
        const creditNumber = await issueStoreCredit({ customerId, amount });
        if (!creditNumber) {
          return NextResponse.json({ ok: false, error: "Store credit could not be issued — the credit was not saved" }, { status: 500 });
        }
        // GL posting — this fallback leg skipped the entry that
        // issue_store_credit posts (Dr 1000 cash / Cr 2310 liability),
        // leaving the credit off the books. Mirror it (best-effort).
        try {
          if (amount > 0) {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            await postBalancedJournalEntry(q, resolveTenantId(req), {
              source: "store_credit_issued",
              sourceId: creditNumber,
              memo: `Store credit ${creditNumber} issued via add_value: $${amount}`,
              lines: [
                { accountCode: "1000", debit: amount, credit: 0 },
                { accountCode: "2310", debit: 0, credit: amount },
              ],
            });
          }
        } catch (e) { console.error("[GL] add_value store credit failed:", e); }
        await auditAction({ action, domain: "acct", tableName: "commerce_store_credits", recordId: creditNumber, afterData: { amount, customerId, reason }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, creditNumber, amount, reason, message: `Added $${amount} value to customer account` });
      }

      case "apply_to_invoice": {
        // accts_apply_to_invoice → apply_to_invoice — apply a deposit, store
        // credit, or gift card to an invoice
        const invoiceId = String(payload.invoice_id || "");
        if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(invoiceId)) {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} not found` }, { status: 404 });
        }
        const depositId = payload.deposit_id ? String(payload.deposit_id) : null;
        const creditId = payload.credit_id ? String(payload.credit_id) : null;
        const giftCardId = payload.gift_card_id ? String(payload.gift_card_id) : null;
        const amount = Number(payload.amount || 0);
        // Pre-validate the deposit / store-credit legs BEFORE any money
        // moves, so a failed leg can't leave the gift card decremented
        // with nothing applied to the invoice.
        if (depositId) {
          const depCheck = await pgQuery<{ status: string }>(
            `SELECT status FROM public.commerce_deposits WHERE id = $1::uuid AND tenant_id = $2`,
            [depositId, resolveTenantId(req)],
          );
          if (!depCheck[0] || depCheck[0].status !== "held") {
            return NextResponse.json({ ok: false, error: "Deposit not found or not held — nothing was applied" }, { status: 422 });
          }
        }
        if (creditId) {
          const creditCheck = await pgQuery<{ balance: string }>(
            `SELECT balance::text FROM public.commerce_store_credits WHERE id = $1::uuid AND tenant_id = $2`,
            [creditId, resolveTenantId(req)],
          );
          if (!creditCheck[0] || Number(creditCheck[0].balance || 0) < amount) {
            return NextResponse.json({ ok: false, error: "Store credit not found or balance insufficient — nothing was applied" }, { status: 422 });
          }
        }
        if (giftCardId) {
          // Gift-card leg (SA-74 at the invoice): decrement the card first —
          // if the card can't cover it, nothing else moves.
          const gcUpdated = await pgExec(
            `UPDATE public.commerce_gift_cards
                SET balance = balance - $1, last_used_at = now(),
                    status = CASE WHEN balance - $1 = 0 THEN 'redeemed' ELSE 'partially_redeemed' END
              WHERE id = $2::uuid AND tenant_id = $3 AND status IN ('active','partially_redeemed') AND balance >= $1`,
            [amount, giftCardId, resolveTenantId(req)],
          );
          if (!gcUpdated) {
            return NextResponse.json({ ok: false, error: "Gift card not found, not active, or balance insufficient — nothing was applied" }, { status: 422 });
          }
        }
        if (depositId) {
          // Only a held deposit can be applied — and if the deposit leg
          // cannot land, the invoice must NOT be credited for money that
          // never moved (previously the result was ignored).
          const depApplied = await pgExec(
            `UPDATE public.commerce_deposits SET status = 'applied', applied_invoice_id = $1::uuid, updated_at = now()
              WHERE id = $2::uuid AND tenant_id = $3 AND status = 'held'`,
            [invoiceId, depositId, resolveTenantId(req)],
          );
          if (!depApplied) {
            return NextResponse.json({ ok: false, error: "Deposit not found or not held — nothing was applied" }, { status: 422 });
          }
        }
        if (creditId) {
          const creditApplied = await pgExec(
            `UPDATE public.commerce_store_credits SET balance = balance - $1
              WHERE id = $2::uuid AND tenant_id = $3 AND balance >= $1`,
            [amount, creditId, resolveTenantId(req)],
          );
          if (!creditApplied) {
            return NextResponse.json({ ok: false, error: "Store credit not found or balance insufficient — nothing was applied" }, { status: 422 });
          }
        }
        // Credit the invoice (single record: acct_ar_invoices). The
        // applied value lands in deposit_paid — the applied-value counter
        // in the disjoint balance rule (total − paid − credited −
        // deposit) — and the status re-derives from the settled sum.
        const invoiceUpdated = await pgExec(
          `UPDATE public.acct_ar_invoices
              SET deposit_paid = deposit_paid + $1,
                  status = CASE
                    WHEN amount_paid + amount_credited + deposit_paid + $1 >= total THEN 'paid'::public.acct_document_status
                    WHEN amount_paid + amount_credited + deposit_paid + $1 > 0 THEN 'partially_paid'::public.acct_document_status
                    ELSE status END,
                  paid_at = CASE
                    WHEN amount_paid + amount_credited + deposit_paid + $1 >= total THEN COALESCE(paid_at, now())
                    ELSE paid_at END,
                  updated_at = now()
            WHERE id = $2::uuid AND tenant_id = $3`,
          [amount, invoiceId, resolveTenantId(req)],
        );
        if (!invoiceUpdated) {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} could not be updated — the application did not land on the invoice` }, { status: 500 });
        }
        if (giftCardId && amount > 0) {
          // GL posting: debit gift card liability, credit AR (best-effort)
          try {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            await postBalancedJournalEntry(q, resolveTenantId(req), {
              source: "giftcard_redeem",
              sourceId: giftCardId,
              memo: `Gift card ${giftCardId} applied to invoice ${invoiceId}: $${amount}`,
              lines: [
                { accountCode: "2310", debit: amount, credit: 0 },
                { accountCode: "1200", debit: 0, credit: amount },
              ],
            });
          } catch (e) { console.error("[GL] apply_to_invoice gift card failed:", e); }
        }
        await auditAction({ action, domain: "acct", tableName: "invoices", recordId: invoiceId, afterData: { depositId, creditId, giftCardId, amount }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, invoiceId, depositId, creditId, giftCardId, amountApplied: amount });
      }

      case "convert_gc": {
        // accts_convert_gc → convert_gc — convert a gift card's remaining balance to store credit
        const giftCardId = String(payload.gift_card_id || "");
        const rows = await pgQuery<{ balance: number; customer_id: string | null }>(
          `SELECT balance, customer_id FROM public.commerce_gift_cards WHERE id = $1::uuid AND tenant_id = $2`,
          [giftCardId, resolveTenantId(req)],
        );
        if (rows.length === 0) {
          return NextResponse.json({ ok: false, error: "Gift card not found" }, { status: 404 });
        }
        const balance = Number(rows[0].balance || 0);
        const customerId = rows[0].customer_id ?? null;
        if (balance <= 0) {
          return NextResponse.json({ ok: false, error: "Gift card has no balance to convert" }, { status: 400 });
        }
        const creditNumber = await issueStoreCredit({ customerId, amount: balance });
        if (!creditNumber) {
          return NextResponse.json({ ok: false, error: "Conversion failed — the store credit could not be issued, so the gift card was left unchanged" }, { status: 500 });
        }
        // GL: no journal entry by design — gift cards and store credits are
        // both carried in 2310 Gift Card Liability (see issue_store_credit),
        // so a conversion is a within-2310 reclass with zero net GL effect.
        // The ledger evidence is the converted_store_credit_id link + audit.
        if (creditNumber) {
          await pgExec(
            `UPDATE public.commerce_gift_cards
                SET status = 'converted', balance = 0, converted_store_credit_id = (
                    SELECT id FROM public.commerce_store_credits WHERE credit_number = $1
                )
              WHERE id = $2::uuid AND tenant_id = $3`,
            [creditNumber, giftCardId, resolveTenantId(req)],
          );
        }
        await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: giftCardId, afterData: { creditNumber, balance, customerId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, giftCardId, creditNumber, convertedAmount: balance });
      }

      case "issue_store_credit": {
        // accts_issue_store_credit → issue_store_credit — issue a fresh store credit memo
        const customerId = payload.customer_id ? String(payload.customer_id) : null;
        const amount = Number(payload.amount || 0);
        const expiresAt = payload.expires_at ? String(payload.expires_at) : null;
        const creditNumber = await issueStoreCredit({ customerId, amount, expiresAt });
        if (!creditNumber) {
          return NextResponse.json({ ok: false, error: "Store credit could not be issued — the credit was not saved" }, { status: 500 });
        }
        // GL posting: debit cash, credit gift card liability (2310 carries
        // store credits too) — mirrors the accounting route's
        // giftcard_issue_store_credit so both surfaces book it the same way.
        try {
          if (amount > 0) {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            await postBalancedJournalEntry(q, resolveTenantId(req), {
              source: "store_credit_issued",
              sourceId: creditNumber,
              memo: `Store credit ${creditNumber} issued: $${amount}`,
              lines: [
                { accountCode: "1000", debit: amount, credit: 0 },
                { accountCode: "2310", debit: 0, credit: amount },
              ],
            });
          }
        } catch (e) { console.error("[GL] issue_store_credit failed:", e); }
        await auditAction({ action, domain: "acct", tableName: "commerce_store_credits", recordId: creditNumber, afterData: { amount, customerId, expiresAt }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, creditNumber, amount });
      }

      case "redeem": {
        // accts_redeem → redeem — generic redemption for either a gift card or store credit
        const cardNumber = payload.card_number ? String(payload.card_number) : null;
        const creditNumber = payload.credit_number ? String(payload.credit_number) : null;
        const amount = Number(payload.amount || 0);
        let updated = 0;
        let type = "unknown";
        if (cardNumber) {
          updated = await pgExec(
            `UPDATE public.commerce_gift_cards
                SET balance = balance - $1, last_used_at = now(),
                    status = CASE WHEN balance - $1 = 0 THEN 'redeemed' ELSE 'partially_redeemed' END
              WHERE card_number = $2 AND tenant_id = $3 AND status IN ('active','partially_redeemed') AND balance >= $1`,
            [amount, cardNumber, resolveTenantId(req)],
          );
          type = "gift_card";
        } else if (creditNumber) {
          updated = await pgExec(
            `UPDATE public.commerce_store_credits
                SET balance = balance - $1,
                    status = CASE WHEN balance - $1 = 0 THEN 'used' ELSE 'partially_used' END
              WHERE credit_number = $2 AND tenant_id = $3 AND status IN ('active','partially_used') AND balance >= $1`,
            [amount, creditNumber, resolveTenantId(req)],
          );
          type = "store_credit";
        } else {
          return NextResponse.json({ ok: false, error: "Either card_number or credit_number is required" }, { status: 400 });
        }
        if (!updated) {
          return NextResponse.json({ ok: false, error: "Insufficient balance or no matching active account — nothing was redeemed" }, { status: 422 });
        }
        // GL posting: debit 2310 liability, credit revenue (best-effort)
        try {
          if (amount > 0) {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            await postBalancedJournalEntry(q, resolveTenantId(req), {
              source: type === "gift_card" ? "giftcard_redeem" : "store_credit_redeemed",
              sourceId: cardNumber || creditNumber,
              memo: `${type === "gift_card" ? "Gift card" : "Store credit"} ${cardNumber || creditNumber} redeemed: $${amount}`,
              lines: [
                { accountCode: "2310", debit: amount, credit: 0 },
                { accountCode: "4000", debit: 0, credit: amount },
              ],
            });
          }
        } catch (e) { console.error("[GL] redeem failed:", e); }
        await auditAction({ action, domain: "acct", tableName: type === "gift_card" ? "commerce_gift_cards" : "commerce_store_credits", recordId: cardNumber || creditNumber, afterData: { amount, type, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, type, amount, updated, message: "Redeemed" });
      }

      case "register_credits": {
        // accts_register_credits → register_credits — batch register multiple credit memos
        const credits = (payload.credits as Array<{ customer_id?: string; amount: number; reason?: string }>) || [];
        const results: Array<{ creditNumber: string | null; amount: number; customerId: string | null }> = [];
        for (const c of credits) {
          const creditNumber = await issueStoreCredit({
            customerId: c.customer_id ? String(c.customer_id) : null,
            amount: Number(c.amount || 0),
          });
          results.push({ creditNumber, amount: Number(c.amount || 0), customerId: c.customer_id ? String(c.customer_id) : null });
        }
        const issued = results.filter(r => r.creditNumber).length;
        if (results.length > 0 && issued === 0) {
          return NextResponse.json({ ok: false, error: "None of the credit memos could be issued — nothing was saved" }, { status: 500 });
        }
        // GL posting: one aggregate entry for the batch — debit cash, credit
        // 2310 (best-effort), mirroring issue_store_credit per-credit booking.
        try {
          const totalIssued = results.filter(r => r.creditNumber).reduce((s, r) => s + r.amount, 0);
          if (totalIssued > 0) {
            const q = async (text: string, params?: unknown[]) => {
              const r = await pgQuery(text, params);
              return { rows: r as Record<string, unknown>[] };
            };
            await postBalancedJournalEntry(q, resolveTenantId(req), {
              source: "store_credit_issued",
              sourceId: null,
              memo: `Register credits batch: ${issued} store credit(s), $${totalIssued}`,
              lines: [
                { accountCode: "1000", debit: totalIssued, credit: 0 },
                { accountCode: "2310", debit: 0, credit: totalIssued },
              ],
            });
          }
        } catch (e) { console.error("[GL] register_credits failed:", e); }
        await auditAction({ action, domain: "acct", tableName: "commerce_store_credits", recordId: null, afterData: { count: issued, results }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, count: issued, credits: results });
      }

      case "register_refunds": {
        // accts_register_refunds → register_refunds — batch register refund ledger entries
        const refunds = (payload.refunds as Array<{ payment_id?: string; order_id?: string; amount: number; reason?: string }>) || [];
        const results: Array<{ paymentId: string | null; orderId: string | null; amount: number; updated: number }> = [];
        for (const r of refunds) {
          const paymentId = r.payment_id ? String(r.payment_id) : null;
          const orderId = r.order_id ? String(r.order_id) : null;
          const amount = Number(r.amount || 0);
          let updated = 0;
          if (paymentId) {
            updated = await pgExec(
              `UPDATE public.commerce_payments SET status = 'refunded' WHERE id = $1::uuid AND tenant_id = $2`,
              [paymentId, resolveTenantId(req)],
            );
          }
          if (orderId) {
            updated = await pgExec(
              `UPDATE public.commerce_orders SET status = 'refunded', payment_status = 'refunded', updated_at = now()
                WHERE id = $1 AND tenant_id = $2`,
              [orderId, resolveTenantId(req)],
            );
          }
          results.push({ paymentId, orderId, amount, updated });
          // The refunds list (GET /api/admin/refunds) reads commerce_refunds —
          // a batch-registered refund that only flips payment/order status
          // never appears there. Create the refunds-ledger row too.
          if (updated > 0 && amount > 0) {
            await pgExec(
              `INSERT INTO public.commerce_refunds
                 (id, tenant_id, refund_number, payment_id, amount, reason, status, refund_method, created_at, processed_at)
               VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4, $5, 'completed', 'original_payment', now(), now())`,
              [resolveTenantId(req), `RFN-${Date.now().toString(36).toUpperCase()}`, paymentId, amount, r.reason ? String(r.reason) : "register_refund"],
            );
          }
          // GL per landed refund: Dr 4000 revenue reversal / Cr 1000 cash.
          if (updated > 0 && amount > 0) {
            try {
              const q = async (text: string, params?: unknown[]) => {
                const r = await pgQuery(text, params);
                return { rows: r as Record<string, unknown>[] };
              };
              await postBalancedJournalEntry(q, resolveTenantId(req), {
                source: "refund",
                sourceId: paymentId || orderId,
                memo: `Register refund ${paymentId || orderId}: $${amount}`,
                lines: [
                  { accountCode: "4000", debit: amount, credit: 0 },
                  { accountCode: "1000", debit: 0, credit: amount },
                ],
              });
            } catch (e) { console.error("[GL] register_refunds failed:", e); }
          }
        }
        await auditAction({ action, domain: "commerce", tableName: "commerce_payments", recordId: null, afterData: { count: results.length, refunds: results }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, count: results.length, refunds: results });
      }

      case "send_reminder_gc": {
        // accts_send_reminder_gc — REAL delivery via Resend (gift_card_reminder
        // template, same as POST /api/admin/gift-cards/remind). Recipient per
        // card: recipient_email → holder customer's email → card customer's
        // email → purchaser_email. reminder_sent_at advances ONLY on a real
        // send, so unsent cards stay eligible. (Previously: note-only.)
        const tenant = resolveTenantId(req);
        const since = payload.older_than_days ? Number(payload.older_than_days) : 30;
        const onlyCardId = payload.card_id ? String(payload.card_id) : null;
        const dryRun = payload.dry_run === true;
        const provider = await getEmailProviderSettings(tenant);
        if (!provider.hasSendingKey) {
          return NextResponse.json({ ok: false, error: "Email not configured", detail: "Set an email provider key at Admin → Connections & Keys (Resend or Brevo)" }, { status: 503 });
        }
        const tally = emptyTally();
        // Cards with a balance that were reminded inside the window are
        // reported honestly as skipped_recent rather than silently excluded.
        const throttled = await pgQuery<{ n: string }>(
          `SELECT count(*)::text AS n FROM public.commerce_gift_cards
            WHERE tenant_id = $1 AND status = 'active' AND balance > 0
              AND ($2::uuid IS NULL OR id = $2::uuid)
              AND reminder_sent_at IS NOT NULL
              AND reminder_sent_at >= now() - ($3 || ' days')::interval`,
          [tenant, onlyCardId, since],
        );
        tally.skipped_recent = Number(throttled[0]?.n || 0);
        const cards = await pgQuery<{
          id: string; card_number: string; customer_id: string | null; holder_customer_id: string | null;
          balance: string; expires_at: string | null;
          recipient_email: string | null; recipient_name: string | null; purchaser_email: string | null;
        }>(
          `SELECT id, card_number, customer_id::text, holder_customer_id::text, balance::text, expires_at::text,
                  recipient_email, recipient_name, purchaser_email
             FROM public.commerce_gift_cards
            WHERE tenant_id = $1
              AND status = 'active'
              AND balance > 0
              AND ($2::uuid IS NULL OR id = $2::uuid)
              AND (reminder_sent_at IS NULL OR reminder_sent_at < now() - ($3 || ' days')::interval)
            LIMIT 100`,
          [tenant, onlyCardId, since],
        );
        for (const c of cards) {
          // Resolve the cardholder's email from real fields, in order.
          let toEmail: string | null = c.recipient_email;
          let toName: string | undefined = c.recipient_name || undefined;
          let customerIdForNotif: string | undefined;
          const crmEmailFor = async (cid: string | null) => {
            if (!cid) return null;
            const rows = await pgQuery<{ email: string | null; first_name: string | null }>(
              `SELECT email, first_name FROM public.crm_customers WHERE id = $1::uuid`,
              [cid],
            );
            return rows[0] ?? null;
          };
          if (!toEmail) {
            const holder = await crmEmailFor(c.holder_customer_id);
            if (holder?.email) {
              toEmail = holder.email;
              if (!toName && holder.first_name) toName = holder.first_name;
              customerIdForNotif = c.holder_customer_id || undefined;
            }
          }
          if (!toEmail) {
            const cust = await crmEmailFor(c.customer_id);
            if (cust?.email) {
              toEmail = cust.email;
              if (!toName && cust.first_name) toName = cust.first_name;
              customerIdForNotif = c.customer_id || undefined;
            }
          }
          if (!toEmail && c.purchaser_email) toEmail = c.purchaser_email;
          if (!toEmail) {
            tally.skipped_no_email++;
            continue;
          }
          const balance = `$${Number(c.balance || 0).toFixed(2)}`;
          if (dryRun) {
            tally.sent++;
            continue;
          }
          const result = await sendEmail({
            to: toEmail,
            template: "gift_card_reminder",
            subject: `Don't forget your ${balance} UnSaid Memories gift card`,
            html: giftCardReminderHtml({ recipientName: toName, cardNumber: c.card_number, balance, expiresAt: c.expires_at }),
            customerId: customerIdForNotif,
            tenantId: tenant,
            variables: toResendVariables({ recipientName: toName, cardNumber: c.card_number, balance, expiresAt: c.expires_at || "" }),
          });
          if (!result.ok) {
            tally.failed++;
            if (result.error) tally.failures.push(result.error);
            continue;
          }
          tally.sent++;
          await pgExec(
            `UPDATE public.commerce_gift_cards SET reminder_sent_at = now() WHERE id = $1::uuid`,
            [c.id],
          );
          const noteCustomer = c.customer_id || c.holder_customer_id;
          if (noteCustomer) {
            await logCustomerNote({
              customerId: noteCustomer,
              body: `Gift card reminder emailed for card ${c.card_number} (balance ${balance}).`,
              noteType: "gift_card_reminder",
            });
          }
        }
        await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: null, afterData: { candidates: cards.length, olderThanDays: since, dryRun, ...tally }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({
          ok: true, ...tally, count: tally.sent, dryRun,
          message: dryRun
            ? `Dry run — no emails sent. Would email ${tally.sent} gift card reminder(s); ${tally.skipped_no_email} skipped (no email on file); ${tally.skipped_recent} skipped (reminded within ${since} days)`
            : tallyMessage(tally, tally.sent === 1 ? "gift card reminder" : "gift card reminders"),
        });
      }

      case "send_reminders": {
        // accts_send_reminders — batch REAL delivery: one invoice_reminder
        // email per overdue invoice (unpaid, balance owed, due date passed),
        // deduped against the email outbox for 7 days. Honest tallies —
        // `count` is the number actually emailed, nothing else.
        const tenant = resolveTenantId(req);
        const dryRun = payload.dry_run === true;
        const provider = await getEmailProviderSettings(tenant);
        if (!provider.hasSendingKey) {
          return NextResponse.json({ ok: false, error: "Email not configured", detail: "Set an email provider key at Admin → Connections & Keys (Resend or Brevo)" }, { status: 503 });
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
        await auditAction({ action, domain: "acct", tableName: "invoices", recordId: null, afterData: { candidates: invoices.length, dryRun, ...tally }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({
          ok: true, ...tally, count: tally.sent, dryRun,
          message: invoices.length === 0
            ? "No overdue invoices — nothing sent"
            : dryRun
              ? `Dry run — no emails sent. Would email ${tally.sent} payment reminder(s); ${tally.skipped_no_email} skipped (no email on file); ${tally.skipped_recent} skipped (already reminded this week)`
              : tallyMessage(tally, tally.sent === 1 ? "payment reminder" : "payment reminders"),
        });
      }

      case "void_cancel": {
        // accts_void_cancel → void_cancel — void an invoice or cancel a payment.
        // Invoice ids are acct_ar_invoices uuids (a non-uuid id is not found).
        // SA-53: voiding a PAID invoice posts a REVERSAL journal entry
        // (debit AR / credit cash) undoing the mark_paid receipt entry;
        // voiding an unpaid invoice posts nothing (creation posted no JE).
        const invoiceId = payload.invoice_id ? String(payload.invoice_id) : null;
        const paymentId = payload.payment_id ? String(payload.payment_id) : null;
        const reason = payload.reason ? String(payload.reason) : null;
        let updated = 0;
        let entity = "none";
        let reversalEntryId: string | null = null;
        if (invoiceId) {
          if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(invoiceId)) {
            return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} not found` }, { status: 404 });
          }
          const prior = await pgQuery<{ status: string; total: string; amount_paid: string; amount_credited: string; deposit_paid: string }>(
            `SELECT status::text AS status, total::text, amount_paid::text, amount_credited::text, deposit_paid::text FROM public.acct_ar_invoices WHERE id = $1::uuid AND tenant_id = $2`,
            [invoiceId, resolveTenantId(req)],
          );
          if (prior.length === 0) {
            return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} not found` }, { status: 404 });
          }
          if (String(prior[0].status).toLowerCase() === "void") {
            return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} is already void` }, { status: 409 });
          }
          const wasPaid = String(prior[0].status).toLowerCase() === "paid";
          const paidAmt = Number(prior[0].amount_paid || 0) + Number(prior[0].amount_credited || 0) + Number(prior[0].deposit_paid || 0) || Number(prior[0].total || 0);
          updated = await pgExec(
            `UPDATE public.acct_ar_invoices SET status = 'void', voided_at = now(), updated_at = now() WHERE id = $1::uuid AND tenant_id = $2`,
            [invoiceId, resolveTenantId(req)],
          );
          if (!updated) {
            return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} could not be voided — the update did not land` }, { status: 500 });
          }
          if (wasPaid && paidAmt > 0) {
            try {
              const q = async (text: string, params?: unknown[]) => {
                const r = await pgQuery(text, params);
                return { rows: r as Record<string, unknown>[] };
              };
              reversalEntryId = await postBalancedJournalEntry(q, resolveTenantId(req), {
                source: "invoice_paid",
                sourceId: invoiceId,
                reference: "invoice_void_reversal",
                memo: `Reversal — invoice ${invoiceId} voided after payment of $${paidAmt.toFixed(2)}${reason ? ` (${reason})` : ""}`,
                lines: [
                  { accountCode: "1200", debit: paidAmt, credit: 0 },
                  { accountCode: "1000", debit: 0, credit: paidAmt },
                ],
              });
            } catch (e) { console.error("[GL] void_cancel reversal failed:", e); }
          }
          entity = "invoice";
        } else if (paymentId) {
          updated = await pgExec(
            `UPDATE public.commerce_payments SET status = 'cancelled' WHERE id = $1::uuid AND tenant_id = $2`,
            [paymentId, resolveTenantId(req)],
          );
          if (!updated) {
            return NextResponse.json({ ok: false, error: `Payment ${paymentId} not found — nothing was cancelled` }, { status: 404 });
          }
          entity = "payment";
        } else {
          return NextResponse.json({ ok: false, error: "Either invoice_id or payment_id is required" }, { status: 400 });
        }
        await auditAction({ action, domain: entity === "invoice" ? "acct" : "commerce", tableName: entity === "invoice" ? "invoices" : "commerce_payments", recordId: invoiceId || paymentId, afterData: { entity, updated, reason, reversalEntryId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, entity, id: invoiceId || paymentId, updated, reversalEntryId, status: entity === "invoice" ? "void" : "cancelled" });
      }

      case "export_ledger": {
        // order_export_ledger → export_ledger (SA-38) — EXPORT THE
        // GENERAL LEDGER: every journal line in the range, optionally
        // filtered to one account, with debit/credit totals. (The
        // previous version returned an operational summary of invoice /
        // payment / deposit counts — real numbers, but it was not a
        // ledger and could not be reconciled against the books.)
        // Lines come from rpc_get_general_ledger, the same source as
        // run_general_ledger. Defaults to year-to-date when no range is
        // supplied so the palette action works without a payload form.
        const today = new Date();
        const defaultFrom = `${today.getFullYear()}-01-01`;
        const defaultTo = today.toISOString().slice(0, 10);
        const fromDate = (payload.from_date || payload.start_date) ? String(payload.from_date || payload.start_date) : defaultFrom;
        const toDate = (payload.to_date || payload.end_date) ? String(payload.to_date || payload.end_date) : defaultTo;
        const accountCode = payload.account_code ? String(payload.account_code) : null;
        const rows = await pgQuery<{
          entry_no: string; entry_date: string; posting_date: string; source: string;
          memo: string | null; reference: string | null; line_no: string;
          account_code: string; account_name: string; account_type: string;
          line_description: string | null; debit: string; credit: string; running_balance: string;
        }>(
          `SELECT * FROM public.rpc_get_general_ledger($1, $2::date, $3::date)`,
          [resolveTenantId(req), fromDate, toDate],
        );
        const allLines = rows.map(r => ({
          entryNo: Number(r.entry_no), entryDate: r.entry_date, postingDate: r.posting_date,
          source: r.source, memo: r.memo, reference: r.reference, lineNo: Number(r.line_no),
          accountCode: r.account_code, accountName: r.account_name, accountType: r.account_type,
          description: r.line_description, debit: Number(r.debit), credit: Number(r.credit),
          runningBalance: Number(r.running_balance),
        }));
        const lines = accountCode ? allLines.filter(l => l.accountCode === accountCode) : allLines;
        const ledger = {
          dateRange: { from: fromDate, to: toDate },
          accountCode,
          lineCount: lines.length,
          totalDebit: lines.reduce((s, l) => s + l.debit, 0),
          totalCredit: lines.reduce((s, l) => s + l.credit, 0),
          lines,
        };
        await auditAction({ action, domain: "acct", tableName: null, recordId: null, afterData: { lineCount: ledger.lineCount, dateRange: ledger.dateRange, accountCode }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, ledger });
      }

      // ───────────────────────────────────────────────────────────────────
      // FINANCIAL REPORT RPCs — call into the 4 PostgreSQL functions
      // created in /supabase/rpcs/. Each returns real aggregated data from
      // acct_journal_entries + acct_journal_lines + acct_chart_of_accounts.
      // ───────────────────────────────────────────────────────────────────

      case "run_profit_loss":
      case "run_pnl": {
        // accts_run_profit_loss → run_profit_loss
        // Calls rpc_get_profit_and_loss(tenant_id, start_date, end_date).
        const startDate = String(payload.start_date || payload.from_date || "");
        const endDate = String(payload.end_date || payload.to_date || "");
        if (!startDate || !endDate) {
          return NextResponse.json({ ok: false, error: "start_date and end_date are required" }, { status: 400 });
        }
        const rows = await pgQuery<{
          account_code: string; account_name: string; account_type: string;
          debit: string; credit: string; net_amount: string;
        }>(
          `SELECT * FROM public.rpc_get_profit_and_loss($1, $2::date, $3::date)`,
          [resolveTenantId(req), startDate, endDate],
        );
        const accounts = rows.filter(r => r.account_code !== "TOTAL").map(r => ({
          code: r.account_code, name: r.account_name, type: r.account_type,
          debit: Number(r.debit), credit: Number(r.credit), net: Number(r.net_amount),
        }));
        const totalRow = rows.find(r => r.account_code === "TOTAL");
        const totals = {
          revenue: accounts.filter(a => a.type === "revenue").reduce((s, a) => s + a.net, 0),
          expenses: accounts.filter(a => a.type === "expense").reduce((s, a) => s + a.net, 0),
          netIncome: Number(totalRow?.net_amount || 0),
        };
        const result = { dateRange: { from: startDate, to: endDate }, accounts, totals };
        await auditAction({ action, domain: "acct", tableName: null, recordId: null, afterData: result, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, profitAndLoss: result });
      }

      case "run_balance_sheet": {
        // accts_run_balance_sheet → run_balance_sheet
        // Calls rpc_get_balance_sheet(tenant_id, as_of_date).
        const asOfDate = String(payload.as_of_date || payload.end_date || "");
        if (!asOfDate) {
          return NextResponse.json({ ok: false, error: "as_of_date is required" }, { status: 400 });
        }
        const rows = await pgQuery<{
          section: string; account_code: string; account_name: string; account_type: string;
          debit: string; credit: string; balance: string;
        }>(
          `SELECT * FROM public.rpc_get_balance_sheet($1, $2::date)`,
          [resolveTenantId(req), asOfDate],
        );
        const detail = rows.filter(r => r.section !== "TOTAL").map(r => ({
          section: r.section, code: r.account_code, name: r.account_name, type: r.account_type,
          debit: Number(r.debit), credit: Number(r.credit), balance: Number(r.balance),
        }));
        const totalsRows = rows.filter(r => r.section === "TOTAL");
        const assets = Number(totalsRows.find(r => r.account_type === "asset")?.balance || 0);
        const liabilities = Number(totalsRows.find(r => r.account_type === "liability")?.balance || 0);
        const equity = Number(totalsRows.find(r => r.account_type === "equity")?.balance || 0);
        // Net income (revenue - expenses) through p_as_of_date — this is
        // retained earnings, which sits in the equity section of a balance
        // sheet. Computed here because rpc_get_balance_sheet doesn't include
        // income-statement accounts (those are closed to equity at period
        // end, but for an interim balance sheet we surface them as
        // "current period net income" inside equity).
        const niRows = await pgQuery<{ net: string }>(
          `SELECT
             COALESCE((SELECT SUM(jl.credit) - SUM(jl.debit) FROM public.acct_journal_lines jl
                        JOIN public.acct_journal_entries je ON je.id = jl.journal_entry_id
                        JOIN public.acct_chart_of_accounts coa ON coa.id = jl.account_id
                        WHERE jl.tenant_id = $1 AND je.status = 'posted'
                          AND je.entry_date <= $2::date
                          AND coa.account_type = 'revenue'), 0)
             -
             COALESCE((SELECT SUM(jl.debit) - SUM(jl.credit) FROM public.acct_journal_lines jl
                        JOIN public.acct_journal_entries je ON je.id = jl.journal_entry_id
                        JOIN public.acct_chart_of_accounts coa ON coa.id = jl.account_id
                        WHERE jl.tenant_id = $1 AND je.status = 'posted'
                          AND je.entry_date <= $2::date
                          AND coa.account_type = 'expense'), 0)
             AS net`,
          [resolveTenantId(req), asOfDate],
        );
        const netIncome = Number(niRows[0]?.net || 0);
        const equityWithNI = equity + netIncome;
        const totals = {
          assets, liabilities, equity,
          currentPeriodNetIncome: netIncome,
          equityWithNetIncome: equityWithNI,
        };
        // The accounting equation: Assets = Liabilities + Equity (incl. net income).
        // Use a 1-cent tolerance because numeric arithmetic can introduce
        // floating-point drift.
        const balanced = Math.abs(assets - (liabilities + equityWithNI)) < 0.01;
        const result = { asOfDate, detail, totals, balanced };
        await auditAction({ action, domain: "acct", tableName: null, recordId: null, afterData: result, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, balanceSheet: result });
      }

      case "run_trial_balance": {
        // accts_run_trial_balance → run_trial_balance
        // Calls rpc_get_trial_balance(tenant_id, end_date).
        const endDate = String(payload.end_date || payload.as_of_date || "");
        if (!endDate) {
          return NextResponse.json({ ok: false, error: "end_date is required" }, { status: 400 });
        }
        const rows = await pgQuery<{
          account_code: string; account_name: string; account_type: string;
          total_debit: string; total_credit: string; balance: string;
        }>(
          `SELECT * FROM public.rpc_get_trial_balance($1, $2::date)`,
          [resolveTenantId(req), endDate],
        );
        const accounts = rows.filter(r => r.account_code !== "TOTAL").map(r => ({
          code: r.account_code, name: r.account_name, type: r.account_type,
          debit: Number(r.total_debit), credit: Number(r.total_credit), balance: Number(r.balance),
        }));
        const totalRow = rows.find(r => r.account_code === "TOTAL");
        const totals = {
          totalDebit: Number(totalRow?.total_debit || 0),
          totalCredit: Number(totalRow?.total_credit || 0),
          balanced: Number(totalRow?.total_debit || 0) === Number(totalRow?.total_credit || 0),
        };
        const result = { asOfDate: endDate, accounts, totals };
        await auditAction({ action, domain: "acct", tableName: null, recordId: null, afterData: result, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, trialBalance: result });
      }

      case "run_general_ledger": {
        // accts_run_general_ledger → run_general_ledger
        // Calls rpc_get_general_ledger(tenant_id, start_date, end_date).
        const startDate = String(payload.start_date || payload.from_date || "");
        const endDate = String(payload.end_date || payload.to_date || "");
        if (!startDate || !endDate) {
          return NextResponse.json({ ok: false, error: "start_date and end_date are required" }, { status: 400 });
        }
        const rows = await pgQuery<{
          entry_no: string; entry_date: string; posting_date: string; source: string;
          memo: string | null; reference: string | null; line_no: string;
          account_code: string; account_name: string; account_type: string;
          line_description: string | null; debit: string; credit: string; running_balance: string;
        }>(
          `SELECT * FROM public.rpc_get_general_ledger($1, $2::date, $3::date)`,
          [resolveTenantId(req), startDate, endDate],
        );
        const lines = rows.map(r => ({
          entryNo: Number(r.entry_no), entryDate: r.entry_date, postingDate: r.posting_date,
          source: r.source, memo: r.memo, reference: r.reference, lineNo: Number(r.line_no),
          accountCode: r.account_code, accountName: r.account_name, accountType: r.account_type,
          description: r.line_description, debit: Number(r.debit), credit: Number(r.credit),
          runningBalance: Number(r.running_balance),
        }));
        const result = {
          dateRange: { from: startDate, to: endDate },
          lineCount: lines.length,
          totalDebit: lines.reduce((s, l) => s + l.debit, 0),
          totalCredit: lines.reduce((s, l) => s + l.credit, 0),
          lines,
        };
        await auditAction({ action, domain: "acct", tableName: null, recordId: null, afterData: { lineCount: lines.length, dateRange: result.dateRange }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, generalLedger: result });
      }

      // ───────────────────────────────────────────────────────────────────
      // GIFT CARD LIFECYCLE EDGE CASES — the 8 remaining gift-card
      // operations not covered by issue_gift_card / redeem / convert_gc.
      // All hit commerce_gift_cards directly; the status CHECK enum only
      // allows: active | redeemed | partially_redeemed | expired | cancelled
      // | replaced | converted. We never invent a new status string.
      // ───────────────────────────────────────────────────────────────────

      case "deactivate_gift_card": {
        // accts_deactivate_gc → deactivate_gift_card (SA-76)
        // Deactivate an active card WITHOUT destroying its balance — the
        // reversible counterpart to void (void zeroes the balance).
        // The status CHECK enum has no 'deactivated', so deactivation lands
        // on 'cancelled' with the balance preserved; reactivate_gift_card
        // already accepts 'cancelled' cards back to 'active'. The reason is
        // carried in the audit row. GL: none — the 2310 liability is
        // unchanged while the balance survives.
        const cardId = String(payload.gift_card_id || payload.card_id || "");
        const reason = payload.reason ? String(payload.reason) : null;
        if (!reason) {
          return NextResponse.json({ ok: false, error: "A reason is required to deactivate a gift card" }, { status: 400 });
        }
        const updated = await pgExec(
          `UPDATE public.commerce_gift_cards
              SET status = 'cancelled'
            WHERE id = $1::uuid AND tenant_id = $2 AND status IN ('active','partially_redeemed')`,
          [cardId, resolveTenantId(req)],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: "No active gift card found with that ID — nothing was deactivated" }, { status: 422 });
        }
        await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: cardId, afterData: { newStatus: "cancelled", deactivated: true, reason, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, cardId, newStatus: "cancelled", deactivated: true, reason, updated, message: "Gift card deactivated (balance preserved; reactivate to restore)" });
      }

      case "reactivate_gift_card": {
        // accts_reactivate_gift_card → reactivate_gift_card
        // Reactivate a gift card that was previously expired or cancelled.
        // Only allowed when current status is 'expired' or 'cancelled' —
        // we don't reactivate 'converted' or 'replaced' cards (those are
        // terminal states — the balance already moved elsewhere).
        const cardId = String(payload.gift_card_id || payload.card_id || "");
        const updated = await pgExec(
          `UPDATE public.commerce_gift_cards
              SET status = 'active'
            WHERE id = $1::uuid AND tenant_id = $2
              AND status IN ('expired','cancelled')`,
          [cardId, resolveTenantId(req)],
        );
        if (!updated) {
          // Honest failure, not ok:true with updated:0 — only expired or
          // cancelled cards can be reactivated; converted/replaced/redeemed
          // are terminal (the balance already moved).
          return NextResponse.json({ ok: false, error: "No eligible (expired/cancelled) card found with that ID — nothing was reactivated" }, { status: 422 });
        }
        await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: cardId, afterData: { newStatus: "active", updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, cardId, newStatus: "active", updated, message: "Gift card reactivated" });
      }

      case "expire_gift_card": {
        // accts_expire_gift_card → expire_gift_card
        // Force-expire an active gift card. Sets expires_at to now() if
        // not already set, and flips status to 'expired'.
        const cardId = String(payload.gift_card_id || payload.card_id || "");
        const updated = await pgExec(
          `UPDATE public.commerce_gift_cards
              SET status = 'expired', expires_at = COALESCE(expires_at, now())
            WHERE id = $1::uuid AND tenant_id = $2 AND status IN ('active','partially_redeemed')`,
          [cardId, resolveTenantId(req)],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: "No active card found with that ID — nothing was expired" }, { status: 422 });
        }
        await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: cardId, afterData: { newStatus: "expired", updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, cardId, newStatus: "expired", updated, message: "Gift card expired" });
      }

      case "transfer_gift_card": {
        // accts_transfer_gift_card → transfer_gift_card
        // Transfer the gift card's holder to a different customer. The
        // balance and card_number move with it; status stays 'active'.
        // We update both customer_id and holder_customer_id (the FK target
        // for who can redeem).
        const cardId = String(payload.gift_card_id || payload.card_id || "");
        const newHolderId = String(payload.new_customer_id || payload.to_customer_id || "");
        if (!newHolderId) {
          return NextResponse.json({ ok: false, error: "new_customer_id is required for transfer" }, { status: 400 });
        }
        const updated = await pgExec(
          `UPDATE public.commerce_gift_cards
              SET customer_id = $1::uuid, holder_customer_id = $1::uuid
            WHERE id = $2::uuid AND tenant_id = $3 AND status IN ('active','partially_redeemed')`,
          [newHolderId, cardId, resolveTenantId(req)],
        );
        if (!updated) {
          // The UI offers Transfer on partially_redeemed cards too — the
          // old status='active'-only filter silently no-oped for them.
          return NextResponse.json({ ok: false, error: "No active or partially redeemed card found with that ID — nothing was transferred" }, { status: 422 });
        }
        await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: cardId, afterData: { newHolderId, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, cardId, newHolderId, updated, message: "Gift card transferred" });
      }

      case "edit_gift_card": {
        // accts_edit_gift_card → edit_gift_card
        // Edit a gift card's metadata: recipient_name, recipient_email,
        // recipient_phone, sender_name, gift_message, expires_at.
        // We don't allow editing balance or status through this action —
        // those have dedicated lifecycle endpoints.
        const cardId = String(payload.gift_card_id || payload.card_id || "");
        const recipientName = payload.recipient_name !== undefined ? String(payload.recipient_name) : null;
        const recipientEmail = payload.recipient_email !== undefined ? String(payload.recipient_email) : null;
        const recipientPhone = payload.recipient_phone !== undefined ? String(payload.recipient_phone) : null;
        const senderName = payload.sender_name !== undefined ? String(payload.sender_name) : null;
        const giftMessage = payload.gift_message !== undefined ? String(payload.gift_message) : null;
        const expiresAt = payload.expires_at !== undefined ? String(payload.expires_at) : null;
        const updated = await pgExec(
          `UPDATE public.commerce_gift_cards
              SET recipient_name    = COALESCE($1, recipient_name),
                  recipient_email   = COALESCE($2, recipient_email),
                  recipient_phone   = COALESCE($3, recipient_phone),
                  sender_name        = COALESCE($4, sender_name),
                  gift_message      = COALESCE($5, gift_message),
                  expires_at        = CASE WHEN $6::text = '__CLEAR__' THEN NULL ELSE COALESCE($6::timestamptz, expires_at) END
            WHERE id = $7::uuid AND tenant_id = $8`,
          [recipientName, recipientEmail, recipientPhone, senderName, giftMessage, expiresAt || null, cardId, resolveTenantId(req)],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: "Gift card not found — nothing was edited" }, { status: 404 });
        }
        await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: cardId, afterData: { recipientName, recipientEmail, recipientPhone, senderName, giftMessage, expiresAt, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, cardId, updated });
      }

      case "replace_gift_card": {
        // accts_replace_gift_card → replace_gift_card
        // Replace a lost/stolen gift card. Issues a NEW card with the same
        // balance + recipient info, then marks the old card as 'replaced'
        // with balance=0 and replaced_by_id pointing at the new card.
        // The replaced_reason is recorded (e.g. "lost", "stolen", "damaged").
        const oldCardId = String(payload.gift_card_id || payload.card_id || "");
        const reason = String(payload.reason || "lost");
        // Pull the old card's balance + recipient info
        const oldRows = await pgQuery<{
          balance: string; currency: string; card_format: string; customer_id: string | null;
          recipient_name: string | null; recipient_email: string | null;
          recipient_phone: string | null; sender_name: string | null; gift_message: string | null;
        }>(
          `SELECT balance, currency, card_format, customer_id, recipient_name, recipient_email,
                  recipient_phone, sender_name, gift_message
             FROM public.commerce_gift_cards
            WHERE id = $1::uuid AND tenant_id = $2 AND status IN ('active','partially_redeemed')`,
          [oldCardId, resolveTenantId(req)],
        );
        if (oldRows.length === 0) {
          return NextResponse.json({ ok: false, error: "No active gift card found to replace" }, { status: 404 });
        }
        const old = oldRows[0];
        const balance = Number(old.balance || 0);
        if (balance <= 0) {
          return NextResponse.json({ ok: false, error: "Cannot replace a gift card with zero balance" }, { status: 400 });
        }
        // Issue the replacement card
        const newCardNumber = `GC-${Date.now().toString(36).toUpperCase()}`;
        const newRows = await pgQuery<{ id: string }>(
          `INSERT INTO public.commerce_gift_cards
             (id, tenant_id, card_number, customer_id, initial_value, balance, currency,
              status, card_format, recipient_name, recipient_email, recipient_phone,
              sender_name, gift_message, holder_customer_id, issued_at)
           VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4, $4, $5, 'active', $6, $7, $8, $9, $10, $11, $3::uuid, now())
           RETURNING id`,
          [resolveTenantId(req), newCardNumber, old.customer_id, balance, old.currency, old.card_format, old.recipient_name, old.recipient_email, old.recipient_phone, old.sender_name, old.gift_message],
        );
        const newCardId = newRows[0]?.id ?? null;
        if (!newCardId) {
          return NextResponse.json({ ok: false, error: "Failed to issue replacement card" }, { status: 500 });
        }
        // Mark old card as replaced
        const retired = await pgExec(
          `UPDATE public.commerce_gift_cards
              SET status = 'replaced', balance = 0, replaced_by_id = $1::uuid, replaced_reason = $2
            WHERE id = $3::uuid AND tenant_id = $4`,
          [newCardId, reason, oldCardId, resolveTenantId(req)],
        );
        if (!retired) {
          return NextResponse.json({ ok: false, error: `Replacement card ${newCardNumber} was issued, but the old card could not be retired — void the old card manually before either card is used` }, { status: 500 });
        }
        await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: oldCardId, afterData: { oldCardId, newCardId, newCardNumber, balance, reason }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, oldCardId, newCardId, newCardNumber, balance, reason, message: "Replacement card issued; old card zeroed and marked replaced" });
      }

      case "void_gift_card": {
        // accts_void_gift_card → void_gift_card
        // Void a gift card — sets status to 'cancelled' and zeroes the
        // balance. Used for fraudulent cards, refunds, or admin errors.
        // GL: none posted by design — voiding accompanies an external
        // settlement (fraud reversal / refund through the payments flow,
        // which posts its own entry); the chart has no gift-card breakage
        // account, and inventing a write-off credit would misstate revenue.
        // The void + reason are audit-logged below.
        const cardId = String(payload.gift_card_id || payload.card_id || "");
        const reason = payload.reason ? String(payload.reason) : null;
        const updated = await pgExec(
          `UPDATE public.commerce_gift_cards
              SET status = 'cancelled', balance = 0
            WHERE id = $1::uuid AND tenant_id = $2 AND status IN ('active','partially_redeemed','expired')`,
          [cardId, resolveTenantId(req)],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: "No eligible card found with that ID — nothing was voided" }, { status: 422 });
        }
        await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: cardId, afterData: { newStatus: "cancelled", reason, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, cardId, newStatus: "cancelled", reason, updated, message: "Gift card voided" });
      }

      case "send_gift_card_receipt":
      case "reissue_gift_card": {
        // accts_send_gift_card_receipt / accts_reissue_gift_card (SA-47)
        // Send (or re-send) the gift card to the recipient as a REAL email
        // via Resend (giftCardDeliveryHtml — the same delivery template the
        // shop sends at purchase). The previous implementation inserted a
        // crm_messages row with status='queued' and claimed a cron would
        // deliver it; no such sender exists, so receipts never arrived.
        const tenant = resolveTenantId(req);
        const provider = await getEmailProviderSettings(tenant);
        if (!provider.hasSendingKey) {
          return NextResponse.json({ ok: false, error: "Email not configured", detail: "Set an email provider key at Admin → Connections & Keys (Resend or Brevo)" }, { status: 503 });
        }
        const cardId = String(payload.gift_card_id || payload.card_id || "");
        const cardRows = await pgQuery<{
          card_number: string; balance: string; currency: string; customer_id: string | null;
          holder_customer_id: string | null; sender_name: string | null;
          recipient_name: string | null; recipient_email: string | null;
          expires_at: string | null;
        }>(
          `SELECT card_number, balance, currency, customer_id, holder_customer_id, sender_name, recipient_name,
                  recipient_email, expires_at
             FROM public.commerce_gift_cards
            WHERE id = $1::uuid AND tenant_id = $2`,
          [cardId, tenant],
        );
        if (cardRows.length === 0) {
          return NextResponse.json({ ok: false, error: "Gift card not found" }, { status: 404 });
        }
        const card = cardRows[0];
        // Recipient: explicit override → card recipient_email → holder /
        // purchaser customer's email on file.
        let toAddress = payload.to_email ? String(payload.to_email) : card.recipient_email;
        let customerIdForNotif: string | undefined;
        if (!toAddress) {
          for (const cid of [card.holder_customer_id, card.customer_id]) {
            if (!cid) continue;
            const cRows = await pgQuery<{ email: string | null }>(
              `SELECT email FROM public.crm_customers WHERE id = $1::uuid`,
              [cid],
            );
            if (cRows[0]?.email) { toAddress = cRows[0].email; customerIdForNotif = cid; break; }
          }
        } else {
          customerIdForNotif = card.customer_id || card.holder_customer_id || undefined;
        }
        if (!toAddress) {
          return NextResponse.json({ ok: false, error: "Cardholder has no email address — the receipt was not sent" }, { status: 422 });
        }
        const balance = `$${Number(card.balance || 0).toFixed(2)}`;
        const subject = shortAction === "reissue_gift_card"
          ? `Your UnSaid Memories gift card (re-sent) — balance ${balance}`
          : `Your UnSaid Memories gift card — balance ${balance}`;
        const result = await sendEmail({
          to: toAddress,
          template: "gift_card_receipt",
          subject,
          html: giftCardDeliveryHtml({
            recipientName: card.recipient_name || undefined,
            senderName: card.sender_name || "UnSaid Memories",
            amount: balance,
            cardNumber: card.card_number,
          }),
          customerId: customerIdForNotif,
          tenantId: tenant,
          variables: toResendVariables({
            recipientName: card.recipient_name || "",
            senderName: card.sender_name || "UnSaid Memories",
            amount: balance,
            cardNumber: card.card_number,
            message: "",
          }),
        });
        if (!result.ok) {
          return NextResponse.json({ ok: false, error: result.error || "The gift card receipt email failed to send" }, { status: 502 });
        }
        // Mark delivered_at if this is the first send (not a reissue)
        if (shortAction === "send_gift_card_receipt") {
          await pgExec(
            `UPDATE public.commerce_gift_cards SET delivered_at = COALESCE(delivered_at, now())
              WHERE id = $1::uuid`,
            [cardId],
          );
        }
        await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: cardId, afterData: { cardId, toAddress, reissue: shortAction === "reissue_gift_card" }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, cardId, toAddress, message: "Receipt email sent" });
      }

      // ───────────────────────────────────────────────────────────────────
      // BANKING & REGISTER OPERATIONS — the final Accounting module nodes.
      // Banking: connect a bank account + view payouts.
      // Register: open/close cash drawer sessions + X/Z reports.
      // ───────────────────────────────────────────────────────────────────

      case "bank_connect": {
        // SA-84 — Connect Account. The platform model is STRIPE CONNECT
        // ONLY: a tenant links its bank through Stripe's hosted Express
        // onboarding, and the connection lives in tenant_stripe_accounts.
        // No bank account/routing numbers are collected or stored here —
        // Stripe holds them. (The old handler inserted a manual
        // acct_bank_accounts row from typed-in fields and reported it
        // "connected"; that was a fake connection.) This case performs the
        // exact flow of POST /api/admin/stripe-connections/connect and
        // returns the onboarding URL for the caller to open. When Stripe
        // is not configured the honest answer is 503 — never a fake success.
        // Manual acct_bank_accounts rows (BankingView) remain what they are:
        // hand-tracked accounts for reconciliation, NOT connections.
        const stripe = getStripe();
        if (!stripe) {
          return NextResponse.json({ ok: false, error: "Stripe is not configured (STRIPE_SECRET_KEY missing) — bank connection is unavailable until Stripe is configured" }, { status: 503 });
        }
        const tenant = resolveTenantId(req);
        try {
          let row = await getTenantStripeAccount(tenant);
          if (!row) {
            const account = await stripe.accounts.create({
              type: "express",
              country: "US",
              capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
              },
            });
            row = await insertTenantStripeAccount(tenant, account.id);
            if (!row) {
              return NextResponse.json({ ok: false, error: "Stripe account was created but could not be saved — please try again" }, { status: 500 });
            }
          }
          const base = (req.nextUrl.origin || process.env.NEXT_PUBLIC_SITE_URL || "https://www.unsaidmemories.com").replace(/\/$/, "");
          const link = await stripe.accountLinks.create({
            account: row.stripe_account_id,
            refresh_url: `${base}/admin/stripe-connections?refresh=1`,
            return_url: `${base}/admin/stripe-connections?return=1`,
            type: "account_onboarding",
          });
          await auditAction({ action, domain: "acct", tableName: "tenant_stripe_accounts", recordId: null, afterData: { stripe_account_id: row.stripe_account_id, onboarding_complete: row.onboarding_complete }, actorUserId: actorId, ipAddress: ip });
          return NextResponse.json({ ok: true, url: link.url, stripeAccountId: row.stripe_account_id, onboardingComplete: row.onboarding_complete, message: "Continue on Stripe to link your bank account — bank details are entered on Stripe only" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[finance/actions] bank_connect failed:", msg);
          return NextResponse.json({ ok: false, error: msg || "Could not start Stripe onboarding" }, { status: 502 });
        }
      }

      case "bank_payouts": {
        // accts_bank_payouts → bank_payouts
        // View payout schedules & deposit settlements. Returns bank
        // transactions with positive amounts (inbound deposits/payouts)
        // plus succeeded commerce_payments for the same period.
        const startDate = String(payload.start_date || payload.from_date || "");
        const endDate = String(payload.end_date || payload.to_date || "");
        const dateFilter = startDate && endDate
          ? `AND transaction_date BETWEEN $2::date AND $3::date`
          : "";
        const params: unknown[] = [resolveTenantId(req)];
        if (startDate && endDate) params.push(startDate, endDate);
        const bankTxns = await pgQuery<{ id: string; bank_account_id: string; transaction_date: string; amount: string; description: string | null; payee: string | null }>(
          `SELECT id, bank_account_id, transaction_date::text, amount::text, description, payee
             FROM public.acct_bank_transactions
            WHERE tenant_id = $1 AND amount > 0
            ${dateFilter}
            ORDER BY transaction_date DESC LIMIT 100`,
          params,
        );
        const payouts = bankTxns.map(r => ({
          transactionId: r.id, bankAccountId: r.bank_account_id,
          date: r.transaction_date, amount: Number(r.amount),
          description: r.description, payee: r.payee,
        }));
        // SA-86 — read-only. Say exactly what these rows are: inbound
        // deposits/payouts recorded as bank transactions in Banking.
        // Live Stripe payout objects are not synced into this app; the
        // tenant's Stripe connection state is reported alongside so the
        // caller can tell a connected tenant with no recorded payouts
        // from one that never connected.
        const connRows = await pgQuery<{ stripe_account_id: string; payouts_enabled: boolean; onboarding_complete: boolean }>(
          `SELECT stripe_account_id, payouts_enabled, onboarding_complete FROM public.tenant_stripe_accounts WHERE tenant_id = $1`,
          [resolveTenantId(req)],
        );
        const result = {
          source: "acct_bank_transactions",
          stripeConnection: connRows[0]
            ? { connected: true, payoutsEnabled: !!connRows[0].payouts_enabled, onboardingComplete: !!connRows[0].onboarding_complete }
            : { connected: false, payoutsEnabled: false, onboardingComplete: false },
          dateRange: { from: startDate || null, to: endDate || null },
          payouts,
          totals: {
            totalPayouts: payouts.reduce((s, p) => s + p.amount, 0),
            payoutCount: payouts.length,
          },
        };
        await auditAction({ action, domain: "acct", tableName: "acct_bank_transactions", recordId: null, afterData: { totals: result.totals }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, bankPayouts: result });
      }

      // ───────────────────────────────────────────────────────────────────
      // MODULE 7 REMAINING NODES — invoice ops, deposit ops, refund ops,
      // card balance check, receipt printing, tax forms.
      // ───────────────────────────────────────────────────────────────────

      case "print_receipt": {
        // SA-47: server-assembled receipt payload — the client renders it
        // into a print window (browser print → PDF). Includes the customer
        // name and tender label so the printed receipt is complete.
        const paymentId = String(payload.payment_id || "");
        if (!paymentId) {
          return NextResponse.json({ ok: false, error: "payment_id is required" }, { status: 400 });
        }
        const rows = await pgQuery<{ payment_number: string; amount: string; status: string; customer_id: string | null; created_at: string; customer_name: string | null; tender: string | null; currency: string | null }>(
          `SELECT cp.payment_number, cp.amount::text, cp.status, cp.customer_id::text, cp.created_at::text,
                  NULLIF(TRIM(COALESCE(cc.first_name, '') || ' ' || COALESCE(cc.last_name, '')), '') AS customer_name,
                  pm.name AS tender, cp.currency
             FROM public.commerce_payments cp
             LEFT JOIN public.crm_customers cc ON cc.id = cp.customer_id
             LEFT JOIN public.commerce_payment_methods pm ON pm.id = cp.payment_method_id
            WHERE cp.id = $1::uuid AND cp.tenant_id = $2`,
          [paymentId, resolveTenantId(req)],
        );
        if (rows.length === 0) return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
        const r = rows[0];
        await auditAction({ action, domain: "commerce", tableName: "commerce_payments", recordId: paymentId, afterData: { paymentNumber: r.payment_number, amount: Number(r.amount) }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, receipt: { paymentId, paymentNumber: r.payment_number, amount: Number(r.amount), status: r.status, customerId: r.customer_id, customerName: r.customer_name, tender: r.tender, currency: r.currency || "USD", date: r.created_at } });
      }

      case "batch_export": {
        // SA-49 (A.7.1.4): server-side batch export of payments as CSV.
        // The client downloads the returned CSV as a file. Optional
        // from_date / to_date (YYYY-MM-DD) bound the export; capped at
        // 5000 rows so a huge export can't OOM the lambda.
        const tenant = resolveTenantId(req);
        const fromDate = payload.from_date ? String(payload.from_date) : null;
        const toDate = payload.to_date ? String(payload.to_date) : null;
        const rows = await pgQuery<{
          payment_number: string; amount: string; tip_amount: string; currency: string; status: string;
          created_at: string; customer_name: string | null; customer_email: string | null;
          tender: string | null; external_reference: string | null;
        }>(
          `SELECT cp.payment_number, cp.amount::text, cp.tip_amount::text, cp.currency, cp.status,
                  cp.created_at::text,
                  NULLIF(TRIM(COALESCE(cc.first_name, '') || ' ' || COALESCE(cc.last_name, '')), '') AS customer_name,
                  cc.email AS customer_email,
                  COALESCE(pm.name, 'Other') AS tender,
                  cp.external_reference
             FROM public.commerce_payments cp
             LEFT JOIN public.crm_customers cc ON cc.id = cp.customer_id
             LEFT JOIN public.commerce_payment_methods pm ON pm.id = cp.payment_method_id
            WHERE cp.tenant_id = $1
              AND ($2::date IS NULL OR cp.created_at >= $2::date)
              AND ($3::date IS NULL OR cp.created_at < ($3::date + interval '1 day'))
            ORDER BY cp.created_at DESC
            LIMIT 5000`,
          [tenant, fromDate, toDate],
        );
        const esc = (v: unknown) => {
          const s = v == null ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const header = "payment_number,date,customer,customer_email,tender,amount,tip,currency,status,reference";
        const lines = rows.map((r) => [
          r.payment_number, r.created_at, r.customer_name || "Walk-in", r.customer_email || "",
          r.tender || "", Number(r.amount || 0).toFixed(2), Number(r.tip_amount || 0).toFixed(2),
          (r.currency || "USD").toUpperCase(), r.status, r.external_reference || "",
        ].map(esc).join(","));
        const csv = [header, ...lines].join("\n");
        const totalAmount = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
        const filename = `payments-export-${new Date().toISOString().slice(0, 10)}.csv`;
        await auditAction({ action, domain: "commerce", tableName: "commerce_payments", recordId: null, afterData: { count: rows.length, totalAmount, fromDate, toDate, filename }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, filename, csv, count: rows.length, totalAmount: Math.round(totalAmount * 100) / 100 });
      }

      case "edit_invoice": {
        // SA-50: versioned edit — the pre-edit snapshot is written to the
        // audit log as beforeData alongside the new values, and PAID/VOID
        // invoices are locked. Invoice ids are acct_ar_invoices uuids.
        const invoiceId = String(payload.invoice_id || "");
        if (!invoiceId) {
          return NextResponse.json({ ok: false, error: "invoice_id is required" }, { status: 400 });
        }
        if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(invoiceId)) {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} not found` }, { status: 404 });
        }
        const prior = await pgQuery<{ status: string; dueDate: string | null; notes: string | null }>(
          `SELECT status::text AS status, due_date::text AS "dueDate", notes FROM public.acct_ar_invoices WHERE id = $1::uuid AND tenant_id = $2`,
          [invoiceId, resolveTenantId(req)],
        );
        if (prior.length === 0) {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} not found` }, { status: 404 });
        }
        const priorStatus = String(prior[0].status).toUpperCase();
        if (priorStatus === "PAID" || priorStatus === "VOID") {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} is ${priorStatus.toLowerCase()} and locked — it can no longer be edited` }, { status: 422 });
        }
        const dueDate = payload.due_date !== undefined ? String(payload.due_date) : null;
        const notes = payload.notes !== undefined ? String(payload.notes) : null;
        const updated = await pgExec(
          `UPDATE public.acct_ar_invoices SET due_date = COALESCE($1::date, due_date),
              notes = COALESCE($2, notes), updated_at = now()
            WHERE id = $3::uuid AND tenant_id = $4`,
          [dueDate, notes, invoiceId, resolveTenantId(req)],
        );
        if (!updated) {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} could not be edited — the update did not land` }, { status: 500 });
        }
        await auditAction({ action, domain: "acct", tableName: "invoices", recordId: invoiceId, beforeData: { dueDate: prior[0].dueDate, notes: prior[0].notes, status: prior[0].status }, afterData: { dueDate, notes, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, invoiceId, updated });
      }

      case "duplicate_invoice": {
        const invoiceId = String(payload.invoice_id || "");
        if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(invoiceId)) {
          return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
        }
        const orig = await pgQuery<{ entity_id: string; customer_id: string; source_customer_id: string | null; booking_id: string | null; appointment_id: string | null; subtotal: string; tax_total: string; discount_total: string; total: string; currency: string; dueDate: string | null; notes: string | null }>(
          `SELECT entity_id::text, customer_id::text, source_customer_id, booking_id,
                  appointment_id::text, subtotal::text, tax_total::text, discount_total::text,
                  total::text, currency::text, due_date::text AS "dueDate", notes
             FROM public.acct_ar_invoices WHERE id = $1::uuid AND tenant_id = $2`,
          [invoiceId, resolveTenantId(req)],
        );
        if (orig.length === 0) return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
        const o = orig[0];
        const newNum = `INV-${Date.now().toString(36).toUpperCase()}`;
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.acct_ar_invoices
             (tenant_id, entity_id, customer_id, source_customer_id, booking_id, appointment_id,
              invoice_number, status, invoice_date, due_date, subtotal, tax_total, discount_total,
              total, amount_paid, amount_credited, deposit_paid, currency, notes)
           VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6::uuid, $7, 'draft', CURRENT_DATE,
                   COALESCE($8::date, CURRENT_DATE + 30), $9, $10, $11, $12, 0, 0, 0, $13, $14)
           RETURNING id::text AS id`,
          [resolveTenantId(req), o.entity_id, o.customer_id, o.source_customer_id, o.booking_id, o.appointment_id,
           newNum, o.dueDate, Number(o.subtotal), Number(o.tax_total), Number(o.discount_total), Number(o.total),
           o.currency || "USD", o.notes],
        );
        const newId = rows[0]?.id ?? null;
        if (!newId) {
          return NextResponse.json({ ok: false, error: `Invoice copy ${newNum} could not be created — the duplicate was not saved` }, { status: 500 });
        }
        // SA-54: copy the line items too — a duplicate with totals but no
        // lines is not a duplicate (previously the items were dropped).
        const copiedItems = await pgExec(
          `INSERT INTO public.acct_ar_invoice_lines
             (invoice_id, line_no, description, quantity, unit_price, discount_amount, line_subtotal, tax_amount, revenue_account_id, dimensions)
           SELECT $2::uuid, line_no, description, quantity, unit_price, discount_amount, line_subtotal, tax_amount, revenue_account_id, dimensions
             FROM public.acct_ar_invoice_lines WHERE invoice_id = $1::uuid`,
          [invoiceId, newId],
        );
        await auditAction({ action, domain: "acct", tableName: "invoices", recordId: newId, afterData: { clonedFrom: invoiceId, newNumber: newNum, copiedItems }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, originalId: invoiceId, newInvoiceId: newId, newInvoiceNumber: newNum, copiedItems });
      }

      case "delete_invoice": {
        // SA-55: ONLY drafts may be deleted. Anything that was sent, is
        // open/unpaid, paid, or already void is a financial record — it
        // must go through Void (SA-53), never Delete. Drafts are hard-
        // deleted with their line items; the audit row is the record.
        const invoiceId = String(payload.invoice_id || "");
        if (!invoiceId) {
          return NextResponse.json({ ok: false, error: "invoice_id is required" }, { status: 400 });
        }
        if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(invoiceId)) {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} not found` }, { status: 404 });
        }
        const prior = await pgQuery<{ status: string; number: string }>(
          `SELECT status::text AS status, invoice_number AS number FROM public.acct_ar_invoices WHERE id = $1::uuid AND tenant_id = $2`,
          [invoiceId, resolveTenantId(req)],
        );
        if (prior.length === 0) {
          return NextResponse.json({ ok: false, error: `Invoice ${invoiceId} not found` }, { status: 404 });
        }
        if (String(prior[0].status).toLowerCase() !== "draft") {
          return NextResponse.json({ ok: false, error: `Only draft invoices can be deleted — invoice ${prior[0].number} is ${prior[0].status}. Use Void / Cancel instead.` }, { status: 422 });
        }
        const deletedItems = await pgExec(
          `DELETE FROM public.acct_ar_invoice_lines WHERE invoice_id = $1::uuid`,
          [invoiceId],
        );
        const deleted = await pgExec(
          `DELETE FROM public.acct_ar_invoices WHERE id = $1::uuid AND tenant_id = $2`,
          [invoiceId, resolveTenantId(req)],
        );
        if (!deleted) {
          return NextResponse.json({ ok: false, error: `Draft invoice ${invoiceId} could not be deleted — the delete did not land` }, { status: 500 });
        }
        await auditAction({ action, domain: "acct", tableName: "invoices", recordId: invoiceId, beforeData: { status: prior[0].status, number: prior[0].number }, afterData: { deleted: true, deletedItems }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, invoiceId, deleted, deletedItems, status: "deleted" });
      }

      case "transfer_deposit": {
        // SA-60: transfer moves the liability between customers — no GL
        // (the 2300 balance is unchanged, only its owner). Full audit trail
        // via transferred_from/to columns + acct_audit_log.
        const tenant = resolveTenantId(req);
        const rawId = String(payload.deposit_id || "").trim();
        const newCustomerId = payload.new_customer_id ? String(payload.new_customer_id) : null;
        const reason = payload.reason ? String(payload.reason) : "Transfer";
        if (!newCustomerId) return NextResponse.json({ ok: false, error: "new_customer_id required" }, { status: 400 });
        const cust = await pgQuery<{ id: string }>(
          `SELECT id::text AS id FROM public.crm_customers WHERE id = $1::uuid AND tenant_id = $2 LIMIT 1`,
          [newCustomerId, tenant],
        );
        if (!cust[0]) return NextResponse.json({ ok: false, error: `Customer ${newCustomerId} not found` }, { status: 400 });
        const depRows = await pgQuery<{ id: string; customer_id: string | null }>(
          `SELECT id::text AS id, customer_id::text FROM public.commerce_deposits
            WHERE tenant_id = $1 AND (id::text = $2 OR UPPER(deposit_number) = UPPER($2)) LIMIT 1`,
          [tenant, rawId],
        );
        if (!depRows[0]) return NextResponse.json({ ok: false, error: `Deposit ${rawId || "(blank)"} not found` }, { status: 404 });
        const depositId = depRows[0].id;
        const previousCustomerId = depRows[0].customer_id;
        // NOTE: transferred_from_id / transferred_to_id FK to
        // commerce_deposits(id) — they are deposit-CHAIN links, not customer
        // ids. The old handler wrote the customer UUID into them and every
        // transfer died on the FK. The customer move is recorded here via
        // customer_id + transferred_at + transfer_reason, and the from→to
        // pair lives in the audit row below.
        const updated = await pgExec(
          `UPDATE public.commerce_deposits SET customer_id = $1::uuid,
              transferred_at = now(), transfer_reason = $2, updated_at = now()
            WHERE id = $3::uuid AND tenant_id = $4`,
          [newCustomerId, reason, depositId, tenant],
        );
        if (!updated) return NextResponse.json({ ok: false, error: "Deposit transfer did not land" }, { status: 500 });
        await auditAction({ action, domain: "acct", tableName: "commerce_deposits", recordId: depositId, afterData: { previousCustomerId, newCustomerId, reason, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, depositId, previousCustomerId, newCustomerId, updated });
      }

      case "edit_deposit": {
        // SA-61: metadata/amount edit with audit. (Amount edits on a held
        // deposit change the recorded liability; the audit row carries the
        // before/after so the books can be reconciled.)
        const tenant = resolveTenantId(req);
        const rawId = String(payload.deposit_id || "").trim();
        const depRows = await pgQuery<{ id: string; amount: string }>(
          `SELECT id::text AS id, amount::text FROM public.commerce_deposits
            WHERE tenant_id = $1 AND (id::text = $2 OR UPPER(deposit_number) = UPPER($2)) LIMIT 1`,
          [tenant, rawId],
        );
        if (!depRows[0]) return NextResponse.json({ ok: false, error: `Deposit ${rawId || "(blank)"} not found` }, { status: 404 });
        const depositId = depRows[0].id;
        const amount = payload.amount !== undefined ? Number(payload.amount) : null;
        const method = payload.method ? String(payload.method) : null;
        const notes = payload.notes !== undefined ? String(payload.notes) : null;
        const updated = await pgExec(
          `UPDATE public.commerce_deposits SET amount = COALESCE($1, amount),
              method = COALESCE($2, method), notes = COALESCE($3, notes), updated_at = now()
            WHERE id = $4::uuid AND tenant_id = $5`,
          [amount, method, notes, depositId, tenant],
        );
        if (!updated) return NextResponse.json({ ok: false, error: "Deposit edit did not land" }, { status: 500 });
        await auditAction({ action, domain: "acct", tableName: "commerce_deposits", recordId: depositId, afterData: { amount, previousAmount: Number(depRows[0].amount), method, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, depositId, updated });
      }

      case "receipt_deposit": {
        const rawId = String(payload.deposit_id || "").trim();
        const rows = await pgQuery<{ deposit_number: string; amount: string; status: string; customer_id: string | null; collected_at: string; method: string | null }>(
          `SELECT deposit_number, amount::text, status, customer_id, collected_at::text, method
             FROM public.commerce_deposits
            WHERE tenant_id = $2 AND (id::text = $1 OR UPPER(deposit_number) = UPPER($1)) LIMIT 1`,
          [rawId, resolveTenantId(req)],
        );
        const depositId = rawId;
        if (rows.length === 0) return NextResponse.json({ ok: false, error: "Deposit not found" }, { status: 404 });
        const r = rows[0];
        await auditAction({ action, domain: "acct", tableName: "commerce_deposits", recordId: depositId, afterData: { depositNumber: r.deposit_number, amount: Number(r.amount) }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, receipt: { depositId, depositNumber: r.deposit_number, amount: Number(r.amount), status: r.status, customerId: r.customer_id, collectedAt: r.collected_at, method: r.method } });
      }

      case "approve_refund": {
        // SA-63: approval moves the refund to completed AND triggers the
        // refund itself (SA-29 ledger effect): GL Dr 4000 / Cr 1000 for the
        // refund amount. Already-completed/rejected/voided refunds cannot
        // be approved again.
        const tenant = resolveTenantId(req);
        const paymentId = String(payload.payment_id || "");
        const refundId = String(payload.refund_id || "");
        let updated = 0;
        let journalEntryId: string | null = null;
        if (refundId) {
          const rows = await pgQuery<{ amount: string; status: string; refund_method: string | null; payment_id: string | null; store_credit_id: string | null; sale_id: string | null }>(
            `SELECT amount::text, status, refund_method, payment_id::text, store_credit_id::text, sale_id::text FROM public.commerce_refunds WHERE id = $1::uuid AND tenant_id = $2`,
            [refundId, tenant],
          );
          if (!rows[0]) return NextResponse.json({ ok: false, error: `Refund ${refundId} not found` }, { status: 404 });
          if (["completed", "rejected", "void"].includes(rows[0].status)) {
            return NextResponse.json({ ok: false, error: `Refund is '${rows[0].status}' — it cannot be approved` }, { status: 400 });
          }
          const isStoreCredit = rows[0].refund_method === "store_credit";
          updated = await pgExec(
            `UPDATE public.commerce_refunds SET status = 'completed', approved_at = now(), processed_at = now()
              WHERE id = $1::uuid AND tenant_id = $2`,
            [refundId, tenant],
          );
          if (updated) {
            const amt = Number(rows[0].amount || 0);
            // Refunds held at 'requires_approval' were created WITHOUT a
            // payment-ledger row or store credit — approval is when the
            // money actually moves, so create them here.
            try {
              if (isStoreCredit && !rows[0].store_credit_id && amt > 0) {
                let custId: string | null = null;
                if (rows[0].sale_id) {
                  const sRows = await pgQuery<{ customer_id: string | null }>(
                    `SELECT customer_id::text FROM public.commerce_sales WHERE id = $1::uuid AND tenant_id = $2`,
                    [rows[0].sale_id, tenant],
                  );
                  custId = sRows[0]?.customer_id ?? null;
                }
                const creditNumber = await issueStoreCredit({ customerId: custId, amount: amt });
                if (creditNumber) {
                  await pgExec(
                    `UPDATE public.commerce_refunds SET store_credit_id = (
                        SELECT id FROM public.commerce_store_credits WHERE credit_number = $1 AND tenant_id = $2
                      ) WHERE id = $3::uuid AND tenant_id = $2`,
                    [creditNumber, tenant, refundId],
                  );
                }
              } else if (!isStoreCredit && !rows[0].payment_id && amt > 0) {
                const methodRows = await pgQuery<{ id: string }>(
                  `SELECT id::text AS id FROM public.commerce_payment_methods
                    WHERE tenant_id = $1 AND active = true
                    ORDER BY (code = 'manual_cash') DESC, (method_type = 'cash') DESC, id
                    LIMIT 1`,
                  [tenant],
                );
                if (methodRows[0]?.id) {
                  const payRows = await pgQuery<{ id: string }>(
                    `INSERT INTO public.commerce_payments
                       (tenant_id, payment_number, payment_method_id, customer_id, amount, status, currency, external_reference, created_at)
                     VALUES ($1::uuid, $2, $3::uuid, NULL, $4::numeric, 'refunded', 'USD', $5, now()) RETURNING id::text`,
                    [tenant, `PAY-${Date.now().toString(36).toUpperCase()}`, methodRows[0].id, amt.toFixed(2), `refund_${refundId.slice(0, 8)}`],
                  );
                  if (payRows[0]?.id) {
                    await pgExec(
                      `UPDATE public.commerce_refunds SET payment_id = $1::uuid WHERE id = $2::uuid AND tenant_id = $3`,
                      [payRows[0].id, refundId, tenant],
                    );
                  }
                }
              }
            } catch (e) { console.error("[approve_refund] ledger completion failed:", e); }
            try {
              if (amt > 0) {
                const q = async (text: string, params?: unknown[]) => {
                  const r = await pgQuery(text, params);
                  return { rows: r as Record<string, unknown>[] };
                };
                journalEntryId = await postBalancedJournalEntry(q, tenant, {
                  source: "refund",
                  sourceId: refundId,
                  memo: `Refund ${refundId} approved and issued: $${amt}`,
                  lines: isStoreCredit
                    ? [
                        { accountCode: "4000", debit: amt, credit: 0 },
                        { accountCode: "2310", debit: 0, credit: amt },
                      ]
                    : [
                        { accountCode: "4000", debit: amt, credit: 0 },
                        { accountCode: "1000", debit: 0, credit: amt },
                      ],
                });
              }
            } catch (e) { console.error("[GL] approve_refund failed:", e); }
          }
        } else {
          updated = await pgExec(
            `UPDATE public.commerce_payments SET status = 'succeeded' WHERE id = $1::uuid AND tenant_id = $2 AND status IN ('pending','processing')`,
            [paymentId, tenant],
          );
        }
        await auditAction({ action, domain: "commerce", tableName: refundId ? "commerce_refunds" : "commerce_payments", recordId: refundId || paymentId, afterData: { status: refundId ? "completed" : "succeeded", updated, journalEntryId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, refundId: refundId || null, paymentId: paymentId || null, updated, journalEntryId });
      }

      case "reject_refund": {
        // SA-64: a rejection reason is REQUIRED (audit carries it).
        const paymentId = String(payload.payment_id || "");
        const refundId = String(payload.refund_id || "");
        const reason = payload.reason ? String(payload.reason).trim() : "";
        if (!reason) return NextResponse.json({ ok: false, error: "A rejection reason is required" }, { status: 400 });
        let updated = 0;
        if (refundId) {
          updated = await pgExec(
            `UPDATE public.commerce_refunds SET status = 'rejected', rejected_at = now(), rejection_reason = $1
              WHERE id = $2::uuid AND tenant_id = $3`,
            [reason, refundId, resolveTenantId(req)],
          );
        } else {
          updated = await pgExec(
            `UPDATE public.commerce_payments SET status = 'cancelled' WHERE id = $1::uuid AND tenant_id = $2`,
            [paymentId, resolveTenantId(req)],
          );
          if (reason) {
            await pgExec(`UPDATE public.commerce_payments SET external_reference = COALESCE(external_reference || ' | ', '') || $1 WHERE id = $2::uuid`, [`Rejected: ${reason}`, paymentId]);
          }
        }
        await auditAction({ action, domain: "commerce", tableName: refundId ? "commerce_refunds" : "commerce_payments", recordId: refundId || paymentId, afterData: { status: refundId ? "rejected" : "cancelled", reason, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, refundId: refundId || null, paymentId: paymentId || null, updated });
      }

      case "edit_refund": {
        // SA-65: edit with audit. Completed/voided/rejected refunds are
        // closed books — editing them would desync the posted GL, so they
        // get an honest 400 instead of a silent rewrite.
        const refundId = String(payload.refund_id || payload.order_id || "");
        const existing = await pgQuery<{ status: string; amount: string }>(
          `SELECT status, amount::text FROM public.commerce_refunds WHERE id = $1::uuid AND tenant_id = $2`,
          [refundId, resolveTenantId(req)],
        );
        if (!existing[0]) return NextResponse.json({ ok: false, error: `Refund ${refundId} not found` }, { status: 404 });
        if (["completed", "void", "rejected"].includes(existing[0].status)) {
          return NextResponse.json({ ok: false, error: `Refund is '${existing[0].status}' — closed refunds cannot be edited` }, { status: 400 });
        }
        const amount = payload.amount !== undefined ? Number(payload.amount) : null;
        const reason = payload.reason !== undefined ? String(payload.reason) : null;
        const method = payload.refund_method !== undefined ? String(payload.refund_method) : null;
        const updated = await pgExec(
          `UPDATE public.commerce_refunds SET amount = COALESCE($1::numeric, amount),
              reason = COALESCE($2, reason), refund_method = COALESCE($3, refund_method)
            WHERE id = $4::uuid AND tenant_id = $5`,
          [amount, reason, method, refundId, resolveTenantId(req)],
        );
        if (!updated) return NextResponse.json({ ok: false, error: "Refund edit did not land" }, { status: 500 });
        await auditAction({ action, domain: "commerce", tableName: "commerce_refunds", recordId: refundId, afterData: { amount, previousAmount: Number(existing[0].amount), reason, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, refundId, updated });
      }

      case "dispute_refund": {
        const paymentId = String(payload.payment_id || "");
        const refundId = String(payload.refund_id || "");
        const reason = String(payload.reason || payload.notes || "customer_dispute");
        const amount = Number(payload.amount || 0);
        // Resolve the payment when given a refund id — and fall back to the
        // refund's own amount (callers like RefundsView send only notes, so
        // disputes were being created at $0).
        let pid: string | null = paymentId || null;
        let effAmount = amount;
        if (refundId) {
          const rRows = await pgQuery<{ payment_id: string | null; amount: string }>(
            `SELECT payment_id::text, amount::text FROM public.commerce_refunds WHERE id = $1::uuid AND tenant_id = $2`,
            [refundId, resolveTenantId(req)],
          );
          if (!pid) pid = rRows[0]?.payment_id ?? null;
          if (!(effAmount > 0)) effAmount = Number(rRows[0]?.amount || 0);
        }
        const rows = await pgQuery<{ id: string }>(
          `INSERT INTO public.commerce_disputes (id, tenant_id, dispute_number, refund_id, payment_id, reason, status, amount, opened_at, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4::uuid, $5, 'open', $6, now(), now(), now()) RETURNING id`,
          [resolveTenantId(req), `DIS-${Date.now().toString(36).toUpperCase()}`, refundId || null, pid, reason, effAmount],
        );
        const disputeId = rows[0]?.id ?? null;
        if (!disputeId) {
          return NextResponse.json({ ok: false, error: "The dispute could not be opened — the dispute record was not saved" }, { status: 500 });
        }
        if (pid) {
          await pgExec(`UPDATE public.commerce_payments SET status = 'disputed' WHERE id = $1::uuid AND tenant_id = $2`, [pid, resolveTenantId(req)]);
        }
        await auditAction({ action, domain: "commerce", tableName: "commerce_disputes", recordId: disputeId, afterData: { refundId: refundId || null, paymentId: pid, reason, amount: effAmount }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, disputeId, refundId: refundId || null, paymentId: pid, reason, amount: effAmount, message: "Dispute opened" });
      }

      case "void_refund": {
        // SA-66: void a refund that hasn't been processed. No GL reversal is
        // posted because a pre-completion refund has no GL yet (the entry
        // posts at approval/issue-to-completed). A COMPLETED refund cannot
        // be voided — that gets an honest 400 instead of silent success.
        const refundId = String(payload.refund_id || "");
        const reason = payload.reason ? String(payload.reason) : null;
        const existing = await pgQuery<{ status: string }>(
          `SELECT status FROM public.commerce_refunds WHERE id = $1::uuid AND tenant_id = $2`,
          [refundId, resolveTenantId(req)],
        );
        if (!existing[0]) return NextResponse.json({ ok: false, error: `Refund ${refundId} not found` }, { status: 404 });
        if (existing[0].status === "completed") {
          return NextResponse.json({ ok: false, error: "Refund is 'completed' — completed refunds cannot be voided; the GL entry already posted" }, { status: 400 });
        }
        // NOTE: the commerce_refunds status CHECK allows 'void', NOT
        // 'voided' — the old handler wrote 'voided' and every void died on
        // the constraint. Stored status is 'void'.
        if (existing[0].status === "void") {
          return NextResponse.json({ ok: true, refundId, status: "void", updated: 0, idempotent: true });
        }
        const updated = await pgExec(
          `UPDATE public.commerce_refunds SET status = 'void', rejection_reason = COALESCE($1, rejection_reason)
            WHERE id = $2::uuid AND tenant_id = $3 AND status NOT IN ('completed', 'void')`,
          [reason, refundId, resolveTenantId(req)],
        );
        await auditAction({ action, domain: "commerce", tableName: "commerce_refunds", recordId: refundId, afterData: { status: "void", reason, updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, refundId, status: "void", updated });
      }

      case "respond_dispute": {
        // Submit a rebuttal: dispute -> under_review with evidence notes.
        // Evidence is stored LOCALLY on the dispute record (processor-
        // neutral). Only open/under_review disputes can be responded to —
        // a won/lost/accepted dispute is closed, and silently flipping it
        // back to under_review would rewrite history. (Submission of the
        // evidence to Stripe is gated off while the platform is disabled.)
        const disputeId = String(payload.dispute_id || "");
        const notes = payload.notes ? String(payload.notes) : null;
        const existing = await pgQuery<{ status: string }>(
          `SELECT status FROM public.commerce_disputes WHERE id = $1::uuid AND tenant_id = $2`,
          [disputeId, resolveTenantId(req)],
        );
        if (!existing[0]) return NextResponse.json({ ok: false, error: `Dispute ${disputeId} not found` }, { status: 404 });
        if (!["open", "under_review"].includes(existing[0].status)) {
          return NextResponse.json({ ok: false, error: `Dispute is '${existing[0].status}' — closed disputes cannot be responded to` }, { status: 400 });
        }
        const updated = await pgExec(
          `UPDATE public.commerce_disputes SET status = 'under_review', responded_at = now(),
              notes = CASE WHEN $1::text IS NULL THEN notes ELSE COALESCE(notes || E'\n', '') || $1::text END,
              updated_at = now()
            WHERE id = $2::uuid AND tenant_id = $3 AND status IN ('open','under_review')`,
          [notes, disputeId, resolveTenantId(req)],
        );
        if (!updated) return NextResponse.json({ ok: false, error: "Dispute response did not land" }, { status: 500 });
        await auditAction({ action, domain: "commerce", tableName: "commerce_disputes", recordId: disputeId, afterData: { status: "under_review", updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, disputeId, status: "under_review", updated });
      }

      case "accept_dispute": {
        // Concede a dispute: dispute -> lost, funds forfeited. Only an
        // open/under_review dispute can be conceded — accepting a dispute
        // that was already won would falsely forfeit funds.
        const disputeId = String(payload.dispute_id || "");
        const existing = await pgQuery<{ status: string }>(
          `SELECT status FROM public.commerce_disputes WHERE id = $1::uuid AND tenant_id = $2`,
          [disputeId, resolveTenantId(req)],
        );
        if (!existing[0]) return NextResponse.json({ ok: false, error: `Dispute ${disputeId} not found` }, { status: 404 });
        if (!["open", "under_review"].includes(existing[0].status)) {
          return NextResponse.json({ ok: false, error: `Dispute is '${existing[0].status}' — only open disputes can be accepted` }, { status: 400 });
        }
        const updated = await pgExec(
          `UPDATE public.commerce_disputes SET status = 'lost', resolved_at = now(), updated_at = now()
            WHERE id = $1::uuid AND tenant_id = $2 AND status IN ('open','under_review')`,
          [disputeId, resolveTenantId(req)],
        );
        if (!updated) return NextResponse.json({ ok: false, error: "Dispute acceptance did not land" }, { status: 500 });
        await auditAction({ action, domain: "commerce", tableName: "commerce_disputes", recordId: disputeId, afterData: { status: "lost", updated }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, disputeId, status: "lost", updated });
      }

      case "receipt_refund": {
        // SA-47: receipt for a refund. Accepts refund_id (what RefundsView
        // has) as well as the legacy payment_id — the receipt is built from
        // the commerce_refunds row when a refund id is given.
        const paymentId = String(payload.payment_id || "");
        const refundId = String(payload.refund_id || "");
        if (refundId) {
          const rRows = await pgQuery<{ refund_number: string; amount: string; status: string; reason: string | null; refund_method: string | null; processor_reference: string | null; created_at: string; processed_at: string | null }>(
            `SELECT refund_number, amount::text, status, reason, refund_method, processor_reference, created_at::text, processed_at::text
               FROM public.commerce_refunds WHERE id = $1::uuid AND tenant_id = $2`,
            [refundId, resolveTenantId(req)],
          );
          if (rRows.length === 0) return NextResponse.json({ ok: false, error: "Refund not found" }, { status: 404 });
          const r = rRows[0];
          await auditAction({ action, domain: "commerce", tableName: "commerce_refunds", recordId: refundId, afterData: { refundNumber: r.refund_number }, actorUserId: actorId, ipAddress: ip });
          return NextResponse.json({ ok: true, receipt: { refundId, refundNumber: r.refund_number, amount: Number(r.amount), status: r.status, reason: r.reason, method: r.refund_method, processorReference: r.processor_reference, date: r.processed_at || r.created_at }, refundReceipt: { refundId, refundNumber: r.refund_number, amount: Number(r.amount), status: r.status, date: r.processed_at || r.created_at } });
        }
        const rows = await pgQuery<{ payment_number: string; amount: string; status: string; customer_id: string | null; created_at: string }>(
          `SELECT payment_number, amount::text, status, customer_id, created_at::text
             FROM public.commerce_payments WHERE id = $1::uuid AND tenant_id = $2`,
          [paymentId, resolveTenantId(req)],
        );
        if (rows.length === 0) return NextResponse.json({ ok: false, error: "Refund not found" }, { status: 404 });
        const r = rows[0];
        await auditAction({ action, domain: "commerce", tableName: "commerce_payments", recordId: paymentId, afterData: { paymentNumber: r.payment_number }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, refundReceipt: { paymentId, paymentNumber: r.payment_number, amount: Number(r.amount), status: r.status, customerId: r.customer_id, date: r.created_at } });
      }

      case "refund_notes": {
        const paymentId = String(payload.payment_id || "");
        const refundId = String(payload.refund_id || "");
        const note = String(payload.note || "");
        // Resolve the customer: direct payment id, or via the refund row.
        let customerId: string | null = null;
        if (paymentId) {
          const custRows = await pgQuery<{ customer_id: string | null }>(`SELECT customer_id FROM public.commerce_payments WHERE id = $1::uuid AND tenant_id = $2`, [paymentId, resolveTenantId(req)]);
          customerId = custRows[0]?.customer_id ?? null;
        } else if (refundId) {
          const rRows = await pgQuery<{ customer_id: string | null; payment_id: string | null }>(
            `SELECT cp.customer_id, r.payment_id FROM public.commerce_refunds r
               LEFT JOIN public.commerce_payments cp ON cp.id = r.payment_id
              WHERE r.id = $1::uuid AND r.tenant_id = $2`,
            [refundId, resolveTenantId(req)],
          );
          customerId = rRows[0]?.customer_id ?? null;
        }
        if (customerId) {
          await logCustomerNote({ customerId, body: `Refund note for ${refundId ? `refund ${refundId.slice(0, 8)}` : `payment ${paymentId.slice(0, 8)}`}: ${note}`, noteType: "internal" });
        }
        // SA-09: the note always persists — as a crm_notes row when the
        // customer resolves, and in full in the audit log either way.
        await auditAction({ action, domain: "crm", tableName: "crm_notes", recordId: refundId || paymentId, afterData: { note, customerNoted: !!customerId }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, refundId: refundId || null, paymentId: paymentId || null, note, customerNoted: !!customerId, message: customerId ? "Note added" : "Note recorded in the refund audit log (no customer linked to this refund)" });
      }

      case "view_original_refund": {
        // SA-68: read-only view of the original transaction behind a refund.
        // Accepts refund_id (resolves its payment / sale linkage) or a
        // direct payment_id.
        const refundId = String(payload.refund_id || "");
        let paymentId = String(payload.payment_id || "");
        let refundCtx: { refund_number: string; sale_id: string | null; processor_reference: string | null; amount: string } | null = null;
        if (refundId) {
          const rRows = await pgQuery<{ refund_number: string; sale_id: string | null; payment_id: string | null; processor_reference: string | null; amount: string }>(
            `SELECT refund_number, sale_id::text, payment_id::text, processor_reference, amount::text
               FROM public.commerce_refunds WHERE id = $1::uuid AND tenant_id = $2`,
            [refundId, resolveTenantId(req)],
          );
          if (!rRows[0] && !paymentId) return NextResponse.json({ ok: false, error: `Refund ${refundId} not found` }, { status: 404 });
          if (rRows[0]) {
            refundCtx = rRows[0];
            if (!paymentId && rRows[0].payment_id) paymentId = rRows[0].payment_id;
          }
        }
        if (paymentId) {
          const rows = await pgQuery<{ payment_number: string; amount: string; status: string; external_reference: string | null; created_at: string }>(
            `SELECT payment_number, amount::text, status, external_reference, created_at::text
               FROM public.commerce_payments WHERE id = $1::uuid AND tenant_id = $2`,
            [paymentId, resolveTenantId(req)],
          );
          if (rows.length > 0) {
            const r = rows[0];
            await auditAction({ action, domain: "commerce", tableName: "commerce_payments", recordId: paymentId, afterData: { paymentNumber: r.payment_number }, actorUserId: actorId, ipAddress: ip });
            return NextResponse.json({ ok: true, originalPayment: { paymentId, paymentNumber: r.payment_number, amount: Number(r.amount), status: r.status, externalReference: r.external_reference, date: r.created_at }, refund: refundCtx ? { refundId, refundNumber: refundCtx.refund_number, saleId: refundCtx.sale_id } : null });
          }
        }
        if (refundCtx) {
          // No payment row linked — the refund's own origin data is the
          // original-transaction record (sale + processor reference).
          await auditAction({ action, domain: "commerce", tableName: "commerce_refunds", recordId: refundId, afterData: { refundNumber: refundCtx.refund_number }, actorUserId: actorId, ipAddress: ip });
          return NextResponse.json({ ok: true, originalPayment: { paymentId: null, paymentNumber: null, amount: Number(refundCtx.amount), status: "no linked payment row", externalReference: refundCtx.processor_reference, saleId: refundCtx.sale_id, refundNumber: refundCtx.refund_number } });
        }
        return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
      }

      case "check_card_balance": {
        const cardNumber = String(payload.card_number || "");
        const rows = await pgQuery<{ balance: string; status: string; issued_at: string; expires_at: string | null }>(
          `SELECT balance::text, status, issued_at::text, expires_at::text
             FROM public.commerce_gift_cards WHERE card_number = $1 AND tenant_id = $2`,
          [cardNumber, resolveTenantId(req)],
        );
        if (rows.length === 0) return NextResponse.json({ ok: false, error: "Card not found" }, { status: 404 });
        const r = rows[0];
        await auditAction({ action, domain: "acct", tableName: "commerce_gift_cards", recordId: null, afterData: { cardNumber, balance: Number(r.balance), status: r.status }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, cardNumber, balance: Number(r.balance), status: r.status, issuedAt: r.issued_at, expiresAt: r.expires_at });
      }

      case "view_tax_forms": {
        // SA-90 — read-only list of the tenant's REAL payroll_tax_forms
        // rows (B.3.12). Includes each form's payload so the view can offer
        // a genuine download of the recorded form data. No rows → an honest
        // empty list; forms are never invented here.
        const yearFilter = payload.year !== undefined && payload.year !== null && String(payload.year) !== "" ? Number(payload.year) : null;
        const rows = await pgQuery<{ id: string; form_type: string; year: string; quarter: string; status: string; filed_at: string | null; payload: unknown; created_at: string }>(
          `SELECT id, form_type, year::text, quarter::text, status, filed_at::text, payload, created_at::text
             FROM public.payroll_tax_forms
            WHERE tenant_id = $1 AND ($2::int IS NULL OR year = $2::int)
            ORDER BY year DESC, quarter DESC LIMIT 50`,
          [resolveTenantId(req), yearFilter],
        );
        const forms = rows.map(r => ({ id: r.id, formType: r.form_type, year: r.year, quarter: r.quarter, status: r.status, filedAt: r.filed_at, payload: r.payload ?? null, createdAt: r.created_at }));
        await auditAction({ action, domain: "acct", tableName: "payroll_tax_forms", recordId: null, afterData: { count: forms.length }, actorUserId: actorId, ipAddress: ip });
        return NextResponse.json({ ok: true, taxForms: forms, total: forms.length });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action} (short: ${shortAction})` }, { status: 400 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[finance/actions] ${action} failed:`, msg);
    return NextResponse.json({ error: msg, action }, { status: 500 });
  }
}

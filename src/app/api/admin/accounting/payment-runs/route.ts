import { NextRequest, NextResponse } from "next/server";
import { guard, ctx, body } from "../_shared";
import { resolveTenantId, adminAuthorIdFromSession } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";
import { round2, postJournal, nextNumber, bookContext, accountByCode, todayISO } from "@/lib/accounting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/payment-runs — Purchases & Payables →
// Approvals & Payment Runs: the acct_ap_approvals queue (joined to
// the bill or PO it gates), every payable bill with its balance,
// vendor terms and latest approval state, the tenant's approval
// workflow rules (acct_workflows), recent acct_ap_payments with
// their bill applications, and ledger cash across the bank GL
// accounts (acct_bank_accounts carry no balance column — cash is
// read from posted journal lines, the same numbers the books show).
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const approvals = await pgQuery<any>(
      `SELECT a.id::text AS id, a.bill_id::text AS bill_id, a.purchase_order_id::text AS po_id,
              a.sequence_no, a.status::text AS status, a.acted_at::text AS acted_at, a.comments,
              b.bill_number, b.total::text AS bill_total, b.due_date::text AS bill_due,
              po.po_number, po.total::text AS po_total,
              v.legal_name AS vendor_name
         FROM public.acct_ap_approvals a
         LEFT JOIN public.acct_ap_bills b ON b.id = a.bill_id
         LEFT JOIN public.acct_ap_purchase_orders po ON po.id = a.purchase_order_id
         LEFT JOIN public.acct_vendors v ON v.id = COALESCE(b.vendor_id, po.vendor_id)
        WHERE a.tenant_id = $1
        ORDER BY (a.status = 'pending') DESC, a.sequence_no ASC, a.acted_at DESC NULLS FIRST
        LIMIT 200`,
      [tenant],
    );
    const bills = await pgQuery<any>(
      `SELECT b.id::text AS id, b.bill_number, b.due_date::text AS due_date, b.bill_date::text AS bill_date,
              b.total::text, b.amount_paid::text, b.amount_credited::text, b.discount_total::text, b.status,
              v.id::text AS vendor_id, v.legal_name AS vendor_name, v.payment_terms_days,
              (SELECT a.status::text FROM public.acct_ap_approvals a
                WHERE a.bill_id = b.id ORDER BY a.sequence_no DESC LIMIT 1) AS approval_status
         FROM public.acct_ap_bills b
         JOIN public.acct_vendors v ON v.id = b.vendor_id
        WHERE b.tenant_id = $1
          AND b.status IN ('open','partially_paid','received')
          AND (b.total - b.amount_paid - b.amount_credited) > 0
        ORDER BY b.due_date ASC
        LIMIT 300`,
      [tenant],
    );
    const workflows = await pgQuery<any>(
      `SELECT id::text AS id, name, entity_type, threshold_amount::text, is_active
         FROM public.acct_workflows WHERE tenant_id = $1 ORDER BY name`,
      [tenant],
    );
    const payments = await pgQuery<any>(
      `SELECT p.id::text AS id, p.payment_number, p.payment_date::text AS payment_date,
              p.amount::text, p.payment_method, p.status, p.reference,
              v.legal_name AS vendor_name,
              (SELECT string_agg(b.bill_number, ', ') FROM public.acct_ap_payment_applications a
                JOIN public.acct_ap_bills b ON b.id = a.bill_id WHERE a.payment_id = p.id) AS applied_bills
         FROM public.acct_ap_payments p
         LEFT JOIN public.acct_vendors v ON v.id = p.vendor_id
        WHERE p.tenant_id = $1
        ORDER BY p.payment_date DESC, p.payment_number DESC
        LIMIT 50`,
      [tenant],
    );
    const cash = await pgQuery<any>(
      `SELECT COALESCE(SUM(l.debit - l.credit), 0)::text AS cash
         FROM public.acct_journal_lines l
         JOIN public.acct_chart_of_accounts a ON a.id = l.account_id
         JOIN public.acct_journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
        WHERE l.tenant_id = $1 AND a.code IN ('1000','1010','1020','1021','1022','1030','1040','1050','1060')`,
      [tenant],
    );
    const bankAccounts = await pgQuery<any>(
      `SELECT name, institution_name, masked_account_number FROM public.acct_bank_accounts
        WHERE tenant_id = $1 AND is_active = true ORDER BY name`,
      [tenant],
    );
    return NextResponse.json({
      approvals: approvals.map((a) => ({
        id: a.id, billId: a.bill_id, poId: a.po_id, sequenceNo: a.sequence_no, status: a.status,
        actedAt: a.acted_at, comments: a.comments,
        reference: a.bill_number || a.po_number || "—",
        amount: Number(a.bill_total ?? a.po_total ?? 0),
        dueDate: a.bill_due, vendorName: a.vendor_name,
      })),
      payableBills: bills.map((b) => ({
        id: b.id, billNumber: b.bill_number, dueDate: b.due_date, billDate: b.bill_date,
        total: Number(b.total), amountPaid: Number(b.amount_paid), amountCredited: Number(b.amount_credited),
        discountTotal: Number(b.discount_total), balance: round2(Number(b.total) - Number(b.amount_paid) - Number(b.amount_credited)),
        status: b.status, vendorId: b.vendor_id, vendorName: b.vendor_name,
        paymentTermsDays: b.payment_terms_days, approvalStatus: b.approval_status,
      })),
      workflows: workflows.map((w) => ({
        id: w.id, name: w.name, entityType: w.entity_type,
        thresholdAmount: w.threshold_amount === null ? null : Number(w.threshold_amount), isActive: !!w.is_active,
      })),
      recentPayments: payments.map((p) => ({
        id: p.id, paymentNumber: p.payment_number, paymentDate: p.payment_date, amount: Number(p.amount),
        paymentMethod: p.payment_method, status: p.status, reference: p.reference,
        vendorName: p.vendor_name, appliedBills: p.applied_bills,
      })),
      liquidCash: Number(cash[0]?.cash || 0),
      bankAccounts: bankAccounts.map((a) => ({ name: a.name, institution: a.institution_name, masked: a.masked_account_number })),
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/payment-runs]", e);
    return NextResponse.json({ error: e?.message || "Failed to load payment runs" }, { status: 500 });
  }
}

// POST /api/admin/accounting/payment-runs — actions:
//  request_approval { bill_id }
//    → inserts a pending acct_ap_approvals row for the bill.
//  decide { approval_id, decision: "approved"|"rejected", comments? }
//    → writes status, acted_at, comments, approver on the approval.
//  run { items: [{ bill_id, discount_percent?, method? }] }
//    → for each bill: posts DR AP (2050) for the full balance,
//      CR cash (1000) for the net, CR the bill's first expense line
//      for any early-payment discount taken; inserts the
//      acct_ap_payments row + acct_ap_payment_applications row and
//      settles the bill (discount recorded in discount_total and
//      amount_credited so the balance reaches zero honestly).
export async function POST(req: NextRequest) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const b = await body(req);

    if (b.action === "request_approval") {
      if (!b.bill_id) throw new Error("bill_id is required");
      const { data: bill } = await db.from("acct_ap_bills").select("id, status").eq("id", b.bill_id).eq("tenant_id", tenant).single();
      if (!bill) throw new Error("Bill not found");
      const { count } = await db.from("acct_ap_approvals").select("id", { count: "exact", head: true }).eq("bill_id", b.bill_id);
      const { data, error } = await db.from("acct_ap_approvals").insert({
        tenant_id: tenant, bill_id: b.bill_id, sequence_no: (count || 0) + 1, status: "pending",
      }).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
    }

    if (b.action === "decide") {
      if (!b.approval_id || !["approved", "rejected"].includes(b.decision)) {
        throw new Error("Pick approve or reject for this approval");
      }
      const approverId = await adminAuthorIdFromSession().catch(() => null);
      const { error } = await db.from("acct_ap_approvals").update({
        status: b.decision, acted_at: new Date().toISOString(),
        comments: b.comments || null, approver_id: approverId,
      }).eq("id", b.approval_id).eq("tenant_id", tenant).eq("status", "pending");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (b.action !== "run") throw new Error("Unknown action");
    const items: any[] = (Array.isArray(b.items) ? b.items : []).filter((i: any) => i && i.bill_id);
    if (!items.length) throw new Error("Select at least one bill for this payment run");
    const { entityId } = await bookContext(db, tenant);
    const cashAcct = await accountByCode(db, tenant, "1000");
    if (!cashAcct) throw new Error("No cash account (1000) exists in the chart of accounts");

    const created: any[] = [];
    for (const item of items) {
      const { data: bill } = await db.from("acct_ap_bills").select("*").eq("id", item.bill_id).eq("tenant_id", tenant).single();
      if (!bill) throw new Error("A selected bill could not be found");
      const balance = round2(Number(bill.total) - Number(bill.amount_paid) - Number(bill.amount_credited));
      if (balance <= 0) throw new Error(`Bill ${bill.bill_number} has no balance left to pay`);
      const pct = Math.max(0, Math.min(100, Number(item.discount_percent) || 0));
      const discount = round2((balance * pct) / 100);
      const net = round2(balance - discount);

      const journalLines: { accountCode: string; debit: number; credit: number; memo?: string }[] = [
        { accountCode: "2050", debit: balance, credit: 0, memo: `Payment run — bill ${bill.bill_number}` },
        { accountCode: "1000", debit: 0, credit: net, memo: `Payment run — bill ${bill.bill_number}` },
      ];
      if (discount > 0) {
        const { data: firstLine } = await db.from("acct_ap_bill_lines")
          .select("expense_account_id").eq("bill_id", bill.id).order("line_no").limit(1).single();
        let discountCode = "5000";
        if (firstLine?.expense_account_id) {
          const { data: acct } = await db.from("acct_chart_of_accounts").select("code").eq("id", firstLine.expense_account_id).single();
          if (acct?.code) discountCode = String(acct.code);
        }
        journalLines.push({ accountCode: discountCode, debit: 0, credit: discount, memo: `Early-payment discount taken on bill ${bill.bill_number}` });
      }
      const journalId = await postJournal(db, {
        source: "vendor_payment", sourceId: bill.id,
        memo: `Payment run — bill ${bill.bill_number}${discount > 0 ? ` (discount ${discount})` : ""}`,
        lines: journalLines,
      });

      const paymentNumber = await nextNumber(db, "acct_ap_payments", "payment_number", "PAY", tenant);
      const { data: pay, error } = await db.from("acct_ap_payments").insert({
        tenant_id: tenant, entity_id: entityId, vendor_id: bill.vendor_id,
        payment_number: paymentNumber, payment_date: todayISO(), currency: "USD",
        amount: net, payment_method: item.method || "ach", status: "posted",
        cash_account_id: cashAcct.id, reference: bill.bill_number, posted_journal_id: journalId,
      }).select("id").single();
      if (error) throw new Error(error.message);
      const { error: appErr } = await db.from("acct_ap_payment_applications").insert({
        payment_id: pay.id, bill_id: bill.id, applied_amount: balance,
      });
      if (appErr) throw new Error(appErr.message);
      const { error: billErr } = await db.from("acct_ap_bills").update({
        amount_paid: round2(Number(bill.amount_paid) + net),
        amount_credited: round2(Number(bill.amount_credited) + discount),
        discount_total: round2(Number(bill.discount_total) + discount),
        status: "paid",
      }).eq("id", bill.id);
      if (billErr) throw new Error(billErr.message);
      created.push({ payment_id: pay.id, payment_number: paymentNumber, bill_number: bill.bill_number, net, discount });
    }
    return NextResponse.json({ ok: true, payments: created }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Payment run failed" }, { status: 400 });
  }
}

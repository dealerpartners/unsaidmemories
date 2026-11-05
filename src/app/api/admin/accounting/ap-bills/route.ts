import { NextRequest, NextResponse } from "next/server";
import { guard, ctx, body } from "../_shared";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";
import { round2, postJournal, nextNumber, bookContext, todayISO } from "@/lib/accounting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/ap-bills — Purchases & Payables →
// Bills & Expenses: every acct_ap_bills row with vendor, terms,
// balance, the first line's GL category and PO reference, plus all
// lines (for the posting preview), the tenant's expense reports
// (acct_expense_reports + lines), vendors and expense accounts for
// the record forms. Read model is computed at request time — no
// stored rollups to drift.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const bills = await pgQuery<any>(
      `SELECT b.id::text AS id, b.bill_number, b.bill_date::text AS bill_date, b.due_date::text AS due_date,
              b.currency, b.subtotal::text, b.tax_total::text, b.total::text,
              b.amount_paid::text, b.amount_credited::text, b.status, b.external_id,
              b.posted_journal_id::text AS posted_journal_id,
              v.id::text AS vendor_id, v.legal_name AS vendor_name, v.payment_terms_days,
              (SELECT l.purchase_order_ref FROM public.acct_ap_bill_lines l
                WHERE l.bill_id = b.id AND l.purchase_order_ref IS NOT NULL
                ORDER BY l.line_no LIMIT 1) AS po_reference,
              (SELECT a.code || ' · ' || a.name FROM public.acct_ap_bill_lines l
                JOIN public.acct_chart_of_accounts a ON a.id = l.expense_account_id
                WHERE l.bill_id = b.id ORDER BY l.line_no LIMIT 1) AS gl_category
         FROM public.acct_ap_bills b
         JOIN public.acct_vendors v ON v.id = b.vendor_id
        WHERE b.tenant_id = $1
        ORDER BY b.due_date ASC, b.bill_date DESC
        LIMIT 500`,
      [tenant],
    );
    const lines = bills.length
      ? await pgQuery<any>(
          `SELECT l.bill_id::text AS bill_id, l.line_no, l.description, l.quantity::text, l.unit_cost::text,
                  l.line_subtotal::text, l.tax_amount::text, l.purchase_order_ref, l.item_ref,
                  a.code AS account_code, a.name AS account_name
             FROM public.acct_ap_bill_lines l
             JOIN public.acct_chart_of_accounts a ON a.id = l.expense_account_id
            WHERE l.bill_id = ANY($1::uuid[])
            ORDER BY l.bill_id, l.line_no`,
          [bills.map((b) => b.id)],
        )
      : [];
    const linesByBill = new Map<string, any[]>();
    for (const l of lines) {
      const arr = linesByBill.get(l.bill_id) || [];
      arr.push({
        lineNo: l.line_no, description: l.description, quantity: Number(l.quantity),
        unitCost: Number(l.unit_cost), lineSubtotal: Number(l.line_subtotal), taxAmount: Number(l.tax_amount),
        purchaseOrderRef: l.purchase_order_ref, itemRef: l.item_ref,
        accountCode: l.account_code, accountName: l.account_name,
      });
      linesByBill.set(l.bill_id, arr);
    }
    const expenseReports = await pgQuery<any>(
      `SELECT r.id::text AS id, r.report_number, r.report_date::text AS report_date, r.currency,
              r.total_amount::text, r.status::text AS status, r.employee_id,
              COUNT(l.id)::int AS line_count
         FROM public.acct_expense_reports r
         LEFT JOIN public.acct_expense_lines l ON l.expense_report_id = r.id
        WHERE r.tenant_id = $1
        GROUP BY r.id
        ORDER BY r.report_date DESC
        LIMIT 200`,
      [tenant],
    );
    const vendors = await pgQuery<any>(
      `SELECT id::text AS id, legal_name, payment_terms_days FROM public.acct_vendors
        WHERE tenant_id = $1 AND is_active = true ORDER BY legal_name`,
      [tenant],
    );
    const accounts = await pgQuery<any>(
      `SELECT id::text AS id, code, name FROM public.acct_chart_of_accounts
        WHERE tenant_id = $1 AND account_type = 'expense' AND is_active = true ORDER BY code`,
      [tenant],
    );
    return NextResponse.json({
      bills: bills.map((b) => ({
        id: b.id, billNumber: b.bill_number, billDate: b.bill_date, dueDate: b.due_date,
        currency: b.currency || "USD", subtotal: Number(b.subtotal), taxTotal: Number(b.tax_total),
        total: Number(b.total), amountPaid: Number(b.amount_paid), amountCredited: Number(b.amount_credited),
        balance: round2(Number(b.total) - Number(b.amount_paid) - Number(b.amount_credited)),
        status: b.status, externalId: b.external_id, postedJournalId: b.posted_journal_id,
        vendorId: b.vendor_id, vendorName: b.vendor_name, paymentTermsDays: b.payment_terms_days,
        poReference: b.po_reference || b.external_id || null,
        glCategory: b.gl_category,
        lines: linesByBill.get(b.id) || [],
      })),
      expenseReports: expenseReports.map((r) => ({
        id: r.id, reportNumber: r.report_number, reportDate: r.report_date, currency: r.currency || "USD",
        totalAmount: Number(r.total_amount), status: r.status, employeeId: r.employee_id, lineCount: r.line_count,
      })),
      vendors: vendors.map((v) => ({ id: v.id, name: v.legal_name, paymentTermsDays: v.payment_terms_days })),
      expenseAccounts: accounts.map((a) => ({ id: a.id, code: a.code, name: a.name })),
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/ap-bills]", e);
    return NextResponse.json({ error: e?.message || "Failed to load bills" }, { status: 500 });
  }
}

// POST /api/admin/accounting/ap-bills
//  { action: "create_bill", vendor_id, bill_date?, due_date?, po_reference?,
//    lines: [{ description, quantity, unit_cost, expense_account_id, tax_amount? }] }
//    → inserts the bill + lines and posts DR expense / CR AP (2050).
//  { action: "create_expense", expense_date, merchant?, description, amount,
//    expense_account_id }
//    → inserts an acct_expense_reports row (draft) + one expense line.
export async function POST(req: NextRequest) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const b = await body(req);
    const { entityId } = await bookContext(db, tenant);

    if (b.action === "create_expense") {
      if (!b.description || !(Number(b.amount) > 0) || !b.expense_account_id) {
        throw new Error("An expense needs a description, an amount, and a GL account");
      }
      const reportNumber = await nextNumber(db, "acct_expense_reports", "report_number", "EXP", tenant);
      const { data: report, error } = await db.from("acct_expense_reports").insert({
        tenant_id: tenant, entity_id: entityId, employee_id: b.employee_id || null,
        report_number: reportNumber, report_date: b.expense_date || todayISO(), currency: "USD",
        total_amount: round2(Number(b.amount)), status: "draft",
      }).select("id").single();
      if (error) throw new Error(error.message);
      const { error: lineErr } = await db.from("acct_expense_lines").insert({
        expense_report_id: report.id, expense_date: b.expense_date || todayISO(),
        merchant: b.merchant || null, description: b.description, amount: round2(Number(b.amount)),
        tax_amount: 0, expense_account_id: b.expense_account_id, dimensions: {},
      });
      if (lineErr) throw new Error(lineErr.message);
      return NextResponse.json({ ok: true, id: report.id, report_number: reportNumber }, { status: 201 });
    }

    if (b.action !== "create_bill") throw new Error("Unknown action");
    if (!b.vendor_id) throw new Error("Pick the vendor this bill is from");
    const rawLines: any[] = Array.isArray(b.lines) ? b.lines : [];
    const lines = rawLines.filter((l) => l && l.description && Number(l.quantity) > 0 && l.expense_account_id);
    if (!lines.length) throw new Error("Add at least one bill line with a description, quantity, and GL account");

    const subtotal = round2(lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_cost || 0), 0));
    const taxTotal = round2(lines.reduce((s, l) => s + Number(l.tax_amount || 0), 0));
    const total = round2(subtotal + taxTotal);
    const billDate = b.bill_date || todayISO();
    let dueDate: string | null = b.due_date || null;
    if (!dueDate) {
      const { data: vendor } = await db.from("acct_vendors").select("payment_terms_days").eq("id", b.vendor_id).eq("tenant_id", tenant).single();
      const d = new Date(`${billDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + (Number(vendor?.payment_terms_days) || 30));
      dueDate = d.toISOString().slice(0, 10);
    }

    const journalLines = lines.map((l) => ({
      accountCode: "", debit: round2(Number(l.quantity) * Number(l.unit_cost || 0) + Number(l.tax_amount || 0)), credit: 0,
      _accountId: l.expense_account_id as string,
    }));
    // postJournal keys lines by account code — resolve codes for the chosen accounts.
    const acctIds = [...new Set(journalLines.map((l) => l._accountId))];
    const { data: accts } = await db.from("acct_chart_of_accounts").select("id, code").in("id", acctIds);
    const codeById = new Map((accts || []).map((a: any) => [a.id, String(a.code)]));
    for (const l of journalLines) {
      const code = codeById.get(l._accountId);
      if (!code) throw new Error("One of the line GL accounts could not be found");
      l.accountCode = code;
    }
    const journalId = await postJournal(db, {
      source: "vendor_bill", memo: `Vendor bill from vendor ${b.vendor_id}`,
      lines: [
        ...journalLines.map(({ accountCode, debit, credit }) => ({ accountCode, debit, credit })),
        { accountCode: "2050", debit: 0, credit: total },
      ],
    });

    const billNumber = await nextNumber(db, "acct_ap_bills", "bill_number", "BILL", tenant);
    const { data: bill, error } = await db.from("acct_ap_bills").insert({
      tenant_id: tenant, entity_id: entityId, vendor_id: b.vendor_id, bill_number: billNumber,
      bill_date: billDate, due_date: dueDate, currency: "USD", exchange_rate: 1,
      subtotal, tax_total: taxTotal, discount_total: 0, total,
      amount_paid: 0, amount_credited: 0, status: "open",
      external_id: b.po_reference || null, source_system: "manual", posted_journal_id: journalId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const { error: lineErr } = await db.from("acct_ap_bill_lines").insert(lines.map((l, i) => ({
      tenant_id: tenant, bill_id: bill.id, line_no: i + 1, description: l.description,
      quantity: Number(l.quantity), unit_cost: Number(l.unit_cost || 0),
      line_subtotal: round2(Number(l.quantity) * Number(l.unit_cost || 0)),
      tax_amount: Number(l.tax_amount || 0), expense_account_id: l.expense_account_id,
      purchase_order_ref: b.po_reference || null, dimensions: {},
    })));
    if (lineErr) throw new Error(lineErr.message);
    return NextResponse.json({ ok: true, id: bill.id, bill_number: billNumber, journal_id: journalId }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to save" }, { status: 400 });
  }
}

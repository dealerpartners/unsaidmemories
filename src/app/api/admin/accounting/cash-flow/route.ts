import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/cash-flow
//
// Banking & Cash → Cash Flow & Forecasting. The projection is computed
// from real obligations only:
//  - starting cash = posted ledger balances of the bank accounts' GL
//    accounts (same figure as Cards & Bank Accounts)
//  - money in  = open AR invoices (balance due) on their due dates,
//    plus projected runs of active recurring invoices
//  - money out = open AP bills (balance due) on their due dates
// Overdue items are pulled to day 0 and flagged. The response carries
// the dated items and a 13-week cumulative series; the what-if
// sandbox in the page re-derives its own series client-side from the
// same items and is labeled a simulation.

const HORIZON_DAYS = 90;

function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

function stepDate(d: Date, frequency: string, interval: number): Date {
  const x = new Date(d);
  switch ((frequency || "monthly").toLowerCase()) {
    case "weekly": x.setDate(x.getDate() + 7 * interval); return x;
    case "biweekly": x.setDate(x.getDate() + 14 * interval); return x;
    case "quarterly": return addMonths(x, 3 * interval);
    case "yearly": case "annually": return addMonths(x, 12 * interval);
    case "daily": x.setDate(x.getDate() + interval); return x;
    default: return addMonths(x, interval); // monthly
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizonEnd = new Date(today);
    horizonEnd.setDate(horizonEnd.getDate() + HORIZON_DAYS);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const [cash] = await pgQuery<{ bal: string }>(
      `SELECT COALESCE(SUM(l.debit - l.credit), 0)::text AS bal
         FROM public.acct_journal_lines l
         JOIN public.acct_journal_entries e
           ON e.id = l.journal_entry_id AND e.tenant_id = l.tenant_id
        WHERE l.tenant_id = $1 AND e.status = 'posted'
          AND l.account_id IN (SELECT gl_account_id FROM public.acct_bank_accounts
                                WHERE tenant_id = $1 AND gl_account_id IS NOT NULL AND is_active = true)`,
      [tenant],
    );
    const startingCash = Number(cash?.bal || 0);

    type Item = { date: string; kind: "in" | "out"; label: string; detail: string; amount: number; overdue: boolean };
    const items: Item[] = [];

    const ar = await pgQuery<{
      invoice_number: string; due_date: string; balance: string; customer: string | null;
    }>(
      `SELECT i.invoice_number, i.due_date::text AS due_date,
              (i.total - i.amount_paid - i.amount_credited - i.deposit_paid)::text AS balance,
              c.legal_name AS customer
         FROM public.acct_ar_invoices i
         LEFT JOIN public.acct_customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
        WHERE i.tenant_id = $1
          AND i.status NOT IN ('paid','void','draft','cancelled')
          AND (i.total - i.amount_paid - i.amount_credited - i.deposit_paid) > 0
        ORDER BY i.due_date ASC`,
      [tenant],
    );
    for (const r of ar) {
      const due = new Date(r.due_date);
      const overdue = due < today;
      items.push({
        date: iso(overdue ? today : due), kind: "in",
        label: `Invoice ${r.invoice_number}`,
        detail: r.customer ? `Due from ${r.customer}${overdue ? ` · was due ${r.due_date}` : ""}` : overdue ? `Was due ${r.due_date}` : "Open invoice",
        amount: Number(r.balance), overdue,
      });
    }

    const ap = await pgQuery<{
      bill_number: string; due_date: string; balance: string; vendor: string | null;
    }>(
      `SELECT b.bill_number, b.due_date::text AS due_date,
              (b.total - b.amount_paid - b.amount_credited)::text AS balance,
              v.legal_name AS vendor
         FROM public.acct_ap_bills b
         LEFT JOIN public.acct_vendors v ON v.id = b.vendor_id AND v.tenant_id = b.tenant_id
        WHERE b.tenant_id = $1
          AND b.status NOT IN ('paid','void','cancelled','draft')
          AND (b.total - b.amount_paid - b.amount_credited) > 0
        ORDER BY b.due_date ASC`,
      [tenant],
    );
    for (const r of ap) {
      const due = new Date(r.due_date);
      const overdue = due < today;
      items.push({
        date: iso(overdue ? today : due), kind: "out",
        label: `Bill ${r.bill_number}`,
        detail: r.vendor ? `Owed to ${r.vendor}${overdue ? ` · was due ${r.due_date}` : ""}` : overdue ? `Was due ${r.due_date}` : "Open bill",
        amount: Number(r.balance), overdue,
      });
    }

    const recurring = await pgQuery<{
      template_number: string; name: string | null; frequency: string; interval_count: number | null;
      next_run_date: string | null; next_run_on: string | null; total: string;
      occurrences_limit: number | null; occurrences_done: number | null; customer: string | null;
    }>(
      `SELECT r.template_number, r.name, r.frequency, r.interval_count,
              r.next_run_date::text AS next_run_date, r.next_run_on::text AS next_run_on,
              r.total::text AS total, r.occurrences_limit, r.occurrences_done,
              c.legal_name AS customer
         FROM public.acct_recurring_invoices r
         LEFT JOIN public.acct_customers c ON c.id = r.customer_id AND c.tenant_id = r.tenant_id
        WHERE r.tenant_id = $1 AND r.status = 'active'`,
      [tenant],
    );
    for (const r of recurring) {
      const first = r.next_run_on || r.next_run_date;
      if (!first) continue;
      let d = new Date(first);
      let made = Number(r.occurrences_done || 0);
      let guard = 0;
      while (d <= horizonEnd && guard++ < 60) {
        if (r.occurrences_limit != null && made >= r.occurrences_limit) break;
        if (d >= today) {
          items.push({
            date: iso(d), kind: "in",
            label: `Recurring ${r.template_number}`,
            detail: `${r.name || r.frequency} billing${r.customer ? ` · ${r.customer}` : ""} (projected run)`,
            amount: Number(r.total), overdue: false,
          });
        }
        made++;
        d = stepDate(d, r.frequency, Math.max(1, Number(r.interval_count || 1)));
      }
    }

    items.sort((a, b) => a.date.localeCompare(b.date));

    const weeks: { start: string; end: string; inflow: number; outflow: number; net: number; balance: number }[] = [];
    let balance = startingCash;
    for (let w = 0; w < 13; w++) {
      const start = new Date(today);
      start.setDate(start.getDate() + w * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const inSum = items.filter((i) => i.kind === "in" && i.date >= iso(start) && i.date <= iso(end)).reduce((s, i) => s + i.amount, 0);
      const outSum = items.filter((i) => i.kind === "out" && i.date >= iso(start) && i.date <= iso(end)).reduce((s, i) => s + i.amount, 0);
      balance += inSum - outSum;
      weeks.push({ start: iso(start), end: iso(end), inflow: inSum, outflow: outSum, net: inSum - outSum, balance });
    }

    return NextResponse.json({
      asOf: iso(today),
      horizonDays: HORIZON_DAYS,
      startingCash,
      items,
      weeks,
      totals: {
        inflow: items.reduce((s, i) => s + (i.kind === "in" ? i.amount : 0), 0),
        outflow: items.reduce((s, i) => s + (i.kind === "out" ? i.amount : 0), 0),
        overdueIn: items.filter((i) => i.overdue && i.kind === "in").reduce((s, i) => s + i.amount, 0),
        overdueOut: items.filter((i) => i.overdue && i.kind === "out").reduce((s, i) => s + i.amount, 0),
      },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/cash-flow]", e);
    return NextResponse.json({ error: e?.message || "Failed to load cash flow forecast" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/service-items — Purchases & Payables →
// Service Items & Rates.
//
// STORAGE NOTE (verified against the live schema): there is no
// acct_* service-items table, and the tables literally named
// service_items / crm_services are the AAPawZ grooming-booking
// catalogs (size-based pet prices, durations, deposits) — the
// wrong domain for the books, with no rate or GL columns. The
// accounting system's service catalog is the chart of accounts
// itself — revenue accounts are the services the business sells,
// expense accounts are the services and costs it buys — which is
// what the previous version of this page already read. This route
// returns those accounts with their posted ledger activity, plus
// the analyzer aggregates: realized billable revenue vs the
// burdened labor cost family (COGS 5xxx — direct labor, payroll
// taxes & fringe, subcontractors) so margin is computed from
// posted journals, never from a stored "rate card" that does not
// exist in this schema.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const rows = await pgQuery<any>(
      `SELECT a.id::text AS id, a.code, a.name, a.account_type, a.subtype, a.is_active,
              COALESCE(SUM(l.debit) FILTER (WHERE e.status = 'posted'), 0)::text AS debits,
              COALESCE(SUM(l.credit) FILTER (WHERE e.status = 'posted'), 0)::text AS credits
         FROM public.acct_chart_of_accounts a
         LEFT JOIN public.acct_journal_lines l
           ON l.account_id = a.id AND l.tenant_id = a.tenant_id
         LEFT JOIN public.acct_journal_entries e
           ON e.id = l.journal_entry_id
        WHERE a.tenant_id = $1 AND a.account_type IN ('revenue','expense')
        GROUP BY a.id
        ORDER BY a.account_type, a.code`,
      [tenant],
    );
    const items = rows.map((r: any) => {
      const debits = Number(r.debits || 0);
      const credits = Number(r.credits || 0);
      const realized = r.account_type === "revenue" ? credits - debits : debits - credits;
      return {
        id: r.id, code: r.code, name: r.name, accountType: r.account_type,
        subtype: r.subtype, isActive: !!r.is_active, realized,
      };
    });
    const revenue = items.filter((i: any) => i.accountType === "revenue");
    const expenses = items.filter((i: any) => i.accountType === "expense");
    const billableRevenue = revenue.reduce((s: number, i: any) => s + i.realized, 0);
    const laborCosts = expenses.filter((i: any) => /^5/.test(i.code));
    const burdenedCost = laborCosts.reduce((s: number, i: any) => s + i.realized, 0);
    return NextResponse.json({
      items,
      analyzer: {
        billableRevenue,
        burdenedCost,
        marginPct: billableRevenue > 0 ? Math.round(((billableRevenue - burdenedCost) / billableRevenue) * 1000) / 10 : null,
        laborCostLines: laborCosts,
        revenueLines: revenue.length, expenseLines: expenses.length,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/service-items]", e);
    return NextResponse.json({ error: e?.message || "Failed to load service items" }, { status: 500 });
  }
}

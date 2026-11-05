import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId, adminAuthorIdFromSession } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/admin/accounting/budgets
//
// Banking & Cash / Reporting → Budgets & Forecasts.
// GET returns the budget versions and, for the selected one, the
// Budget vs Actual ledger: acct_budget_lines per chart account
// against REALIZED actuals from posted journal lines (signed into
// each account's natural direction by normal_balance). MTD figures
// use the acct_periods period that contains today. It also returns
// the two summary views the design calls for, computed from the
// same live data: cash runway (bank GL cash vs average monthly net
// burn from posted cash activity) and the replenishment cash-out
// (open AP bills falling due in the next 30 days).
//
// POST actions: create_version, add_line, set_status (approve) —
// real writes to acct_budget_versions / acct_budget_lines.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const versionId = req.nextUrl.searchParams.get("version") || "";

    const versions = await pgQuery<{
      id: string; name: string; fiscal_year: number; version_no: number;
      scenario: string; status: string; approved_at: string | null; line_count: number;
    }>(
      `SELECT v.id::text AS id, v.name, v.fiscal_year, v.version_no, v.scenario, v.status,
              v.approved_at::text AS approved_at,
              (SELECT COUNT(*) FROM public.acct_budget_lines l WHERE l.budget_id = v.id)::int AS line_count
         FROM public.acct_budget_versions v
        WHERE v.tenant_id = $1
        ORDER BY v.fiscal_year DESC, v.version_no DESC`,
      [tenant],
    );

    const periods = await pgQuery<{ id: string; name: string; start_date: string; end_date: string }>(
      `SELECT id::text AS id, name, start_date::text AS start_date, end_date::text AS end_date
         FROM public.acct_periods WHERE tenant_id = $1 ORDER BY start_date ASC`,
      [tenant],
    );
    const accounts = await pgQuery<{ id: string; code: string; name: string; account_type: string }>(
      `SELECT id::text AS id, code, name, account_type FROM public.acct_chart_of_accounts
        WHERE tenant_id = $1 AND is_active = true ORDER BY code ASC`,
      [tenant],
    );

    const version = versions.find((v) => v.id === versionId) || versions[0] || null;

    let rows: any[] = [];
    let unbudgetedActual = 0;
    if (version) {
      const currentPeriod = periods.find((p) => {
        const now = new Date().toISOString().slice(0, 10);
        return p.start_date <= now && p.end_date >= now;
      });
      const detail = await pgQuery<{
        account_id: string; code: string; name: string; account_type: string; normal_balance: string;
        annual_budget: string; mtd_budget: string; annual_actual: string; mtd_actual: string;
      }>(
        `SELECT coa.id::text AS account_id, coa.code, coa.name, coa.account_type, coa.normal_balance,
                COALESCE((SELECT SUM(l.amount) FROM public.acct_budget_lines l
                           WHERE l.budget_id = $2 AND l.account_id = coa.id), 0)::text AS annual_budget,
                COALESCE((SELECT SUM(l.amount) FROM public.acct_budget_lines l
                           WHERE l.budget_id = $2 AND l.account_id = coa.id
                             ${currentPeriod ? "AND l.period_id = $3" : "AND false"}), 0)::text AS mtd_budget,
                COALESCE((SELECT SUM(jl.debit - jl.credit) FROM public.acct_journal_lines jl
                           JOIN public.acct_journal_entries je
                             ON je.id = jl.journal_entry_id AND je.tenant_id = jl.tenant_id
                          WHERE jl.tenant_id = $1 AND jl.account_id = coa.id AND je.status = 'posted'
                            AND EXTRACT(YEAR FROM je.entry_date) = $4), 0)::text AS annual_actual,
                COALESCE((SELECT SUM(jl.debit - jl.credit) FROM public.acct_journal_lines jl
                           JOIN public.acct_journal_entries je
                             ON je.id = jl.journal_entry_id AND je.tenant_id = jl.tenant_id
                          WHERE jl.tenant_id = $1 AND jl.account_id = coa.id AND je.status = 'posted'
                            ${currentPeriod ? "AND je.entry_date >= $5 AND je.entry_date <= $6" : "AND false"}), 0)::text AS mtd_actual
           FROM public.acct_chart_of_accounts coa
          WHERE coa.tenant_id = $1
            AND (EXISTS (SELECT 1 FROM public.acct_budget_lines l WHERE l.budget_id = $2 AND l.account_id = coa.id)
                 OR EXISTS (SELECT 1 FROM public.acct_journal_lines jl
                              JOIN public.acct_journal_entries je
                                ON je.id = jl.journal_entry_id AND je.tenant_id = jl.tenant_id
                             WHERE jl.tenant_id = $1 AND jl.account_id = coa.id AND je.status = 'posted'
                               AND EXTRACT(YEAR FROM je.entry_date) = $4))
          ORDER BY coa.code ASC`,
        currentPeriod
          ? [tenant, version.id, currentPeriod.id, version.fiscal_year, currentPeriod.start_date, currentPeriod.end_date]
          : [tenant, version.id, version.fiscal_year],
      );
      rows = detail.map((r) => {
        const sign = r.normal_balance === "credit" ? -1 : 1;
        const annualBudget = Number(r.annual_budget || 0);
        const annualActual = Number(r.annual_actual || 0) * sign;
        const hasBudget = annualBudget !== 0;
        if (!hasBudget) unbudgetedActual += annualActual;
        return {
          accountId: r.account_id, code: r.code, name: r.name, accountType: r.account_type,
          annualBudget, mtdBudget: Number(r.mtd_budget || 0),
          annualActual, mtdActual: Number(r.mtd_actual || 0) * sign,
          variance: annualBudget - annualActual,
          variancePct: annualBudget !== 0 ? ((annualActual - annualBudget) / Math.abs(annualBudget)) * 100 : null,
          hasBudget,
        };
      });
    }

    // Runway: cash on bank GL accounts vs average monthly net burn.
    const [cashRow] = await pgQuery<{ bal: string }>(
      `SELECT COALESCE(SUM(l.debit - l.credit), 0)::text AS bal
         FROM public.acct_journal_lines l
         JOIN public.acct_journal_entries e ON e.id = l.journal_entry_id AND e.tenant_id = l.tenant_id
        WHERE l.tenant_id = $1 AND e.status = 'posted'
          AND l.account_id IN (SELECT gl_account_id FROM public.acct_bank_accounts
                                WHERE tenant_id = $1 AND gl_account_id IS NOT NULL AND is_active = true)`,
      [tenant],
    );
    const monthly = await pgQuery<{ month: string; net: string }>(
      `SELECT TO_CHAR(e.entry_date, 'YYYY-MM') AS month,
              SUM(l.debit - l.credit)::text AS net
         FROM public.acct_journal_lines l
         JOIN public.acct_journal_entries e ON e.id = l.journal_entry_id AND e.tenant_id = l.tenant_id
        WHERE l.tenant_id = $1 AND e.status = 'posted'
          AND l.account_id IN (SELECT gl_account_id FROM public.acct_bank_accounts
                                WHERE tenant_id = $1 AND gl_account_id IS NOT NULL AND is_active = true)
        GROUP BY 1 ORDER BY 1 DESC LIMIT 6`,
      [tenant],
    );
    const burnMonths = monthly.map((m) => Number(m.net)).filter((n) => n < 0);
    const avgBurn = burnMonths.length ? Math.abs(burnMonths.reduce((s, n) => s + n, 0) / burnMonths.length) : 0;
    const cashNow = Number(cashRow?.bal || 0);

    const [replenish] = await pgQuery<{ total: string; count: number }>(
      `SELECT COALESCE(SUM(total - amount_paid - amount_credited), 0)::text AS total, COUNT(*)::int AS count
         FROM public.acct_ap_bills
        WHERE tenant_id = $1 AND status NOT IN ('paid','void','cancelled','draft')
          AND (total - amount_paid - amount_credited) > 0
          AND due_date <= CURRENT_DATE + INTERVAL '30 days'`,
      [tenant],
    );

    return NextResponse.json({
      versions: versions.map((v) => ({
        id: v.id, name: v.name, fiscalYear: v.fiscal_year, versionNo: v.version_no,
        scenario: v.scenario, status: v.status, approvedAt: v.approved_at, lineCount: Number(v.line_count || 0),
      })),
      selectedVersionId: version?.id || null,
      rows,
      unbudgetedActual,
      periods,
      accounts,
      runway: {
        cashNow,
        avgMonthlyBurn: avgBurn,
        monthsSampled: monthly.length,
        burnMonths: burnMonths.length,
        runwayMonths: avgBurn > 0 && cashNow > 0 ? cashNow / avgBurn : null,
      },
      replenishment: { dueIn30Days: Number(replenish?.total || 0), billCount: Number(replenish?.count || 0) },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/budgets]", e);
    return NextResponse.json({ error: e?.message || "Failed to load budgets" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || "");

    if (action === "create_version") {
      const name = String(b.name || "").trim();
      const fiscalYear = Number(b.fiscalYear);
      if (!name || !Number.isFinite(fiscalYear)) throw new Error("Name and fiscal year are required");
      const [entity] = await pgQuery<{ id: string }>(
        `SELECT id::text AS id FROM public.acct_entities WHERE tenant_id = $1 LIMIT 1`,
        [tenant],
      );
      if (!entity) throw new Error("No accounting entity exists for this tenant yet");
      const [maxV] = await pgQuery<{ v: number }>(
        `SELECT COALESCE(MAX(version_no), 0)::int AS v FROM public.acct_budget_versions WHERE tenant_id = $1 AND fiscal_year = $2`,
        [tenant, fiscalYear],
      );
      const created = await pgQuery<{ id: string }>(
        `INSERT INTO public.acct_budget_versions
           (tenant_id, entity_id, name, fiscal_year, version_no, scenario, status, currency)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft', 'USD')
         RETURNING id::text AS id`,
        [tenant, entity.id, name, fiscalYear, Number(maxV?.v || 0) + 1, String(b.scenario || "base")],
      );
      return NextResponse.json({ ok: true, versionId: created[0].id });
    }

    if (action === "add_line") {
      const budgetId = String(b.budgetId || "");
      const periodId = String(b.periodId || "");
      const accountId = String(b.accountId || "");
      const amount = Number(b.amount);
      if (!budgetId || !periodId || !accountId || !Number.isFinite(amount)) {
        throw new Error("Budget, period, account and amount are required");
      }
      const created = await pgQuery<{ id: string }>(
        `INSERT INTO public.acct_budget_lines (budget_id, period_id, account_id, amount, notes)
         VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
        [budgetId, periodId, accountId, amount, b.notes ? String(b.notes) : null],
      );
      return NextResponse.json({ ok: true, lineId: created[0].id });
    }

    if (action === "set_status") {
      const versionId = String(b.versionId || "");
      const status = String(b.status || "");
      if (!versionId || !["draft", "approved", "active", "archived"].includes(status)) {
        throw new Error("versionId and a valid status are required");
      }
      const author = await adminAuthorIdFromSession(req.headers.get("cookie"));
      await pgQuery(
        `UPDATE public.acct_budget_versions
            SET status = $3,
                approved_at = CASE WHEN $3 = 'approved' THEN NOW() ELSE approved_at END,
                approved_by = CASE WHEN $3 = 'approved' THEN $4 ELSE approved_by END
          WHERE id = $1 AND tenant_id = $2`,
        [versionId, tenant, status, author],
      );
      return NextResponse.json({ ok: true });
    }

    throw new Error("Unknown action");
  } catch (e: any) {
    console.error("[POST /api/admin/accounting/budgets]", e);
    return NextResponse.json({ error: e?.message || "Action failed" }, { status: 400 });
  }
}

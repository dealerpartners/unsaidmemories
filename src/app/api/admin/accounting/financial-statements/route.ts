import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/financial-statements?statement=<kind>&period=YYYY-MM
//
// The GAAP statement suite (owner's financial_statements.html)
// computed from posted acct_journal_lines rollups — nothing here is
// estimated. Kinds:
//   balance-sheet      balances as of the period-end vs prior
//                      period-end, per GL account, by section.
//   profit-loss        activity inside the period vs the prior
//                      period, revenue / expense sections.
//   trial-balance      debit/credit columns as of both dates.
//   cash-flow          cash-account lines for the period,
//                      classified by counterpart account type
//                      (derivation returned with the numbers).
//   retained-earnings  opening RE (accounts 3100/3200) + period
//                      net income − period distributions (3310).
// Default period = the month of the latest posted journal entry,
// so the suite opens on the newest real books.

type Account = {
  id: string; code: string; name: string;
  account_type: string; normal_balance: string | null; subtype: string | null;
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function periodWindow(period: string) {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const priorEnd = new Date(Date.UTC(y, m - 1, 0));
  const priorStart = new Date(Date.UTC(y, m - 2, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const priorPeriod = `${priorStart.getUTCFullYear()}-${String(priorStart.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end), priorStart: iso(priorStart), priorEnd: iso(priorEnd), priorPeriod };
}

async function loadAccounts(tenant: string): Promise<Account[]> {
  return pgQuery<Account>(
    `SELECT id::text AS id, code, name, account_type, normal_balance, subtype
       FROM public.acct_chart_of_accounts
      WHERE tenant_id = $1 AND is_active IS NOT FALSE
      ORDER BY code`,
    [tenant],
  );
}

// account_id -> {debit, credit} for posted entries in a date range
// (through a date when `from` is null).
async function rollup(tenant: string, from: string | null, to: string) {
  const rows = await pgQuery<{ account_id: string; debit: string; credit: string }>(
    `SELECT l.account_id::text AS account_id,
            COALESCE(SUM(l.debit), 0)::text AS debit,
            COALESCE(SUM(l.credit), 0)::text AS credit
       FROM public.acct_journal_lines l
       JOIN public.acct_journal_entries e ON e.id = l.journal_entry_id
      WHERE l.tenant_id = $1 AND e.status = 'posted'
        AND e.entry_date <= $2::date
        ${from ? "AND e.entry_date >= $3::date" : ""}
      GROUP BY l.account_id`,
    from ? [tenant, to, from] : [tenant, to],
  );
  const map = new Map<string, { debit: number; credit: number }>();
  for (const r of rows) map.set(r.account_id, { debit: Number(r.debit || 0), credit: Number(r.credit || 0) });
  return map;
}

const signed = (a: Account, agg?: { debit: number; credit: number }) => {
  if (!agg) return 0;
  const net = agg.debit - agg.credit;
  return round2(a.normal_balance === "credit" ? -net : net);
};

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const statement = String(req.nextUrl.searchParams.get("statement") || "balance-sheet");
    let period = String(req.nextUrl.searchParams.get("period") || "");
    if (!/^\d{4}-\d{2}$/.test(period)) {
      const latest = await pgQuery<{ mx: string | null }>(
        `SELECT MAX(entry_date)::text AS mx FROM public.acct_journal_entries
          WHERE tenant_id = $1 AND status = 'posted'`,
        [tenant],
      );
      period = (latest[0]?.mx || new Date().toISOString().slice(0, 10)).slice(0, 7);
    }
    const w = periodWindow(period);
    const accounts = await loadAccounts(tenant);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const base = { statement, period, priorPeriod: w.priorPeriod, window: w };

    if (statement === "balance-sheet" || statement === "trial-balance") {
      const [cur, prior] = [await rollup(tenant, null, w.end), await rollup(tenant, null, w.priorEnd)];
      if (statement === "trial-balance") {
        const rows = accounts.map((a) => {
          const c = cur.get(a.id) || { debit: 0, credit: 0 };
          const p = prior.get(a.id) || { debit: 0, credit: 0 };
          const netC = round2(c.debit - c.credit);
          const netP = round2(p.debit - p.credit);
          return {
            code: a.code, name: a.name, type: a.account_type,
            debitCurrent: netC > 0 ? netC : 0, creditCurrent: netC < 0 ? -netC : 0,
            debitPrior: netP > 0 ? netP : 0, creditPrior: netP < 0 ? -netP : 0,
          };
        }).filter((r) => r.debitCurrent || r.creditCurrent || r.debitPrior || r.creditPrior);
        const sum = (k: keyof (typeof rows)[number]) => round2(rows.reduce((s, r) => s + Number(r[k] || 0), 0));
        return NextResponse.json({
          ...base, rows,
          totals: {
            debitCurrent: sum("debitCurrent"), creditCurrent: sum("creditCurrent"),
            debitPrior: sum("debitPrior"), creditPrior: sum("creditPrior"),
          },
        });
      }
      // Balance sheet: sections by type; equity folds in cumulative
      // earnings through each date (revenue − expense signed sums).
      const section = (type: string, map: Map<string, { debit: number; credit: number }>) =>
        accounts.filter((a) => a.account_type === type)
          .map((a) => ({ code: a.code, name: a.name, value: signed(a, map.get(a.id)) }))
          .filter((r) => r.value !== 0);
      const earnings = (map: Map<string, { debit: number; credit: number }>) => {
        const rev = accounts.filter((a) => a.account_type === "revenue").reduce((s, a) => s + signed(a, map.get(a.id)), 0);
        const exp = accounts.filter((a) => a.account_type === "expense").reduce((s, a) => s + signed(a, map.get(a.id)), 0);
        return round2(rev - exp);
      };
      const mk = (type: string, title: string, totalLabel: string) => {
        const curRows = section(type, cur);
        const priorByCode = new Map(section(type, prior).map((r) => [r.code, r.value]));
        const rows = curRows.map((r) => ({ code: r.code, name: r.name, current: r.value, prior: priorByCode.get(r.code) ?? 0 }));
        // accounts that existed in prior but are zero now still belong in the comparison
        for (const [code, value] of priorByCode) {
          if (!rows.some((r) => r.code === code)) {
            const a = accounts.find((x) => x.code === code);
            rows.push({ code, name: a?.name || code, current: 0, prior: value });
          }
        }
        rows.sort((x, y) => x.code.localeCompare(y.code));
        return {
          title, totalLabel, rows,
          totalCurrent: round2(rows.reduce((s, r) => s + r.current, 0)),
          totalPrior: round2(rows.reduce((s, r) => s + r.prior, 0)),
        };
      };
      const assets = mk("asset", "Assets", "Total Assets");
      const liabs = mk("liability", "Liabilities", "Total Liabilities");
      const equity = mk("equity", "Equity", "Total Equity");
      const earnCur = earnings(cur);
      const earnPrior = earnings(prior);
      equity.rows.push({ code: "", name: "Current Period Earnings (not yet closed)", current: earnCur, prior: earnPrior });
      equity.totalCurrent = round2(equity.totalCurrent + earnCur);
      equity.totalPrior = round2(equity.totalPrior + earnPrior);
      return NextResponse.json({
        ...base,
        sections: [assets, liabs, equity],
        totalAssets: assets.totalCurrent, totalAssetsPrior: assets.totalPrior,
        totalLiabEquity: round2(liabs.totalCurrent + equity.totalCurrent),
        totalLiabEquityPrior: round2(liabs.totalPrior + equity.totalPrior),
        balanced: round2(assets.totalCurrent) === round2(liabs.totalCurrent + equity.totalCurrent),
      });
    }

    if (statement === "profit-loss") {
      const [cur, prior] = [await rollup(tenant, w.start, w.end), await rollup(tenant, w.priorStart, w.priorEnd)];
      const section = (type: string, map: Map<string, { debit: number; credit: number }>) =>
        accounts.filter((a) => a.account_type === type)
          .map((a) => ({ code: a.code, name: a.name, value: signed(a, map.get(a.id)) }))
          .filter((r) => r.value !== 0);
      const mk = (type: string, title: string, totalLabel: string) => {
        const curRows = section(type, cur);
        const priorByCode = new Map(section(type, prior).map((r) => [r.code, r.value]));
        const rows = curRows.map((r) => ({ code: r.code, name: r.name, current: r.value, prior: priorByCode.get(r.code) ?? 0 }));
        for (const [code, value] of priorByCode) {
          if (!rows.some((r) => r.code === code)) {
            const a = accounts.find((x) => x.code === code);
            rows.push({ code, name: a?.name || code, current: 0, prior: value });
          }
        }
        rows.sort((x, y) => x.code.localeCompare(y.code));
        return { title, totalLabel, rows, totalCurrent: round2(rows.reduce((s, r) => s + r.current, 0)), totalPrior: round2(rows.reduce((s, r) => s + r.prior, 0)) };
      };
      const revenue = mk("revenue", "Revenue", "Total Revenue");
      const expenses = mk("expense", "Expenses", "Total Expenses");
      const cogsOf = (rows: { code: string; current: number; prior: number }[]) => ({
        current: round2(rows.filter((r) => r.code.startsWith("5")).reduce((s, r) => s + r.current, 0)),
        prior: round2(rows.filter((r) => r.code.startsWith("5")).reduce((s, r) => s + r.prior, 0)),
      });
      const cogs = cogsOf(expenses.rows);
      return NextResponse.json({
        ...base,
        sections: [revenue, expenses],
        cogs,
        grossProfit: { current: round2(revenue.totalCurrent - cogs.current), prior: round2(revenue.totalPrior - cogs.prior) },
        netIncome: { current: round2(revenue.totalCurrent - expenses.totalCurrent), prior: round2(revenue.totalPrior - expenses.totalPrior) },
      });
    }

    if (statement === "cash-flow") {
      // Cash accounts: asset accounts whose subtype marks them cash
      // or bank, plus the root Cash account (1000, subtype null).
      const isCash = (a: Account) =>
        a.account_type === "asset" &&
        (["cash", "bank"].includes(String(a.subtype || "").toLowerCase()) || a.code === "1000");
      const cashAccounts = accounts.filter(isCash);
      const cashIds = new Set(cashAccounts.map((a) => a.id));
      const lineRows = await pgQuery<{
        entry_id: string; entry_date: string; reference: string | null; memo: string | null;
        account_id: string; debit: string; credit: string;
      }>(
        `SELECT e.id::text AS entry_id, e.entry_date::text AS entry_date, e.reference, e.memo,
                l.account_id::text AS account_id, l.debit::text AS debit, l.credit::text AS credit
           FROM public.acct_journal_entries e
           JOIN public.acct_journal_lines l ON l.journal_entry_id = e.id
          WHERE e.tenant_id = $1 AND e.status = 'posted'
            AND e.entry_date >= $2::date AND e.entry_date <= $3::date
          ORDER BY e.entry_date, e.entry_no`,
        [tenant, w.start, w.end],
      );
      const byEntry = new Map<string, { date: string; reference: string | null; memo: string | null; lines: { account_id: string; debit: number; credit: number }[] }>();
      for (const r of lineRows) {
        if (!byEntry.has(r.entry_id)) byEntry.set(r.entry_id, { date: r.entry_date, reference: r.reference, memo: r.memo, lines: [] });
        byEntry.get(r.entry_id)!.lines.push({ account_id: r.account_id, debit: Number(r.debit || 0), credit: Number(r.credit || 0) });
      }
      const sections: Record<string, { key: string; label: string; total: number; entries: any[] }> = {
        operating: { key: "operating", label: "Operating Activities", total: 0, entries: [] },
        investing: { key: "investing", label: "Investing Activities", total: 0, entries: [] },
        financing: { key: "financing", label: "Financing Activities", total: 0, entries: [] },
      };
      let internalTransfers = 0;
      for (const e of byEntry.values()) {
        const cashDelta = round2(e.lines.filter((l) => cashIds.has(l.account_id)).reduce((s, l) => s + (l.debit - l.credit), 0));
        if (cashDelta === 0) continue;
        const counterparts = e.lines.filter((l) => !cashIds.has(l.account_id)).map((l) => byId.get(l.account_id)).filter(Boolean) as Account[];
        if (!counterparts.length) { internalTransfers += 1; continue; }
        const investing = counterparts.some((a) => a.account_type === "asset" && ["fixedasset", "intangibleasset", "longtermasset"].includes(String(a.subtype || "").replace(/_/g, "").toLowerCase()));
        const financing = !investing && counterparts.some((a) => a.account_type === "equity" || (a.account_type === "liability" && String(a.subtype || "").toLowerCase().includes("longterm")));
        const key = investing ? "investing" : financing ? "financing" : "operating";
        sections[key].total = round2(sections[key].total + cashDelta);
        sections[key].entries.push({ date: e.date, reference: e.reference, memo: e.memo, amount: cashDelta });
      }
      const balThrough = async (date: string) => {
        const map = await rollup(tenant, null, date);
        return round2(cashAccounts.reduce((s, a) => s + (map.get(a.id) ? map.get(a.id)!.debit - map.get(a.id)!.credit : 0), 0));
      };
      const dayBefore = new Date(Date.UTC(Number(w.start.slice(0, 4)), Number(w.start.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);
      const openingCash = await balThrough(dayBefore);
      const closingCash = await balThrough(w.end);
      const netChange = round2(Object.values(sections).reduce((s, x) => s + x.total, 0));
      return NextResponse.json({
        ...base,
        cashAccounts: cashAccounts.map((a) => ({ code: a.code, name: a.name })),
        sections: Object.values(sections),
        openingCash, closingCash, netChange, internalTransfers,
        reconciles: round2(openingCash + netChange) === closingCash,
        derivation:
          "Direct method, derived from the posted journal: every entry touching a cash or bank account is classified by its counterpart lines — revenue, receivables, payables, inventory, tax and operating expense counterparts are Operating; fixed-asset, intangible and long-term asset counterparts are Investing; equity and long-term liability counterparts are Financing. Entries moving money between two cash/bank accounts are internal transfers and are excluded.",
      });
    }

    if (statement === "retained-earnings") {
      const reAccounts = accounts.filter((a) => a.account_type === "equity" && /retained earnings/i.test(a.name));
      const distAccounts = accounts.filter((a) => a.account_type === "equity" && /distribution|draw/i.test(a.name));
      const before = await rollup(tenant, null, w.priorEnd);
      const inPeriod = await rollup(tenant, w.start, w.end);
      const sumSigned = (list: Account[], map: Map<string, { debit: number; credit: number }>) =>
        round2(list.reduce((s, a) => s + signed(a, map.get(a.id)), 0));
      const openingRE = sumSigned(reAccounts, before);
      const rev = accounts.filter((a) => a.account_type === "revenue").reduce((s, a) => s + signed(a, inPeriod.get(a.id)), 0);
      const exp = accounts.filter((a) => a.account_type === "expense").reduce((s, a) => s + signed(a, inPeriod.get(a.id)), 0);
      const netIncome = round2(rev - exp);
      // Distributions are owner draws: net DEBIT activity on the
      // distribution accounts during the period, whatever balance
      // direction the chart row declares.
      const distributions = round2(distAccounts.reduce((s, a) => {
        const agg = inPeriod.get(a.id);
        return s + (agg ? agg.debit - agg.credit : 0);
      }, 0));
      const closingRE = round2(openingRE + netIncome - distributions);
      const atEnd = await rollup(tenant, null, w.end);
      return NextResponse.json({
        ...base,
        reAccounts: reAccounts.map((a) => ({ code: a.code, name: a.name })),
        distAccounts: distAccounts.map((a) => ({ code: a.code, name: a.name })),
        openingRE, netIncome, distributions, closingRE,
        ledgerREBalance: sumSigned(reAccounts, atEnd),
        derivation:
          "Opening retained earnings is the posted balance of the retained-earnings accounts at the prior period end. Net income is the period's posted revenue minus expenses. Distributions are the period's net debit activity on the owner distribution/draw accounts. Closing = opening + net income − distributions. The ledger balance of the retained-earnings accounts themselves only moves when a closing entry is posted, so it is shown as a check figure.",
      });
    }

    return NextResponse.json({ error: `Unknown statement: ${statement}` }, { status: 400 });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/financial-statements]", e);
    return NextResponse.json({ error: e?.message || "Failed to build statement" }, { status: 500 });
  }
}

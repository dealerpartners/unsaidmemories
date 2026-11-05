import { guard, ctx, ok, fail, body } from "../_shared";
import { round2 } from "@/lib/accounting";
import { pgQuery } from "@/lib/pg";

export const dynamic = "force-dynamic";

// GET /api/admin/accounting/taxes
//
// Sales Tax & Nexus payload (Batch 2). The nexus register is
// computed at request time from the storefront orders table:
// trailing-12-month sales volume + transaction count grouped by
// the shipping state in each order's shipping_address, counting
// orders that actually sold (status paid or refunded — pending
// checkouts are not sales). Registrations come from
// acct_tax_jurisdictions (empty until the owner registers in a
// state). Benchmarks are the standard statutory economic-nexus
// thresholds — reference data, labeled as such on the page —
// the same values the owner's design uses ($500k CA/NY/TX,
// $100k in most states, transaction prongs where statutes have
// them). Utilization = the higher of the dollar and transaction
// prongs. Nothing about a state's real obligation is asserted
// beyond this arithmetic.

const BENCHMARKS: Record<string, { dollars: number; txns?: number }> = {
  CA: { dollars: 500000 },
  NY: { dollars: 500000, txns: 100 },
  TX: { dollars: 500000 },
  IL: { dollars: 100000, txns: 200 },
  GA: { dollars: 100000, txns: 200 },
};
const DEFAULT_BENCHMARK = { dollars: 100000 } as { dollars: number; txns?: number };
const HOME_STATE = "TN";

export async function GET() {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const [{ data: jurisdictions }, { data: rates }, { data: filings }] = await Promise.all([
      db.from("acct_tax_jurisdictions").select("*").eq("tenant_id", tenant).limit(200),
      db.from("acct_tax_rates").select("*").eq("tenant_id", tenant).order("name").limit(200),
      db.from("acct_tax_filings").select("*").eq("tenant_id", tenant).order("period_start", { ascending: false }).limit(200),
    ]);
    let rules: any[] = [];
    try {
      const { data } = await db.from("acct_tax_rules").select("*").eq("tenant_id", tenant).order("state_code").limit(200);
      rules = data || [];
    } catch { rules = []; }

    const volumeRows = await pgQuery<{ state: string; volume: string; txns: number }>(
      `SELECT UPPER(shipping_address->>'state') AS state,
              COALESCE(SUM(total), 0)::text AS volume,
              COUNT(*)::int AS txns
         FROM public.orders
        WHERE tenant_id = $1
          AND status IN ('paid', 'refunded')
          AND created_at >= NOW() - INTERVAL '12 months'
          AND NULLIF(TRIM(COALESCE(shipping_address->>'state', '')), '') IS NOT NULL
        GROUP BY 1
        ORDER BY SUM(total) DESC`,
      [tenant],
    );
    const regByState = new Map<string, any>();
    for (const j of (jurisdictions || []) as any[]) {
      if (j.state_code) regByState.set(String(j.state_code).toUpperCase(), j);
    }
    const nexus = volumeRows.map((r) => {
      const bench = BENCHMARKS[r.state] || DEFAULT_BENCHMARK;
      const volume = Number(r.volume || 0);
      const dollarUtil = bench.dollars > 0 ? (volume / bench.dollars) * 100 : 0;
      const txnUtil = bench.txns ? (Number(r.txns) / bench.txns) * 100 : 0;
      const utilization = Math.max(dollarUtil, txnUtil);
      const reg = regByState.get(r.state) || null;
      return {
        state: r.state,
        volume,
        txns: Number(r.txns),
        benchmarkDollars: bench.dollars,
        benchmarkTxns: bench.txns || null,
        utilization: Math.round(utilization * 10) / 10,
        nexusType: r.state === HOME_STATE ? "Physical & Economic" : "Economic Only",
        registered: Boolean(reg),
        registrationNumber: reg?.registration_number || null,
        agency: reg?.name || null,
        status: reg ? "Active Registered" : utilization >= 100 ? "Threshold Breached — Not Registered" : utilization >= 80 ? "Threshold Alert" : "Safe — Not Registered",
      };
    });
    return ok({
      nexus, jurisdictions: jurisdictions || [], rates: rates || [], filings: filings || [], rules,
      totals: {
        statesWithSales: nexus.length,
        activeNexus: nexus.filter((n) => n.registered).length,
        approaching: nexus.filter((n) => !n.registered && n.utilization >= 80).length,
        trailing12Volume: round2(nexus.reduce((s, n) => s + n.volume, 0)),
      },
    });
  } catch (e) { return fail(e, 500); }
}

export async function POST(req: Request) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const b = await body(req);
    switch (b.action) {
      case "upsert_rate": {
        const payload: Record<string, unknown> = {
          tenant_id: tenant, name: b.name, jurisdiction: b.jurisdiction || null,
          rate_percent: Number(b.rate_percent) || 0, is_active: true,
          updated_at: new Date().toISOString(),
        };
        if (b.gl_account_id) payload.gl_account_id = b.gl_account_id;
        const { error } = b.id
          ? await db.from("acct_tax_rates").update(payload).eq("id", b.id).eq("tenant_id", tenant)
          : await db.from("acct_tax_rates").insert(payload);
        if (error) throw new Error(error.message);
        return ok();
      }
      case "toggle_rate": {
        const { error } = await db.from("acct_tax_rates").update({ is_active: !!b.is_active }).eq("id", b.id).eq("tenant_id", tenant);
        if (error) throw new Error(error.message);
        return ok();
      }
      case "create_filing": {
        const { data, error } = await db.from("acct_tax_filings").insert({
          tenant_id: tenant, tax_rate_id: b.tax_rate_id || null,
          period_label: b.period_label, period_start: b.period_start, period_end: b.period_end,
          taxable_sales: round2(Number(b.taxable_sales)), tax_collected: round2(Number(b.tax_collected)),
          tax_remitted: 0, status: "draft",
        }).select("id").single();
        if (error) throw new Error(error.message);
        return ok({ id: data.id });
      }
      case "file_filing": {
        const { data: filing } = await db.from("acct_tax_filings").select("*").eq("id", b.id).eq("tenant_id", tenant).single();
        if (!filing) throw new Error("Filing not found");
        const { error } = await db.from("acct_tax_filings").update({
          status: "filed", filed_at: new Date().toISOString(),
          confirmation_ref: b.confirmation_ref || null, tax_remitted: filing.tax_collected,
        }).eq("id", b.id);
        if (error) throw new Error(error.message);
        return ok();
      }
      default:
        throw new Error("Unknown action");
    }
  } catch (e) { return fail(e); }
}

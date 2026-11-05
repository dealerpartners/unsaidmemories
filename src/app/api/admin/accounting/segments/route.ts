import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/segments
//
// Dimensions & Segment P&L: posted journal line totals sliced by
// dimension values. Dimensions are defined in acct_dimensions with
// their values in acct_dimension_values; journal lines carry their
// tags in acct_journal_lines.dimensions (a jsonb object keyed by
// dimension code). For every dimension we return the debit/credit
// totals per tagged value plus the untagged remainder, so each
// slice always reconciles to the posted ledger totals — which are
// returned alongside a by-account-type P&L summary.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const [dimensions, totals, byType] = await Promise.all([
      pgQuery<{ id: string; code: string; name: string; value_id: string | null; value_code: string | null; value_name: string | null }>(
        `SELECT d.id::text AS id, d.code, d.name,
                v.id::text AS value_id, v.code AS value_code, v.name AS value_name
           FROM public.acct_dimensions d
           LEFT JOIN public.acct_dimension_values v
             ON v.dimension_id = d.id AND v.tenant_id = d.tenant_id AND v.is_active IS NOT FALSE
          WHERE d.tenant_id = $1 AND d.is_active IS NOT FALSE
          ORDER BY d.name, v.name`,
        [tenant],
      ),
      pgQuery<{ debit: string; credit: string; lines: number }>(
        `SELECT COALESCE(SUM(l.debit), 0)::text AS debit,
                COALESCE(SUM(l.credit), 0)::text AS credit,
                COUNT(*)::int AS lines
           FROM public.acct_journal_lines l
           JOIN public.acct_journal_entries e ON e.id = l.journal_entry_id
          WHERE l.tenant_id = $1 AND e.status = 'posted'`,
        [tenant],
      ),
      pgQuery<{ account_type: string; debit: string; credit: string }>(
        `SELECT a.account_type,
                COALESCE(SUM(l.debit), 0)::text AS debit,
                COALESCE(SUM(l.credit), 0)::text AS credit
           FROM public.acct_journal_lines l
           JOIN public.acct_journal_entries e ON e.id = l.journal_entry_id
           JOIN public.acct_chart_of_accounts a ON a.id = l.account_id
          WHERE l.tenant_id = $1 AND e.status = 'posted'
          GROUP BY a.account_type
          ORDER BY a.account_type`,
        [tenant],
      ),
    ]);

    const dimMap = new Map<string, any>();
    for (const row of dimensions) {
      if (!dimMap.has(row.id)) {
        dimMap.set(row.id, { id: row.id, code: row.code, name: row.name, values: [], segments: [], untagged: null });
      }
      if (row.value_id) {
        dimMap.get(row.id).values.push({ id: row.value_id, code: row.value_code, name: row.value_name });
      }
    }

    for (const dim of dimMap.values()) {
      const segs = await pgQuery<{ value_key: string; debit: string; credit: string; lines: number }>(
        `SELECT l.dimensions ->> $2 AS value_key,
                COALESCE(SUM(l.debit), 0)::text AS debit,
                COALESCE(SUM(l.credit), 0)::text AS credit,
                COUNT(*)::int AS lines
           FROM public.acct_journal_lines l
           JOIN public.acct_journal_entries e ON e.id = l.journal_entry_id
          WHERE l.tenant_id = $1 AND e.status = 'posted'
            AND l.dimensions ->> $2 IS NOT NULL
          GROUP BY l.dimensions ->> $2
          ORDER BY 2 DESC`,
        [tenant, dim.code],
      );
      dim.segments = segs.map((s) => ({
        valueKey: s.value_key, debit: Number(s.debit || 0), credit: Number(s.credit || 0), lines: s.lines,
      }));
      const taggedDebit = dim.segments.reduce((sum: number, s: any) => sum + s.debit, 0);
      const taggedCredit = dim.segments.reduce((sum: number, s: any) => sum + s.credit, 0);
      const t = totals[0];
      dim.untagged = {
        debit: Number(t?.debit || 0) - taggedDebit,
        credit: Number(t?.credit || 0) - taggedCredit,
      };
    }

    const t = totals[0];
    return NextResponse.json({
      dimensions: Array.from(dimMap.values()),
      totals: { debit: Number(t?.debit || 0), credit: Number(t?.credit || 0), lines: Number(t?.lines || 0) },
      byAccountType: byType.map((r) => ({
        accountType: r.account_type, debit: Number(r.debit || 0), credit: Number(r.credit || 0),
      })),
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/segments]", e);
    return NextResponse.json({ error: e?.message || "Failed to load segment data" }, { status: 500 });
  }
}

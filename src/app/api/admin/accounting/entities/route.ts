import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/admin/accounting/entities
//
// Entities & Consolidation data:
//  - entity structure: acct_entities (parent/child rollup)
//  - consolidation groups + members: acct_consolidation_groups,
//    acct_consolidation_members
//  - intercompany ledger: acct_intercompany_transactions between
//    entities, with elimination flags
//  - consolidation runs: acct_consolidation_runs (fx adjustment +
//    elimination amounts per run)
//  - per-entity posted ledger totals from acct_journal_entries —
//    the rollup the consolidated view is built from
// POST: add a subsidiary entity to acct_entities.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const [entities, groups, intercompany, runs, entityTotals] = await Promise.all([
      pgQuery(
        `SELECT e.id::text AS id, e.code, e.legal_name, e.display_name, e.entity_type,
                e.parent_entity_id::text AS parent_entity_id, p.legal_name AS parent_name,
                e.country_code, e.tax_identifier, e.functional_currency, e.reporting_currency,
                e.fiscal_year_start_month, e.is_active
           FROM public.acct_entities e
           LEFT JOIN public.acct_entities p ON p.id = e.parent_entity_id
          WHERE e.tenant_id = $1
          ORDER BY e.legal_name`,
        [tenant],
      ),
      pgQuery(
        `SELECT g.id::text AS id, g.code, g.name, g.reporting_currency, g.consolidation_method,
                m.entity_id::text AS member_entity_id, e.legal_name AS member_name,
                m.ownership_percent::text AS ownership_percent,
                m.consolidation_percent::text AS consolidation_percent,
                m.effective_from::text AS effective_from, m.effective_to::text AS effective_to
           FROM public.acct_consolidation_groups g
           LEFT JOIN public.acct_consolidation_members m ON m.consolidation_group_id = g.id
           LEFT JOIN public.acct_entities e ON e.id = m.entity_id
          WHERE g.tenant_id = $1
          ORDER BY g.name, e.legal_name`,
        [tenant],
      ),
      pgQuery(
        `SELECT t.id::text AS id, t.transaction_date::text AS transaction_date,
                fe.legal_name AS from_name, te.legal_name AS to_name,
                t.currency, t.amount::text AS amount, t.description, t.source_type,
                t.status, t.elimination_required
           FROM public.acct_intercompany_transactions t
           LEFT JOIN public.acct_entities fe ON fe.id = t.from_entity_id
           LEFT JOIN public.acct_entities te ON te.id = t.to_entity_id
          WHERE t.tenant_id = $1
          ORDER BY t.transaction_date DESC
          LIMIT 200`,
        [tenant],
      ),
      pgQuery(
        `SELECT r.id::text AS id, g.name AS group_name, p.name AS period_name,
                r.status, r.reporting_currency, r.fx_adjustment::text AS fx_adjustment,
                r.elimination_amount::text AS elimination_amount, r.created_at::text AS created_at
           FROM public.acct_consolidation_runs r
           LEFT JOIN public.acct_consolidation_groups g ON g.id = r.consolidation_group_id
           LEFT JOIN public.acct_periods p ON p.id = r.period_id
          WHERE r.tenant_id = $1
          ORDER BY r.created_at DESC
          LIMIT 50`,
        [tenant],
      ),
      pgQuery(
        `SELECT entity_id::text AS entity_id, COUNT(*)::int AS entries,
                COALESCE(SUM(total_debit), 0)::text AS total_debit,
                COALESCE(SUM(total_credit), 0)::text AS total_credit
           FROM public.acct_journal_entries
          WHERE tenant_id = $1 AND status = 'posted'
          GROUP BY entity_id`,
        [tenant],
      ),
    ]);

    const groupMap = new Map<string, any>();
    for (const row of groups as any[]) {
      if (!groupMap.has(row.id)) {
        groupMap.set(row.id, {
          id: row.id, code: row.code, name: row.name,
          reportingCurrency: row.reporting_currency, method: row.consolidation_method, members: [],
        });
      }
      if (row.member_entity_id) {
        groupMap.get(row.id).members.push({
          entityId: row.member_entity_id, name: row.member_name,
          ownershipPercent: Number(row.ownership_percent || 0),
          consolidationPercent: Number(row.consolidation_percent || 0),
          effectiveFrom: row.effective_from, effectiveTo: row.effective_to,
        });
      }
    }

    return NextResponse.json({
      entities,
      groups: Array.from(groupMap.values()),
      intercompany: (intercompany as any[]).map((t) => ({ ...t, amount: Number(t.amount || 0) })),
      runs: (runs as any[]).map((r) => ({
        ...r, fxAdjustment: Number(r.fx_adjustment || 0), eliminationAmount: Number(r.elimination_amount || 0),
      })),
      entityTotals: (entityTotals as any[]).map((t) => ({
        entityId: t.entity_id, entries: t.entries,
        totalDebit: Number(t.total_debit || 0), totalCredit: Number(t.total_credit || 0),
      })),
      total: (entities as any[]).length,
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/entities]", e);
    return NextResponse.json({ error: e?.message || "Failed to load entities" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const code = String(body.code || "").trim();
  const legalName = String(body.legalName || body.legal_name || "").trim();
  if (!code || !legalName) {
    return NextResponse.json({ error: "An entity code and legal name are required." }, { status: 400 });
  }
  try {
    const rows = await pgQuery<{ id: string }>(
      `INSERT INTO public.acct_entities
         (tenant_id, parent_entity_id, code, legal_name, display_name, entity_type,
          country_code, tax_identifier, functional_currency, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       RETURNING id::text AS id`,
      [
        tenant,
        body.parentEntityId ? String(body.parentEntityId) : null,
        code,
        legalName,
        String(body.displayName || legalName),
        String(body.entityType || "subsidiary"),
        body.countryCode ? String(body.countryCode).slice(0, 2).toUpperCase() : null,
        body.taxIdentifier ? String(body.taxIdentifier) : null,
        String(body.functionalCurrency || "USD").slice(0, 3).toUpperCase(),
      ],
    );
    return NextResponse.json({ data: { id: rows[0]?.id } }, { status: 201 });
  } catch (e: any) {
    console.error("[POST /api/admin/accounting/entities]", e);
    return NextResponse.json({ error: e?.message || "Failed to create entity" }, { status: 500 });
  }
}

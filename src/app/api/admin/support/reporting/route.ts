import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import {
  buildDailyRollups, getSupportMetrics, listRollupKeys, listRollupTenants,
  getBacklogAge, getWorkload,
  type SupportMetricsResult,
} from "@/lib/support/reporting"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// GET /api/admin/support/reporting — the desk's §17 reporting surface.
// Reads support_report_daily (the step-5 materialized rollups) through
// the one canonical reader (getSupportMetrics): totals + per-category,
// per-team, and per-channel breakdowns (B9), averages derived from
// sums/counts at read. Backlog age and workload are point-in-time
// §17 metrics, read live from the spine for the resolved tenant.
//
// Franchise rollup (§17): the rollups are tenant-keyed. A franchisee
// reads only its own tenant. The MASTER tenant's desk may pass
// scope=all — the same widening condition the ticket queue uses —
// to also receive a per-tenant totals breakdown (byTenant). No other
// caller can widen, and the point-in-time reads never widen.
//
// Freshness: the rollup is a rebuild, not an increment — this endpoint
// re-materializes yesterday and today (UTC) for the tenant before
// reading, so the surface is never stale by more than the current
// moment; older days are kept fresh by the support sweep cron. A
// tenant with no tickets gets honest zeros, not an error.
//
// Params: days=N (default 30, max 92) OR from=YYYY-MM-DD&to=YYYY-MM-DD.
// Gated on the 'support' module (read).
// ============================================================================

const DAY_MS = 86400000
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate

  const sp = req.nextUrl.searchParams
  const now = new Date()
  let from = sp.get("from") || ""
  let to = sp.get("to") || isoDay(now)
  if (!from) {
    const days = Math.min(92, Math.max(1, parseInt(sp.get("days") || "30", 10) || 30))
    from = isoDay(new Date(now.getTime() - (days - 1) * DAY_MS))
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 })
  }

  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)

    // Re-materialize the two freshest days (fail-soft: stale rollups
    // read as they are rather than failing the surface).
    for (const day of [isoDay(new Date(now.getTime() - DAY_MS)), isoDay(now)]) {
      await buildDailyRollups(c, tenant, day).catch(() => {})
    }

    const range = { from, to }
    const totals = await getSupportMetrics(c, tenant, range)
    const keys = await listRollupKeys(c, tenant, range)

    const byCategory: { category: string; metrics: SupportMetricsResult }[] = []
    for (const category of keys.categories) {
      byCategory.push({ category, metrics: await getSupportMetrics(c, tenant, { ...range, category }) })
    }
    const byTeam: { teamId: string; teamName: string | null; metrics: SupportMetricsResult }[] = []
    for (const teamId of keys.teamIds) {
      const nameRes = await c.query(
        `SELECT name FROM public.support_teams WHERE id = $1::uuid LIMIT 1`,
        [teamId],
      ).catch(() => ({ rows: [] as any[] }))
      byTeam.push({
        teamId,
        teamName: nameRes.rows[0]?.name ?? null,
        metrics: await getSupportMetrics(c, tenant, { ...range, teamId }),
      })
    }
    const byChannel: { channel: string; metrics: SupportMetricsResult }[] = []
    for (const channel of keys.channels) {
      byChannel.push({ channel, metrics: await getSupportMetrics(c, tenant, { ...range, channel }) })
    }

    // Point-in-time §17 metrics for the resolved tenant.
    const backlogAge = await getBacklogAge(c, tenant)
    const workload = await getWorkload(c, tenant, range)

    // Franchise rollup: per-tenant totals, only under the desk's
    // master-scope widening (same condition as the ticket queue).
    const scopeAll = sp.get("scope") === "all" && tenant === (process.env.SUPABASE_TENANT_ID || "")
    const byTenant: { tenantId: string; tenantName: string | null; metrics: SupportMetricsResult }[] = []
    if (scopeAll) {
      for (const tenantId of await listRollupTenants(c, range)) {
        const nameRes = await c.query(
          `SELECT name FROM public.tenants WHERE id = $1::uuid LIMIT 1`,
          [tenantId],
        ).catch(() => ({ rows: [] as any[] }))
        byTenant.push({
          tenantId,
          tenantName: nameRes.rows[0]?.name ?? null,
          metrics: await getSupportMetrics(c, tenantId, range),
        })
      }
    }

    return NextResponse.json({ from, to, totals, byCategory, byTeam, byChannel, backlogAge, workload, byTenant })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

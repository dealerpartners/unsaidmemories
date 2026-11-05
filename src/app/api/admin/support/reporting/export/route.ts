import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { resolveActingStaff } from "@/lib/support/actor"
import {
  buildDailyRollups, getSupportMetrics, listRollupKeys, listRollupTenants,
  hasSupportExportPermission, type SupportMetricsResult,
} from "@/lib/support/reporting"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// GET /api/admin/support/reporting/export — §17 CSV export.
//
// Exports exactly what the reporting surface shows for the range:
// totals plus the category / team / channel breakdowns (and per-tenant
// totals under the desk's master-scope widening), one flat row per
// breakdown entry, metrics as the canonical reader derives them.
//
// Gated twice, as §17 writes it: the desk's 'support' module gate,
// then the 'support.export' permission code itself (seeded registry
// data, 20261031) via hasSupportExportPermission — a read-only grant
// cannot export. Every export appends its crm_audit_log row (§18
// change-log idiom: entity_type 'support_reporting', the range and
// scope in after_data), in the same statement shape the §10 config
// writers use. Tenant scoping is the reporting route's: the resolved
// tenant only, widened solely by the master scope=all condition.
// ============================================================================

const DAY_MS = 86400000
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

const cell = (v: unknown): string => {
  if (v == null) return ""
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const HEADERS = [
  "breakdown", "key",
  "tickets_created", "tickets_resolved", "tickets_closed", "tickets_reopened",
  "reopen_rate", "avg_first_response_minutes", "avg_resolution_minutes",
  "sla_due", "sla_met", "sla_breached", "sla_attainment_pct",
  "csat_responses", "csat_avg", "messages", "public_replies",
  "replies_per_resolved_ticket", "time_spent_seconds", "backlog_open_end",
]

function metricRow(breakdown: string, key: string, m: SupportMetricsResult): string {
  return [
    breakdown, key,
    m.ticketsCreated, m.ticketsResolved, m.ticketsClosed, m.ticketsReopened,
    m.reopenRate, m.avgFirstResponseMinutes, m.avgResolutionMinutes,
    m.slaDue, m.slaMet, m.slaBreached, m.slaAttainmentPct,
    m.csatResponses, m.csatAvg, m.messages, m.publicReplies,
    m.repliesPerResolvedTicket, m.timeSpentSeconds, m.backlogOpenEnd,
  ].map(cell).join(",")
}

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

    // The 'support.export' code, resolved against the acting staffer.
    const userId = await getActorIdFromRequest(req)
    const staff = userId ? await resolveActingStaff() : null
    const allowed = await hasSupportExportPermission(c as any, tenant, staff?.staffId ?? null)
    if (!allowed) {
      return NextResponse.json(
        { error: "Export requires the 'support.export' permission" },
        { status: 403 },
      )
    }

    // Same freshness contract as the reporting surface.
    for (const day of [isoDay(new Date(now.getTime() - DAY_MS)), isoDay(now)]) {
      await buildDailyRollups(c as any, tenant, day).catch(() => {})
    }

    const range = { from, to }
    const lines: string[] = [HEADERS.join(",")]
    lines.push(metricRow("total", tenant, await getSupportMetrics(c as any, tenant, range)))

    const keys = await listRollupKeys(c as any, tenant, range)
    for (const category of keys.categories) {
      lines.push(metricRow("category", category, await getSupportMetrics(c as any, tenant, { ...range, category })))
    }
    for (const teamId of keys.teamIds) {
      const nameRes = await c.query(
        `SELECT name FROM public.support_teams WHERE id = $1::uuid LIMIT 1`,
        [teamId],
      ).catch(() => ({ rows: [] as any[] }))
      const label = nameRes.rows[0]?.name ? `${nameRes.rows[0].name} (${teamId})` : teamId
      lines.push(metricRow("team", label, await getSupportMetrics(c as any, tenant, { ...range, teamId })))
    }
    for (const channel of keys.channels) {
      lines.push(metricRow("channel", channel, await getSupportMetrics(c as any, tenant, { ...range, channel })))
    }

    const scopeAll = sp.get("scope") === "all" && tenant === (process.env.SUPABASE_TENANT_ID || "")
    if (scopeAll) {
      for (const tenantId of await listRollupTenants(c as any, range)) {
        const nameRes = await c.query(
          `SELECT name FROM public.tenants WHERE id = $1::uuid LIMIT 1`,
          [tenantId],
        ).catch(() => ({ rows: [] as any[] }))
        const label = nameRes.rows[0]?.name ? `${nameRes.rows[0].name} (${tenantId})` : tenantId
        lines.push(metricRow("tenant", label, await getSupportMetrics(c as any, tenantId, range)))
      }
    }

    // The audit row (§18 idiom; fail-soft like every §10 writer's —
    // the export's trail is this row, written before the file ships).
    try {
      await c.query(
        `INSERT INTO public.crm_audit_log
           (tenant_id, actor_user_id, actor_staff_id, entity_type, entity_id, action, before_data, after_data, ip_address, user_agent)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7::jsonb, $8::jsonb, $9::inet, $10)`,
        [
          tenant, userId, staff?.staffId ?? null, "support_reporting", null,
          "support_report_export",
          null,
          JSON.stringify({
            from, to, scope: scopeAll ? "all" : "tenant",
            rows: lines.length - 1,
          }),
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          req.headers.get("user-agent") ?? null,
        ],
      )
    } catch (e) {
      console.error(
        "[support-reporting] export audit write failed:",
        e instanceof Error ? e.message : String(e),
      )
    }

    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="support-report-${from}_${to}.csv"`,
      },
    })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

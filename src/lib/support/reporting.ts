// ============================================================================
// Reporting rollups + metrics (spec §17).
//
// buildDailyRollups materializes one day into support_report_daily
// (migration 20261039) at four grains — total, per-team, per-category,
// per team+category — from support_tickets + support_ticket_events.
// It is a rebuild, not an increment: the day's rows are deleted and
// recomputed, so the rollup can always be regenerated from the spine
// and events (the sources of truth). Dates are UTC calendar days.
//
// Metric bases (the day a fact is attributed to):
//   created / resolved / closed   → the ticket's own stamp that day
//   reopened                      → 'reopened' events that day
//   first response                → first_public_reply_at that day;
//                                   minutes = created → first reply
//   resolution minutes            → created → resolved, on resolved day
//   SLA due / met / breached      → tickets whose resolution_due_at
//                                   falls that day; met = resolved by
//                                   the due; breached = breach stamp or
//                                   a late resolution
//   CSAT                          → csat_answered_at that day
//   backlog_open_end              → open+pending at end of that day,
//                                   by the ticket's CURRENT team /
//                                   category (assignment history is not
//                                   kept, so team grains of old days
//                                   move with reassignments — totals
//                                   and category grains are exact)
// Team grains cover assigned tickets only; unassigned volume lives in
// the total and category grains (see the migration header).
//
// B9 (§17 completion): a fifth grain — channel (migration 20261056).
// The same eight folds run grouped by source_channel (NULL channel
// coalesces to 'unknown', so channel volume still sums to the total);
// the channel of a ticket is stamped at creation and never changes,
// so channel grains are exact for every day, backlog included.
//
// getSupportMetrics reads rollups back and derives the §17 metrics
// (averages from sums/counts — never averaged averages). Franchise
// rollup (§17) falls out of the tenant key: master reads every
// tenant's rows, a franchisee reads only its own tenant_id.
//
// Two §17 metrics are point-in-time, not daily, so they are computed
// live at read instead of materialized: backlog AGE (getBacklogAge —
// the rollup carries the backlog COUNT at each day's end; age is a
// property of the current backlog) and workload (getWorkload — open
// load per assignee now, plus resolved volume over the range).
//
// 'Time spent' (§17) is carried by the rollup from the ticket's own
// time_spent_seconds column, but has NO honest input today: the §14
// support_time_entries store was never created and nothing writes
// the ticket column, so the metric reads a structural zero until a
// time-entry writer exists. It is reported as-is, never fabricated.
// ============================================================================

import type { SupportDb } from "./engine-shared"

interface Metrics {
  created: number; resolved: number; closed: number; reopened: number
  frCount: number; frSum: number; resCount: number; resSum: number
  slaDue: number; slaMet: number; slaBreached: number
  messages: number; publicReplies: number
  csatCount: number; csatSum: number; timeSpent: number; backlog: number
}

const zero = (): Metrics => ({
  created: 0, resolved: 0, closed: 0, reopened: 0,
  frCount: 0, frSum: 0, resCount: 0, resSum: 0,
  slaDue: 0, slaMet: 0, slaBreached: 0,
  messages: 0, publicReplies: 0,
  csatCount: 0, csatSum: 0, timeSpent: 0, backlog: 0,
})

const num = (v: unknown): number => (v == null ? 0 : Number(v))

interface AggRow { team_id: string | null; category: string; [key: string]: unknown }

export async function buildDailyRollups(
  db: SupportDb,
  tenantId: string,
  dateISO: string, // 'YYYY-MM-DD' (UTC)
): Promise<{ rowsWritten: number }> {
  const day = `created_at >= $2::date AND created_at < $2::date + INTERVAL '1 day'`
  const byStamp = (col: string) =>
    `${col} >= $2::date AND ${col} < $2::date + INTERVAL '1 day'`
  const merged = new Map<string, Metrics & { team_id: string | null; category: string }>()
  const slot = (team_id: string | null, category: string) => {
    const key = `${team_id ?? ""}|${category}`
    let m = merged.get(key)
    if (!m) { m = { ...zero(), team_id, category }; merged.set(key, m) }
    return m
  }
  const fold = (rows: AggRow[], apply: (m: Metrics, r: AggRow) => void) => {
    for (const r of rows) apply(slot(r.team_id ?? null, r.category), r)
  }

  const q = async (sql: string) =>
    (await db.query<AggRow>(sql, [tenantId, dateISO])).rows

  fold(await q(
    `SELECT assigned_team_id::text AS team_id, category,
            count(*)::int AS n, COALESCE(sum(message_count),0)::bigint AS messages,
            COALESCE(sum(public_reply_count),0)::bigint AS public_replies,
            COALESCE(sum(time_spent_seconds),0)::bigint AS time_spent
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL AND ${day}
      GROUP BY 1, 2`),
    (m, r) => { m.created += num(r.n); m.messages += num(r.messages); m.publicReplies += num(r.public_replies); m.timeSpent += num(r.time_spent) })

  fold(await q(
    `SELECT assigned_team_id::text AS team_id, category,
            count(*)::int AS n,
            COALESCE(sum(extract(epoch FROM (resolved_at - created_at)) / 60.0), 0) AS minutes
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL AND ${byStamp("resolved_at")}
      GROUP BY 1, 2`),
    (m, r) => { m.resolved += num(r.n); m.resCount += num(r.n); m.resSum += num(r.minutes) })

  fold(await q(
    `SELECT assigned_team_id::text AS team_id, category, count(*)::int AS n
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL AND ${byStamp("closed_at")}
      GROUP BY 1, 2`),
    (m, r) => { m.closed += num(r.n) })

  fold(await q(
    `SELECT assigned_team_id::text AS team_id, category,
            count(*)::int AS n,
            COALESCE(sum(extract(epoch FROM (first_public_reply_at - created_at)) / 60.0), 0) AS minutes
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL AND ${byStamp("first_public_reply_at")}
      GROUP BY 1, 2`),
    (m, r) => { m.frCount += num(r.n); m.frSum += num(r.minutes) })

  fold(await q(
    `SELECT t.assigned_team_id::text AS team_id, t.category, count(*)::int AS n
       FROM public.support_ticket_events e
       JOIN public.support_tickets t ON t.id = e.ticket_id
      WHERE e.tenant_id = $1::uuid AND e.event_type = 'reopened'
        AND e.created_at >= $2::date AND e.created_at < $2::date + INTERVAL '1 day'
      GROUP BY 1, 2`),
    (m, r) => { m.reopened += num(r.n) })

  fold(await q(
    `SELECT assigned_team_id::text AS team_id, category,
            count(*)::int AS due,
            count(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at <= resolution_due_at)::int AS met,
            count(*) FILTER (WHERE resolution_breached_at IS NOT NULL
                              OR (resolved_at IS NOT NULL AND resolved_at > resolution_due_at))::int AS breached
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL AND ${byStamp("resolution_due_at")}
      GROUP BY 1, 2`),
    (m, r) => { m.slaDue += num(r.due); m.slaMet += num(r.met); m.slaBreached += num(r.breached) })

  fold(await q(
    `SELECT assigned_team_id::text AS team_id, category,
            count(*)::int AS n, COALESCE(sum(csat_score),0)::int AS score_sum
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL AND csat_score IS NOT NULL
        AND ${byStamp("csat_answered_at")}
      GROUP BY 1, 2`),
    (m, r) => { m.csatCount += num(r.n); m.csatSum += num(r.score_sum) })

  fold(await q(
    `SELECT assigned_team_id::text AS team_id, category, count(*)::int AS n
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL
        AND created_at < $2::date + INTERVAL '1 day'
        AND (resolved_at IS NULL OR resolved_at >= $2::date + INTERVAL '1 day')
        AND (closed_at IS NULL OR closed_at >= $2::date + INTERVAL '1 day')
      GROUP BY 1, 2`),
    (m, r) => { m.backlog += num(r.n) })

  // ── Channel grain (B9): the same folds, grouped by source_channel. ──
  const byChannel = new Map<string, Metrics>()
  const cslot = (channel: string) => {
    let m = byChannel.get(channel)
    if (!m) { m = zero(); byChannel.set(channel, m) }
    return m
  }
  const foldChannel = (rows: AggRow[], apply: (m: Metrics, r: AggRow) => void) => {
    for (const r of rows) apply(cslot(String(r.channel)), r)
  }
  const CH = `COALESCE(source_channel, 'unknown')`

  foldChannel(await q(
    `SELECT ${CH} AS channel,
            count(*)::int AS n, COALESCE(sum(message_count),0)::bigint AS messages,
            COALESCE(sum(public_reply_count),0)::bigint AS public_replies,
            COALESCE(sum(time_spent_seconds),0)::bigint AS time_spent
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL AND ${day}
      GROUP BY 1`),
    (m, r) => { m.created += num(r.n); m.messages += num(r.messages); m.publicReplies += num(r.public_replies); m.timeSpent += num(r.time_spent) })

  foldChannel(await q(
    `SELECT ${CH} AS channel,
            count(*)::int AS n,
            COALESCE(sum(extract(epoch FROM (resolved_at - created_at)) / 60.0), 0) AS minutes
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL AND ${byStamp("resolved_at")}
      GROUP BY 1`),
    (m, r) => { m.resolved += num(r.n); m.resCount += num(r.n); m.resSum += num(r.minutes) })

  foldChannel(await q(
    `SELECT ${CH} AS channel, count(*)::int AS n
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL AND ${byStamp("closed_at")}
      GROUP BY 1`),
    (m, r) => { m.closed += num(r.n) })

  foldChannel(await q(
    `SELECT ${CH} AS channel,
            count(*)::int AS n,
            COALESCE(sum(extract(epoch FROM (first_public_reply_at - created_at)) / 60.0), 0) AS minutes
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL AND ${byStamp("first_public_reply_at")}
      GROUP BY 1`),
    (m, r) => { m.frCount += num(r.n); m.frSum += num(r.minutes) })

  foldChannel(await q(
    `SELECT COALESCE(t.source_channel, 'unknown') AS channel, count(*)::int AS n
       FROM public.support_ticket_events e
       JOIN public.support_tickets t ON t.id = e.ticket_id
      WHERE e.tenant_id = $1::uuid AND e.event_type = 'reopened'
        AND e.created_at >= $2::date AND e.created_at < $2::date + INTERVAL '1 day'
      GROUP BY 1`),
    (m, r) => { m.reopened += num(r.n) })

  foldChannel(await q(
    `SELECT ${CH} AS channel,
            count(*)::int AS due,
            count(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at <= resolution_due_at)::int AS met,
            count(*) FILTER (WHERE resolution_breached_at IS NOT NULL
                              OR (resolved_at IS NOT NULL AND resolved_at > resolution_due_at))::int AS breached
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL AND ${byStamp("resolution_due_at")}
      GROUP BY 1`),
    (m, r) => { m.slaDue += num(r.due); m.slaMet += num(r.met); m.slaBreached += num(r.breached) })

  foldChannel(await q(
    `SELECT ${CH} AS channel,
            count(*)::int AS n, COALESCE(sum(csat_score),0)::int AS score_sum
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL AND csat_score IS NOT NULL
        AND ${byStamp("csat_answered_at")}
      GROUP BY 1`),
    (m, r) => { m.csatCount += num(r.n); m.csatSum += num(r.score_sum) })

  foldChannel(await q(
    `SELECT ${CH} AS channel, count(*)::int AS n
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL
        AND created_at < $2::date + INTERVAL '1 day'
        AND (resolved_at IS NULL OR resolved_at >= $2::date + INTERVAL '1 day')
        AND (closed_at IS NULL OR closed_at >= $2::date + INTERVAL '1 day')
      GROUP BY 1`),
    (m, r) => { m.backlog += num(r.n) })

  // Fold (team, category) cells into the grains, plus channel rows.
  interface GrainRow extends Metrics { grain: string; team_id: string | null; category: string | null; channel: string | null }
  const grains = new Map<string, GrainRow>()
  const gslot = (grain: string, team_id: string | null, category: string | null, channel: string | null = null) => {
    const key = `${grain}|${team_id ?? ""}|${category ?? ""}|${channel ?? ""}`
    let g = grains.get(key)
    if (!g) { g = { ...zero(), grain, team_id, category, channel }; grains.set(key, g) }
    return g
  }
  const addInto = (g: Metrics, m: Metrics) => {
    (Object.keys(zero()) as (keyof Metrics)[]).forEach((k) => { g[k] += m[k] })
  }
  for (const m of merged.values()) {
    addInto(gslot("total", null, null), m)
    addInto(gslot("category", null, m.category), m)
    if (m.team_id) {
      addInto(gslot("team", m.team_id, null), m)
      addInto(gslot("team_category", m.team_id, m.category), m)
    }
  }
  for (const [channel, m] of byChannel) {
    addInto(gslot("channel", null, null, channel), m)
  }

  await db.query(
    `DELETE FROM public.support_report_daily
      WHERE tenant_id = $1::uuid AND rollup_date = $2::date`,
    [tenantId, dateISO],
  )
  let rowsWritten = 0
  for (const g of grains.values()) {
    // Skip all-zero non-total grains (a category with only a backlog
    // still counts — backlog is a real value, so check every metric).
    await db.query(
      `INSERT INTO public.support_report_daily
         (tenant_id, rollup_date, grain, team_id, category, channel,
          tickets_created, tickets_resolved, tickets_closed, tickets_reopened,
          first_response_count, first_response_minutes_sum,
          resolution_count, resolution_minutes_sum,
          sla_due_count, sla_met_count, sla_breached_count,
          messages_count, public_reply_count,
          csat_count, csat_score_sum, time_spent_seconds, backlog_open_end)
       VALUES ($1::uuid, $2::date, $3, $4::uuid, $5, $6,
               $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
               $18, $19, $20, $21, $22, $23)`,
      [
        tenantId, dateISO, g.grain, g.team_id, g.category, g.channel,
        g.created, g.resolved, g.closed, g.reopened,
        g.frCount, g.frSum, g.resCount, g.resSum,
        g.slaDue, g.slaMet, g.slaBreached,
        g.messages, g.publicReplies,
        g.csatCount, g.csatSum, g.timeSpent, g.backlog,
      ],
    )
    rowsWritten++
  }
  return { rowsWritten }
}

export interface SupportMetricsResult {
  from: string
  to: string
  grain: string
  ticketsCreated: number
  ticketsResolved: number
  ticketsClosed: number
  ticketsReopened: number
  reopenRate: number | null
  avgFirstResponseMinutes: number | null
  avgResolutionMinutes: number | null
  slaDue: number
  slaMet: number
  slaBreached: number
  slaAttainmentPct: number | null
  csatResponses: number
  csatAvg: number | null
  messages: number
  publicReplies: number
  repliesPerResolvedTicket: number | null
  timeSpentSeconds: number
  backlogOpenEnd: number | null
}

/** The category codes, team ids, and channels that carry rollup rows
 *  in a range — the desk reporting surface iterates these to build
 *  its breakdowns through getSupportMetrics (one canonical reader,
 *  no second math). */
export async function listRollupKeys(
  db: SupportDb,
  tenantId: string,
  range: { from: string; to: string },
): Promise<{ categories: string[]; teamIds: string[]; channels: string[] }> {
  const { rows: catRows } = await db.query<{ category: string }>(
    `SELECT DISTINCT category FROM public.support_report_daily
      WHERE tenant_id = $1::uuid AND category IS NOT NULL
        AND rollup_date >= $2::date AND rollup_date <= $3::date
      ORDER BY category`,
    [tenantId, range.from, range.to],
  )
  const { rows: teamRows } = await db.query<{ team_id: string }>(
    `SELECT DISTINCT team_id::text AS team_id FROM public.support_report_daily
      WHERE tenant_id = $1::uuid AND team_id IS NOT NULL
        AND rollup_date >= $2::date AND rollup_date <= $3::date
      ORDER BY team_id`,
    [tenantId, range.from, range.to],
  )
  const { rows: chanRows } = await db.query<{ channel: string }>(
    `SELECT DISTINCT channel FROM public.support_report_daily
      WHERE tenant_id = $1::uuid AND grain = 'channel' AND channel IS NOT NULL
        AND rollup_date >= $2::date AND rollup_date <= $3::date
      ORDER BY channel`,
    [tenantId, range.from, range.to],
  )
  return {
    categories: catRows.map((r) => r.category),
    teamIds: teamRows.map((r) => r.team_id),
    channels: chanRows.map((r) => r.channel),
  }
}

/** The tenants carrying rollup rows in a range — the franchise
 *  rollup's key list (§17: master sees all tenants). The reporting
 *  route only calls this under the desk's existing master-scope
 *  widening; the rows themselves stay tenant-keyed, so a franchisee
 *  caller never reaches another tenant's numbers through it. */
export async function listRollupTenants(
  db: SupportDb,
  range: { from: string; to: string },
): Promise<string[]> {
  const { rows } = await db.query<{ tenant_id: string }>(
    `SELECT DISTINCT tenant_id::text AS tenant_id FROM public.support_report_daily
      WHERE rollup_date >= $1::date AND rollup_date <= $2::date
      ORDER BY tenant_id`,
    [range.from, range.to],
  )
  return rows.map((r) => r.tenant_id)
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function getSupportMetrics(
  db: SupportDb,
  tenantId: string,
  range: { from: string; to: string; teamId?: string | null; category?: string | null; channel?: string | null },
): Promise<SupportMetricsResult> {
  const grain = range.channel ? "channel"
    : range.teamId && range.category ? "team_category"
    : range.teamId ? "team"
    : range.category ? "category"
    : "total"
  const where = `tenant_id = $1::uuid AND grain = $4
    AND rollup_date >= $2::date AND rollup_date <= $3::date
    AND ($5::uuid IS NULL OR team_id = $5::uuid)
    AND ($6::text IS NULL OR category = $6::text)
    AND ($7::text IS NULL OR channel = $7::text)`
  const params = [tenantId, range.from, range.to, grain, range.teamId ?? null, range.category ?? null, range.channel ?? null]
  const { rows } = await db.query<any>(
    `SELECT COALESCE(sum(tickets_created),0) AS created,
            COALESCE(sum(tickets_resolved),0) AS resolved,
            COALESCE(sum(tickets_closed),0) AS closed,
            COALESCE(sum(tickets_reopened),0) AS reopened,
            COALESCE(sum(first_response_count),0) AS fr_count,
            COALESCE(sum(first_response_minutes_sum),0) AS fr_sum,
            COALESCE(sum(resolution_count),0) AS res_count,
            COALESCE(sum(resolution_minutes_sum),0) AS res_sum,
            COALESCE(sum(sla_due_count),0) AS sla_due,
            COALESCE(sum(sla_met_count),0) AS sla_met,
            COALESCE(sum(sla_breached_count),0) AS sla_breached,
            COALESCE(sum(messages_count),0) AS messages,
            COALESCE(sum(public_reply_count),0) AS public_replies,
            COALESCE(sum(csat_count),0) AS csat_count,
            COALESCE(sum(csat_score_sum),0) AS csat_sum,
            COALESCE(sum(time_spent_seconds),0) AS time_spent
       FROM public.support_report_daily WHERE ${where}`,
    params,
  )
  const { rows: backlogRows } = await db.query<{ backlog_open_end: number }>(
    `SELECT backlog_open_end FROM public.support_report_daily
      WHERE ${where} ORDER BY rollup_date DESC LIMIT 1`,
    params,
  )
  const r = rows[0] ?? {}
  const created = num(r.created), resolved = num(r.resolved)
  const frCount = num(r.fr_count), resCount = num(r.res_count)
  const slaDue = num(r.sla_due), slaMet = num(r.sla_met)
  const csatCount = num(r.csat_count)
  const publicReplies = num(r.public_replies)
  return {
    from: range.from, to: range.to, grain,
    ticketsCreated: created,
    ticketsResolved: resolved,
    ticketsClosed: num(r.closed),
    ticketsReopened: num(r.reopened),
    reopenRate: resolved > 0 ? round2(num(r.reopened) / resolved) : null,
    avgFirstResponseMinutes: frCount > 0 ? round2(num(r.fr_sum) / frCount) : null,
    avgResolutionMinutes: resCount > 0 ? round2(num(r.res_sum) / resCount) : null,
    slaDue, slaMet, slaBreached: num(r.sla_breached),
    slaAttainmentPct: slaDue > 0 ? round2((slaMet / slaDue) * 100) : null,
    csatResponses: csatCount,
    csatAvg: csatCount > 0 ? round2(num(r.csat_sum) / csatCount) : null,
    messages: num(r.messages),
    publicReplies,
    repliesPerResolvedTicket: resolved > 0 ? round2(publicReplies / resolved) : null,
    timeSpentSeconds: num(r.time_spent),
    backlogOpenEnd: backlogRows[0] ? num(backlogRows[0].backlog_open_end) : null,
  }
}

// ── Backlog age (§17) ────────────────────────────────────────────────
// The rollup carries the backlog COUNT at each day's end; age is a
// property of the backlog as it stands, so it is read live from the
// spine: how many tickets are open right now, how old the oldest is,
// and the average age. Merged-away duplicates are not backlog.

export interface BacklogAge {
  openCount: number
  oldestAgeMinutes: number | null
  avgAgeMinutes: number | null
  oldestTicketRef: string | null
}

export async function getBacklogAge(
  db: SupportDb,
  tenantId: string,
): Promise<BacklogAge> {
  const { rows } = await db.query<any>(
    `SELECT count(*)::int AS open_count,
            round(avg(extract(epoch FROM (now() - created_at)) / 60.0)::numeric, 2) AS avg_age,
            round(max(extract(epoch FROM (now() - created_at)) / 60.0)::numeric, 2) AS oldest_age,
            (SELECT ticket_ref FROM public.support_tickets
              WHERE tenant_id = $1::uuid AND deleted_at IS NULL
                AND merged_into_id IS NULL AND status IN ('open','pending')
              ORDER BY created_at ASC LIMIT 1) AS oldest_ref
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND deleted_at IS NULL
        AND merged_into_id IS NULL AND status IN ('open','pending')`,
    [tenantId],
  )
  const r = rows[0] ?? {}
  const openCount = num(r.open_count)
  return {
    openCount,
    oldestAgeMinutes: openCount > 0 && r.oldest_age != null ? num(r.oldest_age) : null,
    avgAgeMinutes: openCount > 0 && r.avg_age != null ? num(r.avg_age) : null,
    oldestTicketRef: r.oldest_ref ?? null,
  }
}

// ── Workload (§17) ───────────────────────────────────────────────────
// Open load per assignee as it stands (open / pending / urgent-open),
// plus the assignee's resolved volume over the range with its average
// resolution time (sums/counts, derived here — never averaged
// averages). Assignment is the ticket's CURRENT assignee, the same
// basis the backlog team grains document. Unassigned work is its own
// row (staffId null) — it is real load on the desk, not an omission.

export interface WorkloadRow {
  staffId: string | null
  staffName: string | null
  open: number
  pending: number
  urgentOpen: number
  resolvedInRange: number
  avgResolutionMinutes: number | null
}

export async function getWorkload(
  db: SupportDb,
  tenantId: string,
  range: { from: string; to: string },
): Promise<WorkloadRow[]> {
  const { rows } = await db.query<any>(
    `SELECT t.assigned_staff_id::text AS staff_id, s.display_name AS staff_name,
            count(*) FILTER (WHERE t.status = 'open')::int AS open_n,
            count(*) FILTER (WHERE t.status = 'pending')::int AS pending_n,
            count(*) FILTER (WHERE t.status IN ('open','pending') AND t.priority = 'urgent')::int AS urgent_n,
            count(*) FILTER (WHERE t.resolved_at >= $2::date
                               AND t.resolved_at < $3::date + INTERVAL '1 day')::int AS res_n,
            COALESCE(sum(extract(epoch FROM (t.resolved_at - t.created_at)) / 60.0)
                     FILTER (WHERE t.resolved_at >= $2::date
                               AND t.resolved_at < $3::date + INTERVAL '1 day'), 0) AS res_minutes
       FROM public.support_tickets t
       LEFT JOIN public.crm_staff s ON s.id = t.assigned_staff_id
      WHERE t.tenant_id = $1::uuid AND t.deleted_at IS NULL AND t.merged_into_id IS NULL
        AND (t.status IN ('open','pending')
             OR (t.resolved_at >= $2::date AND t.resolved_at < $3::date + INTERVAL '1 day'))
      GROUP BY 1, 2
      ORDER BY open_n DESC, pending_n DESC, staff_name NULLS LAST`,
    [tenantId, range.from, range.to],
  )
  return rows.map((r: any) => ({
    staffId: r.staff_id ?? null,
    staffName: r.staff_name ?? null,
    open: num(r.open_n),
    pending: num(r.pending_n),
    urgentOpen: num(r.urgent_n),
    resolvedInRange: num(r.res_n),
    avgResolutionMinutes: num(r.res_n) > 0 ? round2(num(r.res_minutes) / num(r.res_n)) : null,
  }))
}

// ── CSV export gate (§17: "gated by 'support.export'") ──────────────
// The code is seeded registry data (support_permissions, 20261031:
// 'Export ticket data'), bound to module 'support'. Its platform
// semantics (platform_has_permission) are: platform admin, OR a
// platform_module_permissions grant on the code's module at write or
// full. At the app layer the desk's module gate has already passed
// when this runs; this resolves the code itself against the caller's
// staff record, exactly as getSupportAuthority resolves approver
// class: no staff row (an admin session the gate admitted) passes,
// an owner staff record passes, a 'support' grant at write/full
// passes; a read-only grant does not export.

export async function hasSupportExportPermission(
  db: SupportDb,
  tenantId: string,
  staffId: string | null,
): Promise<boolean> {
  if (!staffId) return true
  const { rows } = await db.query<any>(
    `SELECT s.role, p.access_level
       FROM public.crm_staff s
       LEFT JOIN public.platform_module_permissions p
         ON p.staff_id = s.id AND p.module_code = 'support'
      WHERE s.id = $1::uuid AND s.tenant_id = $2::uuid AND s.is_active
      LIMIT 1`,
    [staffId, tenantId],
  )
  const r = rows[0]
  if (!r) return false
  const level = String(r.access_level ?? "none")
  return r.role === "owner" || level === "write" || level === "full"
}

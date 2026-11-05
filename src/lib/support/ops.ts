// ===========================================================================
// Support Desk §13 — BACKGROUND JOBS: the operations read surface.
//
// support_jobs is the desk's job ledger (live schema, migration-era CHECKs):
//   type   — sla_sweep | auto_close | email_ingest_retry | csat_dispatch |
//            retention | virus_scan | webhook_delivery
//   status — queued | running | succeeded | failed | dead_letter
//   tenant_id is NULLABLE in the schema (a platform-shaped slot), but every
//   writer in the code today stamps its tenant; reads below scope to the
//   resolved tenant, widening only under the desk's master condition.
//
// HOW JOBS ACTUALLY RUN (updated by the support-gaps build): the two
// synchronous producers (the support sweep and §18 retention) run
// their work INLINE in their own request and record the run as a job
// row (running → succeeded/failed). Queued work is executed by the
// §13 CONSUMER (jobs.ts — claim/heartbeat/settle, registered types
// only: webhook_delivery today), driven by the sweep's per-tenant
// pass and by /api/cron/support-jobs. Consequences this lib encodes
// honestly:
//   - A 'running' row older than STALE_RUNNING_MINUTES is STUCK by
//     definition: producers write a terminal state synchronously, and
//     the consumer heartbeats its claims — a live run never
//     legitimately stays running past the lease. The consumer
//     reclaims stuck rows (requeue, or dead_letter when attempts are
//     spent) on its next pass.
//   - This surface stays READ-ONLY: retry/requeue is the consumer's
//     automatic discipline, not a desk action — no manual requeue is
//     offered here.
//   - Three of the seven types still have vocabulary slots and NO
//     producer yet (auto_close, csat_dispatch, virus_scan): their
//     counts read zero because nothing writes them, and the surface
//     says so rather than implying flow. webhook_delivery is produced
//     by logTicketEvent's §16 emission (webhooks.ts).
//
// §13's failed-ingest quarantine = this ledger's email_ingest_retry rows
// in failed/dead_letter (inbound mail never silently dropped). The §3
// inbound email ingest (B14, channels.ts) is the producer: mail that
// cannot be filed — unparseable, blocked, bounce-shaped, unknown
// domain, body-fetch failure — is held here with its reason. (The
// table literally named `quarantine` in the live DB is the SUPPLIER
// feed's product quarantine — kole-sync.ts writes it; it is not a
// support store and is never read here.)
// ===========================================================================

export const JOB_TYPES = [
  "sla_sweep",
  "auto_close",
  "email_ingest_retry",
  "csat_dispatch",
  "retention",
  "virus_scan",
  "webhook_delivery",
] as const

export const JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "dead_letter",
] as const

/** Types with a producer in the code today, and what produces them. */
export const JOB_PRODUCERS: Record<string, string> = {
  sla_sweep: "Support sweep cron — records its own per-tenant runs",
  retention: "§18 retention — a run records itself in the sweep's idiom",
  email_ingest_retry: "§3 inbound email ingest — a held delivery records itself here with its reason (the §13 quarantine)",
  webhook_delivery: "§16 outbound webhooks — logTicketEvent emission queues one job per subscribed registration; the §13 consumer (jobs.ts) executes them",
}

/** A 'running' job older than this is stuck (see header: producers are synchronous). */
export const STALE_RUNNING_MINUTES = 30

export interface JobRow {
  id: string
  tenantId: string | null
  type: string
  status: string
  attempts: number
  maxAttempts: number
  nextAttemptAt: string | null
  lastError: string | null
  payload: unknown
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface JobTypeHealth {
  type: string
  producer: string | null
  total: number
  byStatus: Record<string, number>
  lastFinishedAt: string | null
}

export interface QueueHealth {
  byStatus: Record<string, number>
  byType: JobTypeHealth[]
  staleRunning: number
  queuedOldestAt: string | null
}

const JOB_COLUMNS = `
  id::text AS id, tenant_id::text AS tenant_id, type, status,
  attempts, max_attempts, next_attempt_at, last_error, payload,
  created_at, started_at, finished_at`

function mapJobRow(r: any): JobRow {
  return {
    id: r.id,
    tenantId: r.tenant_id ?? null,
    type: r.type,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    nextAttemptAt: r.next_attempt_at ? new Date(r.next_attempt_at).toISOString() : null,
    lastError: r.last_error ?? null,
    payload: r.payload ?? null,
    createdAt: new Date(r.created_at).toISOString(),
    startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
    finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
  }
}

/** Tenant predicate fragment + params for the ops reads. */
function scope(scopeAll: boolean, tenant: string): { where: string; params: unknown[] } {
  return scopeAll
    ? { where: "", params: [] }
    : { where: "WHERE tenant_id = $1::uuid", params: [tenant] }
}

export async function getQueueHealth(
  client: any,
  tenant: string,
  scopeAll: boolean,
): Promise<QueueHealth> {
  const { where, params } = scope(scopeAll, tenant)

  const statusRes = await client.query(
    `SELECT status, count(*)::int AS n FROM public.support_jobs ${where} GROUP BY status`,
    params,
  )
  const byStatus: Record<string, number> = {}
  for (const s of JOB_STATUSES) byStatus[s] = 0
  for (const r of statusRes.rows as any[]) byStatus[r.status] = r.n

  const typeRes = await client.query(
    `SELECT type, status, count(*)::int AS n, max(finished_at) AS last_finished_at
       FROM public.support_jobs ${where} GROUP BY type, status`,
    params,
  )
  const perType = new Map<string, JobTypeHealth>()
  for (const t of JOB_TYPES) {
    perType.set(t, {
      type: t,
      producer: JOB_PRODUCERS[t] ?? null,
      total: 0,
      byStatus: Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])),
      lastFinishedAt: null,
    })
  }
  for (const r of typeRes.rows as any[]) {
    const entry = perType.get(r.type)
    if (!entry) continue
    entry.byStatus[r.status] = r.n
    entry.total += r.n
    if (r.last_finished_at) {
      const iso = new Date(r.last_finished_at).toISOString()
      if (!entry.lastFinishedAt || iso > entry.lastFinishedAt) entry.lastFinishedAt = iso
    }
  }

  const staleRes = await client.query(
    `SELECT count(*)::int AS n FROM public.support_jobs
      ${where ? `${where} AND` : "WHERE"} status = 'running'
        AND COALESCE(started_at, created_at) < now() - ($${params.length + 1}::int || ' minutes')::interval`,
    [...params, STALE_RUNNING_MINUTES],
  )

  const queuedRes = await client.query(
    `SELECT min(created_at) AS oldest FROM public.support_jobs
      ${where ? `${where} AND` : "WHERE"} status = 'queued'`,
    params,
  )

  return {
    byStatus,
    byType: [...perType.values()],
    staleRunning: staleRes.rows[0]?.n ?? 0,
    queuedOldestAt: queuedRes.rows[0]?.oldest
      ? new Date(queuedRes.rows[0].oldest).toISOString()
      : null,
  }
}

/** Newest failed + dead-letter rows — the desk's failure visibility. */
export async function listJobFailures(
  client: any,
  tenant: string,
  scopeAll: boolean,
  limit = 25,
): Promise<JobRow[]> {
  const { where, params } = scope(scopeAll, tenant)
  const res = await client.query(
    `SELECT ${JOB_COLUMNS} FROM public.support_jobs
      ${where ? `${where} AND` : "WHERE"} status IN ('failed','dead_letter')
      ORDER BY COALESCE(finished_at, updated_at) DESC
      LIMIT $${params.length + 1}`,
    [...params, limit],
  )
  return (res.rows as any[]).map(mapJobRow)
}

/** Dead-letter rows with full payload + error — the inspection read. */
export async function listDeadLetters(
  client: any,
  tenant: string,
  scopeAll: boolean,
  limit = 25,
): Promise<JobRow[]> {
  const { where, params } = scope(scopeAll, tenant)
  const res = await client.query(
    `SELECT ${JOB_COLUMNS} FROM public.support_jobs
      ${where ? `${where} AND` : "WHERE"} status = 'dead_letter'
      ORDER BY COALESCE(finished_at, updated_at) DESC
      LIMIT $${params.length + 1}`,
    [...params, limit],
  )
  return (res.rows as any[]).map(mapJobRow)
}

/**
 * §13 failed-ingest quarantine: email_ingest_retry jobs in failed or
 * dead_letter state — inbound mail that could not be ingested and must
 * never be silently dropped. (The ingest pipeline that produces these
 * jobs is unbuilt; see header.)
 */
export async function getIngestQuarantine(
  client: any,
  tenant: string,
  scopeAll: boolean,
  limit = 25,
): Promise<{ held: number; byStatus: Record<string, number>; rows: JobRow[] }> {
  const { where, params } = scope(scopeAll, tenant)
  const heldWhere = `${where ? `${where} AND` : "WHERE"} type = 'email_ingest_retry'`

  const counts = await client.query(
    `SELECT status, count(*)::int AS n FROM public.support_jobs ${heldWhere} GROUP BY status`,
    params,
  )
  const byStatus: Record<string, number> = {}
  for (const s of JOB_STATUSES) byStatus[s] = 0
  for (const r of counts.rows as any[]) byStatus[r.status] = r.n

  const res = await client.query(
    `SELECT ${JOB_COLUMNS} FROM public.support_jobs
      ${heldWhere} AND status IN ('failed','dead_letter')
      ORDER BY COALESCE(finished_at, updated_at) DESC
      LIMIT $${params.length + 1}`,
    [...params, limit],
  )
  return {
    held: (byStatus.failed ?? 0) + (byStatus.dead_letter ?? 0),
    byStatus,
    rows: (res.rows as any[]).map(mapJobRow),
  }
}

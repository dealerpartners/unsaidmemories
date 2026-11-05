// ---------------------------------------------------------------------------
// sync_jobs — the durable record set for the Supabase ↔ Stripe ↔ Algolia
// sync triangle (migration 20261080). Every cross-system sync is a job row:
// producers enqueue, the cron runner claims and executes, and the row's
// lifecycle is the proof the sync happened. Before this module the triangle
// left no trace at all — the product→Stripe endpoint was manual and silent,
// feed-sync told nobody, and the Algolia indexer was a hand-run script.
//
// Retry profile: portals.md §9.4 — 5 attempts, exponential backoff
// 1s / 10s / 1m / 10m / 1h via scheduled_for; exhaustion lands in 'dead'
// with last_error holding the final failure.
// ---------------------------------------------------------------------------

export type SyncJobType =
  | "stripe_product_sync"
  | "algolia_reindex"
  | "feed_followthrough"

export type SyncJobStatus = "queued" | "running" | "succeeded" | "failed" | "dead"

export type SyncJob = {
  id: string
  tenant_id: string
  job_type: SyncJobType
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  status: SyncJobStatus
  attempts: number
  last_error: string | null
  idempotency_key: string
  scheduled_for: string
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

export const SYNC_MAX_ATTEMPTS = 5
// §9.4 backoff ladder, indexed by the attempt that just failed (1-based).
const BACKOFF_MS = [1_000, 10_000, 60_000, 600_000, 3_600_000]

export function backoffMs(failedAttempt: number): number {
  const i = Math.min(Math.max(failedAttempt, 1), BACKOFF_MS.length) - 1
  return BACKOFF_MS[i]
}

/**
 * Enqueue a job. Idempotent on idempotency_key: a replayed producer call
 * returns the existing job instead of duplicating the sync.
 */
export async function enqueueSyncJob(
  c: PgClient,
  input: {
    tenantId: string
    jobType: SyncJobType
    payload: Record<string, unknown>
    idempotencyKey: string
    scheduledFor?: Date
  },
): Promise<SyncJob> {
  const { rows } = await c.query(
    `INSERT INTO public.sync_jobs (tenant_id, job_type, payload, idempotency_key, scheduled_for)
     VALUES ($1, $2, $3::jsonb, $4, COALESCE($5, now()))
     ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [
      input.tenantId,
      input.jobType,
      JSON.stringify(input.payload),
      input.idempotencyKey,
      input.scheduledFor ?? null,
    ],
  )
  return rows[0] as SyncJob
}

/**
 * Claim the oldest due job. The status flip is atomic via FOR UPDATE
 * SKIP LOCKED, so concurrent runners never execute the same job twice.
 */
export async function claimNextSyncJob(c: PgClient): Promise<SyncJob | null> {
  const { rows } = await c.query(
    `UPDATE public.sync_jobs j
        SET status = 'running',
            attempts = j.attempts + 1,
            started_at = now(),
            updated_at = now()
      WHERE j.id = (
        SELECT id FROM public.sync_jobs
         WHERE status = 'queued' AND scheduled_for <= now()
         ORDER BY scheduled_for ASC, created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING j.*`,
  )
  return (rows[0] as SyncJob) ?? null
}

export async function completeSyncJob(
  c: PgClient,
  jobId: string,
  result: Record<string, unknown>,
): Promise<void> {
  await c.query(
    `UPDATE public.sync_jobs
        SET status = 'succeeded', result = $2::jsonb, last_error = NULL,
            finished_at = now(), updated_at = now()
      WHERE id = $1`,
    [jobId, JSON.stringify(result)],
  )
}

/**
 * Record a failure. Attempts remaining → back to 'queued' with the next
 * scheduled_for pushed out by the §9.4 ladder (status 'failed' is reserved
 * for the terminal record only when a caller forces it; the runner's
 * contract is queued-retry or dead). Exhausted → 'dead'.
 */
export async function failSyncJob(
  c: PgClient,
  job: Pick<SyncJob, "id" | "attempts">,
  error: string,
): Promise<"queued" | "dead"> {
  if (job.attempts >= SYNC_MAX_ATTEMPTS) {
    await c.query(
      `UPDATE public.sync_jobs
          SET status = 'dead', last_error = $2, finished_at = now(), updated_at = now()
        WHERE id = $1`,
      [job.id, error],
    )
    return "dead"
  }
  const next = new Date(Date.now() + backoffMs(job.attempts))
  await c.query(
    `UPDATE public.sync_jobs
        SET status = 'queued', last_error = $2, scheduled_for = $3, updated_at = now()
      WHERE id = $1`,
    [job.id, error, next.toISOString()],
  )
  return "queued"
}

/**
 * Enqueue from inside a caller's transaction (the product write paths):
 * wrapped in a SAVEPOINT so a missing sync_jobs table (migration pending)
 * or any enqueue failure rolls back ONLY the enqueue — the caller's write
 * still commits. Returns whether the job was recorded.
 */
export async function enqueueSyncJobSafe(
  c: PgClient,
  input: Parameters<typeof enqueueSyncJob>[1],
): Promise<boolean> {
  try {
    await c.query("SAVEPOINT sync_enqueue")
    await enqueueSyncJob(c, input)
    await c.query("RELEASE SAVEPOINT sync_enqueue")
    return true
  } catch {
    try { await c.query("ROLLBACK TO SAVEPOINT sync_enqueue") } catch { /* no txn */ }
    return false
  }
}

/** Terminally fail a job whose error is not retryable (e.g. the subject
 *  product no longer exists). Distinct from 'dead' (retries exhausted). */
export async function failSyncJobTerminal(
  c: PgClient,
  jobId: string,
  error: string,
): Promise<void> {
  await c.query(
    `UPDATE public.sync_jobs
        SET status = 'failed', last_error = $2, finished_at = now(), updated_at = now()
      WHERE id = $1`,
    [jobId, error],
  )
}

/** Recent jobs for the admin surface, newest first. */
export async function listSyncJobs(
  c: PgClient,
  tenantId: string,
  limit = 50,
): Promise<SyncJob[]> {
  const { rows } = await c.query(
    `SELECT * FROM public.sync_jobs
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [tenantId, limit],
  )
  return rows as SyncJob[]
}

/**
 * True when the sync_jobs table itself is missing (migration 20261080 not
 * yet applied) — callers use this to degrade honestly instead of 500ing.
 */
export function isMissingSyncJobsTable(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /sync_jobs/.test(msg) && /(does not exist|undefined table|42P01)/i.test(msg)
}

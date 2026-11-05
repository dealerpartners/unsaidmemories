import "server-only"

// ---------------------------------------------------------------------------
// Google Indexing API — server side.
//
// THE credential gate is this module: every surface (the cron sweep,
// the admin settings route) resolves credentials through
// resolveGoogleIndexingConfig() — ONE definition. Sources, in the
// platform's settings posture (app_settings wins, env is the fallback
// — the lib/paypal.ts pattern):
//   app_settings: google.indexing_service_account_json
//   env:          GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON (the downloaded
//                 service-account key file, as one JSON string), or the
//                 field pair GOOGLE_INDEXING_CLIENT_EMAIL +
//                 GOOGLE_INDEXING_PRIVATE_KEY (the shape the platform's
//                 creds file carries for the Web Search Indexing API
//                 service account: client email + PEM private key).
// Values are NEVER hardcoded. Until credentials exist, the gate
// reports armed=false and every consumer no-ops honestly.
//
// Submissions are recorded in google_indexing_submissions (migration
// record 20261199): the ledger IS the dedupe state (freshness window +
// the version Google was told about) and the failure record (status,
// error, attempts, backoff). Before the record is applied live, the
// store probes to_regclass and the sweep reports installed=false and
// submits NOTHING — without the ledger there is no honest dedupe, and
// an unrecorded submission is a resubmission waiting to happen.
// ---------------------------------------------------------------------------

import { pgQuery } from "@/lib/pg"
import { cached } from "@/lib/cache"
import { buildSitemap } from "@/lib/shop/sitemap-source"
import {
  GOOGLE_BATCH_URL,
  GOOGLE_TOKEN_URL,
  INDEXING_BATCH_SIZE,
  INDEXING_DAILY_QUOTA,
  GOOGLE_INDEXING_SCOPE,
  buildBatchBody,
  buildServiceAccountJwtWithScopes,
  chunkBatches,
  isSuccessStatus,
  parseBatchResponse,
  parseServiceAccount,
  runDecisionFor,
  selectCandidates,
  type IndexingCandidateInput,
  type IndexingUrlState,
  type ServiceAccount,
  type UrlNotificationType,
} from "./core"

export type GoogleIndexingConfig = {
  serviceAccount: ServiceAccount | null
  armed: boolean
}

const SETTINGS_KEY = "google.indexing_service_account_json"

/** The env-only snapshot (synchronous base of the resolved gate). */
export function googleIndexingEnvConfig(): GoogleIndexingConfig {
  const fromJson = parseServiceAccount(process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON)
  if (fromJson) return { serviceAccount: fromJson, armed: true }
  const fromPair = parseServiceAccount({
    client_email: process.env.GOOGLE_INDEXING_CLIENT_EMAIL || "",
    private_key: process.env.GOOGLE_INDEXING_PRIVATE_KEY || "",
    project_id: process.env.GOOGLE_INDEXING_PROJECT_ID || "",
  })
  if (fromPair) return { serviceAccount: fromPair, armed: true }
  return { serviceAccount: null, armed: false }
}

/** The resolved gate: app_settings overlay the env snapshot (cached
 *  5 min, the paypal pattern). A DB outage degrades to the env
 *  snapshot — credentials in env keep working. */
export async function resolveGoogleIndexingConfig(): Promise<GoogleIndexingConfig> {
  return cached("google-indexing:config", 5 * 60 * 1000, async () => {
    const base = googleIndexingEnvConfig()
    try {
      const rows = await pgQuery<{ value: unknown }>(
        `SELECT value FROM app_settings WHERE key = $1`,
        [SETTINGS_KEY],
      )
      const fromSettings = parseServiceAccount(rows[0]?.value)
      if (fromSettings) return { serviceAccount: fromSettings, armed: true }
    } catch {
      // Settings read failed — the env snapshot stands.
    }
    return base
  })
}

// ---------------------------------------------------------------------------
// Access token (service-account JWT exchange, cached in-process)
// ---------------------------------------------------------------------------

// One cache slot PER SCOPE SET: an access token carries the scopes
// it was minted for, so the indexing token and the Merchant / Search
// Console / GA4 tokens (lib/google-properties) must never be served
// for one another. The slot key is the account + sorted scope list.
const tokenCache = new Map<string, { token: string; expiresAtMs: number }>()

/** Mint (or reuse) an access token for an explicit scope set, via
 *  the same JWT-bearer exchange as the indexing token. This is the
 *  scope extension of the ONE credential gate: consumers resolve
 *  the service account through resolveGoogleIndexingConfig() and
 *  mint their tokens here — there is no second credential path. */
export async function getGoogleAccessTokenForScopes(
  sa: ServiceAccount,
  scopes: readonly string[],
  nowMs: number = Date.now(),
): Promise<string> {
  const cacheKey = `${sa.clientEmail}|${[...scopes].sort().join(" ")}`
  const hit = tokenCache.get(cacheKey)
  if (hit && hit.expiresAtMs > nowMs + 30_000) return hit.token
  const assertion = buildServiceAccountJwtWithScopes(sa, nowMs, scopes)
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Google token exchange failed: HTTP ${res.status} ${text.slice(0, 300)}`)
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new Error("Google token exchange returned no access_token")
  const ttlMs = Math.max(60, Number(data.expires_in) || 3600) * 1000
  tokenCache.set(cacheKey, { token: data.access_token, expiresAtMs: nowMs + ttlMs })
  return data.access_token
}

/** The indexing-scope token — the original entry point, unchanged
 *  for existing callers (the batch publisher above). */
export async function getGoogleAccessToken(
  sa: ServiceAccount,
  nowMs: number = Date.now(),
): Promise<string> {
  return getGoogleAccessTokenForScopes(sa, [GOOGLE_INDEXING_SCOPE], nowMs)
}

// ---------------------------------------------------------------------------
// Submissions ledger (probes for the table; no-ops honestly pre-apply)
// ---------------------------------------------------------------------------

export async function submissionsTableInstalled(): Promise<boolean> {
  try {
    const rows = await pgQuery<{ reg: string | null }>(
      `SELECT to_regclass('public.google_indexing_submissions') AS reg`,
    )
    return Boolean(rows[0]?.reg)
  } catch {
    return false
  }
}

type StateRow = {
  url: string
  status: string
  attempts: number
  last_submitted_at: string | null
  content_modified_at: string | null
  last_attempt_at: string | null
}

async function loadState(urls: string[]): Promise<Map<string, IndexingUrlState>> {
  const out = new Map<string, IndexingUrlState>()
  if (urls.length === 0) return out
  const rows = await pgQuery<StateRow>(
    `SELECT url, status, attempts,
            last_submitted_at::text AS last_submitted_at,
            content_modified_at::text AS content_modified_at,
            last_attempt_at::text AS last_attempt_at
       FROM google_indexing_submissions
      WHERE url = ANY($1::text[])`,
    [urls],
  )
  for (const r of rows) {
    out.set(r.url, {
      url: r.url,
      lastSuccessAtMs: r.last_submitted_at ? Date.parse(r.last_submitted_at) : null,
      contentModifiedAtMs: r.content_modified_at ? Date.parse(r.content_modified_at) : null,
      attempts: Number(r.attempts) || 0,
      lastAttemptAtMs: r.last_attempt_at ? Date.parse(r.last_attempt_at) : null,
      lastStatus: r.status === "submitted" ? "submitted" : r.status === "failed" ? "failed" : null,
    })
  }
  return out
}

async function recordResult(row: {
  url: string
  pageType: string | null
  type: UrlNotificationType
  source: "sweep" | "admin"
  ok: boolean
  error: string | null
  contentModifiedAtMs: number | null
}): Promise<void> {
  await pgQuery(
    `INSERT INTO google_indexing_submissions
       (url, page_type, notify_type, source, status, last_error, attempts,
        last_submitted_at, content_modified_at, last_attempt_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             CASE WHEN $5 = 'submitted' THEN now() END,
             CASE WHEN $5 = 'submitted' THEN $8::timestamptz END,
             now(), now())
     ON CONFLICT (url) DO UPDATE SET
       page_type = COALESCE(EXCLUDED.page_type, google_indexing_submissions.page_type),
       notify_type = EXCLUDED.notify_type,
       source = EXCLUDED.source,
       status = EXCLUDED.status,
       last_error = EXCLUDED.last_error,
       attempts = CASE WHEN EXCLUDED.status = 'failed'
                     THEN google_indexing_submissions.attempts + 1 ELSE 0 END,
       last_submitted_at = CASE WHEN EXCLUDED.status = 'submitted'
                            THEN now() ELSE google_indexing_submissions.last_submitted_at END,
       content_modified_at = CASE WHEN EXCLUDED.status = 'submitted'
                              THEN EXCLUDED.content_modified_at
                              ELSE google_indexing_submissions.content_modified_at END,
       last_attempt_at = now(),
       updated_at = now()`,
    [
      row.url,
      row.pageType,
      row.type,
      row.source,
      row.ok ? "submitted" : "failed",
      row.ok ? null : (row.error || "unknown error").slice(0, 2000),
      row.ok ? 0 : 1,
      row.contentModifiedAtMs != null ? new Date(row.contentModifiedAtMs).toISOString() : null,
    ],
  )
}

export async function submittedLast24h(): Promise<number> {
  const rows = await pgQuery<{ n: string }>(
    `SELECT count(*)::text AS n FROM google_indexing_submissions
      WHERE status = 'submitted' AND last_submitted_at > now() - interval '24 hours'`,
  )
  return Number(rows[0]?.n) || 0
}

// ---------------------------------------------------------------------------
// Batch publish — one API call per ≤100 URLs; per-URL results recorded
// ---------------------------------------------------------------------------

export type PublishOutcome = {
  url: string
  ok: boolean
  status: number
  error: string | null
}

export async function publishBatch(
  sa: ServiceAccount,
  urls: string[],
  type: UrlNotificationType,
): Promise<{ outcomes: PublishOutcome[]; stopReason: string | null }> {
  const token = await getGoogleAccessToken(sa)
  const boundary = `unsaid_indexing_${Date.now().toString(36)}`
  const res = await fetch(GOOGLE_BATCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: buildBatchBody(urls, type, boundary),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  const decision = runDecisionFor(res.status, text)
  if (!res.ok) {
    // The batch call itself failed: every URL in it failed with the
    // call's status; a stop decision ends the run after recording.
    return {
      outcomes: urls.map((url) => ({
        url,
        ok: false,
        status: res.status,
        error: `batch HTTP ${res.status}: ${text.slice(0, 300)}`,
      })),
      stopReason: decision.action === "stop" ? decision.reason : `http_${res.status}`,
    }
  }
  const contentType = res.headers.get("content-type") || ""
  const responseBoundary =
    contentType.match(/boundary=([^;]+)/)?.[1]?.trim() || boundary
  const parts = parseBatchResponse(text, responseBoundary)
  const byIndex = new Map(parts.map((p) => [p.index, p]))
  const outcomes = urls.map((url, i) => {
    const part = byIndex.get(i)
    if (!part) {
      return { url, ok: false, status: 0, error: "no result part in batch response" }
    }
    return {
      url,
      ok: isSuccessStatus(part.status),
      status: part.status,
      error: part.error,
    }
  })
  // A per-part 429 is the quota speaking through the batch: stop.
  const rateLimited = outcomes.some((o) => o.status === 429)
  return { outcomes, stopReason: rateLimited ? "rate_limited" : null }
}

// ---------------------------------------------------------------------------
// The sweep — cron-driven, and the admin single-URL submit
// ---------------------------------------------------------------------------

export type SweepSummary = {
  armed: boolean
  installed: boolean
  considered: number
  candidates: number
  submitted: number
  failed: number
  stoppedReason: string | null
}

/** One sweep run: sitemap inventory (the platform's ONE URL list) →
 *  ledger state → candidate selection under the day's remaining quota
 *  budget → batched publishes, each result recorded. Stops at the
 *  first rate-limit/quota signal and reports why. */
export async function runGoogleIndexingSweep(): Promise<SweepSummary> {
  const summary: SweepSummary = {
    armed: false,
    installed: false,
    considered: 0,
    candidates: 0,
    submitted: 0,
    failed: 0,
    stoppedReason: null,
  }
  const config = await resolveGoogleIndexingConfig()
  if (!config.armed || !config.serviceAccount) return summary
  summary.armed = true
  if (!(await submissionsTableInstalled())) return summary
  summary.installed = true

  const entries = await buildSitemap()
  summary.considered = entries.length

  // Products carry a truthful lastModified (catalog created_at / the
  // sitemap view's own stamp); every other type's sitemap lastmod is a
  // synthetic build time, so the sweep passes null and lets the
  // freshness window be its change signal instead of fabricating one.
  const inputs: IndexingCandidateInput[] = entries.map((e) => ({
    url: e.loc,
    pageType: e.pageType,
    lastModifiedMs: e.pageType === "product" ? e.lastModified.getTime() : null,
  }))
  const state = await loadState(inputs.map((i) => i.url))
  const usedToday = await submittedLast24h()
  const budget = Math.max(0, INDEXING_DAILY_QUOTA - usedToday)
  const candidates = selectCandidates(inputs, state, Date.now(), budget)
  summary.candidates = candidates.length

  for (const batch of chunkBatches(candidates, INDEXING_BATCH_SIZE)) {
    const { outcomes, stopReason } = await publishBatch(
      config.serviceAccount,
      batch.map((c) => c.url),
      "URL_UPDATED",
    )
    const byUrl = new Map(batch.map((c) => [c.url, c]))
    for (const outcome of outcomes) {
      const input = byUrl.get(outcome.url)
      await recordResult({
        url: outcome.url,
        pageType: input?.pageType ?? null,
        type: "URL_UPDATED",
        source: "sweep",
        ok: outcome.ok,
        error: outcome.error,
        contentModifiedAtMs: input?.lastModifiedMs ?? null,
      })
      if (outcome.ok) summary.submitted += 1
      else summary.failed += 1
    }
    if (stopReason) {
      summary.stoppedReason = stopReason
      break
    }
  }
  return summary
}

/** The admin single-URL submit: an explicit operator action, so it
 *  bypasses the freshness window — but never the gate or the ledger:
 *  the result is recorded exactly like a sweep submission. */
export async function submitUrlForIndexing(
  url: string,
  type: UrlNotificationType = "URL_UPDATED",
): Promise<
  | { ok: true; status: number }
  | {
      ok: false
      reason: "not_armed" | "not_installed" | "invalid_url" | "provider_error"
      error?: string
      status?: number
    }
> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: "invalid_url" }
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "invalid_url" }
  }
  const config = await resolveGoogleIndexingConfig()
  if (!config.armed || !config.serviceAccount) return { ok: false, reason: "not_armed" }
  if (!(await submissionsTableInstalled())) return { ok: false, reason: "not_installed" }

  const { outcomes, stopReason } = await publishBatch(config.serviceAccount, [url], type)
  const outcome = outcomes[0]
  await recordResult({
    url,
    pageType: null,
    type,
    source: "admin",
    ok: outcome?.ok ?? false,
    error: outcome?.error ?? stopReason ?? "no outcome",
    contentModifiedAtMs: null,
  })
  if (outcome?.ok) return { ok: true, status: outcome.status }
  return {
    ok: false,
    reason: "provider_error",
    error: outcome?.error ?? stopReason ?? "unknown error",
    status: outcome?.status,
  }
}

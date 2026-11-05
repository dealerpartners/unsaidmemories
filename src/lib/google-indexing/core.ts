// ---------------------------------------------------------------------------
// Google Indexing API — PURE decision core (no DB, no Next runtime).
// The client (client.ts), the cron sweep, and the admin surface are all
// built from these functions; scripts/google-indexing.test.mjs drives
// them directly.
//
// What lives here:
//   - the service-account shape (parse + validate, key normalization)
//   - the OAuth JWT (RS256, built and signed with node:crypto)
//   - the batch request body builder + multipart response parser
//   - candidate selection: which sitemap URLs a run may notify, under
//     the freshness window + the daily quota budget
//   - response classification: per-URL outcome + the run-level stop
//     rule (a 429 / quota 403 stops the run; nothing is hammered)
//   - failure backoff for recorded submissions
//
// Credential VALUES never appear here — the gate in client.ts resolves
// them through resolveGoogleIndexingConfig() and hands the parsed
// shape in.
// ---------------------------------------------------------------------------

import { createSign } from "node:crypto"

export const GOOGLE_INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing"
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
export const GOOGLE_PUBLISH_PATH = "/v3/urlNotifications:publish"
export const GOOGLE_BATCH_URL = "https://indexing.googleapis.com/batch"

// The Indexing API's published default quota posture: 200 publish
// requests per day per project, up to 100 URLs per batch call. The
// sweep caps a run by the day's REMAINING budget (counted from the
// submissions ledger), so repeated cron runs share one daily budget
// instead of each spending a fresh 200.
export const INDEXING_BATCH_SIZE = 100
export const INDEXING_DAILY_QUOTA = 200

// A URL successfully notified inside this window is never re-notified —
// Google has the current version; resubmitting spends quota for
// nothing. 24h matches the quota's daily reset rhythm.
export const INDEXING_FRESHNESS_WINDOW_MS = 24 * 3600_000

// Failed submissions back off exponentially (1h, 2h, 4h, … capped at
// 24h) before they become eligible again — recorded, never dropped,
// never retried in a hot loop.
export const INDEXING_FAILURE_BACKOFF_BASE_MS = 3600_000
export const INDEXING_FAILURE_BACKOFF_CAP_MS = 24 * 3600_000

export type UrlNotificationType = "URL_UPDATED" | "URL_DELETED"

// Page types the sweep notifies. The sitemap inventory is the ONE
// source (buildSitemap in lib/shop/sitemap-source.ts); these are the
// content types whose publication matters to search: products,
// category/department pages, brands, collections, and the education
// library (guides/courses — the platform's "articles"). Static,
// location, policy, and related-search entries are excluded: they are
// not recently-created content and their sitemap lastModified is a
// synthetic build-time stamp, so notifying them would burn the daily
// quota on unchanged pages.
export const INDEXABLE_PAGE_TYPES: ReadonlySet<string> = new Set([
  "product",
  "category",
  "subcategory",
  "department",
  "animal",
  "brand",
  "collection",
  "guide",
  "course",
  "learn",
  "article",
])

// ---------------------------------------------------------------------------
// Service account
// ---------------------------------------------------------------------------

export type ServiceAccount = {
  clientEmail: string
  privateKey: string
  projectId: string | null
}

/** Normalize a PEM private key pasted through settings/env: literal
 *  "\n" escape sequences become real newlines, surrounding quotes and
 *  whitespace are stripped. */
export function normalizePrivateKey(raw: string): string {
  let key = String(raw || "").trim()
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1)
  }
  return key.replace(/\\r\\n|\\n|\\r/g, "\n").trim()
}

/** Parse a service-account credential from either its JSON form (the
 *  downloaded key file: {client_email, private_key, project_id, …})
 *  or the field pair the platform's creds file carries
 *  ({clientEmail/email, privateKey/private_key}). Returns null when
 *  the shape is not a usable service account — the gate treats null
 *  as "not armed", never as an error worth throwing over. */
export function parseServiceAccount(raw: unknown): ServiceAccount | null {
  if (raw == null) return null
  let obj: Record<string, unknown>
  if (typeof raw === "string") {
    const text = raw.trim()
    if (!text) return null
    try {
      const parsed = JSON.parse(text)
      if (!parsed || typeof parsed !== "object") return null
      obj = parsed as Record<string, unknown>
    } catch {
      return null
    }
  } else if (typeof raw === "object") {
    obj = raw as Record<string, unknown>
  } else {
    return null
  }
  const email = String(obj.client_email ?? obj.clientEmail ?? obj.email ?? "").trim()
  const keyRaw = String(obj.private_key ?? obj.privateKey ?? "").trim()
  if (!email || !keyRaw) return null
  const privateKey = normalizePrivateKey(keyRaw)
  if (!privateKey.includes("BEGIN PRIVATE KEY") || !privateKey.includes("END PRIVATE KEY")) {
    return null
  }
  const projectId = String(obj.project_id ?? obj.projectId ?? "").trim() || null
  return { clientEmail: email, privateKey, projectId }
}

// ---------------------------------------------------------------------------
// OAuth JWT (service account -> access token exchange)
// ---------------------------------------------------------------------------

export function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export type JwtParts = { header: Record<string, unknown>; claims: Record<string, unknown> }

/** The JWT the token exchange expects: RS256, iss = the service
 *  account email, aud = the token endpoint, the requested scopes
 *  (space-joined, per the OAuth JWT-bearer grant), one-hour life.
 *  Returned unsigned so tests can assert the shape;
 *  signServiceAccountJwt produces the compact form. The scopes
 *  parameter defaults to the indexing scope so every existing
 *  caller is unchanged; other Google consumers (Merchant Center,
 *  Search Console, GA4 — lib/google-properties) pass their own
 *  scopes through THIS builder, keeping one JWT definition for
 *  the one credential gate. */
export function buildServiceAccountJwtParts(
  sa: ServiceAccount,
  nowMs: number,
  scopes: readonly string[] = [GOOGLE_INDEXING_SCOPE],
): JwtParts {
  const iat = Math.floor(nowMs / 1000)
  return {
    header: { alg: "RS256", typ: "JWT" },
    claims: {
      iss: sa.clientEmail,
      scope: scopes.join(" "),
      aud: GOOGLE_TOKEN_URL,
      iat,
      exp: iat + 3600,
    },
  }
}

export function signJwtRs256(parts: JwtParts, privateKeyPem: string): string {
  const signingInput =
    `${base64UrlEncode(JSON.stringify(parts.header))}.` +
    `${base64UrlEncode(JSON.stringify(parts.claims))}`
  const signer = createSign("RSA-SHA256")
  signer.update(signingInput)
  signer.end()
  const signature = signer.sign(privateKeyPem)
  return `${signingInput}.${base64UrlEncode(signature)}`
}

export function buildServiceAccountJwt(sa: ServiceAccount, nowMs: number): string {
  return signJwtRs256(buildServiceAccountJwtParts(sa, nowMs), sa.privateKey)
}

/** The signed JWT for an explicit scope set — the form the token
 *  cache in client.ts mints per consumer (Merchant / Search
 *  Console / GA4). Same signer, same claims shape; only the scope
 *  claim differs. */
export function buildServiceAccountJwtWithScopes(
  sa: ServiceAccount,
  nowMs: number,
  scopes: readonly string[],
): string {
  return signJwtRs256(buildServiceAccountJwtParts(sa, nowMs, scopes), sa.privateKey)
}

// ---------------------------------------------------------------------------
// Batch publish (multipart/related, up to INDEXING_BATCH_SIZE per call)
// ---------------------------------------------------------------------------

export function buildBatchBody(
  urls: string[],
  type: UrlNotificationType,
  boundary: string,
): string {
  const parts = urls.map((url, i) => {
    const payload = JSON.stringify({ url, type })
    return (
      `--${boundary}\r\n` +
      `Content-Type: application/http\r\n` +
      `Content-ID: <item-${i}>\r\n\r\n` +
      `POST ${GOOGLE_PUBLISH_PATH} HTTP/1.1\r\n` +
      `Content-Type: application/json\r\n` +
      `Content-Length: ${Buffer.byteLength(payload)}\r\n\r\n` +
      `${payload}\r\n`
    )
  })
  return parts.join("") + `--${boundary}--\r\n`
}

export type BatchPartResult = {
  index: number
  status: number
  error: string | null
}

/** Parse a multipart batch response: each part carries an inner HTTP
 *  status line and a JSON body. Tolerant by design — a part that does
 *  not parse is reported as status 0 with the parse failure, never
 *  silently treated as success. */
export function parseBatchResponse(body: string, boundary: string): BatchPartResult[] {
  const results: BatchPartResult[] = []
  const segments = String(body || "").split(`--${boundary}`)
  for (const segment of segments) {
    const idMatch = segment.match(/Content-ID:\s*<response-item-(\d+)>|Content-ID:\s*<item-(\d+)>/i)
    const statusMatch = segment.match(/HTTP\/1\.1\s+(\d{3})/)
    if (!statusMatch) continue
    const status = Number(statusMatch[1])
    const index = idMatch ? Number(idMatch[1] ?? idMatch[2]) : results.length
    let error: string | null = null
    if (status < 200 || status >= 300) {
      const jsonMatch = segment.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as {
            error?: { message?: string; status?: string }
          }
          error =
            parsed?.error?.message ||
            parsed?.error?.status ||
            `HTTP ${status}`
        } catch {
          error = `HTTP ${status}`
        }
      } else {
        error = `HTTP ${status}`
      }
    }
    results.push({ index, status, error })
  }
  return results.sort((a, b) => a.index - b.index)
}

// ---------------------------------------------------------------------------
// Response classification — the run-level stop rule
// ---------------------------------------------------------------------------

export type RunDecision =
  | { action: "continue" }
  | { action: "stop"; reason: "rate_limited" | "quota_exhausted" | "unauthorized" | "fatal" }

/** Decide, from a batch/token HTTP status, whether the run continues.
 *  429 (rate limit) and 403 RESOURCE_EXHAUSTED (daily quota) stop the
 *  run — the recorded ledger keeps what succeeded and the next run
 *  resumes under a fresh budget. 401/403 auth failures stop too:
 *  retrying with a bad credential is hammering, not resilience. */
export function runDecisionFor(status: number, bodyText?: string): RunDecision {
  if (status >= 200 && status < 300) return { action: "continue" }
  if (status === 429) return { action: "stop", reason: "rate_limited" }
  if (status === 403) {
    if (bodyText && /RESOURCE_EXHAUSTED|quota/i.test(bodyText)) {
      return { action: "stop", reason: "quota_exhausted" }
    }
    return { action: "stop", reason: "unauthorized" }
  }
  if (status === 401) return { action: "stop", reason: "unauthorized" }
  if (status >= 500) return { action: "continue" } // per-URL results carry the failures
  return { action: "stop", reason: "fatal" }
}

export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300
}

// ---------------------------------------------------------------------------
// Candidate selection — freshness window + daily quota budget
// ---------------------------------------------------------------------------

export type IndexingUrlState = {
  url: string
  /** ms epoch of the last successful notification, or null. */
  lastSuccessAtMs: number | null
  /** The sitemap lastModified (ms) recorded at the last success —
   *  the "version" Google was told about. Null when the sitemap
   *  carries no truthful lastmod for this URL (categories, guides). */
  contentModifiedAtMs: number | null
  /** Failure bookkeeping for the backoff rule. */
  attempts: number
  lastAttemptAtMs: number | null
  lastStatus: "submitted" | "failed" | null
}

export type IndexingCandidateInput = {
  url: string
  pageType: string
  /** Truthful lastmod (products), or null when the sitemap stamps a
   *  synthetic build time for this page type. */
  lastModifiedMs: number | null
}

export function failureBackoffMs(attempts: number): number {
  const n = Math.max(1, attempts)
  return Math.min(
    INDEXING_FAILURE_BACKOFF_CAP_MS,
    INDEXING_FAILURE_BACKOFF_BASE_MS * 2 ** (n - 1),
  )
}

/** Is this URL eligible to notify right now? The three gates:
 *  1. freshness — a success inside the window suppresses resubmission;
 *  2. change — with a truthful lastmod on both sides, an unchanged
 *     version is not re-notified after the window either;
 *  3. backoff — a failed URL waits out its exponential backoff.
 *  An explicit operator submit bypasses all three (force). */
export function isEligible(
  entry: IndexingCandidateInput,
  state: IndexingUrlState | undefined,
  nowMs: number,
): boolean {
  if (!state) return true
  if (state.lastStatus === "failed" && state.lastAttemptAtMs != null) {
    if (nowMs - state.lastAttemptAtMs < failureBackoffMs(state.attempts)) return false
  }
  if (state.lastSuccessAtMs != null) {
    if (nowMs - state.lastSuccessAtMs < INDEXING_FRESHNESS_WINDOW_MS) return false
    if (
      entry.lastModifiedMs != null &&
      state.contentModifiedAtMs != null &&
      entry.lastModifiedMs <= state.contentModifiedAtMs
    ) {
      return false
    }
  }
  return true
}

/** Order: new products first (truthful lastmod, newest first), then
 *  changed products, then first-seen other content, then refreshes of
 *  other content. The daily budget caps the list — what doesn't fit
 *  today is tomorrow's head of queue, not a dropped URL. */
export function selectCandidates(
  entries: IndexingCandidateInput[],
  stateByUrl: Map<string, IndexingUrlState>,
  nowMs: number,
  budget: number,
): IndexingCandidateInput[] {
  if (budget <= 0) return []
  const seen = new Set<string>()
  const eligible: (IndexingCandidateInput & { tier: number })[] = []
  for (const entry of entries) {
    if (!INDEXABLE_PAGE_TYPES.has(entry.pageType)) continue
    if (!entry.url || seen.has(entry.url)) continue
    seen.add(entry.url)
    const state = stateByUrl.get(entry.url)
    if (!isEligible(entry, state, nowMs)) continue
    const isProduct = entry.pageType === "product"
    const firstSeen = !state || state.lastSuccessAtMs == null
    const tier = isProduct ? (firstSeen ? 0 : 1) : firstSeen ? 2 : 3
    eligible.push({ ...entry, tier })
  }
  eligible.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    const am = a.lastModifiedMs ?? 0
    const bm = b.lastModifiedMs ?? 0
    if (bm !== am) return bm - am
    return a.url.localeCompare(b.url)
  })
  return eligible.slice(0, budget).map(({ tier: _tier, ...entry }) => entry)
}

export function chunkBatches<T>(items: T[], size: number = INDEXING_BATCH_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

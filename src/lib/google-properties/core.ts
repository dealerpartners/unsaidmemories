// ---------------------------------------------------------------------------
// Google property consumers — PURE decision core (no DB, no Next
// runtime). The client (client.ts), the daily cron, and the admin
// status surface are all built from these functions;
// scripts/google-properties.test.mjs drives them directly.
//
// What lives here:
//   - the three APIs' scopes, bases, and pull windows
//   - Google API error classification — SERVICE_DISABLED is its own
//     kind, DISTINCT from an auth failure and from a no-access 403:
//     a project that has not enabled an API is an honest recorded
//     state ("disabled"), not an error to retry or a credential to
//     doubt. The property APIs (Search Console, Analytics Admin,
//     Analytics Data) start out disabled in the platform's Cloud
//     project; each consumer lights up the moment its API is
//     enabled, with no code change. (Merchant Center product sync
//     lives in lib/google-merchant on the Merchant API v1 — it
//     reuses this module's error classification and the same
//     credential gate.)
//   - response parsers for each API (searchanalytics rows, sitemap
//     entries, GA4 account summaries + report rows)
//   - property selection (which Search Console property / GA4
//     property is this platform's, when discovery lists several)
//   - the per-leg isolation runner: one leg's failure never blocks
//     the others, and every leg's outcome is reported
//   - natural keys for the idempotent upserts (a re-pull of the
//     same window updates rows in place — never duplicates)
//
// Credential VALUES never appear here — the gate in
// lib/google-indexing/client.ts resolves them (ONE gate for every
// Google consumer) and the client hands parsed API responses in.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Scopes, bases, windows
// ---------------------------------------------------------------------------

export const GOOGLE_SEARCH_CONSOLE_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly"
export const GOOGLE_GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"

export const SEARCH_CONSOLE_API_BASE = "https://searchconsole.googleapis.com/webmasters/v3"
export const GA4_ADMIN_API_BASE = "https://analyticsadmin.googleapis.com/v1beta"
export const GA4_DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta"

// Search Console data lags publication by roughly 2–3 days, so the
// daily pull covers the 7-day window ENDING 3 days ago — re-pulling
// the same window is the norm (late-arriving data lands in it),
// which is exactly why the upserts are idempotent.
export const SEARCH_CONSOLE_LAG_DAYS = 3
export const SEARCH_CONSOLE_WINDOW_DAYS = 7

// GA4 headline reporting: the trailing 30 days ending yesterday.
export const GA4_WINDOW_DAYS = 30

export const PROPERTY_LEGS = ["search_console", "ga4"] as const
export type PropertyLeg = (typeof PROPERTY_LEGS)[number]

// ---------------------------------------------------------------------------
// Seeded account/property ids — the platform's own, supplied by the
// owner (GA4, 2026-10-25). These are IDENTIFIERS, not credentials.
// Enablement lands in stages (the GA4 Data API was live while the
// Analytics Admin API was still SERVICE_DISABLED), so discovery
// cannot be the only path to an id: precedence is
//   app_settings value  →  these known defaults  →  API discovery
// An app_settings value always wins; discovery, when its API is
// enabled, refreshes and stores. The defaults are the floor that
// lets a live API's leg run before its discovery API exists. (The
// Merchant account/data-source ids seed the same way, in
// lib/google-merchant.)
// ---------------------------------------------------------------------------

export const KNOWN_GA4_PROPERTY_ID = "554711589"
export const KNOWN_GA4_ACCOUNT_ID = "408499060"

/** Resolve an account/property id: the stored setting when present,
 *  else the known default, else null (discovery decides). Blank
 *  strings count as absent on both sides. */
export function resolveSeededId(
  settingValue: string | null,
  knownDefault: string | null,
): string | null {
  const fromSetting = String(settingValue ?? "").trim()
  if (fromSetting) return fromSetting
  const fromDefault = String(knownDefault ?? "").trim()
  return fromDefault ? fromDefault : null
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export type GoogleApiErrorKind =
  | "disabled" // the API is not enabled in the Cloud project (SERVICE_DISABLED)
  | "unauthorized" // 401 — the credential itself was rejected
  | "no_access" // 403 — enabled, but the account lacks the property/role
  | "rate_limited" // 429
  | "transient" // 5xx
  | "fatal" // anything else

export type ClassifiedGoogleError = {
  kind: GoogleApiErrorKind
  detail: string
}

/** Pull the error detail reasons (e.g. SERVICE_DISABLED) out of a
 *  Google API error body. Empty when the body is not the standard
 *  JSON error envelope. */
export function googleErrorReasons(bodyText: string): string[] {
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { details?: { reason?: unknown }[] }
    }
    const details = parsed?.error?.details
    if (!Array.isArray(details)) return []
    return details.map((d) => String(d?.reason || "")).filter(Boolean)
  } catch {
    return []
  }
}

function googleErrorMessage(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as { error?: { message?: unknown } }
    const message = parsed?.error?.message
    return typeof message === "string" && message ? message : null
  } catch {
    return null
  }
}

/** Classify an API failure. SERVICE_DISABLED is checked FIRST and
 *  on its own evidence (the detail reason, or the telltale message
 *  "has not been used in project … before or it is disabled"): the
 *  platform's four property APIs answer exactly this until the
 *  owner enables them, and that state must read as "disabled" in
 *  every status surface — never as an auth failure (the credential
 *  is fine) and never as no-access (no role decision was reached). */
export function classifyGoogleApiError(
  httpStatus: number,
  bodyText: string,
): ClassifiedGoogleError {
  const message = googleErrorMessage(bodyText)
  const detail = (message || bodyText || "").slice(0, 500) || `HTTP ${httpStatus}`
  const reasons = googleErrorReasons(bodyText)
  if (
    reasons.includes("SERVICE_DISABLED") ||
    /SERVICE_DISABLED|has not been used in project|it is disabled/i.test(bodyText || "")
  ) {
    return { kind: "disabled", detail }
  }
  if (httpStatus === 401) return { kind: "unauthorized", detail }
  if (httpStatus === 429) return { kind: "rate_limited", detail }
  if (httpStatus === 403) return { kind: "no_access", detail }
  if (httpStatus >= 500) return { kind: "transient", detail }
  return { kind: "fatal", detail }
}

// ---------------------------------------------------------------------------
// Search Console
// ---------------------------------------------------------------------------

export type ScSite = { siteUrl: string; permissionLevel: string }

export function parseScSites(json: unknown): ScSite[] {
  const root = (json ?? {}) as {
    siteEntry?: { siteUrl?: unknown; permissionLevel?: unknown }[]
  }
  if (!Array.isArray(root.siteEntry)) return []
  return root.siteEntry
    .map((s) => ({
      siteUrl: String(s?.siteUrl ?? ""),
      permissionLevel: String(s?.permissionLevel ?? ""),
    }))
    .filter((s) => s.siteUrl)
}

/** Which property in the list is THIS platform's? Order of evidence:
 *  1. the URL-prefix property equal to the site URL (with slash),
 *  2. the domain property (sc-domain:<domain>) — domain properties
 *     register on the BARE domain, so both the full host and its
 *     www-stripped form are tried,
 *  3. any property the account can actually read (permission above
 *     siteUnverifiedUser) whose URL mentions the host or the bare
 *     domain,
 *  4. the first readable property at all.
 *  Returns null when nothing is readable — the leg records
 *  no_access rather than guessing at a stranger's property. */
export function selectScProperty(sites: ScSite[], siteBase: string): string | null {
  if (sites.length === 0) return null
  const base = String(siteBase || "").replace(/\/$/, "")
  let host = ""
  try {
    host = new URL(base).hostname
  } catch {
    host = ""
  }
  const hostForms = host ? [host, host.replace(/^www\./, "")] : []
  const readable = sites.filter((s) => s.permissionLevel !== "siteUnverifiedUser")
  const pool = readable.length > 0 ? readable : []
  const exact = pool.find((s) => s.siteUrl === `${base}/` || s.siteUrl === base)
  if (exact) return exact.siteUrl
  for (const form of hostForms) {
    const domain = pool.find((s) => s.siteUrl === `sc-domain:${form}`)
    if (domain) return domain.siteUrl
  }
  for (const form of hostForms) {
    const byHost = pool.find((s) => s.siteUrl.includes(form))
    if (byHost) return byHost.siteUrl
  }
  return pool[0]?.siteUrl ?? null
}

export function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** The pull window: SEARCH_CONSOLE_WINDOW_DAYS days ending
 *  SEARCH_CONSOLE_LAG_DAYS before `now` (UTC dates, YYYY-MM-DD). */
export function searchConsoleWindow(now: Date): { startDate: string; endDate: string } {
  const end = new Date(now.getTime() - SEARCH_CONSOLE_LAG_DAYS * 24 * 3600_000)
  const start = new Date(end.getTime() - (SEARCH_CONSOLE_WINDOW_DAYS - 1) * 24 * 3600_000)
  return { startDate: isoDateUTC(start), endDate: isoDateUTC(end) }
}

export type ScDailyRow = {
  page: string
  date: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

/** searchanalytics.query response → rows. Dimensions are [page,
 *  date] by this consumer's own request, so keys map positionally;
 *  a row with fewer keys is skipped rather than misfiled. */
export function parseScSearchAnalytics(json: unknown): ScDailyRow[] {
  const root = (json ?? {}) as {
    rows?: { keys?: unknown[]; clicks?: unknown; impressions?: unknown; ctr?: unknown; position?: unknown }[]
  }
  if (!Array.isArray(root.rows)) return []
  const out: ScDailyRow[] = []
  for (const row of root.rows) {
    const keys = Array.isArray(row?.keys) ? row.keys : []
    if (keys.length < 2) continue
    out.push({
      page: String(keys[0] ?? ""),
      date: String(keys[1] ?? ""),
      clicks: Math.trunc(Number(row.clicks) || 0),
      impressions: Math.trunc(Number(row.impressions) || 0),
      ctr: Number(row.ctr) || 0,
      position: Number(row.position) || 0,
    })
  }
  return out
}

export type ScSitemap = {
  path: string
  lastSubmitted: string | null
  lastDownloaded: string | null
  isPending: boolean
  warnings: number
  errors: number
}

export function parseScSitemaps(json: unknown): ScSitemap[] {
  const root = (json ?? {}) as { sitemap?: Record<string, unknown>[] }
  if (!Array.isArray(root.sitemap)) return []
  return root.sitemap
    .map((s) => ({
      path: String(s?.path ?? ""),
      lastSubmitted: s?.lastSubmitted != null ? String(s.lastSubmitted) : null,
      lastDownloaded: s?.lastDownloaded != null ? String(s.lastDownloaded) : null,
      isPending: Boolean(s?.isPending),
      warnings: Math.trunc(Number(s?.warnings) || 0),
      errors: Math.trunc(Number(s?.errors) || 0),
    }))
    .filter((s) => s.path)
}

// ---------------------------------------------------------------------------
// GA4 — Analytics Admin (discovery) + Analytics Data (reports)
// ---------------------------------------------------------------------------

export type Ga4PropertyChoice = {
  accountId: string | null
  accountDisplayName: string | null
  propertyId: string
  propertyResource: string
  displayName: string | null
}

function lastSegment(resource: unknown): string {
  const text = String(resource ?? "")
  const idx = text.lastIndexOf("/")
  return idx >= 0 ? text.slice(idx + 1) : text
}

/** accountSummaries → every property the credential can see,
 *  flattened. propertyId is the numeric tail of the resource name
 *  (properties/123456789 → 123456789) — the id the Data API path
 *  and the settings record use. */
export function parseGa4AccountSummaries(json: unknown): Ga4PropertyChoice[] {
  const root = (json ?? {}) as {
    accountSummaries?: {
      account?: unknown
      displayName?: unknown
      propertySummaries?: { property?: unknown; displayName?: unknown }[]
    }[]
  }
  if (!Array.isArray(root.accountSummaries)) return []
  const out: Ga4PropertyChoice[] = []
  for (const account of root.accountSummaries) {
    const summaries = Array.isArray(account?.propertySummaries)
      ? account.propertySummaries
      : []
    for (const property of summaries) {
      const resource = String(property?.property ?? "")
      if (!resource) continue
      out.push({
        accountId: account?.account != null ? lastSegment(account.account) : null,
        accountDisplayName:
          account?.displayName != null ? String(account.displayName) : null,
        propertyId: lastSegment(resource),
        propertyResource: resource,
        displayName: property?.displayName != null ? String(property.displayName) : null,
      })
    }
  }
  return out
}

/** Which GA4 property is this platform's? One property → it.
 *  Several → the one whose display name names the brand ("portal");
 *  otherwise the first (deterministic, and the choice is recorded
 *  in app_settings at discovery so later runs never re-decide). */
export function selectGa4Property(choices: Ga4PropertyChoice[]): Ga4PropertyChoice | null {
  if (choices.length === 0) return null
  if (choices.length === 1) return choices[0]
  const branded = choices.find((c) => /portal/i.test(c.displayName || ""))
  return branded ?? choices[0]
}

/** The pull window: GA4_WINDOW_DAYS days ending yesterday (UTC). */
export function ga4Window(now: Date): { startDate: string; endDate: string } {
  const end = new Date(now.getTime() - 24 * 3600_000)
  const start = new Date(end.getTime() - (GA4_WINDOW_DAYS - 1) * 24 * 3600_000)
  return { startDate: isoDateUTC(start), endDate: isoDateUTC(end) }
}

/** GA4 report dates arrive as YYYYMMDD; persist ISO. Anything else
 *  passes through untouched (a shape change should be visible in
 *  the data, not silently coerced). */
export function ga4DateToIso(raw: string): string {
  const text = String(raw || "")
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
  }
  return text
}

export type Ga4DailyRow = {
  date: string
  sessions: number
  users: number
  conversions: number
  revenue: number
}

/** Daily report rows. The request fixes the metric order —
 *  sessions, totalUsers, conversions, totalRevenue — so metric
 *  values map positionally. */
export function parseGa4DailyReport(json: unknown): Ga4DailyRow[] {
  const root = (json ?? {}) as {
    rows?: {
      dimensionValues?: { value?: unknown }[]
      metricValues?: { value?: unknown }[]
    }[]
  }
  if (!Array.isArray(root.rows)) return []
  const out: Ga4DailyRow[] = []
  for (const row of root.rows) {
    const dateRaw = row?.dimensionValues?.[0]?.value
    if (dateRaw == null) continue
    const metrics = Array.isArray(row.metricValues) ? row.metricValues : []
    out.push({
      date: ga4DateToIso(String(dateRaw)),
      sessions: Math.trunc(Number(metrics[0]?.value) || 0),
      users: Math.trunc(Number(metrics[1]?.value) || 0),
      conversions: Number(metrics[2]?.value) || 0,
      revenue: Number(metrics[3]?.value) || 0,
    })
  }
  return out
}

export type Ga4LandingRow = {
  date: string
  landingPage: string
  sessions: number
}

/** Top-landing-pages report rows: dimensions [date, landingPage],
 *  metric [sessions]. */
export function parseGa4LandingReport(json: unknown): Ga4LandingRow[] {
  const root = (json ?? {}) as {
    rows?: {
      dimensionValues?: { value?: unknown }[]
      metricValues?: { value?: unknown }[]
    }[]
  }
  if (!Array.isArray(root.rows)) return []
  const out: Ga4LandingRow[] = []
  for (const row of root.rows) {
    const dims = Array.isArray(row?.dimensionValues) ? row.dimensionValues : []
    if (dims.length < 2) continue
    out.push({
      date: ga4DateToIso(String(dims[0]?.value ?? "")),
      landingPage: String(dims[1]?.value ?? ""),
      sessions: Math.trunc(Number(row?.metricValues?.[0]?.value) || 0),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Natural keys — the upsert identities. A re-pull of the same window
// produces the same keys, so ON CONFLICT updates in place.
// ---------------------------------------------------------------------------

export const scDailyKey = (property: string, page: string, date: string): string =>
  `${property}\n${page}\n${date}`

export const scSitemapKey = (property: string, path: string): string =>
  `${property}\n${path}`

export const ga4DailyKey = (propertyId: string, date: string): string =>
  `${propertyId}\n${date}`

export const ga4LandingKey = (propertyId: string, date: string, landingPage: string): string =>
  `${propertyId}\n${date}\n${landingPage}`

// ---------------------------------------------------------------------------
// Per-leg isolation — one leg's failure never blocks the others.
// Sequential on purpose: quota behavior stays predictable and the
// recorded outcomes read in leg order.
// ---------------------------------------------------------------------------

export type SettledLeg<R> =
  | { name: string; ok: true; value: R }
  | { name: string; ok: false; error: string }

export async function settleLegs<R>(
  legs: { name: string; run: () => Promise<R> }[],
): Promise<SettledLeg<R>[]> {
  const out: SettledLeg<R>[] = []
  for (const leg of legs) {
    try {
      const value = await leg.run()
      out.push({ name: leg.name, ok: true, value })
    } catch (e) {
      out.push({
        name: leg.name,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return out
}

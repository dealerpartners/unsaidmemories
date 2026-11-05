import "server-only"

// ---------------------------------------------------------------------------
// Google property consumers — server side: Search Console and GA4
// (Analytics Admin + Data). Both read Google's view of the platform
// back into the platform's own tables: how search actually performs
// (per page/day) and how traffic converts (GA4 headline commerce).
// Merchant Center product sync is NOT here: it lives in
// lib/google-merchant on the Merchant API v1 (the legacy Content
// API leg that used to ride this module was removed with it).
//
// THE credential gate is the google-indexing gate
// (lib/google-indexing/client.ts → resolveGoogleIndexingConfig):
// ONE service account, ONE settings key, resolved once — this
// module extends that gate's scope handling
// (getGoogleAccessTokenForScopes) instead of building a second
// credential path. One definition per gate.
//
// Probe-gated, the step-7/8 pattern: the tables are migration
// record 20261200 (RECORD ONLY until the coordinator applies it).
// Every leg probes to_regclass and reports skipped until its
// tables exist. And the property APIs start out NOT ENABLED in the
// Cloud project: they answer 403 SERVICE_DISABLED, which classifies
// (core.ts) as its own honest state — status "disabled", recorded
// per leg, never retried in a hot loop and never mistaken for a
// credential failure. The moment an API is enabled, its leg lights
// up on the next daily run with no code change: discovery resolves
// the property, stores the ids in app_settings, and the pulls begin.
//
// Resolved ids (self-populating, one gate): precedence is
// app_settings → the owner's known ids (core.ts KNOWN_* — the
// GA4 property/account the owner supplied) → API discovery,
// which stores what it finds in app_settings
// (google.search_console_property / google.ga4_property_id /
// google.ga4_account_id). The seed matters because enablement lands
// in stages: the GA4 Data API was live while the Analytics Admin
// API was still disabled, so the GA4 leg runs on the seeded
// property and treats Admin-API discovery as a non-fatal probe (it
// also self-heals the stored account id when the Admin API lights
// up).
// ---------------------------------------------------------------------------

import { pgExec, pgQuery } from "@/lib/pg"
import { SITE_URL } from "@/lib/site-url"
import {
  getGoogleAccessTokenForScopes,
  resolveGoogleIndexingConfig,
} from "@/lib/google-indexing/client"
import type { ServiceAccount } from "@/lib/google-indexing/core"
import {
  GA4_ADMIN_API_BASE,
  GA4_DATA_API_BASE,
  GOOGLE_GA4_SCOPE,
  GOOGLE_SEARCH_CONSOLE_SCOPE,
  KNOWN_GA4_ACCOUNT_ID,
  KNOWN_GA4_PROPERTY_ID,
  PROPERTY_LEGS,
  SEARCH_CONSOLE_API_BASE,
  classifyGoogleApiError,
  ga4Window,
  parseGa4AccountSummaries,
  parseGa4DailyReport,
  parseGa4LandingReport,
  parseScSearchAnalytics,
  parseScSites,
  parseScSitemaps,
  resolveSeededId,
  searchConsoleWindow,
  selectGa4Property,
  selectScProperty,
  settleLegs,
  type ClassifiedGoogleError,
  type Ga4DailyRow,
  type Ga4LandingRow,
  type PropertyLeg,
  type ScDailyRow,
  type ScSitemap,
} from "./core"

// ---------------------------------------------------------------------------
// Leg outcomes
// ---------------------------------------------------------------------------

export type LegRunStatus = "ok" | "disabled" | "error" | "skipped"

export type LegResult = {
  leg: PropertyLeg
  status: LegRunStatus
  rowsUpserted: number
  detail: string | null
}

class GoogleApiRequestError extends Error {
  kind: ClassifiedGoogleError["kind"]
  httpStatus: number
  constructor(classified: ClassifiedGoogleError, httpStatus: number) {
    super(classified.detail)
    this.kind = classified.kind
    this.httpStatus = httpStatus
  }
}

/** Translate any leg failure into its recorded outcome. A
 *  SERVICE_DISABLED classification is the leg's honest "disabled"
 *  state; everything else is an error whose detail keeps the
 *  classification, so the admin surface can tell "API off" from
 *  "role missing" from "rate limited" without log-diving. */
function legError(leg: PropertyLeg, e: unknown): LegResult {
  if (e instanceof GoogleApiRequestError) {
    if (e.kind === "disabled") {
      return { leg, status: "disabled", rowsUpserted: 0, detail: e.message }
    }
    return { leg, status: "error", rowsUpserted: 0, detail: `${e.kind}: ${e.message}` }
  }
  return {
    leg,
    status: "error",
    rowsUpserted: 0,
    detail: e instanceof Error ? e.message : String(e),
  }
}

// ---------------------------------------------------------------------------
// HTTP — one fetch shape for the three APIs
// ---------------------------------------------------------------------------

async function googleJson(
  sa: ServiceAccount,
  scopes: readonly string[],
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<unknown> {
  const token = await getGoogleAccessTokenForScopes(sa, scopes)
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init?.body != null ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new GoogleApiRequestError(classifyGoogleApiError(res.status, text), res.status)
  }
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Google API returned a non-JSON body (HTTP ${res.status})`)
  }
}

// ---------------------------------------------------------------------------
// Tables — probe-gated on migration record 20261200
// ---------------------------------------------------------------------------

export type PropertyTables = {
  searchConsoleDaily: boolean
  searchConsoleSitemaps: boolean
  ga4Daily: boolean
  ga4Landing: boolean
  syncRuns: boolean
}

/** Shared per-leg sync context: the resolved service account plus
 *  which property tables are installed. */
export interface LegContext {
  sa: ServiceAccount
  tables: PropertyTables
}

const NO_TABLES: PropertyTables = {
  searchConsoleDaily: false,
  searchConsoleSitemaps: false,
  ga4Daily: false,
  ga4Landing: false,
  syncRuns: false,
}

export async function propertyTablesInstalled(): Promise<PropertyTables> {
  try {
    const rows = await pgQuery<Record<string, string | null>>(
      `SELECT to_regclass('public.google_search_console_daily') AS sc_daily,
              to_regclass('public.google_search_console_sitemaps') AS sc_sitemaps,
              to_regclass('public.google_ga4_daily') AS ga4_daily,
              to_regclass('public.google_ga4_landing_pages') AS ga4_landing,
              to_regclass('public.google_property_sync_runs') AS runs`,
    )
    const r = rows[0] ?? {}
    return {
      searchConsoleDaily: Boolean(r.sc_daily),
      searchConsoleSitemaps: Boolean(r.sc_sitemaps),
      ga4Daily: Boolean(r.ga4_daily),
      ga4Landing: Boolean(r.ga4_landing),
      syncRuns: Boolean(r.runs),
    }
  } catch {
    return NO_TABLES
  }
}

// ---------------------------------------------------------------------------
// Resolved ids in app_settings (self-populating, one gate)
// ---------------------------------------------------------------------------

const SETTING_SC_PROPERTY = "google.search_console_property"
const SETTING_GA4_PROPERTY = "google.ga4_property_id"
const SETTING_GA4_ACCOUNT = "google.ga4_account_id"

async function readSetting(key: string): Promise<string | null> {
  try {
    const rows = await pgQuery<{ value: unknown }>(
      `SELECT value FROM app_settings WHERE key = $1`,
      [key],
    )
    const v = rows[0]?.value
    if (v == null) return null
    const s = (typeof v === "string" ? v : String(v)).trim()
    return s ? s : null
  } catch {
    return null
  }
}

async function writeSetting(key: string, value: string, description: string): Promise<void> {
  await pgExec(
    `INSERT INTO app_settings (key, value, description, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value), description],
  )
}

// ---------------------------------------------------------------------------
// Sync-run recording — the visible outcome of every leg, every run
// ---------------------------------------------------------------------------

async function recordRun(result: LegResult, startedAt: Date): Promise<void> {
  try {
    await pgExec(
      `INSERT INTO google_property_sync_runs
         (leg, status, detail, rows_upserted, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz, now())`,
      [
        result.leg,
        result.status,
        result.detail ? result.detail.slice(0, 2000) : null,
        result.rowsUpserted,
        startedAt.toISOString(),
      ],
    )
  } catch {
    // Recording is visibility, not the work itself: a failed record
    // never fails the run (the cron response still carries it).
  }
}

// ---------------------------------------------------------------------------
// Chunked multi-row upserts — idempotent on the natural keys, so a
// re-pull of the same window updates rows in place.
// ---------------------------------------------------------------------------

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function upsertScDaily(property: string, rows: ScDailyRow[]): Promise<number> {
  let written = 0
  for (const part of chunk(rows, 500)) {
    const params: unknown[] = []
    const values = part.map((r, i) => {
      const b = i * 7
      params.push(property, r.page, r.date, r.clicks, r.impressions, r.ctr, r.position)
      return `($${b + 1}, $${b + 2}, $${b + 3}::date, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, now(), now(), now())`
    })
    await pgQuery(
      `INSERT INTO google_search_console_daily
         (property_url, page_url, report_date, clicks, impressions, ctr, position,
          pulled_at, created_at, updated_at)
       VALUES ${values.join(", ")}
       ON CONFLICT (property_url, page_url, report_date) DO UPDATE SET
         clicks = EXCLUDED.clicks,
         impressions = EXCLUDED.impressions,
         ctr = EXCLUDED.ctr,
         position = EXCLUDED.position,
         pulled_at = now(),
         updated_at = now()`,
      params,
    )
    written += part.length
  }
  return written
}

async function upsertScSitemaps(property: string, rows: ScSitemap[]): Promise<number> {
  let written = 0
  for (const part of chunk(rows, 200)) {
    const params: unknown[] = []
    const values = part.map((r, i) => {
      const b = i * 7
      params.push(
        property,
        r.path,
        r.lastSubmitted,
        r.lastDownloaded,
        r.isPending,
        r.warnings,
        r.errors,
      )
      return `($${b + 1}, $${b + 2}, $${b + 3}::timestamptz, $${b + 4}::timestamptz, $${b + 5}, $${b + 6}, $${b + 7}, now(), now(), now())`
    })
    await pgQuery(
      `INSERT INTO google_search_console_sitemaps
         (property_url, sitemap_path, last_submitted, last_downloaded, is_pending,
          warnings, errors, pulled_at, created_at, updated_at)
       VALUES ${values.join(", ")}
       ON CONFLICT (property_url, sitemap_path) DO UPDATE SET
         last_submitted = EXCLUDED.last_submitted,
         last_downloaded = EXCLUDED.last_downloaded,
         is_pending = EXCLUDED.is_pending,
         warnings = EXCLUDED.warnings,
         errors = EXCLUDED.errors,
         pulled_at = now(),
         updated_at = now()`,
      params,
    )
    written += part.length
  }
  return written
}

async function upsertGa4Daily(propertyId: string, rows: Ga4DailyRow[]): Promise<number> {
  let written = 0
  for (const part of chunk(rows, 200)) {
    const params: unknown[] = []
    const values = part.map((r, i) => {
      const b = i * 6
      params.push(propertyId, r.date, r.sessions, r.users, r.conversions, r.revenue)
      return `($${b + 1}, $${b + 2}::date, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, now(), now(), now())`
    })
    await pgQuery(
      `INSERT INTO google_ga4_daily
         (property_id, report_date, sessions, users, conversions, revenue,
          pulled_at, created_at, updated_at)
       VALUES ${values.join(", ")}
       ON CONFLICT (property_id, report_date) DO UPDATE SET
         sessions = EXCLUDED.sessions,
         users = EXCLUDED.users,
         conversions = EXCLUDED.conversions,
         revenue = EXCLUDED.revenue,
         pulled_at = now(),
         updated_at = now()`,
      params,
    )
    written += part.length
  }
  return written
}

async function upsertGa4Landing(propertyId: string, rows: Ga4LandingRow[]): Promise<number> {
  let written = 0
  for (const part of chunk(rows, 500)) {
    const params: unknown[] = []
    const values = part.map((r, i) => {
      const b = i * 4
      params.push(propertyId, r.date, r.landingPage, r.sessions)
      return `($${b + 1}, $${b + 2}::date, $${b + 3}, $${b + 4}, now(), now(), now())`
    })
    await pgQuery(
      `INSERT INTO google_ga4_landing_pages
         (property_id, report_date, landing_page, sessions, pulled_at, created_at, updated_at)
       VALUES ${values.join(", ")}
       ON CONFLICT (property_id, report_date, landing_page) DO UPDATE SET
         sessions = EXCLUDED.sessions,
         pulled_at = now(),
         updated_at = now()`,
      params,
    )
    written += part.length
  }
  return written
}

// ---------------------------------------------------------------------------
// Leg 1 — Search Console: per page/day search analytics for the
// trailing window + the property's sitemap states (submitted vs
// downloaded, errors) recorded alongside.
// ---------------------------------------------------------------------------

async function runSearchConsoleLeg(ctx: LegContext): Promise<LegResult> {
  const leg: PropertyLeg = "search_console"
  if (!ctx.tables.searchConsoleDaily || !ctx.tables.searchConsoleSitemaps) {
    return { leg, status: "skipped", rowsUpserted: 0, detail: "table_not_installed" }
  }
  try {
    let property = await readSetting(SETTING_SC_PROPERTY)
    if (!property) {
      const sitesJson = await googleJson(
        ctx.sa,
        [GOOGLE_SEARCH_CONSOLE_SCOPE],
        `${SEARCH_CONSOLE_API_BASE}/sites`,
      )
      property = selectScProperty(parseScSites(sitesJson), SITE_URL)
      if (!property) {
        return {
          leg,
          status: "error",
          rowsUpserted: 0,
          detail:
            "no_access: the service account sees no readable Search Console property (sites.list returned none)",
        }
      }
      await writeSetting(
        SETTING_SC_PROPERTY,
        property,
        "Google Search Console property (auto-discovered via sites.list)",
      )
    }

    const { startDate, endDate } = searchConsoleWindow(new Date())
    const sitePath = `${SEARCH_CONSOLE_API_BASE}/sites/${encodeURIComponent(property)}`
    let rowsWritten = 0
    let startRow = 0
    const rowLimit = 25000
    for (let i = 0; i < 10; i += 1) {
      const pageJson = await googleJson(ctx.sa, [GOOGLE_SEARCH_CONSOLE_SCOPE], `${sitePath}/searchAnalytics/query`, {
        method: "POST",
        body: {
          startDate,
          endDate,
          dimensions: ["page", "date"],
          rowLimit,
          startRow,
        },
      })
      const rows = parseScSearchAnalytics(pageJson)
      rowsWritten += await upsertScDaily(property, rows)
      if (rows.length < rowLimit) break
      startRow += rows.length
    }

    const sitemapsJson = await googleJson(
      ctx.sa,
      [GOOGLE_SEARCH_CONSOLE_SCOPE],
      `${sitePath}/sitemaps`,
    )
    const sitemaps = parseScSitemaps(sitemapsJson)
    const sitemapsWritten = await upsertScSitemaps(property, sitemaps)
    const sitemapErrors = sitemaps.reduce((n, s) => n + s.errors, 0)

    return {
      leg,
      status: "ok",
      rowsUpserted: rowsWritten + sitemapsWritten,
      detail:
        `property=${property} window=${startDate}..${endDate} analytics_rows=${rowsWritten} ` +
        `sitemaps=${sitemapsWritten} sitemap_errors=${sitemapErrors}`,
    }
  } catch (e) {
    return legError(leg, e)
  }
}

// ---------------------------------------------------------------------------
// Leg 2 — GA4: the headline commerce/traffic report (sessions,
// users, conversions, revenue by date) + top landing pages.
// ---------------------------------------------------------------------------

async function runGa4Leg(ctx: LegContext): Promise<LegResult> {
  const leg: PropertyLeg = "ga4"
  if (!ctx.tables.ga4Daily || !ctx.tables.ga4Landing) {
    return { leg, status: "skipped", rowsUpserted: 0, detail: "table_not_installed" }
  }
  try {
    let propertyId = resolveSeededId(
      await readSetting(SETTING_GA4_PROPERTY),
      KNOWN_GA4_PROPERTY_ID,
    )
    // The leg's subject is the Data API. Discovery (Analytics Admin)
    // is only a means to a property id — with a seeded id it is a
    // NON-FATAL probe: its staged enablement stays visible in the
    // leg detail (admin_api=disabled/ok/…), and when it lights up
    // the stored account id self-heals from it. An Admin failure
    // never fails a Data API pull.
    let adminNote = "admin_api=not_probed"
    if (!propertyId) {
      const summariesJson = await googleJson(
        ctx.sa,
        [GOOGLE_GA4_SCOPE],
        `${GA4_ADMIN_API_BASE}/accountSummaries?pageSize=200`,
      )
      const choices = parseGa4AccountSummaries(summariesJson)
      const choice = selectGa4Property(choices)
      if (!choice) {
        return {
          leg,
          status: "error",
          rowsUpserted: 0,
          detail:
            "no_access: the service account sees no GA4 property (accountSummaries returned none)",
        }
      }
      propertyId = choice.propertyId
      adminNote = "admin_api=ok"
      await writeSetting(
        SETTING_GA4_PROPERTY,
        propertyId,
        "GA4 property id (auto-discovered via Analytics Admin accountSummaries)",
      )
      if (choice.accountId) {
        await writeSetting(
          SETTING_GA4_ACCOUNT,
          choice.accountId,
          "GA4 account id (auto-discovered via Analytics Admin accountSummaries)",
        )
      }
    } else {
      try {
        const summariesJson = await googleJson(
          ctx.sa,
          [GOOGLE_GA4_SCOPE],
          `${GA4_ADMIN_API_BASE}/accountSummaries?pageSize=200`,
        )
        const choice = selectGa4Property(parseGa4AccountSummaries(summariesJson))
        adminNote = "admin_api=ok"
        if (choice?.accountId) {
          const stored = await readSetting(SETTING_GA4_ACCOUNT)
          if (stored !== choice.accountId) {
            await writeSetting(
              SETTING_GA4_ACCOUNT,
              choice.accountId,
              "GA4 account id (auto-discovered via Analytics Admin accountSummaries)",
            )
          }
        }
      } catch (e) {
        adminNote =
          e instanceof GoogleApiRequestError ? `admin_api=${e.kind}` : "admin_api=error"
      }
    }

    const { startDate, endDate } = ga4Window(new Date())
    const reportUrl = `${GA4_DATA_API_BASE}/properties/${encodeURIComponent(propertyId)}:runReport`
    const dailyJson = await googleJson(ctx.sa, [GOOGLE_GA4_SCOPE], reportUrl, {
      method: "POST",
      body: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "conversions" },
          { name: "totalRevenue" },
        ],
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: "1000",
      },
    })
    const dailyWritten = await upsertGa4Daily(propertyId, parseGa4DailyReport(dailyJson))

    const landingJson = await googleJson(ctx.sa, [GOOGLE_GA4_SCOPE], reportUrl, {
      method: "POST",
      body: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }, { name: "landingPage" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: "5000",
      },
    })
    const landingWritten = await upsertGa4Landing(propertyId, parseGa4LandingReport(landingJson))

    return {
      leg,
      status: "ok",
      rowsUpserted: dailyWritten + landingWritten,
      detail:
        `property=${propertyId} ${adminNote} window=${startDate}..${endDate} ` +
        `daily_rows=${dailyWritten} landing_rows=${landingWritten}`,
    }
  } catch (e) {
    return legError(leg, e)
  }
}

// ---------------------------------------------------------------------------
// The daily sync — both legs, isolated (one leg's failure,
// disabled state, or missing tables never blocks the others), every
// outcome recorded.
// ---------------------------------------------------------------------------

export type GooglePropertiesSyncSummary = {
  armed: boolean
  tables: PropertyTables
  legs: LegResult[]
}

export async function runGooglePropertiesSync(): Promise<GooglePropertiesSyncSummary> {
  const tables = await propertyTablesInstalled()
  const config = await resolveGoogleIndexingConfig()
  if (!config.armed || !config.serviceAccount) {
    return {
      armed: false,
      tables,
      legs: PROPERTY_LEGS.map((leg) => ({
        leg,
        status: "skipped" as const,
        rowsUpserted: 0,
        detail: "not_armed",
      })),
    }
  }
  const ctx: LegContext = { sa: config.serviceAccount, tables }
  const startedAt = new Map<string, Date>()
  const wrap = (leg: PropertyLeg, run: (c: LegContext) => Promise<LegResult>) => ({
    name: leg,
    run: async () => {
      startedAt.set(leg, new Date())
      return run(ctx)
    },
  })
  const settled = await settleLegs<LegResult>([
    wrap("search_console", runSearchConsoleLeg),
    wrap("ga4", runGa4Leg),
  ])
  const legs: LegResult[] = []
  for (const s of settled) {
    const result = s.ok
      ? s.value
      : legError(s.name as PropertyLeg, new Error(s.error))
    legs.push(result)
    if (tables.syncRuns) {
      await recordRun(result, startedAt.get(result.leg) ?? new Date())
    }
  }
  return { armed: true, tables, legs }
}

// ---------------------------------------------------------------------------
// Status — the admin surface's read. Reachability per API comes from
// the latest recorded run (ok = enabled and pulling; disabled = the
// API is still off in the Cloud project; never_run = no run yet).
// No credential material is ever read out here — the gate exposes
// only the account email + project id, as identifiers.
// ---------------------------------------------------------------------------

export type ApiReachability = {
  state: "enabled" | "disabled" | "error" | "never_run"
  detail: string | null
  at: string | null
}

export type GooglePropertiesStatus = {
  armed: boolean
  serviceAccountEmail: string | null
  projectId: string | null
  tables: PropertyTables
  resolved: {
    searchConsoleProperty: string | null
    ga4PropertyId: string | null
    ga4AccountId: string | null
  }
  reachability: Record<PropertyLeg, ApiReachability>
  stats: {
    searchConsole: {
      rows: number
      latestDate: string | null
      sitemaps: number
      sitemapErrors: number
    } | null
    ga4: { rows: number; latestDate: string | null } | null
  }
}

export async function getGooglePropertiesStatus(): Promise<GooglePropertiesStatus> {
  const config = await resolveGoogleIndexingConfig()
  const tables = await propertyTablesInstalled()
  const resolved = {
    searchConsoleProperty: await readSetting(SETTING_SC_PROPERTY),
    ga4PropertyId: resolveSeededId(
      await readSetting(SETTING_GA4_PROPERTY),
      KNOWN_GA4_PROPERTY_ID,
    ),
    ga4AccountId: resolveSeededId(
      await readSetting(SETTING_GA4_ACCOUNT),
      KNOWN_GA4_ACCOUNT_ID,
    ),
  }

  const reachability: Record<PropertyLeg, ApiReachability> = {
    search_console: { state: "never_run", detail: null, at: null },
    ga4: { state: "never_run", detail: null, at: null },
  }
  if (tables.syncRuns) {
    try {
      const rows = await pgQuery<{
        leg: string
        status: string
        detail: string | null
        finished_at: string
      }>(
        `SELECT DISTINCT ON (leg) leg, status, detail, finished_at::text AS finished_at
           FROM google_property_sync_runs
          ORDER BY leg, finished_at DESC`,
      )
      for (const r of rows) {
        const leg = r.leg as PropertyLeg
        if (!(leg in reachability)) continue
        reachability[leg] = {
          state:
            r.status === "ok"
              ? "enabled"
              : r.status === "disabled"
                ? "disabled"
                : "error",
          detail: r.detail,
          at: r.finished_at,
        }
      }
    } catch {
      // The recorded state stays never_run — honest when unreadable.
    }
  }

  let scStats: GooglePropertiesStatus["stats"]["searchConsole"] = null
  if (tables.searchConsoleDaily) {
    try {
      const daily = await pgQuery<{ n: string; latest: string | null }>(
        `SELECT count(*)::text AS n, max(report_date)::text AS latest
           FROM google_search_console_daily`,
      )
      let sitemaps = 0
      let sitemapErrors = 0
      if (tables.searchConsoleSitemaps) {
        const sm = await pgQuery<{ n: string; errs: string }>(
          `SELECT count(*)::text AS n, coalesce(sum(errors), 0)::text AS errs
             FROM google_search_console_sitemaps`,
        )
        sitemaps = Number(sm[0]?.n) || 0
        sitemapErrors = Number(sm[0]?.errs) || 0
      }
      scStats = {
        rows: Number(daily[0]?.n) || 0,
        latestDate: daily[0]?.latest ?? null,
        sitemaps,
        sitemapErrors,
      }
    } catch {
      scStats = null
    }
  }

  let ga4Stats: GooglePropertiesStatus["stats"]["ga4"] = null
  if (tables.ga4Daily) {
    try {
      const rows = await pgQuery<{ n: string; latest: string | null }>(
        `SELECT count(*)::text AS n, max(report_date)::text AS latest
           FROM google_ga4_daily`,
      )
      ga4Stats = {
        rows: Number(rows[0]?.n) || 0,
        latestDate: rows[0]?.latest ?? null,
      }
    } catch {
      ga4Stats = null
    }
  }

  return {
    armed: config.armed,
    serviceAccountEmail: config.serviceAccount?.clientEmail ?? null,
    projectId: config.serviceAccount?.projectId ?? null,
    tables,
    resolved,
    reachability,
    stats: { searchConsole: scStats, ga4: ga4Stats },
  }
}

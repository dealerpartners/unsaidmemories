// ---------------------------------------------------------------------------
// Site tenant resolution — S5 keystone of the franchise authoring spec
// (~/workspace/your_files/unsaid-docs/franchise-authoring-spec.md).
//
// Until now the public site was single-tenant by construction: src/lib/repo.ts
// binds one hardcoded TENANT_ID constant and nothing anywhere read the
// tenants table's domain columns (custom_domain / primary_domain) or its
// brand columns (logo_url, primary_color, brand_font, …). This module is the
// first reader of both:
//
//   host ──► tenants.custom_domain / primary_domain ──► SiteTenant
//   unknown / unconfigured host ──► the master tenant (never an error)
//
// Resolution is request-scoped and cached in process for 60s (the same TTL
// discipline as the repo's chrome read cache). If the database is
// unreachable, resolution degrades to a synthetic master descriptor with
// null brand fields so the site still stands on its built-in defaults —
// a marketing page must never need the database to render.
//
// Server-only: it reads tenants with the service-role key via PostgREST,
// the same access path src/lib/repo.ts uses for the public site.
// ---------------------------------------------------------------------------

import { headers } from "next/headers"
import { cached } from "@/lib/cache"
import { supabaseConfig, supabaseReady } from "@/lib/repo"
import {
  MASTER_TENANT_ID,
  MASTER_TENANT_SLUG,
  normalizeHost,
  type SiteTenant,
} from "@/lib/site-tenant-shared"

// Constants, types and pure helpers live in site-tenant-shared.ts (no
// server imports) so client component graphs can use them without
// dragging next/headers into the client bundle. Re-exported here so
// existing server-side imports of "@/lib/site-tenant" keep working.
export {
  MASTER_TENANT_ID,
  MASTER_TENANT_SLUG,
  normalizeHost,
  publicTenantView,
  type PublicSiteTenant,
  type SiteTenant,
} from "@/lib/site-tenant-shared"

const TENANT_COLUMNS =
  "id,name,slug,tenant_type,status,logo_url,logo_dark_url,favicon_url," +
  "primary_color,secondary_color,accent_color,brand_font,support_email," +
  "support_phone,website_url,custom_domain,primary_domain,social_links"

function syntheticMaster(): SiteTenant {
  return {
    id: MASTER_TENANT_ID,
    name: "UnSaid Memories",
    slug: MASTER_TENANT_SLUG,
    tenantType: "master",
    isMaster: true,
    logoUrl: null,
    logoDarkUrl: null,
    faviconUrl: null,
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
    brandFont: null,
    supportEmail: null,
    supportPhone: null,
    websiteUrl: null,
    customDomain: null,
    primaryDomain: null,
    socialLinks: null,
    templateKey: null,
    websiteMode: "template",
  }
}

function rowToTenant(r: Record<string, any>): SiteTenant {
  const social =
    r.social_links && typeof r.social_links === "object" && !Array.isArray(r.social_links)
      ? (r.social_links as Record<string, string>)
      : null
  return {
    id: String(r.id),
    name: String(r.name || "UnSaid Memories"),
    slug: String(r.slug || ""),
    tenantType: r.tenant_type ?? null,
    isMaster: String(r.id) === MASTER_TENANT_ID,
    logoUrl: r.logo_url || null,
    logoDarkUrl: r.logo_dark_url || null,
    faviconUrl: r.favicon_url || null,
    primaryColor: r.primary_color || null,
    secondaryColor: r.secondary_color || null,
    accentColor: r.accent_color || null,
    brandFont: r.brand_font || null,
    supportEmail: r.support_email || null,
    supportPhone: r.support_phone || null,
    websiteUrl: r.website_url || null,
    customDomain: r.custom_domain || null,
    primaryDomain: r.primary_domain || null,
    socialLinks: social,
    templateKey: r.template_key || null,
    websiteMode: r.website_mode || "template",
  }
}

async function fetchTenantRows(path: string): Promise<Record<string, any>[] | null> {
  const { url, key } = supabaseConfig
  if (!url || !key) return null
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      // Bounded (2026-10-23): an unbounded PostgREST read can HANG
      // under database saturation instead of failing. The route's
      // time-box race then resolves without it — but the dangling
      // fetch keeps the serverless invocation alive until the
      // platform kills it, which is exactly the bare-500 symptom on
      // every fresh (site)/[slug] generation. The abort makes the
      // promise settle: the catch below returns null and the route
      // answers from its fallback.
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return null
    const rows = await res.json().catch(() => null)
    return Array.isArray(rows) ? rows : null
  } catch {
    return null
  }
}

/** One tenants read. Retries without template_key when the column does not
 * exist yet (pre-migration tolerance — code must not depend on the
 * migration having been applied). */
async function readTenant(filter: string): Promise<SiteTenant | null> {
  const withKey = await fetchTenantRows(`tenants?select=${TENANT_COLUMNS},template_key,website_mode&${filter}&limit=1`)
  if (withKey && withKey[0]) return rowToTenant(withKey[0])
  if (withKey) return null // query worked; no such tenant
  const plain = await fetchTenantRows(`tenants?select=${TENANT_COLUMNS}&${filter}&limit=1`)
  if (plain && plain[0]) return rowToTenant(plain[0])
  return null
}

/** The host spellings a stored domain should match: the host itself plus
 * its www- twin in whichever direction applies. */
function hostCandidates(host: string): string[] {
  const out = [host]
  if (host.startsWith("www.")) out.push(host.slice(4))
  else out.push(`www.${host}`)
  return out
}

async function resolveUncached(host: string): Promise<SiteTenant> {
  if (host) {
    const candidates = hostCandidates(host)
    const orFilter = candidates
      .map((h) => `custom_domain.eq.${encodeURIComponent(h)},primary_domain.eq.${encodeURIComponent(h)}`)
      .join(",")
    const byDomain = await readTenant(`or=(${orFilter})&status=eq.active`)
    if (byDomain) return byDomain
  }
  const master = await readTenant(`id=eq.${MASTER_TENANT_ID}`)
  return master || syntheticMaster()
}

/**
 * Resolve the tenant serving `host` (defaults to the current request's
 * Host header). Unknown hosts, the master domain, localhost, and any
 * database failure all resolve to the master tenant — never to an error.
 */
/** Next's dynamic-server-usage bailout: thrown by headers()/cookies()
 * when a route is being statically generated. It must NEVER be
 * swallowed by a fail-soft catch — Next converts a swallowed bailout
 * into the fatal app-static-to-dynamic error, which 500s the whole
 * route (observed live on /(site)/[slug] for every unmatched slug,
 * Sentry ALLABOUTPORTAL-9). Rethrowing lets Next convert the request to
 * dynamic rendering, where headers() is legal. */
export function isDynamicBailout(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "digest" in err &&
    String((err as { digest?: unknown }).digest).startsWith("DYNAMIC_SERVER_USAGE")
  )
}

export async function resolveSiteTenant(host?: string | null): Promise<SiteTenant> {
  if (!supabaseReady) return syntheticMaster()
  let h = normalizeHost(host)
  if (!h) {
    try {
      const hdrs = await headers()
      h = normalizeHost(hdrs.get("x-forwarded-host") || hdrs.get("host"))
    } catch (err) {
      if (isDynamicBailout(err)) throw err
      h = ""
    }
  }
  return cached(`site:tenant:${h || "master"}`, 60 * 1000, () => resolveUncached(h))
}

/** Convenience: just the resolved tenant id for read binding. */
export async function getSiteTenantId(): Promise<string> {
  return (await resolveSiteTenant()).id
}

// ---------------------------------------------------------------------------
// Custom (admin-authored) website templates — the data side of the
// Template Builder (Franchise Management Portal, 2026-10-17).
//
// Server-only: reads public.site_templates (migration 20261143) with
// the service-role key via PostgREST, the same pattern as
// src/lib/site-tenant.ts, with the same short cache. The code registry
// (src/lib/site-templates.ts) stays the sync fallback: if the table is
// unreachable or a key is unknown, resolution degrades to the code
// templates exactly as before this module existed.
//
// A custom template is APPLIABLE only while published — drafts are the
// admin's workbench. Assignment validation therefore accepts code keys
// + published custom keys.
// ---------------------------------------------------------------------------

import { supabaseConfig, supabaseReady } from "@/lib/repo"
import {
  SITE_TEMPLATES,
  getSiteTemplate,
  isTemplateKey,
  normalizeTemplateBlocks,
  normalizeTemplatePages,
  templateSurfaces,
  type SiteTemplate,
  type TemplatePage,
} from "@/lib/site-templates"
import type { SiteTenant } from "@/lib/site-tenant-shared"

const CACHE_MS = 60_000
let cache: { at: number; rows: SiteTemplate[] } | null = null

function rowToTemplate(r: Record<string, any>): SiteTemplate {
  const pages = r.pages != null ? normalizeTemplatePages(r.pages) ?? undefined : undefined
  const base: SiteTemplate = {
    id: String(r.id),
    key: String(r.key),
    name: String(r.name || r.key),
    description: String(r.description || ""),
    surfaces: ["home", "book"],
    source: "custom",
    status: r.status === "published" ? "published" : "draft",
    blocks: normalizeTemplateBlocks(r.blocks) ?? [],
    ...(pages ? { pages } : {}),
  }
  base.surfaces = templateSurfaces(base)
  return base
}

async function fetchCustomRows(): Promise<SiteTemplate[]> {
  if (!supabaseReady) return []
  const { url, key } = supabaseConfig
  if (!url || !key) return []
  const read = async (cols: string) => {
    const res = await fetch(
      `${url}/rest/v1/site_templates?select=${cols}&order=created_at.asc`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        // Bounded, same reason as site-tenant's read (2026-10-23): a
        // hung read must settle (and land in the catch below), never
        // dangle past the route's time-box and hold the invocation
        // open until the platform kills it with a bare 500.
        signal: AbortSignal.timeout(2000),
      },
    )
    if (!res.ok) return null
    const rows = await res.json().catch(() => null)
    return Array.isArray(rows) ? rows : null
  }
  try {
    // `pages` exists once migration 20261145 is applied; retry without
    // it on an older database rather than losing every custom template.
    const withPages = await read("id,key,name,description,blocks,pages,status")
    if (withPages) return withPages.map(rowToTemplate)
    const plain = await read("id,key,name,description,blocks,status")
    if (plain) return plain.map(rowToTemplate)
    return []
  } catch {
    return []
  }
}

/** All custom templates (drafts included), 60s-cached. */
export async function loadCustomTemplates(): Promise<SiteTemplate[]> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_MS) return cache.rows
  const rows = await fetchCustomRows()
  cache = { at: now, rows }
  return rows
}

/** Drop the cache (builder writes call this so edits show at once in
 *  the same process; other processes converge within the TTL). */
export function invalidateCustomTemplateCache() {
  cache = null
}

/** Published custom templates — the appliable set. */
export async function loadPublishedCustomTemplates(): Promise<SiteTemplate[]> {
  return (await loadCustomTemplates()).filter((t) => t.status === "published")
}

/** The full template library for pickers: code templates first, then
 *  published custom templates. */
export async function loadTemplateLibrary(): Promise<SiteTemplate[]> {
  return [...SITE_TEMPLATES, ...(await loadPublishedCustomTemplates())]
}

/** True when `key` names an appliable template: a code template or a
 *  PUBLISHED custom template. The DB-aware replacement for the sync
 *  isTemplateKey in assignment paths. */
export async function isKnownTemplateKey(key: unknown): Promise<boolean> {
  if (isTemplateKey(key)) return true
  if (typeof key !== "string" || !key) return false
  return (await loadPublishedCustomTemplates()).some((t) => t.key === key)
}

export type ResolvedTemplate =
  | { kind: "code"; template: SiteTemplate }
  | { kind: "custom"; template: SiteTemplate }

/**
 * Resolve a tenant's assignment for rendering: a published custom
 * template renders from its blocks; anything else (null, code keys,
 * unknown keys, a custom key whose template was drafted/deleted)
 * resolves through the code registry with its house fallback — a bad
 * or stale assignment never breaks a tenant's site.
 */
export async function resolveSiteTemplate(tenant: SiteTenant): Promise<ResolvedTemplate> {
  const key = tenant.templateKey
  if (key && !isTemplateKey(key)) {
    const custom = (await loadPublishedCustomTemplates()).find((t) => t.key === key)
    if (custom) return { kind: "custom", template: custom }
  }
  return { kind: "code", template: getSiteTemplate(key) }
}

/**
 * Resolve ONE page of a tenant's assigned template for the (site)/[slug]
 * tenant-template branch: only a published CUSTOM template with a pages
 * array can serve a slug page, and only for a non-master tenant whose
 * website is platform-templated (a WordPress-mode tenant's site is their
 * WordPress). Returns null for everything else, and the caller falls
 * back to the route's normal behavior — a stale or unknown slug is a
 * 404 there, never a broken render.
 */
export async function resolveTenantTemplatePage(
  tenant: SiteTenant,
  slug: string,
): Promise<{ template: SiteTemplate; page: TemplatePage } | null> {
  // Master in either spelling: the master tenant id, or any master-typed
  // row (live data carries the master domain on master-typed rows whose
  // id is not the canonical one — the platform's own site must never
  // serve tenant template pages).
  if (tenant.isMaster || tenant.tenantType === "master" || tenant.websiteMode !== "template") return null
  const resolved = await resolveSiteTemplate(tenant)
  if (resolved.kind !== "custom" || !resolved.template.pages) return null
  const page = resolved.template.pages.find((p) => p.slug === slug)
  if (!page) return null
  return { template: resolved.template, page }
}

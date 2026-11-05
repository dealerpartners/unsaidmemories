// ---------------------------------------------------------------------------
// Site tenant — CLIENT-SAFE shared pieces (constants, types, pure helpers).
//
// Split out of src/lib/site-tenant.ts at the 2026-10-16 landing fix: the
// server module imports next/headers + the repo's service-role config, and
// client component graphs (Sidebar → portal-nav → franchise-access) import
// the master-tenant constant from it — which dragged next/headers into the
// client bundle and failed every production build after the franchise
// merge (Turbopack: "You're importing a component that needs next/headers").
// Everything in this file is pure and import-free; client code imports
// from here, server code may import from either module (site-tenant.ts
// re-exports all of this).
// ---------------------------------------------------------------------------

// UNSAID ADAPTATION (transplant lane 2, 2026-10-30): UnSaid Memories hardcoded its
// master tenant UUID here. Unsaid resolves its one tenant from the
// environment — the same variables Unsaid's admin gate reads
// (lib/admin/gate.ts PLATFORM_TENANT_ID). Every importer of this
// constant in the transplanted set is a server route; in a client
// bundle these non-public vars are undefined and comparisons fail
// closed (""), exactly as a foreign UUID would.
export const MASTER_TENANT_ID = process.env.SUPABASE_TENANT_ID ?? process.env.UNSAID_TENANT_ID ?? "";
export const MASTER_TENANT_SLUG = "unsaid"; // UNSAID ADAPTATION: was "all-about-portal"

export type SiteTenant = {
  id: string
  name: string
  slug: string
  tenantType: string | null
  isMaster: boolean
  // Brand columns (tenants.*) — null when the tenant has not set them; the
  // site shell falls back to its built-in master brand presentation.
  logoUrl: string | null
  logoDarkUrl: string | null
  faviconUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
  accentColor: string | null
  brandFont: string | null
  supportEmail: string | null
  supportPhone: string | null
  websiteUrl: string | null
  customDomain: string | null
  primaryDomain: string | null
  socialLinks: Record<string, string> | null
  /** Website template assignment (tenants.template_key, migration
   * 20261099). Null = the default template. */
  templateKey: string | null
  /** How the tenant's website is provided (tenants.website_mode,
   * migration 20261143): 'template' (a platform template renders
   * their domain) or 'wordpress' (their connected WordPress). */
  websiteMode: string
}

/** Lowercase, strip port / trailing dot / scheme residue. */
export function normalizeHost(raw: string | null | undefined): string {
  if (!raw) return ""
  return raw.trim().toLowerCase().split(":")[0].replace(/\.$/, "")
}

/**
 * The tenant descriptor safe to hand to the client chrome: brand +
 * identity + template only — never internal columns.
 */
export function publicTenantView(t: SiteTenant) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    isMaster: t.isMaster,
    logoUrl: t.logoUrl,
    logoDarkUrl: t.logoDarkUrl,
    faviconUrl: t.faviconUrl,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor,
    accentColor: t.accentColor,
    brandFont: t.brandFont,
    supportEmail: t.supportEmail,
    supportPhone: t.supportPhone,
    websiteUrl: t.websiteUrl,
    socialLinks: t.socialLinks,
    templateKey: t.templateKey,
    websiteMode: t.websiteMode,
  }
}

export type PublicSiteTenant = ReturnType<typeof publicTenantView>

/**
 * Tier rule (owner, 2026-10-17): the marketplace is a MASTER-tenant
 * offering. A franchise (child) tenant's website comes one of two
 * ways — an applied template or their connected WordPress — and never
 * carries the shop/commerce surface. Before this check existed, any
 * tenant host served the full shop (fed by the master's catalog) under
 * the franchise's brand. Null means "tenant not resolved yet" — the
 * resolution fallback is the master tenant, which keeps the shop.
 */
export function tenantHasMarketplace(tenant: PublicSiteTenant | null | undefined): boolean {
  return !tenant || tenant.isMaster
}

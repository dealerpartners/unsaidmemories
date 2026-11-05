// ---------------------------------------------------------------------------
// Website template registry — S6 of the franchise authoring spec
// (~/workspace/your_files/unsaid-docs/franchise-authoring-spec.md §1.5 / S6).
//
// Templates are CODE, not data. A template is a registered set of layout
// compositions (storefront home, shop landing, booking landing) that
// renders complete from the tenant's brand columns (tenants.* via
// src/lib/site-tenant.ts) plus built-in defaults — with ZERO CMS rows.
// CMS rows may enrich a page where a surface already reads them, but no
// template composition may depend on a CMS row to stand up: a tenant with
// no settings rows and no content still gets a complete, honest page.
//
// Assignment lives on the tenant (tenants.template_key, migration
// 20261099; null = the default template). This module is the registry
// only — it holds no tenant state and reads no database. Other crews
// import SITE_TEMPLATES and getSiteTemplate from "@/lib/site-templates".
//
// 2026-10-17 (Template Builder, Franchise Management Portal): the two
// entries below remain the CODE templates with bespoke compositions.
// Admin-authored templates are DATA (public.site_templates, migration
// 20261143) composed from the block vocabulary below; they resolve
// through src/lib/site-templates-db.ts, which merges them with this
// registry. A SiteTemplate with `blocks` set is a custom template and
// renders through the generic composition renderer; one without is a
// code template with its own page compositions.
// ---------------------------------------------------------------------------

/** One content block of a custom (admin-authored) template. The
 *  optional fields are content overrides in the house CMS idiom —
 *  plain key/value copy the block renders instead of its defaults. */
export type TemplateBlock = {
  block: TemplateBlockType
  eyebrow?: string
  heading?: string
  body?: string
}

/** The section vocabulary a custom template composes from — the
 *  site's existing islands/sections, minus commerce (the shop is a
 *  master-tenant offering; franchise sites never carry it). */
export const TEMPLATE_BLOCK_TYPES = [
  "hero",
  "services",
  "difference",
  "testimonial",
  "gallery",
  "booking",
  "contact",
  "cta",
] as const
export type TemplateBlockType = (typeof TEMPLATE_BLOCK_TYPES)[number]

export function isTemplateBlockType(v: unknown): v is TemplateBlockType {
  return typeof v === "string" && (TEMPLATE_BLOCK_TYPES as readonly string[]).includes(v)
}

/** Validate + normalize an untrusted blocks payload (builder API). */
export function normalizeTemplateBlocks(raw: unknown): TemplateBlock[] | null {
  if (!Array.isArray(raw)) return null
  const out: TemplateBlock[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") return null
    const b = item as Record<string, unknown>
    if (!isTemplateBlockType(b.block)) return null
    const block: TemplateBlock = { block: b.block }
    for (const k of ["eyebrow", "heading", "body"] as const) {
      if (b[k] !== undefined && b[k] !== null && b[k] !== "") {
        if (typeof b[k] !== "string") return null
        block[k] = (b[k] as string).slice(0, 2000)
      }
    }
    out.push(block)
    if (out.length > 24) return null
  }
  return out
}

// ---------------------------------------------------------------------------
// Multi-page templates (2026-10-17, migration 20261145): a custom
// template is a small WEBSITE — an ordered set of pages, each with its
// own ordered block composition from the same vocabulary. Two slugs are
// structural: 'home' renders at the tenant's root and 'book' renders as
// the tenant's booking landing (the surfaces that already resolve
// per-tenant today); every other page renders at /<slug> on the
// tenant's domain through the (site)/[slug] tenant-template branch.
//
// The shape is deliberately plain ordered data — pages, then blocks —
// so a future drag-and-drop builder edits exactly this model.
// ---------------------------------------------------------------------------

export type TemplatePage = {
  slug: string
  title: string
  blocks: TemplateBlock[]
}

export const TEMPLATE_HOME_SLUG = "home"
export const TEMPLATE_BOOK_SLUG = "book"

/** Slugs a template page may never claim: the (site) route tree's fixed
 *  segments (they win routing on every domain, so a page named here
 *  would be unreachable and misleading to author), platform INFO pages
 *  served by the [slug] footer route, and app entry points. 'home' and
 *  'book' are NOT reserved — they are the structural pages. */
export const RESERVED_TEMPLATE_PAGE_SLUGS = new Set([
  "about", "brand-opt-out", "dmca", "docs", "faq", "feedback",
  "free-shipping", "gallery", "gift-cards", "grooming", "offers",
  "onboarding", "partners", "policies", "pricing",
  "process", "products", "seller", "services", "shop", "shop-filtered",
  "sitemap", "subscriptions", "veterinary-partners",
  "pet-insurance",
  "api", "admin", "login", "signup", "sign-in", "index",
])

const TEMPLATE_PAGE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isTemplatePageSlug(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length >= 1 &&
    v.length <= 48 &&
    TEMPLATE_PAGE_SLUG_RE.test(v) &&
    !RESERVED_TEMPLATE_PAGE_SLUGS.has(v)
  )
}

/** Validate + normalize an untrusted pages payload (builder API).
 *  Returns null on ANY defect — a template's page set is written whole
 *  or not at all. Bounds keep a template a small business website:
 *  1–12 pages, each composing at most the per-page block bound. */
export function normalizeTemplatePages(raw: unknown): TemplatePage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 12) return null
  const seen = new Set<string>()
  const out: TemplatePage[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") return null
    const p = item as Record<string, unknown>
    if (!isTemplatePageSlug(p.slug)) return null
    if (seen.has(p.slug as string)) return null
    seen.add(p.slug as string)
    if (typeof p.title !== "string" || !p.title.trim() || p.title.length > 120) return null
    const blocks = normalizeTemplateBlocks(p.blocks ?? [])
    if (!blocks) return null
    out.push({ slug: p.slug as string, title: p.title.trim(), blocks })
  }
  return out
}

/** The page of a template for a slug, when the template is multi-page. */
export function templatePageFor(
  template: { pages?: TemplatePage[] },
  slug: string,
): TemplatePage | null {
  return template.pages?.find((p) => p.slug === slug) ?? null
}

/** The surfaces a template provides, for pickers and summaries. Custom
 *  multi-page templates list their structural surfaces plus one entry
 *  per extra page ("/<slug>"); legacy custom templates keep the
 *  historical home+book pair. */
export function templateSurfaces(template: {
  source?: "code" | "custom"
  surfaces: string[]
  pages?: TemplatePage[]
}): string[] {
  if (template.source === "custom" && template.pages && template.pages.length > 0) {
    return template.pages.map((p) =>
      p.slug === TEMPLATE_HOME_SLUG ? "home" : p.slug === TEMPLATE_BOOK_SLUG ? "book" : `/${p.slug}`,
    )
  }
  return template.surfaces
}

export type SiteTemplate = {
  key: string
  name: string
  description: string
  /** The public surfaces this template provides a composition for. */
  surfaces: string[]
  /** Where the template comes from: 'code' = bespoke compositions in
   *  the page components; 'custom' = admin-authored in the Template
   *  Builder, rendered from `blocks`. */
  source?: "code" | "custom"
  /** Ordered composition blocks (custom templates only). For a
   *  multi-page template this mirrors the home page's blocks so
   *  single-composition readers keep a sensible summary. */
  blocks?: TemplateBlock[]
  /** Ordered pages (custom multi-page templates only, migration
   *  20261145). Absent = the legacy single composition in `blocks`,
   *  rendered on the home and book surfaces exactly as before. */
  pages?: TemplatePage[]
  /** Builder lifecycle (custom templates only). */
  status?: "draft" | "published"
  /** Row id (custom templates only). */
  id?: string
}

export const SITE_TEMPLATES: SiteTemplate[] = [
  {
    key: "house",
    name: "House",
    description:
      "The current master design: split hero with the photo filling the right column, black services band, Portalitive Difference split, shop bento, and the three-part closing band on the home page; promo hero, category orbit, and top sellers on the shop landing; interleaved step bands and entry cards on the booking landing.",
    surfaces: ["home", "shop", "book"],
    source: "code",
  },
  {
    key: "salon",
    name: "Salon",
    description:
      "A complete alternate arrangement of the same islands and the same data: a centered, brand-tinted hero with a full-width photo strip on the home and booking landings, shop and Kinnect sections ahead of the services band at home, shop-by-pet ahead of the promo hero in the shop, and both booking entry cards together ahead of the step bands. Styled from the tenant's brand columns (primary color, brand font, business name) with the house palette as the built-in fallback.",
    surfaces: ["home", "shop", "book"],
    source: "code",
  },
]

export const DEFAULT_TEMPLATE_KEY = "house"

const HOUSE_TEMPLATE: SiteTemplate =
  SITE_TEMPLATES.find((t) => t.key === DEFAULT_TEMPLATE_KEY) ?? SITE_TEMPLATES[0]

/** True when `key` names a registered template. */
export function isTemplateKey(key: unknown): key is string {
  return typeof key === "string" && SITE_TEMPLATES.some((t) => t.key === key)
}

/**
 * Resolve a tenant's stored template_key to its registry entry.
 * Null, undefined, empty, and unknown keys all resolve to the default
 * (house) template — a bad or missing assignment must never break a
 * tenant's site.
 */
export function getSiteTemplate(key?: string | null): SiteTemplate {
  if (!key) return HOUSE_TEMPLATE
  return SITE_TEMPLATES.find((t) => t.key === key) ?? HOUSE_TEMPLATE
}

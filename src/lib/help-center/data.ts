// Help Center data adapter (server-side).
//
// Wraps the compiled document library (src/lib/library) with the Help
// Center's own model. The owner's reorganization (user-first, not
// taxonomy-first):
//
//   PUBLIC Help Center (/docs)
//     How-to guides: Shopping & Orders, Selling on Portal, Brands &
//     Manufacturers, Franchise Owners, Groomer Services, Kinnect U
//     Learning. Legal: General Terms, Buyer Terms, Seller Terms, Brand &
//     Franchise Terms, Vet & Pharmacy Terms, Groomer Terms, Regulatory.
//
//   Developer Platform (/developers)  -> its own surface, own adapter
//     (src/lib/devdocs). Nothing developer renders here.
//
//   Customer portal guides -> buyer guides, rendered in the public Help
//     Center (/help/customer-portal). The customer portal also carries
//     its own internal reader over the same corpus.
//
//   Admin guides -> inside the admin portal (/admin/docs/guides).
//
//   Staff Operations (/docs/staff): employee + internal slices only
//     (admin docs moved behind the admin portal).
//
// - Numbers order the corpus internally but NOTHING numeric is rendered;
//   cross-references were rewritten into named links (references.ts).
// - em dashes retire in every rendered string (clean()).
// - light indexes (no bodies) feed sidebars and prev/next; article pages
//   hand the client exactly one body.

import { libraryDocs, type LibraryDoc } from "@/lib/library/reading";
import { clean, PARTNER_GROUPS, partnerGroupForSlug } from "@/components/help-center/text";
import { docHref, linkReferences } from "@/lib/library/references";
import { linkSitePages } from "@/lib/library/site-links";

export type HCMode = "public" | "developer" | "staff";

export interface HCDomainMeta {
  slug: string;
  title: string;
  blurb: string;
}

export interface HCSectionMeta {
  domainSlug: string;
  slug: string;
  title: string;
}

export interface HCArticleMeta {
  domainSlug: string;
  sectionSlug: string;
  sectionTitle: string;
  slug: string;
  title: string;
  audience: string;
}

export interface HCArticle extends HCArticleMeta {
  body: string;
}

// ---------------------------------------------------------------------------
// Domains: the Help Center carries help + legal (public) and operations
// (staff). The api domain belongs to the Developer Portal.
// ---------------------------------------------------------------------------

export const HC_DOMAINS: HCDomainMeta[] = [
  { slug: "help", title: "Help Guides", blurb: "How-to guides for shopping, bookings, selling and partnerships." },
  { slug: "legal", title: "Legal & Policies", blurb: "Binding, versioned policies by audience." },
  { slug: "operations", title: "Staff Operations", blurb: "Back-of-house guides for the UnSaid Memories team." },
];

export const HC_DOMAIN_BY_SLUG = new Map(HC_DOMAINS.map((d) => [d.slug, d]));

// ---------------------------------------------------------------------------
// User-first section names: the owner's reorganization. The internal
// taxonomy ("Public Website", "Everyone", "Customer Portal") is gone:
// categories say what a person is trying to do.
// ---------------------------------------------------------------------------

const SECTION_TITLES: Record<string, string> = {
  "help/public-website": "Shopping & Orders",
  "help/seller-center": "Selling on Portal",
  "help/brand-manufacturer-franchise": "Brands & Manufacturers",
  "help/franchise-portal": "Franchise Owners",
  "help/groomer-services": "Groomer Services",
  "help/learning-portal": "Kinnect U Learning",
  "help/employee-portal": "Employee Portal",
  "help/corporate-legal": "Corporate & Legal",
  "help/customer-portal": "Portal Guides",
  "help/admin-portal": "Admin Guides",
  "legal/everyone": "General Terms",
  "legal/buyers": "Buyer Terms",
  "legal/sellers": "Seller Terms",
  "legal/brands-franchises": "Brand & Partner Terms",
  "legal/vet-pharmacy": "Vet & Pharmacy Terms",
  "legal/groomers": "Groomer Terms",
  "legal/regulatory": "Regulatory Compliance",
  "legal/internal": "Internal Policies",
  "legal/developers-partners": "Developer & Partner Terms",
};

export function sectionTitle(domainSlug: string, sectionSlug: string, fallback: string): string {
  return SECTION_TITLES[`${domainSlug}/${sectionSlug}`] ?? clean(fallback);
}

/** Sidebar group labels per center: which domains appear, under what label. */
export const HC_CENTER_GROUPS: Record<HCMode, { domainSlug: string; label: string }[]> = {
  public: [
    { domainSlug: "help", label: "Help Guides" },
    { domainSlug: "legal", label: "Legal & Policies" },
  ],
  developer: [
    { domainSlug: "api", label: "Developer Platform" },
    { domainSlug: "legal", label: "Legal for Developers" },
  ],
  staff: [
    { domainSlug: "operations", label: "Staff Operations" },
    { domainSlug: "legal", label: "Staff Policies" },
    { domainSlug: "help", label: "Staff Help" },
  ],
};

const PUBLIC_AUDIENCES = new Set([
  "everyone", "buyer", "seller", "brand", "manufacturer", "franchise", "vet", "pharmacy", "groomer",
]);
const STAFF_AUDIENCES = new Set(["employee", "internal"]);
const DEV_AUDIENCES = new Set(["developer"]);
const ADMIN_AUDIENCES = new Set(["admin"]);

/** Sections that live inside their audience's portal (never public).
 *  Admin guides are staff ops and stay behind /admin. Buyer guides —
 *  including the customer-portal section — are public Help content. */
const ADMIN_PORTAL_SECTIONS = new Set(["help/admin-portal"]);

/**
 * Which center an article renders in. Admin-audience docs map to "staff"
 * so they can never leak public: their pages redirect behind the admin
 * portal, and no center listing includes them.
 */
export function articleMode(audience: string): HCMode {
  if (DEV_AUDIENCES.has(audience)) return "developer";
  if (STAFF_AUDIENCES.has(audience) || ADMIN_AUDIENCES.has(audience)) return "staff";
  return "public";
}

function inCenter(audience: string, mode: HCMode): boolean {
  if (mode === "developer") return DEV_AUDIENCES.has(audience);
  if (mode === "staff") return STAFF_AUDIENCES.has(audience); // admin excluded
  return PUBLIC_AUDIENCES.has(audience);
}

const CENTER_DOMAINS: Record<HCMode, Set<string>> = {
  public: new Set(["help", "legal"]),
  developer: new Set(["api", "legal"]),
  staff: new Set(["operations", "help", "legal"]),
};

// ---------------------------------------------------------------------------
// Compiled corpus -> Help Center shapes (built once per import)
// ---------------------------------------------------------------------------

const ALL: HCArticle[] = libraryDocs().map((d: LibraryDoc) => ({
  domainSlug: d.domain,
  sectionSlug: d.sectionSlug,
  sectionTitle: sectionTitle(d.domain, d.sectionSlug, d.sectionTitle),
  slug: d.slug,
  title: clean(d.title),
  audience: d.audience,
  body: linkSitePages(linkReferences(clean(d.body))),
}));

const BY_DOMAIN_SLUG_ARTICLE = new Map(ALL.map((a) => [`${a.domainSlug}/${a.slug}`, a]));

function numberSortKey(number: string): number {
  const p = number.split(".").map((x) => parseInt(x, 10) || 0);
  return (p[0] ?? 0) * 10000 + (p[1] ?? 0) * 100 + (p[2] ?? 0);
}

// Internal ordering keys, never rendered. Slugs are unique across the
// corpus (the library's own resolver keys on slug alone).
const SORT_KEYS = new Map(libraryDocs().map((d) => [d.slug, numberSortKey(d.number)] as const));

const byOrder = (a: { slug: string }, b: { slug: string }) =>
  (SORT_KEYS.get(a.slug) ?? 0) - (SORT_KEYS.get(b.slug) ?? 0) || a.slug.localeCompare(b.slug);

function meta(a: HCArticle): HCArticleMeta {
  const { body: _body, ...m } = a;
  return m;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search index for the public Help Center header: public + staff slices
 * only. Developer (own portal) and admin docs never surface here.
 */
export function hcUnionIndex(): HCArticleMeta[] {
  return ALL.filter(
    (a) =>
      !DEV_AUDIENCES.has(a.audience) &&
      !ADMIN_PORTAL_SECTIONS.has(`${a.domainSlug}/${a.sectionSlug}`) &&
      !ADMIN_AUDIENCES.has(a.audience),
  )
    .map(meta)
    .sort(byOrder);
}

/** Sections visible in one center, in corpus order. */
export function hcCenterSections(mode: HCMode): HCSectionMeta[] {
  const sections = new Map<string, HCSectionMeta & { order: number }>();
  for (const a of ALL) {
    if (!CENTER_DOMAINS[mode].has(a.domainSlug) || !inCenter(a.audience, mode)) continue;
    if (ADMIN_PORTAL_SECTIONS.has(`${a.domainSlug}/${a.sectionSlug}`)) continue;
    const key = `${a.domainSlug}/${a.sectionSlug}`;
    const order = SORT_KEYS.get(a.slug) ?? 0;
    const existing = sections.get(key);
    if (!existing || order < existing.order) {
      sections.set(key, {
        domainSlug: a.domainSlug,
        slug: a.sectionSlug,
        title: a.sectionTitle,
        order,
      });
    }
  }
  const domainOrder = (slug: string) => HC_DOMAINS.findIndex((d) => d.slug === slug);
  return [...sections.values()]
    .sort((x, y) => domainOrder(x.domainSlug) - domainOrder(y.domainSlug) || x.order - y.order)
    .map(({ order: _order, ...s }) => s);
}

/** Light article index for one center (sidebar leaves, search scope). */
export function hcCenterArticles(mode: HCMode): HCArticleMeta[] {
  return ALL.filter((a) => {
    if (!CENTER_DOMAINS[mode].has(a.domainSlug) || !inCenter(a.audience, mode)) return false;
    if (ADMIN_PORTAL_SECTIONS.has(`${a.domainSlug}/${a.sectionSlug}`)) return false;
    return true;
  })
    .map(meta)
    .sort(byOrder);
}

/** Resolve one article (with its cleaned body) by domain + slug. */
export function hcArticle(domainSlug: string, slug: string): HCArticle | null {
  return BY_DOMAIN_SLUG_ARTICLE.get(`${domainSlug}/${slug}`) ?? null;
}

/** Section metadata + ordered article metas for one section. */
export function hcSection(
  domainSlug: string,
  sectionSlug: string,
): { section: HCSectionMeta; articles: HCArticleMeta[] } | null {
  const arts = ALL.filter((a) => a.domainSlug === domainSlug && a.sectionSlug === sectionSlug);
  if (!arts.length) return null;
  const first = arts[0];
  return {
    section: {
      domainSlug,
      slug: sectionSlug,
      title: first.sectionTitle,
    },
    articles: arts.map(meta).sort(byOrder),
  };
}

/**
 * Prev/next for an article: neighbors inside its center's slice of the same
 * domain, in corpus order. Cross-domain hops stay a deliberate click away.
 */
export function hcPrevNext(article: HCArticleMeta): { prev: HCArticleMeta | null; next: HCArticleMeta | null } {
  const mode = articleMode(article.audience);
  const list = ALL.filter((a) => a.domainSlug === article.domainSlug && inCenter(a.audience, mode))
    .map(meta)
    .sort(byOrder);
  const i = list.findIndex((a) => a.slug === article.slug);
  if (i === -1) return { prev: null, next: null };
  return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null };
}

/** The section an article really belongs to (URL section segments are cosmetic). */
export function hcSectionOf(article: HCArticleMeta): HCSectionMeta {
  return {
    domainSlug: article.domainSlug,
    slug: article.sectionSlug,
    title: article.sectionTitle,
  };
}

/** Center mode for a whole section: the mode its articles' audience implies. */
export function hcSectionMode(domainSlug: string, sectionSlug: string): HCMode | null {
  const arts = ALL.filter((a) => a.domainSlug === domainSlug && a.sectionSlug === sectionSlug);
  if (!arts.length) return null;
  const modes = new Set(arts.map((a) => articleMode(a.audience)));
  if (modes.size === 1) return [...modes][0];
  // Mixed sections (public + staff scoped docs, e.g. Kinnect U Learning)
  // render in the public center; the staff center filters to its own docs
  // inside the same section.
  return "public";
}

// ---------------------------------------------------------------------------
// Portal doc slices (customer + admin guides render inside their portals)
// ---------------------------------------------------------------------------

export interface HCArticleBody extends HCArticleMeta {
  body: string;
}

/** Customer portal guides: rendered by /customer/support/docs. */
export function hcCustomerPortalDocs(): HCArticleBody[] {
  return ALL.filter(
    (a) => a.domainSlug === "help" && a.sectionSlug === "customer-portal",
  ).sort(byOrder) as HCArticleBody[];
}

/** Admin guides: rendered by /admin/docs/guides. */
export function hcAdminDocs(): HCArticleBody[] {
  return ALL.filter(
    (a) =>
      (a.domainSlug === "help" && a.sectionSlug === "admin-portal") ||
      (a.domainSlug === "legal" && a.sectionSlug === "regulatory" && a.audience === "admin"),
  ).sort(byOrder) as HCArticleBody[];
}

/** Resolve one portal guide by slug (customer or admin slice). */
export function hcPortalDoc(slug: string): HCArticleBody | null {
  return (
    hcCustomerPortalDocs().find((a) => a.slug === slug) ??
    hcAdminDocs().find((a) => a.slug === slug) ??
    null
  );
}

/** Everything a page needs to render one center view. */
export interface HCViewData {
  mode: HCMode;
  domains: HCDomainMeta[];
  sections: HCSectionMeta[];
  articles: HCArticleMeta[];
}

export function hcViewData(mode: HCMode): HCViewData {
  return {
    mode,
    domains: HC_DOMAINS,
    sections: hcCenterSections(mode),
    articles: hcCenterArticles(mode),
  };
}

// ---------------------------------------------------------------------------
// Step 15 bifurcated portal slices (owner spec, 2026-10-21). Each public
// portal is a dedicated view over the same compiled corpus:
//   Legal     — the legal domain only; staff-scoped sections/audiences out
//   Help      — buyer-facing help domain only (how-to lives here)
//   Partner U — partner-audience help, grouped per portal below
// Franchise is removed as a public category: franchise-audience docs are
// excluded from every public slice (the corpus itself is untouched).
// ---------------------------------------------------------------------------

const PORTAL_PUBLIC_AUDIENCES = new Set([
  "everyone", "buyer", "seller", "brand", "manufacturer", "vet", "pharmacy", "groomer",
]);

export interface PortalCenterData {
  sections: HCSectionMeta[];
  articles: HCArticleMeta[];
}

function sectionsOf(articles: HCArticleMeta[]): HCSectionMeta[] {
  const seen = new Map<string, HCSectionMeta>();
  for (const a of articles) {
    const key = `${a.domainSlug}/${a.sectionSlug}`;
    if (!seen.has(key)) {
      seen.set(key, { domainSlug: a.domainSlug, slug: a.sectionSlug, title: a.sectionTitle });
    }
  }
  return [...seen.values()];
}

/** Legal Center slice: legal domain, public audiences. The internal
 *  section (employee) and admin-audience regulatory docs stay behind
 *  their portals; the developers-partners section is legal content and
 *  renders here (the Developer Portal links to it, per Step 15). */
export function legalCenterData(): PortalCenterData {
  const articles = ALL.filter((a) => {
    if (a.domainSlug !== "legal") return false;
    if (a.sectionSlug === "internal") return false;
    if (a.audience === "developer") return a.sectionSlug === "developers-partners";
    return PORTAL_PUBLIC_AUDIENCES.has(a.audience);
  })
    .map(meta)
    .sort(byOrder);
  return { sections: sectionsOf(articles), articles };
}

/** Help slice: buyer-facing help domain (public website, learning, and
 *  the customer-portal account & orders guides). Partner sections live
 *  in Partner U; the admin-portal section is staff ops and stays behind
 *  /admin. */
export function helpCenterData(): PortalCenterData {
  const articles = ALL.filter((a) => {
    if (a.domainSlug !== "help") return false;
    if (a.sectionSlug !== "public-website" && a.sectionSlug !== "learning-portal" && a.sectionSlug !== "customer-portal") return false;
    return a.audience === "buyer" || a.audience === "everyone";
  })
    .map(meta)
    .sort(byOrder);
  return { sections: sectionsOf(articles), articles };
}

export interface PartnerGroupData {
  slug: string;
  title: string;
  articles: HCArticleMeta[];
  /** Articles owned by another portal (e.g. Legal terms) surface as
   *  outbound links instead of local article pages. */
  external?: boolean;
}

/** Partner U slice for one portal: the portal's named section tree with
 *  the corpus articles mapped into it (see PARTNER_GROUP_BY_SLUG). */
export function partnerPortalData(portal: string): { groups: PartnerGroupData[]; articles: HCArticleMeta[] } {
  if (portal === "veterinary-pharmacy") {
    // Bifurcation is absolute: Partner U carries partner education only.
    // The vet & pharmacy TERMS are legal policies and live only in the
    // Legal Center — they are never listed or rendered inside Partner U.
    // No vet/pharmacy education guides exist in the corpus yet, so every
    // group in this portal renders honestly empty.
    const groups = PARTNER_GROUPS["veterinary-pharmacy"].map((g) => ({
      slug: g.slug,
      title: g.title,
      articles: [] as HCArticleMeta[],
    }));
    return { groups, articles: [] };
  }
  const sectionByPortal: Record<string, string> = {
    sellers: "seller-center",
    grooming: "groomer-services",
    "brands-manufacturers": "brand-manufacturer-franchise",
  };
  const sectionSlug = sectionByPortal[portal];
  const groupDefs = PARTNER_GROUPS[portal] ?? [];
  if (!sectionSlug) return { groups: [], articles: [] };
  const articles = ALL.filter(
    (a) =>
      a.domainSlug === "help" &&
      a.sectionSlug === sectionSlug &&
      a.audience !== "franchise" &&
      PORTAL_PUBLIC_AUDIENCES.has(a.audience),
  )
    .map(meta)
    .sort(byOrder);
  const groups = groupDefs.map((g) => ({
    slug: g.slug,
    title: g.title,
    articles: articles.filter((a) => partnerGroupForSlug(a.slug) === g.slug),
  }));
  return { groups, articles };
}

/** Union slice for the Partner U mega menu (all four portals). */
export function partnerCenterData(): PortalCenterData {
  const articles = ALL.filter(
    (a) =>
      a.domainSlug === "help" &&
      (a.sectionSlug === "seller-center" ||
        a.sectionSlug === "groomer-services" ||
        a.sectionSlug === "brand-manufacturer-franchise") &&
      a.audience !== "franchise" &&
      PORTAL_PUBLIC_AUDIENCES.has(a.audience),
  )
    .map(meta)
    .sort(byOrder);
  return { sections: sectionsOf(articles), articles };
}

const PORTAL_BAND_SECTIONS: Record<string, string[]> = {
  sellers: ["seller-center"],
  "veterinary-pharmacy": [],
  grooming: ["groomer-services"],
  "brands-manufacturers": ["brand-manufacturer-franchise"],
};

/**
 * One portal's OWN band data. A dedicated page's mega menu and search
 * carry only that portal's sections and articles — the mega menu stays
 * with the dedicated page; nothing combines across portals.
 */
export function portalBandData(portal: string): PortalCenterData {
  const slugs = PORTAL_BAND_SECTIONS[portal] ?? [];
  const articles = ALL.filter(
    (a) =>
      a.domainSlug === "help" &&
      slugs.includes(a.sectionSlug) &&
      a.audience !== "franchise" &&
      PORTAL_PUBLIC_AUDIENCES.has(a.audience),
  )
    .map(meta)
    .sort(byOrder);
  return { sections: sectionsOf(articles), articles };
}

/** Prev/next inside an explicit ordered list (portal-scoped reading). */
export function hcPrevNextFrom(
  list: HCArticleMeta[],
  article: HCArticleMeta,
): { prev: HCArticleMeta | null; next: HCArticleMeta | null } {
  const i = list.findIndex((a) => a.slug === article.slug && a.domainSlug === article.domainSlug);
  if (i === -1) return { prev: null, next: null };
  return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null };
}

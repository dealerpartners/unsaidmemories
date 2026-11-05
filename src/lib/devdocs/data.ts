// Developer Portal data adapter (server-side).
//
// The Developer Portal is its own surface (own route, own chrome, own
// fonts). Its documentation lives in Supabase (doc_domains / doc_sections /
// doc_articles, domain "api") — the portal reads that store through
// docs-center.ts and groups the sections into the eight Step 15 portal
// sections. The compiled library corpus remains only as a failover: if the
// Supabase read returns nothing, the portal renders from the corpus with
// the same section map, so the surface stands when a layer dies.
//
// Step 15 rules honored here:
//   - Legal is NOT part of the Developer Portal — the developers-partners
//     terms live in the Legal Center at /legal/developers-partners and are
//     referenced by link only (devdocsHref still routes them there).
//   - Franchise is out of the public Developer Portal (§6): the franchise
//     sections and articles are never listed or routed here. Their content
//     is untouched in the store; it simply has no public home in this portal.
//   - Ordering uses document numbers internally; nothing numeric renders.

import { cache } from "react";
import {
  listArticlesForSite,
  listSectionsForSite,
  type DocArticle,
  type DocSection,
} from "@/lib/docs-center";
import { libraryDocs, type LibraryDoc } from "@/lib/library/reading";
import { clean } from "@/components/help-center/text";
import { linkReferences } from "@/lib/library/references";
import { linkSitePages } from "@/lib/library/site-links";

export interface DevDoc {
  /** Canonical absolute path, e.g. /developers/api-reference/catalog. */
  href: string;
  /** Portal section label the article renders under. */
  group: string;
  sectionLabel: string;
  slug: string;
  title: string;
  audience: string;
}

export interface DevDocBody extends DevDoc {
  body: string;
}

export type DevdocsSidebarGroup = {
  label: string;
  items: { label: string; href: string }[];
};

export type DevdocsIndexEntry = DevDoc;

// ---------------------------------------------------------------------------
// The eight portal sections (Step 15 tree, Developers), in order.
// ---------------------------------------------------------------------------

const GETTING_STARTED = "Getting Started";
const API_REFERENCE = "API Reference";
const SDKS = "SDKs";
const INTEGRATIONS = "Integrations";
const WEBHOOKS = "Webhooks";
const SECURITY = "Security";
const DEVELOPER_RESOURCES = "Developer Resources";

export const DEV_GROUPS = [
  GETTING_STARTED,
  API_REFERENCE,
  SDKS,
  INTEGRATIONS,
  WEBHOOKS,
  SECURITY,
  DEVELOPER_RESOURCES,
] as const;

const GROUP_SLUG: Record<string, string> = {
  [GETTING_STARTED]: "getting-started",
  [API_REFERENCE]: "api-reference",
  [SDKS]: "sdks",
  [INTEGRATIONS]: "integrations",
  [WEBHOOKS]: "webhooks",
  [SECURITY]: "security",
  [DEVELOPER_RESOURCES]: "developer-resources",
};

/** Supabase doc_sections (api domain) -> portal section. Sections absent
 *  here (developer-guide catch-all, franchise-integration-guide) are not
 *  part of the public portal. */
const SECTION_GROUP: Record<string, string> = {
  "getting-started": GETTING_STARTED,
  "authentication-and-authorization": GETTING_STARTED,
  "core-concepts": GETTING_STARTED,
  "catalog-integration-guide": GETTING_STARTED,
  "inventory-integration-guide": GETTING_STARTED,
  "orders-integration-guide": GETTING_STARTED,
  "fulfillment-integration-guide": GETTING_STARTED,
  "returns-integration-guide": GETTING_STARTED,
  "payments-integration-guide": GETTING_STARTED,
  "pricing-integration-guide": GETTING_STARTED,
  "analytics-integration-guide": GETTING_STARTED,
  "governance-integration-guide": GETTING_STARTED,
  reference: API_REFERENCE,
  "sdks-libraries-guide": SDKS,
  "integration-guides": INTEGRATIONS,
  "veterinary-pharmacy-integration-guide": INTEGRATIONS,
  "feeds-bulk-data-guide": INTEGRATIONS,
  "brand-manufacturer-integration-guide": INTEGRATIONS,
  "solution-providers-guide": INTEGRATIONS,
  "webhooks-guide": WEBHOOKS,
  "security-compliance-guide": SECURITY,
  troubleshooting: DEVELOPER_RESOURCES,
  "api-policies": DEVELOPER_RESOURCES,
  "email-architecture-guide": DEVELOPER_RESOURCES,
  "ai-agents-mcp-guide": DEVELOPER_RESOURCES,
};

/** Article slug -> portal section. The single source of truth for the
 *  failover corpus mapping AND for devdocsHref (the Help Center's legacy
 *  redirects), so a slug has exactly one home everywhere. */
const ARTICLE_GROUP: Record<string, string> = {
  "getting-started": GETTING_STARTED,
  "authentication-and-authorization": GETTING_STARTED,
  "core-concepts": GETTING_STARTED,
  catalog: GETTING_STARTED,
  inventory: GETTING_STARTED,
  orders: GETTING_STARTED,
  fulfillment: GETTING_STARTED,
  returns: GETTING_STARTED,
  payments: GETTING_STARTED,
  pricing: GETTING_STARTED,
  analytics: GETTING_STARTED,
  governance: GETTING_STARTED,
  "sdks-and-libraries": SDKS,
  "systems-integrations": INTEGRATIONS,
  "veterinary-and-pharmacy-integrations": INTEGRATIONS,
  "feeds-and-bulk-data": INTEGRATIONS,
  "brand-and-manufacturer": INTEGRATIONS,
  "solution-providers": INTEGRATIONS,
  webhooks: WEBHOOKS,
  "security-and-compliance": SECURITY,
  "api-troubleshooting": DEVELOPER_RESOURCES,
  "api-policies": DEVELOPER_RESOURCES,
  "email-architecture": DEVELOPER_RESOURCES,
  "ai-agents-and-mcp": DEVELOPER_RESOURCES,
};

/** §6: franchise material never renders in the public Developer Portal. */
const HELD_OUT_SLUGS = new Set(["franchise-integrations", "franchise-endpoints"]);

function numberKey(number: string | null): number {
  const p = (number ?? "").split(".").map((x) => parseInt(x, 10) || 0);
  return (p[0] ?? 0) * 10000 + (p[1] ?? 0) * 100 + (p[2] ?? 0);
}

type Light = DevDocBody & { numberKey: number; sectionSort: number };

const light = (d: Light): DevDocBody => ({
  href: d.href,
  group: d.group,
  sectionLabel: d.sectionLabel,
  slug: d.slug,
  title: d.title,
  audience: d.audience,
  body: d.body,
});

function sortAll(rows: Light[]): Light[] {
  const order = new Map<string, number>(DEV_GROUPS.map((g, i) => [g, i]));
  return rows.sort(
    (a, b) =>
      (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99) ||
      a.sectionSort - b.sectionSort ||
      a.numberKey - b.numberKey ||
      a.title.localeCompare(b.title),
  );
}

const renderBody = (body: string): string =>
  linkSitePages(linkReferences(clean(body)));

// ---------------------------------------------------------------------------
// Primary source: Supabase doc_* (api domain), articles in their sections.
// ---------------------------------------------------------------------------

async function fromSupabase(): Promise<Light[]> {
  const [sections, articles] = await Promise.all([
    listSectionsForSite("api"),
    listArticlesForSite({ domain: "api" }),
  ]);
  const secById = new Map<string, DocSection>(sections.map((s) => [s.id, s]));
  const out: Light[] = [];
  for (const a of articles as DocArticle[]) {
    if (!a.section_id || HELD_OUT_SLUGS.has(a.slug)) continue;
    const sec = secById.get(a.section_id);
    if (!sec) continue;
    const group = SECTION_GROUP[sec.slug];
    if (!group) continue;
    out.push({
      href: `/developers/${GROUP_SLUG[group]}/${a.slug}`,
      group,
      sectionLabel: clean(sec.title),
      slug: a.slug,
      title: clean(a.title),
      audience: a.audience_slug || "developer",
      body: renderBody(a.body ?? ""),
      numberKey: numberKey(a.number),
      sectionSort: sec.sort ?? 0,
    });
  }
  return sortAll(out);
}

// ---------------------------------------------------------------------------
// Failover: the compiled library corpus, same section map.
// ---------------------------------------------------------------------------

function fromLibrary(): Light[] {
  const docs = libraryDocs().filter(
    (d) =>
      d.audience === "developer" &&
      d.domain === "api" &&
      (d.sectionSlug === "developer-guide" || d.sectionSlug === "api-reference") &&
      !HELD_OUT_SLUGS.has(d.slug),
  );
  const out: Light[] = docs.map((d: LibraryDoc) => {
    const group =
      d.sectionSlug === "api-reference" ? API_REFERENCE : ARTICLE_GROUP[d.slug];
    if (!group) return null;
    return {
      href: `/developers/${GROUP_SLUG[group]}/${d.slug}`,
      group,
      sectionLabel: clean(d.sectionTitle),
      slug: d.slug,
      title: clean(d.title),
      audience: d.audience,
      body: renderBody(d.body),
      numberKey: numberKey(d.number),
      sectionSort: 0,
    } as Light;
  }).filter((x): x is Light => x !== null);
  return sortAll(out);
}

const loadAll = cache(async (): Promise<Light[]> => {
  try {
    const rows = await fromSupabase();
    if (rows.length) return rows;
  } catch {
    // fall through to the corpus failover
  }
  return fromLibrary();
});

// ---------------------------------------------------------------------------
// Public reads (all async — the portal's source is the database).
// ---------------------------------------------------------------------------

/** Ordered light index for search, cards and the pager. */
export async function devdocsAll(): Promise<DevDocBody[]> {
  return (await loadAll()).map(light);
}

export async function devdocsGroupArticles(group: string): Promise<DevDoc[]> {
  return (await loadAll()).filter((d) => d.group === group).map(light);
}

/** Sidebar tree: the eight portal sections with their article links. */
export async function devdocsGroups(): Promise<DevdocsSidebarGroup[]> {
  const all = await loadAll();
  return DEV_GROUPS.map((label) => ({
    label,
    items: all
      .filter((d) => d.group === label)
      .map((d) => ({ label: d.title, href: d.href })),
  })).filter((g) => g.items.length);
}

/** Resolve one article (with body) by its URL segments. */
export async function devdocsArticle(
  rawGroup: string,
  slug: string,
): Promise<DevDocBody | null> {
  const wanted = rawGroup.replace(/-/g, " ").toLowerCase();
  const found = (await loadAll()).find(
    (d) => d.slug === slug && d.group.toLowerCase() === wanted,
  );
  return found ? light(found) : null;
}

/** Resolve a section landing by group label (case-insensitive, hyphen-safe). */
export async function devdocsSection(raw: string): Promise<DevDoc[] | null> {
  const wanted = raw.replace(/-/g, " ").toLowerCase();
  const group = DEV_GROUPS.find((g) => g.toLowerCase() === wanted);
  return group ? devdocsGroupArticles(group) : null;
}

/** Canonical href for a library doc, wherever the Help Center found it.
 *  Sync and static (the slug->section map above) so legacy redirects never
 *  wait on the database. */
export function devdocsHref(domain: string, sectionSlug: string, slug: string): string {
  if (sectionSlug === "developers-partners") return "/legal/developers-partners";
  if (slug) {
    const group = ARTICLE_GROUP[slug];
    if (group) return `/developers/${GROUP_SLUG[group]}/${slug}`;
    if (sectionSlug === "api-reference" && !HELD_OUT_SLUGS.has(slug))
      return `/developers/api-reference/${slug}`;
    return "/developers";
  }
  if (sectionSlug === "api-reference") return "/developers/api-reference";
  if (sectionSlug === "developer-guide") return "/developers/getting-started";
  return "/developers";
}

/** Previous / next across the whole developer reading order. */
export async function devdocsPrevNext(
  article: DevDocBody,
): Promise<{ prev: DevDoc | null; next: DevDoc | null }> {
  const all = await loadAll();
  const i = all.findIndex((d) => d.slug === article.slug && d.group === article.group);
  if (i === -1) return { prev: null, next: null };
  const at = (j: number): DevDoc | null => (all[j] ? light(all[j]) : null);
  return { prev: at(i - 1), next: at(i + 1) };
}

/** Per-section counts for the portal home. */
export async function devdocsStats(): Promise<{
  total: number;
  groups: { label: string; slug: string; count: number }[];
}> {
  const all = await loadAll();
  return {
    total: all.length,
    groups: DEV_GROUPS.map((label) => ({
      label,
      slug: GROUP_SLUG[label],
      count: all.filter((d) => d.group === label).length,
    })),
  };
}

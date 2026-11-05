// Server-only data layer for the Document Center (/docs — the Help Center).
//
// Reads the doc_* tables (see doc-center-schema.sql) via the Supabase
// service-role REST API, tenant-scoped. Failed reads THROW — an empty
// array means only that the read succeeded and found no rows. The
// site-chain readers below fall back tenant -> master per read and throw
// only when every tenant in the chain failed.

import { ADMIN_TENANT_ID } from "@/lib/admin-api";
import { MASTER_TENANT_ID, resolveSiteTenant } from "@/lib/site-tenant";

const SB_URL = (
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
).replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const docsServiceConfigured = () => SB_KEY.length > 0;

export interface DocDomain {
  id: string;
  number: string;
  title: string;
  slug: string;
  description: string | null;
  sort: number;
}

export interface DocSection {
  id: string;
  domain_id: string | null;
  parent_id: string | null;
  number: string;
  title: string;
  slug: string;
  description: string | null;
  sort: number;
}

export interface DocAudience {
  id: string;
  slug: string;
  label: string;
  sort: number;
}

export interface DocArticle {
  id: string;
  section_id: string | null;
  number: string | null;
  title: string;
  slug: string;
  audience_slug: string;
  content_type: "article" | "tooltip";
  status: string;
  body: string | null;
  keywords: string | null;
  portal_link: string | null;
  sort: number;
  published_at: string | null;
}

/** Static fallback used before Sunny runs the schema SQL. Keys match the seed slugs. */
export const DOC_DOMAIN_FALLBACK: DocDomain[] = [
  { id: "api", number: "1", title: "API Development", slug: "api", description: "Reference and developer guides for building on Portal Shop.", sort: 10 },
  { id: "legal", number: "2", title: "Legal Policies", slug: "legal", description: "Binding, versioned policies by audience.", sort: 20 },
  { id: "help", number: "3", title: "Help Centers", slug: "help", description: "Operational help by portal and audience.", sort: 30 },
  { id: "operations", number: "4", title: "Back-of-House Operations Help", slug: "operations", description: "POS, CRM, accounting, settings, CMS, and AI Ops help.", sort: 40 },
];

/** Static audience fallback (matches the seed rows). */
export const DOC_AUDIENCE_FALLBACK: DocAudience[] = [
  { id: "buyer", slug: "buyer", label: "Buyer", sort: 10 },
  { id: "seller", slug: "seller", label: "Seller", sort: 20 },
  { id: "brand", slug: "brand", label: "Brand Partner", sort: 30 },
  { id: "manufacturer", slug: "manufacturer", label: "Manufacturer", sort: 40 },
  { id: "franchise", slug: "franchise", label: "Franchisee", sort: 50 },
  { id: "vet", slug: "vet", label: "Veterinarian", sort: 60 },
  { id: "pharmacy", slug: "pharmacy", label: "Pharmacy", sort: 70 },
  { id: "groomer", slug: "groomer", label: "Groomer & Pet Services", sort: 80 },
  { id: "employee", slug: "employee", label: "Employee", sort: 90 },
  { id: "admin", slug: "admin", label: "Admin", sort: 100 },
  { id: "developer", slug: "developer", label: "Developer & Partner", sort: 110 },
  { id: "internal", slug: "internal", label: "Internal", sort: 120 },
];

async function sbList(
  table: string,
  tenantId: string,
  extra: Record<string, string> = {},
): Promise<any[]> {
  if (!SB_KEY) return [];
  const p = new URLSearchParams({
    select: "*",
    tenant_id: `eq.${tenantId}`,
    order: "sort.asc",
    limit: "2000",
    ...extra,
  });
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${p.toString()}`, {
    cache: "no-store",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`docs-center: ${table} read failed (${res.status})`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

export async function listDomains(tenantId: string): Promise<DocDomain[]> {
  return (await sbList("doc_domains", tenantId)) as DocDomain[];
}

export async function listAudiences(tenantId: string): Promise<DocAudience[]> {
  return (await sbList("doc_audiences", tenantId)) as DocAudience[];
}

async function domainIdFor(tenantId: string, domainSlug: string): Promise<string | null> {
  const rows = await sbList("doc_domains", tenantId, { slug: `eq.${domainSlug}` });
  return rows[0]?.id ?? null;
}

export async function listSections(
  tenantId: string,
  domainSlug?: string,
): Promise<DocSection[]> {
  const extra: Record<string, string> = {};
  if (domainSlug) {
    const did = await domainIdFor(tenantId, domainSlug);
    if (!did) return [];
    extra["domain_id"] = `eq.${did}`;
  }
  return (await sbList("doc_sections", tenantId, extra)) as DocSection[];
}

export async function listArticles(
  tenantId: string,
  opts: { domain?: string; publishedOnly?: boolean } = {},
): Promise<DocArticle[]> {
  const extra: Record<string, string> = {};
  if (opts.publishedOnly !== false) extra["status"] = "eq.published";
  if (opts.domain) {
    const sections = await listSections(tenantId, opts.domain);
    if (!sections.length) return [];
    const ids = sections.map((s) => s.id).join(",");
    extra["section_id"] = `in.(${ids})`;
  }
  const rows = await sbList("doc_articles", tenantId, extra);
  return (rows as DocArticle[]).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

export async function getArticleBySlug(
  tenantId: string,
  slug: string,
): Promise<DocArticle | null> {
  const rows = await sbList("doc_articles", tenantId, {
    slug: `eq.${slug}`,
    status: "eq.published",
    limit: "1",
  });
  return (rows[0] as DocArticle) ?? null;
}

/** Master-tenant read for metadata (no request context available there). */
export async function getArticleForMetadata(slug: string): Promise<DocArticle | null> {
  return getArticleBySlug(ADMIN_TENANT_ID(), slug);
}

// ---------------------------------------------------------------------------
// S5 site binding: the public Document Center reads the tenant resolved
// from the request host. A franchise tenant with no docs of its own falls
// back to the master's Document Center — never an error, never invented
// content. The chain is [site tenant, master] (just [master] on the
// master host itself); each reader walks it and returns the first
// non-empty result.
// ---------------------------------------------------------------------------

export async function docsTenantChain(): Promise<string[]> {
  const t = await resolveSiteTenant();
  return t.isMaster ? [t.id] : [t.id, MASTER_TENANT_ID];
}

/** Walk the tenant chain for a list read: the first non-empty result wins.
 *  A tenant whose read FAILS falls through to the next tenant (the master
 *  fallback); the failure surfaces only when every tenant in the chain
 *  failed — it is never rendered as a fabricated empty list. */
async function firstNonEmpty<T>(read: (tenantId: string) => Promise<T[]>): Promise<T[]> {
  let lastErr: unknown = null;
  let anySuccess = false;
  for (const id of await docsTenantChain()) {
    try {
      const rows = await read(id);
      anySuccess = true;
      if (rows.length) return rows;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!anySuccess && lastErr) throw lastErr;
  return [];
}

export async function listDomainsForSite(): Promise<DocDomain[]> {
  return firstNonEmpty((id) => listDomains(id));
}

export async function listAudiencesForSite(): Promise<DocAudience[]> {
  return firstNonEmpty((id) => listAudiences(id));
}

export async function listSectionsForSite(domainSlug?: string): Promise<DocSection[]> {
  return firstNonEmpty((id) => listSections(id, domainSlug));
}

export async function listArticlesForSite(
  opts: { domain?: string; publishedOnly?: boolean } = {},
): Promise<DocArticle[]> {
  return firstNonEmpty((id) => listArticles(id, opts));
}

export async function getArticleBySlugForSite(slug: string): Promise<DocArticle | null> {
  let lastErr: unknown = null;
  let anySuccess = false;
  for (const id of await docsTenantChain()) {
    try {
      const article = await getArticleBySlug(id, slug);
      anySuccess = true;
      if (article) return article;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!anySuccess && lastErr) throw lastErr;
  return null;
}

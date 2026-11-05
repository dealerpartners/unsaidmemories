// Reading layer for the document library (owner ruling 2026-10-18).
//
// Document READING is code: every reading surface (public /policies, the
// /docs Document Center, seller docs, seller governance policies, employee
// policies) renders from the generated bundle — LIBRARY_MANIFEST plus the
// per-domain body modules produced by scripts/docs/generate.ts from
// content/library/. Nothing in a reading path fetches document bodies
// from the database at runtime. The database stores remain what they are
// for: acceptance ledgers, editorial workflow, and version history.
//
// Server-side only in practice: pages and server components import this
// module and hand plain data to client islands as props.

import { LIBRARY_MANIFEST, type LibraryManifestEntry } from "./generated-manifest";
import { LIBRARY_BODIES_API } from "./generated-content-api";
import { LIBRARY_BODIES_LEGAL } from "./generated-content-legal";
import { LIBRARY_BODIES_HELP } from "./generated-content-help";
import { LIBRARY_BODIES_OPERATIONS } from "./generated-content-operations";

const BODIES: Record<string, string> = {
  ...LIBRARY_BODIES_API,
  ...LIBRARY_BODIES_LEGAL,
  ...LIBRARY_BODIES_HELP,
  ...LIBRARY_BODIES_OPERATIONS,
};

export interface LibraryDoc extends LibraryManifestEntry {
  body: string;
}

function numberSort(number: string): number {
  const p = number.split(".").map((x) => parseInt(x, 10) || 0);
  return (p[0] ?? 0) * 10000 + (p[1] ?? 0) * 100 + (p[2] ?? 0);
}

const ALL: LibraryDoc[] = LIBRARY_MANIFEST.map((e) => ({
  ...e,
  body: BODIES[e.slug] ?? "",
})).sort((a, b) => numberSort(a.number) - numberSort(b.number));

const BY_SLUG = new Map(ALL.map((d) => [d.slug, d]));

export function libraryDocBySlug(slug: string): LibraryDoc | undefined {
  return BY_SLUG.get(slug);
}

export function libraryDocs(
  filter: Partial<{ domain: string; audience: string; contentType: string; sectionNumber: string }> = {},
): LibraryDoc[] {
  return ALL.filter(
    (d) =>
      (filter.domain === undefined || d.domain === filter.domain) &&
      (filter.audience === undefined || d.audience === filter.audience) &&
      (filter.contentType === undefined || d.contentType === filter.contentType) &&
      (filter.sectionNumber === undefined || d.sectionNumber === filter.sectionNumber),
  );
}

// ---------------------------------------------------------------------------
// Policies (the /policies surfaces and the employee policy reader)
// ---------------------------------------------------------------------------

/** Every published policy document (content_type = policy), in library order. */
export function libraryPolicies(): LibraryDoc[] {
  return ALL.filter((d) => d.contentType === "policy");
}

export function libraryPolicyBySlug(slug: string): LibraryDoc | undefined {
  const d = BY_SLUG.get(slug);
  return d && d.contentType === "policy" ? d : undefined;
}

/** The §2.3 seller governance set (the documents carrying seller_policy). */
export function librarySellerPolicies(): LibraryDoc[] {
  return ALL.filter((d) => d.sellerPolicy !== null);
}

// ---------------------------------------------------------------------------
// Document Center (/docs) data, in the shapes the center renders
// ---------------------------------------------------------------------------

export interface DocsDomainData {
  id: string;
  number: string;
  title: string;
  slug: string;
  description: string | null;
  sort: number;
}

export interface DocsAudienceData {
  id: string;
  slug: string;
  label: string;
  sort: number;
}

export interface DocsSectionData {
  id: string;
  domain_id: string | null;
  parent_id: string | null;
  number: string;
  title: string;
  slug: string;
  description: string | null;
  sort: number;
}

export interface DocsArticleData {
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
  section_number?: string;
  section_title?: string;
  section_slug?: string;
  domain_slug?: string;
  domain_title?: string;
}

export const DOCS_DOMAINS: DocsDomainData[] = [
  { id: "api", number: "1", title: "API Development", slug: "api", description: "Reference and developer guides for building on Portal Shop.", sort: 10 },
  { id: "legal", number: "2", title: "Legal Policies", slug: "legal", description: "Binding, versioned policies by audience.", sort: 20 },
  { id: "help", number: "3", title: "Help Centers", slug: "help", description: "Operational help by portal and audience.", sort: 30 },
  { id: "operations", number: "4", title: "Back-of-House Operations Help", slug: "operations", description: "CRM, accounting, settings, CMS, and AI Ops help.", sort: 40 },
];

export const DOCS_AUDIENCES: DocsAudienceData[] = [
  { id: "everyone", slug: "everyone", label: "Everyone", sort: 5 },
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

export interface DocsCenterData {
  domains: DocsDomainData[];
  audiences: DocsAudienceData[];
  sections: DocsSectionData[];
  articles: DocsArticleData[];
}

function sectionSort(sectionNumber: string): number {
  const [a, b] = sectionNumber.split(".").map((x) => parseInt(x, 10) || 0);
  return a * 100 + b;
}

/** The full reading data for one Document Center domain, from code. */
export function docsCenterData(domainSlug: string): DocsCenterData {
  const docs = ALL.filter((d) => d.domain === domainSlug);
  const sectionMap = new Map<string, DocsSectionData>();
  for (const d of docs) {
    if (!sectionMap.has(d.sectionNumber)) {
      sectionMap.set(d.sectionNumber, {
        id: d.sectionNumber,
        domain_id: domainSlug,
        parent_id: null,
        number: d.sectionNumber,
        title: d.sectionTitle,
        slug: d.sectionSlug,
        description: null,
        sort: sectionSort(d.sectionNumber),
      });
    }
  }
  const domainTitle = DOCS_DOMAINS.find((x) => x.slug === domainSlug)?.title ?? domainSlug;
  return {
    domains: DOCS_DOMAINS,
    audiences: DOCS_AUDIENCES,
    sections: [...sectionMap.values()].sort((a, b) => a.sort - b.sort),
    articles: docs.map((d) => ({
      id: d.slug,
      section_id: d.sectionNumber,
      number: d.number,
      title: d.title,
      slug: d.slug,
      audience_slug: d.audience,
      content_type: "article" as const,
      status: "published",
      body: d.body,
      keywords: null,
      portal_link: null,
      sort: numberSort(d.number),
      published_at: null,
      section_number: d.sectionNumber,
      section_title: d.sectionTitle,
      section_slug: d.sectionSlug,
      domain_slug: d.domain,
      domain_title: domainTitle,
    })),
  };
}

// ---------------------------------------------------------------------------
// Seller U (seller help library): the seller-audience help documents
// ---------------------------------------------------------------------------

export interface SellerLibraryGroup {
  sectionNumber: string;
  sectionTitle: string;
  articles: LibraryDoc[];
}

export function sellerLibrary(): SellerLibraryGroup[] {
  const docs = ALL.filter((d) => d.domain === "help" && d.audience === "seller");
  const groups = new Map<string, SellerLibraryGroup>();
  for (const d of docs) {
    const g = groups.get(d.sectionNumber) ?? {
      sectionNumber: d.sectionNumber,
      sectionTitle: d.sectionTitle,
      articles: [],
    };
    g.articles.push(d);
    groups.set(d.sectionNumber, g);
  }
  return [...groups.values()].sort((a, b) => sectionSort(a.sectionNumber) - sectionSort(b.sectionNumber));
}

export function sellerLibraryArticle(slug: string): LibraryDoc | undefined {
  const d = BY_SLUG.get(slug);
  return d && d.domain === "help" && d.audience === "seller" ? d : undefined;
}

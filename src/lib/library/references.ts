// Cross-reference transformer (server-side).
//
// The corpus prose cites other documents as "Title (§2.1.36)" or a bare
// "§2.4". The owner's ruling: information is referenced and linked back to
// BY NAME, never by number. This module rewrites those references into
// markdown links to the cited document's real URL:
//
//   "See Buyer Protection and Support (§3.2.16)."
//     -> "See [Buyer Protection and Support](/docs/help/customer-portal/...)."
//   "the brand program documents in §2.4"
//     -> "the brand program documents in [Brands & Franchises](/docs/legal/...)"
//
// This module is the single source of truth for doc -> surface routing:
//   developer corpus  -> /developers/…        (the Developer Portal)
//   customer guides   -> /help/customer-portal/… (buyer guides live in Help)
//   admin guides      -> /admin/docs/guides/… (inside the admin portal)
//   everything else   -> /docs/…              (the public Help Center)
//
// Statutory citations (47 U.S.C. § 227, 42 U.S.C. § 12182) carry no dotted
// doc numbers and pass through untouched.

import { LIBRARY_MANIFEST, type LibraryManifestEntry } from "@/lib/library/generated-manifest";
import { hcArticleHref } from "@/components/help-center/text";

/** Canonical URL under the Step 15 bifurcated portals (shared builder). */
function canonicalDocHref(e: {
  domain: string;
  sectionSlug: string;
  slug: string;
  audience: string;
}): string {
  return hcArticleHref({
    domainSlug: e.domain,
    sectionSlug: e.sectionSlug,
    slug: e.slug,
    audience: e.audience,
  });
}

interface RefTarget {
  title: string;
  href: string;
}

function escapeLinkText(text: string): string {
  return text.replace(/[[\]]/g, (c) => (c === "[" ? "%5B" : "%5D"));
}

// ---------------------------------------------------------------------------
// Number ordering (internal only: nothing numeric is ever rendered)
// ---------------------------------------------------------------------------

function numberKey(number: string): number {
  const p = number.split(".").map((x) => parseInt(x, 10) || 0);
  return (p[0] ?? 0) * 10000 + (p[1] ?? 0) * 100 + (p[2] ?? 0);
}

// ---------------------------------------------------------------------------
// Developer Portal routing: the developer-guide splits in corpus order —
// the first GETTING_STARTED_COUNT articles are "Getting Started", the rest
// are "Guides". devdocs/data.ts imports this so the rule lives once.
// ---------------------------------------------------------------------------

export const GETTING_STARTED_COUNT = 5;

const DEV_GUIDE_RUN = LIBRARY_MANIFEST.filter(
  (e) => e.domain === "api" && e.sectionSlug === "developer-guide",
).sort((a, b) => numberKey(a.number) - numberKey(b.number));

const GETTING_STARTED_SLUGS = new Set(
  DEV_GUIDE_RUN.slice(0, GETTING_STARTED_COUNT).map((e) => e.slug),
);

export function isGettingStarted(slug: string): boolean {
  return GETTING_STARTED_SLUGS.has(slug);
}

// ---------------------------------------------------------------------------
// Doc -> surface routing
// ---------------------------------------------------------------------------

/** Canonical reading URL for a manifest entry, by its audience family. */
export function docHref(e: {
  domain: string;
  sectionSlug: string;
  slug: string;
  audience: string;
}): string {
  // Developer corpus lives in the Developer Portal. Legal content is the
  // one exception (Step 15): the Legal Center lives at /legal even for
  // developer-audience terms; the Developer Portal links there.
  if (e.audience === "developer") {
    if (e.domain === "legal" || e.sectionSlug === "developers-partners") {
      return `/legal/developers-partners/${e.slug}`;
    }
    if (e.sectionSlug === "api-reference") return `/developers/api-reference/${e.slug}`;
    return isGettingStarted(e.slug)
      ? `/developers/getting-started/${e.slug}`
      : `/developers/guides/${e.slug}`;
  }
  // Customer-portal guides are BUYER guides (account & orders how-tos):
  // they live in the public Help Center like every other buyer guide.
  // The customer portal keeps its own internal reader over the same
  // corpus, but no public link routes a reader into the signed-in portal.
  // Admin guides live inside the admin portal's guides reader.
  if (
    (e.domain === "help" && e.sectionSlug === "admin-portal") ||
    (e.audience === "admin" && e.domain === "legal" && e.sectionSlug === "regulatory")
  ) {
    return `/admin/docs/guides/${e.slug}`;
  }
  // Staff-scoped docs have no public reading URL (Step 15: staff
  // operations live behind /admin and /employee).
  if (e.audience === "employee" || e.audience === "internal") {
    return "/employee";
  }
  // Step 15 bifurcation: legal lives in the Legal Center, buyer help in
  // Help, partner help in Partner U (canonical builder is shared with
  // the Help Center surfaces).
  return canonicalDocHref(e);
}

const DOCS_BY_NUMBER = new Map<string, RefTarget>();
const SECTIONS_BY_NUMBER = new Map<string, RefTarget>();

for (const e of LIBRARY_MANIFEST) {
  if (!DOCS_BY_NUMBER.has(e.number)) {
    DOCS_BY_NUMBER.set(e.number, { title: e.title, href: docHref(e) });
  }
  if (!SECTIONS_BY_NUMBER.has(e.sectionNumber)) {
    // Developer sections route into the Developer Portal; every other
    // section keeps its Help Center landing.
    const href =
      e.audience === "developer" && e.sectionSlug === "api-reference"
        ? "/developers/api-reference"
        : e.audience === "developer" && e.sectionSlug === "developer-guide"
          ? "/developers/guides"
          : e.audience === "developer" && e.sectionSlug === "developers-partners"
            ? "/legal/developers-partners"
            : `/docs/${e.domain}/${e.sectionSlug}`;
    SECTIONS_BY_NUMBER.set(e.sectionNumber, { title: e.sectionTitle, href });
  }
}

function resolveRef(number: string): RefTarget | null {
  return DOCS_BY_NUMBER.get(number) ?? SECTIONS_BY_NUMBER.get(number) ?? null;
}

/** Case-insensitive tail match of the title inside a raw phrase. */
function titleTailIndex(phrase: string, title: string): number {
  const p = phrase.toLowerCase();
  const t = title.toLowerCase().trim();
  if (!t) return -1;
  return p.lastIndexOf(t);
}

// ---------------------------------------------------------------------------
// Body transform
// ---------------------------------------------------------------------------

const PAREN_REF = /([^.(:;!?\n*[\]]{0,120}?)\s*\((§\d+(?:\.\d+){1,2})\)/g;
const BARE_REF = /§(\d+(?:\.\d+){1,2})/g;

/**
 * Rewrite every numeric cross-reference into a named markdown link.
 * Runs after clean() in both the Help Center and Developer Portal
 * adapters, so every rendered surface speaks the same linked voice.
 *
 *   "…conflicts with the Terms of Use (§2.1.1), …"
 *     -> "…conflicts with the [Terms of Use](/docs/legal/everyone/terms-of-use), …"
 *   "the brand program documents in §2.4"
 *     -> "the brand program documents in [Brands & Franchises](/docs/legal/…)"
 */
export function linkReferences(body: string): string {
  if (!body) return body;

  // Pass 1: "… Title (§N)" -> link the title inside the phrase; when the
  // phrase does not carry the title at all, the citation becomes a named
  // link in place of the number.
  let out = body.replace(PAREN_REF, (_full, phrase: string, ref: string) => {
    const target = resolveRef(ref.slice(1));
    if (!target) return _full;
    // Keep the phrase's leading whitespace (mid-sentence matches).
    const lead = phrase.slice(0, phrase.length - phrase.trimStart().length);
    const cleanPhrase = phrase.trim();

    // The phrase names the target: link exactly the title words inside it.
    const idx = titleTailIndex(cleanPhrase, target.title);
    if (idx >= 0) {
      const before = cleanPhrase.slice(0, idx);
      const tail = cleanPhrase.slice(idx);
      return `${lead}${before}[${escapeLinkText(tail)}](${target.href})`;
    }

    // No name in the phrase: the number becomes a named link.
    return `${lead}${cleanPhrase ? cleanPhrase + " " : ""}([${escapeLinkText(target.title)}](${target.href}))`;
  });

  // Pass 2: bare "§N" -> "[Target](href)".
  out = out.replace(BARE_REF, (_full, num: string) => {
    const target = resolveRef(num);
    if (!target) return _full;
    return `[${escapeLinkText(target.title)}](${target.href})`;
  });

  return out;
}

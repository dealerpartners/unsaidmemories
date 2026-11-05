// ---------------------------------------------------------------------------
// listing-quality.ts — the fix queue behind /seller/catalog/quality
// (original tree: "/seller/catalog/quality — Listing Quality score,
// fix queue"). Pure functions over the seller's REAL seller_listings rows:
// a listing enters the fix queue for each completeness fact that is false
// of its stored record — no title, no description, no price, no category,
// no GTIN, no listing image. Nothing here scores or invents: health_score
// is the platform's recorded value, read from the row, and the issues are
// derivations of fields the row actually carries.
// ---------------------------------------------------------------------------

export interface ListingIssue {
  listing_id: string;
  title: string;
  sku: string;
  status: unknown;
  health_score: unknown;
  product_id: unknown;
  issues: string[];
}

type Row = Record<string, unknown>;

function blank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** Completeness issues for one listing, given its stored media count. */
export function completenessIssues(listing: Row, mediaCount: number): string[] {
  const issues: string[] = [];
  if (blank(listing.title)) issues.push("Missing title");
  if (blank(listing.description)) issues.push("Missing description");
  const price = Number(listing.price);
  if (listing.price === null || listing.price === undefined || !Number.isFinite(price) || price <= 0) {
    issues.push("Missing price");
  }
  if (blank(listing.category_id)) issues.push("No category assigned");
  if (blank(listing.gtin)) issues.push("No GTIN");
  if (mediaCount <= 0) issues.push("No listing image");
  return issues;
}

/**
 * Prohibited ad copy (§2 ad-copy requirements): phrases a listing's title
 * or description may never carry — unsubstantiated absolute or medical
 * claims, and off-platform solicitation (the sale must stay on the
 * platform). The listing writers check copy against this list; a hit
 * rejects the write with the phrase named, it is never silently stripped.
 */
export const PROHIBITED_COPY_PHRASES: readonly string[] = [
  "guaranteed cure",
  "cures",
  "miracle cure",
  "100% effective",
  "veterinarian approved", // only the platform may record an endorsement
  "vet approved",
  "#1 best",
  "best in the world",
  "cheapest price guaranteed",
  "visit our website",
  "order on our website",
  "call us to order",
  "text us to order",
  "dm us to order",
  "cash only",
  "venmo",
  "zelle",
  "paypal friends and family",
] as const;

/** Contact-shaped solicitation (an email address or phone number in copy). */
const CONTACT_PATTERN =
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/i;

/** Every prohibited-copy hit in a piece of listing copy, phrase-named. */
export function prohibitedCopyHits(copy: string): string[] {
  if (!copy) return [];
  const lower = copy.toLowerCase();
  const hits = PROHIBITED_COPY_PHRASES.filter((p) => lower.includes(p));
  if (CONTACT_PATTERN.test(copy)) hits.push("contact details in listing copy");
  return hits;
}

/** The fix queue: every listing with at least one completeness issue,
 *  worst health score first (unscored listings sort as 0 — they need the
 *  review that produces a score, so they belong at the top of the queue). */
export function buildFixQueue(
  listings: Row[],
  mediaByListing: Map<string, number>,
): ListingIssue[] {
  const queue: ListingIssue[] = [];
  for (const l of listings) {
    const id = l.id != null ? String(l.id) : "";
    if (!id) continue;
    const issues = completenessIssues(l, mediaByListing.get(id) ?? 0);
    if (!issues.length) continue;
    queue.push({
      listing_id: id,
      title: typeof l.title === "string" && l.title ? l.title : "(untitled listing)",
      sku: typeof l.sku === "string" ? l.sku : "",
      status: l.status ?? null,
      health_score: l.health_score ?? null,
      product_id: l.product_id ?? null,
      issues,
    });
  }
  const score = (q: ListingIssue) => {
    const n = Number(q.health_score);
    return Number.isFinite(n) ? n : 0;
  };
  return queue.sort((a, b) => score(a) - score(b));
}

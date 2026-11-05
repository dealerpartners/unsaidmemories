// ---------------------------------------------------------------------------
// algolia.ts — Algolia client for unsaidmemories.com.
//
// Architecture (owner's directive): Algolia = search bar ONLY. On-page
// recommendations come from internal analytics rails, not Algolia.
//
// Indices:
//   unsaid_products — 20,082 product records (name, brand_name, category_id,
//                     image_url, sku). Powers the header type-ahead via
//                     /api/shop/search.
//
// Keys:
//   Search API key or Admin API key (server-only): used here. The
//   ALGOLIA_SEARCH_API_KEY env var is checked first; if it fails (stale
//   key), the ALGOLIA_ADMIN_API_KEY is used as fallback since this module
//   is server-only and never ships to the browser.
//
// The algoliasearch v5 client is isomorphic — this module is server-only
// because the keys should not be shipped to the browser bundle. All
// Algolia reads go through API routes.
// ---------------------------------------------------------------------------

import "server-only"
import { algoliasearch } from "algoliasearch"
import { displayBrand } from "@/lib/shop/supplier-blocklist"

// Keys come from the environment ONLY (defect census, Class C): the
// literals that lived here meant any deployment without Algolia env
// vars silently ran on a key printed in source. A missing variable is
// a configuration failure — the first Algolia use throws this named
// error, and callers follow their documented contract
// (searchAlgoliaProducts throws on failure; the search route falls
// back to the database).
export function algoliaAppId(): string {
  const id = process.env.ALGOLIA_APP_ID
  if (!id) {
    throw new Error("ALGOLIA_NOT_CONFIGURED: ALGOLIA_APP_ID is not set")
  }
  return id
}

/** True when both Algolia env vars are present. Optional consumers
 *  (Kinnect AI product cards) check this and skip search entirely on an
 *  unconfigured deployment instead of throwing ALGOLIA_NOT_CONFIGURED
 *  into a 500 — the throw stays the contract for paths where search
 *  IS the product (the search route falls back to the database). */
export function isAlgoliaConfigured(): boolean {
  return Boolean(process.env.ALGOLIA_APP_ID && (process.env.ALGOLIA_SEARCH_API_KEY || process.env.ALGOLIA_ADMIN_API_KEY))
}

function algoliaSearchKey(): string {
  // The search key is preferred (least privilege). If it's stale or missing,
  // fall back to the admin key — this module is server-only (import "server-only"),
  // so the admin key never reaches the browser.
  const searchKey = process.env.ALGOLIA_SEARCH_API_KEY
  const adminKey = process.env.ALGOLIA_ADMIN_API_KEY
  const key = searchKey || adminKey
  if (!key) {
    throw new Error("ALGOLIA_NOT_CONFIGURED: ALGOLIA_SEARCH_API_KEY or ALGOLIA_ADMIN_API_KEY is not set")
  }
  return key
}

export const ALGOLIA_PRODUCTS_INDEX = "unsaid_products"
// Categories index deprecated — no separate categories index exists in Algolia.
// Category browse is handled by the DB taxonomy directly.
export const ALGOLIA_CATEGORIES_INDEX = "unsaid_products"

// Lazy singleton — the v5 client is lightweight, but keep one instance.
let _client: ReturnType<typeof algoliasearch> | null = null
export function getAlgoliaClient() {
  if (!_client) _client = algoliasearch(algoliaAppId(), algoliaSearchKey())
  return _client
}

/** Strip supplier junk from product names: "(CJ…)" suffixes, " - Default", dupes. */
export function cleanProductName(name: string): string {
  return name
    .replace(/\s*\(CJ[^)]*\)/gi, "")
    .replace(/\s*-\s*Default$/i, "")
    .replace(/\s+/g, " ")
    .trim()
}

// ---------------------------------------------------------------------------
// Product hit → header-search ProductResult shape
// ---------------------------------------------------------------------------

export type AlgoliaProductHit = {
  objectID: string
  name: string
  slug: string
  brand?: string | null
  image?: string | null
  images?: string[] | null
  price_cents?: number | null
  compare_at_cents?: number | null
  taxonomy_node_ids?: string[] | null
}

export type SearchProductResult = {
  id: string
  slug: string
  name: string
  brand: string | null
  image: string | null
  priceCents: number
}

/**
 * Map an Algolia product hit to the search dropdown shape.
 * Returns null when the hit is not displayable (no slug, zero price,
 * supplier-only brand is nulled but the product still shows).
 */
export function mapAlgoliaHit(hit: AlgoliaProductHit): SearchProductResult | null {
  const slug = (hit.slug || "").trim()
  if (!slug) return null
  const priceCents = Math.round(Number(hit.price_cents) || 0)
  if (priceCents <= 0) return null
  const image =
    (hit.image || "").trim() ||
    (Array.isArray(hit.images) && hit.images[0] ? String(hit.images[0]).trim() : "") ||
    null
  return {
    id: String(hit.objectID),
    slug,
    name: cleanProductName(String(hit.name || "")),
    brand: displayBrand(hit.brand ?? null),
    image,
    priceCents,
  }
}

/**
 * Type-ahead product search via Algolia. Returns up to `limit` mapped results.
 * Throws on Algolia failure — callers should fall back to the DB RPC.
 *
 * opts.maxPriceCents — when set, the ceiling is enforced AT THE INDEX with
 * numericFilters (price_cents <= max), not only by post-filtering the page
 * Algolia returns. Post-filtering alone cannot honor a ceiling: the index
 * ranks expensive items first (customRanking desc(price_cents) is the live
 * recommendation), so a "dog food under $50" page of 8 could contain zero
 * items under $50 and the post-filter would empty it. With the numeric
 * filter, every raw hit is already under the ceiling, so ranking among
 * cheap items is harmless. The caller-side post-filter stays as a backstop
 * for the enterprise fallback path, which has no index filter.
 */
export async function searchAlgoliaProducts(
  query: string,
  limit = 6,
  opts?: { maxPriceCents?: number | null },
): Promise<SearchProductResult[]> {
  const q = query.trim().slice(0, 120)
  if (q.length < 2) return []
  const maxPrice =
    opts?.maxPriceCents != null && opts.maxPriceCents > 0
      ? Math.floor(opts.maxPriceCents)
      : null
  const client = getAlgoliaClient()
  const res = await client.searchSingleIndex({
    indexName: ALGOLIA_PRODUCTS_INDEX,
    searchParams: {
      query: q,
      ...(maxPrice != null ? { numericFilters: [`price_cents<=${maxPrice}`] } : {}),
      // Over-fetch raw hits 2x: mapAlgoliaHit drops zero-price and
      // duplicate-slug records AFTER Algolia's page cut, so asking for
      // exactly `limit` raw hits yielded as few as 2 displayable products
      // for the dropdown's 6 slots (live probe 2026-10-22: "dog food"
      // limit 6 → 2 items, limit 8 → 4; "leash" limit 12 → 4). The map
      // loop below still caps the output at `limit`. With a price filter
      // the page is wider (24) because the filter already guarantees every
      // raw hit is eligible — mapping drops are the only loss left.
      hitsPerPage: maxPrice != null ? 24 : Math.max(1, Math.min(12, limit * 2)),
      attributesToRetrieve: [
        "name",
        "slug",
        "brand",
        "image",
        "images",
        "price_cents",
        "compare_at_cents",
      ],
    },
  })
  const out: SearchProductResult[] = []
  const seen = new Set<string>()
  for (const h of res.hits as unknown as AlgoliaProductHit[]) {
    const m = mapAlgoliaHit(h)
    if (!m || seen.has(m.slug)) continue
    seen.add(m.slug)
    out.push(m)
    if (out.length >= limit) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Category index — record shape for unsaid_categories
// ---------------------------------------------------------------------------

export type AlgoliaCategoryRecord = {
  objectID: string // `cat:<uuid>` — stable, from taxonomy_nodes.id
  slug: string
  name: string
  display_name: string | null
  parent_id: string | null
  level: number // 0 = top-level (pet/department), 1..3 = nested
  path: string // breadcrumb path, e.g. "Dog Supplies > Food > Dry Food"
  path_slugs: string[] // slug trail for hierarchical faceting
  product_count: number
  hero_image_url: string | null
}

/** Recommended index settings for unsaid_categories (applied by the sync script). */
export const CATEGORIES_INDEX_SETTINGS = {
  searchableAttributes: ["name", "display_name", "path", "slug"],
  attributesForFaceting: ["level", "parent_id", "path_slugs"],
  ranking: ["typo", "words", "proximity", "attribute", "exact", "custom"],
  customRanking: ["desc(product_count)"],
  hitsPerPage: 20,
}

/** Recommended settings audit for unsaid_products (apply via dashboard or Admin key). */
export const PRODUCTS_INDEX_SETTINGS_RECOMMENDATION = {
  // brand is currently NOT searchable — add it so "Bocce's" etc. match.
  searchableAttributes: ["name", "brand", "slug"],
  attributesForFaceting: ["brand", "taxonomy_node_ids"],
  customRanking: ["desc(price_cents)"], // placeholder — replace with sales/popularity when available
}

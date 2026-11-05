// ---------------------------------------------------------------------------
// Shop shared types + constants (client-safe — no server-only imports).
// The server data layer (src/lib/shop/catalog.ts) re-exports these; client
// islands (sidebar, toolbar) import directly from here so `server-only`
// never leaks into a Client Component module.
// ---------------------------------------------------------------------------

export type Rating = { avg: number; count: number }

// ---------------------------------------------------------------------------
// Sold-by attribution — who the customer is buying from, on every product
// surface (PLP card, PDP buy box, PDP rails). Every marketplace item is
// sold by exactly one party: an attributable approved seller (their shop,
// linked to their storefront) or the house itself — the platform is the
// dropshipper for the whole CJ-sourced catalog, so platform stock reads
// "Sold by Portal Shop". Resolution lives server-side in
// src/lib/sellers/sold-by.ts; this type + the pure mapper are client-safe
// so card components can import them.
// ---------------------------------------------------------------------------

/** The house shop's customer-facing name. Every product in the database is
 *  currently sold by ALL About Portal (owner directive 2026-10-20); when
 *  sellers onboard, soldByAttribution resolves each item to the seller's
 *  own designation — this default is not a hardcode of the seller line. */
export const HOUSE_SHOP_NAME = "ALL About Portal"

export type SoldByAttribution = {
  /** Shop name the customer sees after "Sold by". */
  name: string
  /** Storefront link for a seller's shop; null for the house shop. */
  href: string | null
}

/** Map the attributable sellers of one item (display-name order, the PDP
 *  door's order) to the single attribution a card/rail renders: the first
 *  seller's shop, or the house shop when no seller is attributable. */
export function soldByAttribution(
  sellers: { displayName: string; slug: string }[],
): SoldByAttribution {
  const first = sellers[0]
  return first
    ? { name: first.displayName, href: `/seller/${first.slug}` }
    : { name: HOUSE_SHOP_NAME, href: null }
}

export type ShopProduct = {
  id: string
  name: string
  slug: string
  /** Active display price formatted as a string ("$30.00"). Falls back to base
   *  price when not on sale; equals the sale price when on sale. Backward-compat
   *  alias for {@link displayPrice}. */
  price: string
  /** Active display price in cents. Backward-compat alias for
   *  {@link displayPriceCents}. */
  priceCents: number | null
  /** Original list price parsed from `base_price`, in cents. */
  basePriceCents: number | null
  /** Promotional price parsed from `sale_price`, in cents. Null when no
   *  sale price is set or it can't be parsed. */
  salePriceCents: number | null
  /** Compare-at reference price parsed from `compare_at_price`, in cents. */
  compareAtPriceCents: number | null
  /** The active storefront price in cents — `salePriceCents` when on sale,
   *  otherwise `basePriceCents`. Null when neither parses. */
  displayPriceCents: number | null
  /** Formatted active storefront price ("$30.00"). */
  displayPrice: string | null
  image: string | null
  alt: string | null
  badge: string | null
  category: string | null
  categoryId: number | null
  stock: number | null
  shortDescription: string | null
  description: string | null
  createdAt: string | null
  order: number | null
  featured: boolean
  rating: Rating
  isNew: boolean
  isBestseller: boolean
  /** True when `sale_price` < `base_price` OR `compare_at_price` > `base_price`. */
  isOnSale: boolean
  /** Who sells this item — resolved by the data layer (lib/sellers/sold-by);
   *  every card built from this type must carry it. */
  soldBy: SoldByAttribution
}

/** Customer-facing category node (flattened presentation of raw SQL nodes). */
export type NavCategory = {
  /** Customer-facing slug (unique per parent). */
  key: string
  displayName: string
  /** Canonical route, e.g. /shop/dog/grooming. */
  path: string
  /** 0 = virtual parent landing (Dog), 1 = primary category, 2 = leaf. */
  level: number
  /** Rolled-up count of visible products in this node's subtree. */
  count: number
  /** Raw SQL node ids merged into this presentation node (scope ids). */
  rawIds: number[]
  children: NavCategory[]
  parentKey: string | null
  /** Promo blurb aggregated from the raw SQL nodes folded into this node
   *  (migration 0013). Null when none is set. */
  promoBlurb?: string | null
  /** True when any raw SQL node folded into this node has
   *  `featured_in_mega_menu = true` (migration 0013). */
  featuredInMegaMenu?: boolean
  /** Hero image aggregated from the raw SQL nodes folded into this node. */
  heroImage?: string | null
}

export type FilterOption = { value: string; label: string; count: number }

export type FilterSection =
  | { kind: "price"; label: "Price Range"; buckets: FilterOption[] }
  | { kind: "rating"; label: "Rating"; rows: FilterOption[] }
  | {
      kind: "check"
      key: string
      label: string
      options: FilterOption[]
      /** Whether to render a search-within-this-facet input (e.g. Brand). */
      searchable?: boolean
      /** Whether to collapse options beyond defaultVisible behind a "Show more" toggle. */
      collapsible?: boolean
      /** Number of options shown before the "Show more" button. Default 6. */
      defaultVisible?: number
    }

export type AppliedFilters = {
  minPrice?: number
  maxPrice?: number
  priceBucket?: string
  rating?: number
  availability?: string[]
  /** Multi-select checkbox facets keyed by facet key (brand, flavor, size, ...). */
  facets?: Record<string, string[]>
  /** Free-text query (?q=) when the visitor uses the search bar. */
  q?: string
}

export type SortKey = "best-selling" | "newest" | "price-asc" | "price-desc" | "top-rated"

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "best-selling", label: "Best Selling" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "top-rated", label: "Top Rated" },
]

export type MerchCollection = { key: string; displayName: string; path: string; count: number }
export type MerchKey = "new-arrivals" | "sale"

export const MERCH_META: Record<MerchKey, { displayName: string; blurb: string }> = {
  "new-arrivals": { displayName: "New Arrivals", blurb: "The latest additions to the Portal collection." },
  sale: { displayName: "Sale", blurb: "Marked-down favorites while they last." },
}

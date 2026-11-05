import "server-only"
import { cache } from "react"
import { repo, type Row } from "@/lib/repo"
import {
  listCatalogProducts,
  type CatalogProduct,
} from "@/lib/enterprise/catalog"
import {
  type Rating,
  type ShopProduct,
  type NavCategory,
  type FilterOption,
  type FilterSection,
  type AppliedFilters,
  type SortKey,
  type MerchCollection,
  type MerchKey,
  SORT_OPTIONS,
  MERCH_META,
  soldByAttribution,
} from "./types"
import { getFacetsForPath } from "./facets"
import { loadSoldByForItems } from "@/lib/sellers/sold-by"

export * from "./types"

// ---------------------------------------------------------------------------
// Price helpers (server-side twins of the cart-store utils)
// ---------------------------------------------------------------------------

export function parsePriceToCents(price: unknown): number | null {
  if (price == null) return null
  if (typeof price === "number") return Math.round(price * 100)
  const m = String(price).replace(/[$,\s]/g, "")
  const n = Number.parseFloat(m)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Raw catalog (React-cache'd per request — parallel sections share one fetch)
//
// Products now flow from the NORMALIZED enterprise schema
// (erp_products + erp_product_skus + commerce_catalog_items + commerce_prices
// + commerce_product_media + erp_inventory_movements) via
// listCatalogProducts(). The flat commerce_products table is no longer the
// source of truth — the owner's directive: "Do not invent flat or simplified
// tables; wire the application directly into the existing commerce_* and
// erp_* tables."
// ---------------------------------------------------------------------------

const getRaw = cache(async () => {
  // Category data does NOT come through here anymore: taxonomy_nodes is
  // the one category system and the shop reads it via
  // src/lib/shop/taxonomy-db.ts. The legacy pet_product_categories /
  // pet_product_filters / pet_category_filters reads that used to ride
  // this fetch were removed 2026-10-23 (FRONT 1) — the tables remain in
  // the database for the admin filters editor, but no storefront loader
  // reads them.
  const [enterpriseProducts, reviewRows] = await Promise.all([
    listCatalogProducts(),
    repo.list("product_reviews"),
  ])
  return {
    products: enterpriseProducts as unknown as Row[],
    reviews: reviewRows,
  }
})

/** Visible products enriched with rating rollups + derived merch flags. */
export const getProducts = cache(async (): Promise<ShopProduct[]> => {
  const { products, reviews } = await getRaw()

  const rollup = new Map<string, Rating>()
  for (const r of reviews) {
    if (!(r.visible === true || r.status === "approved")) continue
    const cur = rollup.get(r.productId) || { avg: 0, count: 0 }
    rollup.set(r.productId, {
      avg: (cur.avg * cur.count + (r.rating || 0)) / (cur.count + 1),
      count: cur.count + 1,
    })
  }

  const now = Date.now()
  const visible = (products as unknown as CatalogProduct[]).filter(
    (p) => p.visible && p.slug,
  )
  // Sold-by for the whole visible set in one bulk read (lib/sellers/sold-by);
  // items with no attributable seller are Portal Shop platform stock.
  const soldByMap = await loadSoldByForItems(visible.map((p) => p.id))
  return visible
    .map((p) => {
      const rating = rollup.get(p.id) || { avg: 0, count: 0 }
      const created = p.createdAt ? new Date(p.createdAt).getTime() : 0
      const badge = typeof p.badge === "string" ? p.badge.toLowerCase() : ""

      // ---- Pricing (from commerce_prices via the enterprise layer) ----
      // priceCents = the active storefront price (sale price when on sale,
      // otherwise the base price from commerce_prices.price).
      // compareAtPriceCents = commerce_prices.compare_at_price (shown
      // struck-through when strictly greater than the active price).
      const basePriceCents = p.priceCents
      const salePriceCents = p.isOnSale ? p.priceCents : null
      const compareAtPriceCents = p.compareAtPriceCents
      const isOnSale = p.isOnSale
      const displayPriceCents = p.priceCents
      const displayPrice = formatCents(p.priceCents)

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        // Backward-compat: existing consumers (cart-store, bag-client, PDP
        // buybox) read `price` / `priceCents`. The catalog now resolves these
        // to the active display price so a Sale flows end-to-end without
        // touching every call site.
        price: displayPrice,
        priceCents: displayPriceCents,
        basePriceCents,
        salePriceCents,
        compareAtPriceCents,
        displayPriceCents,
        displayPrice,
        image: p.image ?? null,
        alt: p.alt ?? p.name,
        badge: p.badge ?? null,
        category: p.category ?? null,
        categoryId: p.categoryId ?? null,
        stock: p.stock ?? null,
        shortDescription: p.shortDescription ?? null,
        description: p.description ?? null,
        createdAt: p.createdAt ?? null,
        order: p.sortOrder ?? 99,
        featured: p.featured === true,
        rating,
        isNew: badge.includes("new") || (created > 0 && now - created < 60 * 24 * 3600 * 1000),
        isBestseller:
          badge.includes("bestseller") || badge.includes("best seller") || p.featured === true,
        isOnSale,
        soldBy: soldByMap.get(p.id) ?? soldByAttribution([]),
      }
    })
})

// ---------------------------------------------------------------------------
// Category navigation REMOVED 2026-10-23 (FRONT 1): the presentation
// tree that resolved /shop paths from pet_product_categories (OVERRIDES,
// getNavTree, resolveCategory, resolveLegacyCategorySlug, resolveFlatAlias,
// findByRawIdNav) is gone. taxonomy_nodes is the one category system;
// category resolution lives in src/lib/shop/taxonomy-db.ts
// (resolveTaxPath / getTaxonomyTree), and /api/shop/categories serves it.
// The legacy tables remain in the database; nothing in the shop reads
// them.
// ---------------------------------------------------------------------------
// Merch collections (New Arrivals / Sale) — live product data
// ---------------------------------------------------------------------------

export async function getMerchCollections(): Promise<MerchCollection[]> {
  const products = await getProducts()
  const newArrivals = products.filter((p) => p.isNew)
  const sale = products.filter((p) => p.isOnSale)
  const out: MerchCollection[] = [
    {
      key: "new-arrivals",
      displayName: MERCH_META["new-arrivals"].displayName,
      path: "/shop/new-arrivals",
      count: newArrivals.length,
    },
    {
      key: "sale",
      displayName: MERCH_META["sale"].displayName,
      path: "/shop/sale",
      count: sale.length,
    },
  ]
  // Sale is hidden until it has products; New Arrivals always shows (the
  // route renders a healthy empty state while the catalog grows).
  return out.filter((m) => (m.key === "sale" ? m.count > 0 : true))
}

// ---------------------------------------------------------------------------
// Filter sections (the FILTERS rail — checkbox-driven, data-resolved)
// ---------------------------------------------------------------------------

const PRICE_BUCKETS: { value: string; label: string; min?: number; max?: number }[] = [
  { value: "under-10", label: "Under $10", max: 999 },
  { value: "10-25", label: "$10 to $25", min: 1000, max: 2499 },
  { value: "25-50", label: "$25 to $50", min: 2500, max: 5000 },
  { value: "50-100", label: "$50 to $100", min: 5001, max: 10000 },
  { value: "over-100", label: "Over $100", min: 10001 },
]

/**
 * Build the filter sections for a product scope. Sections are pruned by the
 * visibility rule: a group renders only when in-scope products produce
 * usable values for it. The canonical facets from src/lib/shop/facets.ts
 * are always appended (with 0 counts when product data is absent) so the
 * sidebar scaffolding is visible per the owner's filter spec.
 *
 * @param scopeIds  Raw SQL category ids in scope (null = shop-all).
 * @param path      The shop route path (e.g. "/shop/cat/food"), used to
 *                  resolve the page-specific facet set from
 *                  getFacetsForPath() in facets.ts.
 */
export async function getFilterSections(
  scopeIds: number[] | null,
  path: string = "/shop",
): Promise<FilterSection[]> {
  const products = await getProducts()
  const inScope = scopeIds
    ? products.filter((p) => p.categoryId != null && scopeIds.includes(p.categoryId))
    : products

  const sections: FilterSection[] = []

  // ---- Price Range ----
  const buckets = PRICE_BUCKETS.map((b) => ({
    value: b.value,
    label: b.label,
    count: inScope.filter((p) => {
      if (p.priceCents == null) return false
      if (b.min != null && p.priceCents < b.min) return false
      if (b.max != null && p.priceCents > b.max) return false
      return true
    }).length,
  })).filter((b) => b.count > 0)
  if (buckets.length > 0) sections.push({ kind: "price", label: "Price Range", buckets })

  // ---- Rating (star floors) ----
  const rated = inScope.filter((p) => p.rating.count > 0)
  if (rated.length > 0) {
    const rows = [4, 3, 2, 1]
      .map((floor) => ({
        value: String(floor),
        label: `${floor}★ & up`,
        count: rated.filter((p) => p.rating.avg >= floor).length,
      }))
      .filter((r) => r.count > 0)
    if (rows.length > 0) sections.push({ kind: "rating", label: "Rating", rows })
  }

  // ---- Availability ----
  const inStock = inScope.filter((p) => p.stock == null || p.stock > 0).length
  const outStock = inScope.filter((p) => p.stock != null && p.stock <= 0).length
  if (inStock + outStock > 0) {
    const options: FilterOption[] = []
    if (inStock > 0) options.push({ value: "in-stock", label: "In Stock", count: inStock })
    if (outStock > 0) options.push({ value: "out-of-stock", label: "Out of Stock", count: outStock })
    sections.push({
      kind: "check",
      key: "availability",
      label: "Availability",
      options,
      defaultVisible: 99,
    })
  }

  // ---- Canonical facets from facets.ts (Brand, Food Form, Life Stage,
  //      Flavor, Health Feature, Color, Material, Breed Size, Product
  //      Weight, Frame Material, Apparel Type, Size). These render with
  //      0 counts until product data populates them — the scaffolding the
  //      owner wants visible on every shop page.
  // ----
  const canonicalFacets = getFacetsForPath(path)
  for (const facet of canonicalFacets) {
    // Skip if SQL already produced a section with the same key.
    if (sections.some((s) => s.kind === "check" && s.key === facet.key)) continue
    const options: FilterOption[] = facet.options.map((o) => ({
      value: o.value,
      label: o.label,
      count: 0,
    }))
    if (options.length === 0) continue
    sections.push({
      kind: "check",
      key: facet.key,
      label: facet.label,
      options,
      searchable: facet.searchable,
      collapsible: facet.collapsible,
      defaultVisible: facet.defaultVisible ?? 6,
    })
  }

  // NOTE: the legacy SQL-mapped filter block that read
  // pet_category_filters / pet_product_filters was removed 2026-10-23
  // (FRONT 1). It could never render: it keyed sections to the old
  // numeric category ids while products carry no such fields. The live
  // facet assignments live in node_filters over taxonomy_nodes and are
  // served by the taxonomy PLP path (getNodeFacetSections in
  // taxonomy-db.ts); this legacy section builder keeps price / rating /
  // availability / canonical facets for the merch and shop-all scopes.

  return sections
}

// ---------------------------------------------------------------------------
// Product query (URL-driven, executed per request)
// ---------------------------------------------------------------------------

export type ProductQuery = {
  scopeIds?: number[] | null
  merch?: MerchKey | null
  filters?: AppliedFilters
  sort?: SortKey
  page?: number
  perPage?: number
  /** Category names to filter by (matches against product.category field).
   *  When provided, only products whose category is in this array appear. */
  categoryFilter?: string[]
}

export type ProductQueryResult = {
  items: ShopProduct[]
  total: number
  page: number
  pages: number
}

export async function queryProducts(q: ProductQuery): Promise<ProductQueryResult> {
  const products = await getProducts()
  let items = products

  // Category filter — when provided, only show products matching these categories.
  // This is what makes the bedding page show ONLY bedding products.
  if (q.categoryFilter && q.categoryFilter.length > 0) {
    const filterSet = new Set(q.categoryFilter.map(c => c.toLowerCase()))
    items = items.filter((p) => p.category != null && filterSet.has(p.category.toLowerCase()))
  }

  if (q.scopeIds) {
    const scope = new Set(q.scopeIds)
    items = items.filter((p) => p.categoryId != null && scope.has(p.categoryId))
  }
  if (q.merch === "new-arrivals") items = items.filter((p) => p.isNew)
  if (q.merch === "sale") items = items.filter((p) => p.isOnSale)

  const f = q.filters || {}
  if (f.minPrice != null) items = items.filter((p) => p.priceCents != null && p.priceCents >= f.minPrice!)
  if (f.maxPrice != null) items = items.filter((p) => p.priceCents != null && p.priceCents <= f.maxPrice!)
  if (f.rating != null) items = items.filter((p) => p.rating.count > 0 && p.rating.avg >= f.rating!)
  if (f.availability && f.availability.length > 0) {
    const wantsIn = f.availability.includes("in-stock")
    const wantsOut = f.availability.includes("out-of-stock")
    items = items.filter((p) => {
      const inStock = p.stock == null || p.stock > 0
      return (wantsIn && inStock) || (wantsOut && !inStock)
    })
  }

  // ---- Multi-select facet filters (brand, flavor, size, ...) ----
  // Each facet key in f.facets maps to an array of selected option values;
  // a product passes when ANY of its values for that facet matches (OR
  // within a facet, AND across facets). Until product data carries these
  // attributes (they're a placeholder), the filter is permissive — every
  // in-scope product passes — so the rail still shows results.
  if (f.facets) {
    for (const [facetKey, selectedValues] of Object.entries(f.facets)) {
      if (!Array.isArray(selectedValues) || selectedValues.length === 0) continue
      // Permissive: when products don't carry structured attribute data for
      // this facet, the filter does not exclude anything. (When SQL product
      // attribute columns land, replace this with the actual match logic.)
      const productKey = facetKey // future: snake_case mapping
      items = items.filter((p) => {
        const v = (p as unknown as Record<string, unknown>)[productKey]
        if (typeof v !== "string" || v.trim().length === 0) return true // permissive
        const values = v.split(",").map((s) => s.trim().toLowerCase())
        return selectedValues.some((sel) => values.includes(sel.toLowerCase()))
      })
    }
  }

  // ---- Free-text query (the header search bar's ?q=) ----
  if (f.q && f.q.trim().length >= 2) {
    const needle = f.q.trim().toLowerCase()
    const tokens = needle.split(/\s+/).filter(Boolean)
    items = items.filter((p) => {
      const haystack = [p.name, p.shortDescription, p.description, p.category, p.badge]
        .filter((s): s is string => typeof s === "string" && s.length > 0)
        .join(" ")
        .toLowerCase()
      return tokens.every((tok) => haystack.includes(tok))
    })
  }

  const sort: SortKey = q.sort || "best-selling"
  const sorted = [...items].sort((a, b) => {
    switch (sort) {
      case "newest":
        return (
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime() ||
          (a.order ?? 99) - (b.order ?? 99)
        )
      case "price-asc":
        return (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity)
      case "price-desc":
        return (b.priceCents ?? -Infinity) - (a.priceCents ?? -Infinity)
      case "top-rated":
        return (
          b.rating.count - a.rating.count ||
          b.rating.avg - a.rating.avg ||
          (a.order ?? 99) - (b.order ?? 99)
        )
      default: {
        const rank = (p: ShopProduct) => (p.isBestseller ? 0 : 1)
        return rank(a) - rank(b) || (a.order ?? 99) - (b.order ?? 99)
      }
    }
  })

  const perPage = q.perPage ?? 12
  const total = sorted.length
  const pages = Math.max(1, Math.ceil(total / perPage))
  const page = Math.min(Math.max(1, q.page ?? 1), pages)
  return { items: sorted.slice((page - 1) * perPage, page * perPage), total, page, pages }
}

// ---------------------------------------------------------------------------
// searchParams → query state (the URL is the single source of truth)
// ---------------------------------------------------------------------------

export function parseSearchParams(sp: Record<string, string | string[] | undefined>): {
  filters: AppliedFilters
  sort: SortKey
  page: number
  priceBucket: string | null
  facets: Record<string, string[]>
  q: string | null
} {
  const one = (k: string): string | null => {
    const v = sp[k]
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null
  }
  const num = (k: string): number | undefined => {
    const v = one(k)
    if (v == null) return undefined
    const n = Number.parseFloat(v.replace(/[$,\s]/g, ""))
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined
  }
  const sortRaw = one("sort")
  const sort: SortKey =
    sortRaw && SORT_OPTIONS.some((o) => o.value === sortRaw) ? (sortRaw as SortKey) : "best-selling"
  const availabilityRaw = one("availability")

  // Price bucket → canonical min/max bounds (the URL keeps the bucket for the
  // rail's checked state; the query reads the bounds).
  let bucketMin = num("minPrice")
  let bucketMax = num("maxPrice")
  const priceBucket = one("priceBucket")
  if (priceBucket) {
    if (priceBucket === "under-10") {
      bucketMin = undefined
      bucketMax = 999
    } else if (priceBucket === "10-25") {
      bucketMin = 1000
      bucketMax = 2499
    } else if (priceBucket === "25-50") {
      bucketMin = 2500
      bucketMax = 5000
    } else if (priceBucket === "50-100") {
      bucketMin = 5001
      bucketMax = 10000
    } else if (priceBucket === "over-100") {
      bucketMin = 10001
      bucketMax = undefined
    } else if (priceBucket === "under-25") {
      // legacy bucket — keep working (older URLs)
      bucketMin = undefined
      bucketMax = 2499
    } else if (priceBucket === "over-50") {
      bucketMin = 5001
      bucketMax = undefined
    }
  }

  // ---- Multi-select facet values from URL (?brand=a,b&food-form=c) ----
  // Keys are NOT hardcoded: any reserved-word-free query param is a facet
  // key. The attribute slugs come from the owner's node_filters /
  // v_node_filter_spec view in Supabase, and new facets must start working
  // the moment they're added there — a static key list is how facets ended
  // up silently dead. Values are comma-separated; caps keep URLs sane.
  const RESERVED = new Set([
    "sort", "page", "minPrice", "maxPrice", "priceBucket", "rating",
    "availability", "q", "XTransformPort",
  ])
  const facets: Record<string, string[]> = {}
  for (const [rawKey, rawVal] of Object.entries(sp)) {
    if (rawKey.startsWith("_") || RESERVED.has(rawKey)) continue
    if (typeof rawVal !== "string" || rawVal.trim() === "") continue
    const key = rawKey.toLowerCase()
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(key)) continue
    const values = rawVal.split(",").map((s) => s.trim().slice(0, 80)).filter(Boolean).slice(0, 20)
    if (values.length > 0) facets[key] = values
  }

  // ---- Free-text query (?q=) from the header search bar ----
  const q = one("q")

  return {
    filters: {
      minPrice: bucketMin,
      maxPrice: bucketMax,
      rating: (() => {
        const r = one("rating")
        const n = r ? Number.parseInt(r, 10) : NaN
        return Number.isFinite(n) && n >= 1 && n <= 5 ? n : undefined
      })(),
      availability: availabilityRaw ? availabilityRaw.split(",").filter(Boolean) : undefined,
      facets,
      q: q || undefined,
    },
    sort,
    page: (() => {
      const p = one("page")
      const n = p ? Number.parseInt(p, 10) : 1
      return Number.isFinite(n) && n > 0 ? n : 1
    })(),
    priceBucket,
    facets,
    q,
  }
}

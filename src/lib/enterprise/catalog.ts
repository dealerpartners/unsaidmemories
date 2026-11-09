import "server-only"
import pg from "pg"
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"
import { cached } from "@/lib/cache"
import { TENANT_ID, withPg, withPgStrict } from "@/lib/crm/enterprise"
import { enqueueCatalogItemSync } from "@/lib/sync/handlers"
import { parseVariantAttributes } from "@/lib/shop/catalog-text"

// ============================================================================
// enterprise/catalog.ts — the read/write layer for the NORMALIZED catalog.
//
// GROUND RULE (owner's directive): the schema is ground truth. Products are
// NOT flat. This module wires directly into:
//   erp_products              — base product info (name, description, brand)
//   erp_product_skus          — the sellable unit (sku, unit_price, weight)
//   erp_product_variants      — variant attributes (size, color, …)
//   commerce_catalog_items    — the ecommerce bridge (ecommerce_enabled)
//   commerce_prices           — pricing (price, compare_at_price) per price list
//   commerce_product_media    — multi-image media (url, alt, is_primary)
//   erp_inventory_movements   — stock movements (opening, sale, adjustment, …)
//   commerce_brands           — brand CRUD
//
// Every read is a single SQL query with LEFT JOINs + aggregation. Every write
// is a transaction that touches the right subset of tables. No flat tables,
// no simplified shapes — the normalized schema is the only source of truth.
// ============================================================================

export const DEFAULT_TENANT = TENANT_ID

// ---- the unified catalog product shape (what the storefront + admin see) ----
export type CatalogProductMedia = {
  id: string
  url: string
  altText: string | null
  sortOrder: number
  isPrimary: boolean
  /** commerce_product_media.media_type ('image' on every row today;
   *  'video' / 'customer_photo' rows light up the PDP media slots). */
  mediaType: string | null
}

export type CatalogProduct = {
  // identities
  id: string                 // commerce_catalog_items.id (the storefront's PK)
  productId: string          // erp_products.id
  skuId: string              // erp_product_skus.id
  sku: string                // erp_product_skus.sku (human-readable)
  slug: string               // stored in commerce_catalog_items.metadata.slug
  // display
  name: string
  description: string | null
  shortDescription: string | null
  brand: string | null
  brandId: string | null
  // pricing (cents — from commerce_prices on the RETAIL price list)
  priceCents: number
  compareAtPriceCents: number | null
  salePriceCents: number | null   // derived: priceCents when compareAtPriceCents > priceCents
  isOnSale: boolean
  // media (from commerce_product_media, sorted by sort_order, primary first)
  media: CatalogProductMedia[]
  image: string | null            // the primary image URL (for backward compat)
  alt: string | null
  // inventory (sum of erp_inventory_movements.quantity for this sku)
  stock: number
  // supplier-reported quantity for dropship variants (CJ stock sync);
  // null = supplier availability unknown — NOT the same as zero.
  supplierStock: number | null
  // flags
  ecommerceEnabled: boolean
  active: boolean
  featured: boolean
  badge: string | null
  visible: boolean               // active && ecommerce_enabled && !is_hidden(metadata)
  // categoryId: the LEGACY pet_product_categories pointer
  // (erp_products.metadata.category_id) — kept only for the legacy nav
  // layer's scope filters; it is set on ~0 live products and is NOT the
  // product's category. category: the item's ASSIGNED taxonomy category
  // (deepest commerce_catalog_item_taxonomy → taxonomy_nodes link, by
  // name); null when the item has no assignment (unclassified) — never
  // a brand name or a catch-all.
  categoryId: number | null
  category: string | null
  // detail fields (from erp_products.metadata)
  specs: string | null
  materials: string | null
  ingredients: string | null
  directions: string | null
  warranty: string | null
  // stripe
  stripeProductId: string | null
  stripePriceId: string | null
  // sort
  sortOrder: number
  // live-taxonomy link (metadata.taxonomy_node_ids — node uuids the item is
  // merchandised under) + merch flags carried from the feed sync
  taxonomyNodeIds: string[]
  isNew: boolean
  isBestseller: boolean
  isSalonFavorite: boolean
  // timestamps
  createdAt: string
  updatedAt: string
  // CJ Dropshipping product ID (for variant grouping)
  cjPid: string | null
}

// ============================================================================
// READ — list all ecommerce-enabled catalog products in one query
// ============================================================================

const LIST_SQL = `
  SELECT
    ci.id AS id,
    ci.name AS name,
    ci.description AS description,
    ci.short_description AS "shortDescription",
    ci.brand AS brand,
    ci.ecommerce_enabled AS "ecommerceEnabled",
    ci.active AS active,
    ci.metadata AS ci_metadata,
    ci.created_at AS "createdAt",
    ci.updated_at AS "updatedAt",
    ep.id AS "productId",
    ep.metadata AS ep_metadata,
    sku.id AS "skuId",
    sku.sku AS sku,
    sku.unit_price AS sku_unit_price,
    cp.price AS price,
    cp.compare_at_price AS compare_at_price,
    COALESCE(stock.qty, 0) AS stock,
    (ev.attributes->>'stock_quantity')::int AS supplier_stock,
    COALESCE(media.aggregated, '[]'::json) AS media,
    taxcat.assigned_category AS assigned_category
  FROM public.commerce_catalog_items ci
  JOIN public.erp_product_skus sku ON sku.id = ci.sku_id
  JOIN public.erp_products ep ON ep.id = sku.product_id
  LEFT JOIN public.erp_product_variants ev ON ev.id = sku.variant_id
  LEFT JOIN public.commerce_prices cp
    ON cp.catalog_item_id = ci.id
    AND cp.price_list_id = (SELECT id FROM public.commerce_price_lists WHERE tenant_id = ci.tenant_id AND code = 'RETAIL' AND active = true LIMIT 1)
    AND (cp.valid_to IS NULL OR cp.valid_to >= now())
  -- Stock totals computed ONCE per query as a grouped aggregate over
  -- the movements table (1.5k rows) instead of a lateral SUM re-run
  -- for every catalog row. Measured 2026-10-24 against the live
  -- catalog: the lateral form cost ~1.4s of the list query's 4.6s;
  -- semantics are identical (no movements row -> qty NULL -> the
  -- SELECT's COALESCE still yields 0).
  LEFT JOIN (
    SELECT sku_id, SUM(quantity) AS qty
    FROM public.erp_inventory_movements
    GROUP BY sku_id
  ) stock ON stock.sku_id = sku.id
  LEFT JOIN LATERAL (
    SELECT COALESCE(json_agg(json_build_object(
      'id', m.id, 'url', m.url, 'altText', m.alt_text,
      'sortOrder', m.sort_order, 'isPrimary', m.is_primary,
      'mediaType', m.media_type
    ) ORDER BY m.sort_order, m.is_primary DESC) FILTER (WHERE m.id IS NOT NULL), '[]'::json) AS aggregated
    FROM public.commerce_product_media m
    WHERE m.catalog_item_id = ci.id
  ) media ON true
  -- The ASSIGNED taxonomy category, aggregated ONCE per query over
  -- the link table instead of a lateral probe + sort per catalog row
  -- (the lateral form cost ~2.4s of the list query's 4.6s, measured
  -- 2026-10-24: the n.id::text cast join + per-row ORDER BY/LIMIT).
  -- The pick is unchanged: deepest node, name order breaks ties.
  LEFT JOIN (
    -- The item's ASSIGNED taxonomy category: the deepest node linked in
    -- commerce_catalog_item_taxonomy (name order breaks depth ties, so the
    -- pick is deterministic). This is the ONLY source of a product's
    -- category — erp_products.metadata.category_id (the legacy
    -- pet_product_categories pointer) is set on ~0 live products and must
    -- never present as a category again.
    SELECT t.item_id,
           (ARRAY_AGG(n.name ORDER BY n.depth DESC, n.name ASC))[1] AS assigned_category
    FROM public.commerce_catalog_item_taxonomy t
    JOIN public.taxonomy_nodes n ON n.id::text = t.node_id
    GROUP BY t.item_id
  ) taxcat ON taxcat.item_id = ci.id
  WHERE ci.tenant_id = $1
    AND ci.ecommerce_enabled = true
    AND ci.active = true
`

const LIST_ORDER = `ORDER BY (ci.metadata->>'sort_order')::int ASC NULLS LAST, ci.name ASC`

export async function listCatalogProducts(): Promise<CatalogProduct[]> {
  return (await withPg(async (client) => {
    const { rows } = await client.query(`${LIST_SQL} ${LIST_ORDER}`, [DEFAULT_TENANT()])
    return rows.map(rowToCatalogProduct)
  })) ?? []
}

export type CatalogSource = "all" | "dropship" | "instore"

function sourceClause(source: CatalogSource): string {
  if (source === "dropship") return `AND ci.metadata->>'cj_pid' IS NOT NULL`
  if (source === "instore") return `AND ci.metadata->>'cj_pid' IS NULL`
  return ""
}

/** One page of the catalog + the total for that source filter. The admin
 *  products screen uses this so it never has to ship all ~11.5k joined
 *  rows in a single response. */
export async function listCatalogProductsPage(opts: {
  limit: number
  offset: number
  source: CatalogSource
  q?: string
}): Promise<{ products: CatalogProduct[]; total: number }> {
  const limit = Math.max(1, Math.min(200, Math.floor(opts.limit) || 50))
  const offset = Math.max(0, Math.floor(opts.offset) || 0)
  const q = (opts.q || "").trim().replace(/[%_]/g, "")
  const like = `%${q}%`
  return (await withPg(async (client) => {
    const countRes = await client.query(
      `SELECT count(*)::int AS n FROM public.commerce_catalog_items ci
         JOIN public.erp_product_skus sku ON sku.id = ci.sku_id
        WHERE ci.tenant_id = $1 AND ci.ecommerce_enabled = true AND ci.active = true ${sourceClause(opts.source)}${q ? ` AND (ci.name ILIKE $2 OR sku.sku ILIKE $2)` : ``}`,
      q ? [DEFAULT_TENANT(), like] : [DEFAULT_TENANT()],
    )
    const { rows } = await client.query(
      `${LIST_SQL} ${sourceClause(opts.source)}${q ? ` AND (ci.name ILIKE $4 OR sku.sku ILIKE $4)` : ``} ${LIST_ORDER} LIMIT $2 OFFSET $3`,
      q ? [DEFAULT_TENANT(), limit, offset, like] : [DEFAULT_TENANT(), limit, offset],
    )
    return { products: rows.map(rowToCatalogProduct), total: countRes.rows[0]?.n ?? 0 }
  })) ?? { products: [], total: 0 }
}

/** Batch by-id variant of listCatalogProducts — identical row shape and
 *  visibility rules (LIST_SQL already enforces tenant + ecommerce + active),
 *  restricted to the requested ids. Callers resolving a handful of items
 *  (cart verification) must not pay the full-catalog media-joined pull:
 *  measured 2026-10-16, EXPLAIN ANALYZE — full pull 1,077 ms / 11,477 rows
 *  vs 17 ms for a 3-id batch. Non-uuid ids are dropped up front (the cart
 *  body is user input; a bad cast would poison the whole ANY array, and a
 *  non-uuid id can never match a row anyway). */
export async function listCatalogProductsByIds(ids: string[]): Promise<CatalogProduct[]> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const clean = [...new Set(ids.filter((id) => uuid.test(id)))]
  if (clean.length === 0) return []
  return (await withPg(async (client) => {
    const { rows } = await client.query(
      `${LIST_SQL} AND ci.id = ANY($2::uuid[]) ${LIST_ORDER}`,
      [DEFAULT_TENANT(), clean],
    )
    return rows.map(rowToCatalogProduct)
  })) ?? []
}

/** Header counts for the admin products tabs. */
export async function countCatalogProductsBySource(): Promise<{ all: number; dropship: number; instore: number }> {
  return (await withPg(async (client) => {
    const { rows } = await client.query(
      `SELECT count(*)::int AS all_n,
              count(*) FILTER (WHERE ci.metadata->>'cj_pid' IS NOT NULL)::int AS dropship_n
         FROM public.commerce_catalog_items ci
        WHERE ci.tenant_id = $1 AND ci.ecommerce_enabled = true AND ci.active = true`,
      [DEFAULT_TENANT()],
    )
    const all = rows[0]?.all_n ?? 0
    const dropship = rows[0]?.dropship_n ?? 0
    return { all, dropship, instore: all - dropship }
  })) ?? { all: 0, dropship: 0, instore: 0 }
}

// PUBLIC SELLER GATE — an item stamped with a marketplace seller
// (metadata.seller_id) is publicly visible only while that seller's
// store is approved. Without it, an admin suspension flipped the
// seller's status and 404'd their shop page, but their products kept
// rendering AND selling in the shop grids and on the PDP: the
// storefront reader checked the seller, the catalog readers did not.
// Items with no seller stamp (house catalog) pass untouched. The
// id::text comparison avoids a cast failure on any non-uuid stamp.
//
// LEASHED TENANT LEG (same gate, extended — never a second gate): the
// seller's tenant is joined in, and a tenant whose Leashed subscription
// is on record but not active/trialing hides its listings — the public
// half of the subscription lockout (design step 6). Sellers on the
// master tenant (no subscription attached) and tenants with no
// subscription row yet pass exactly as before: the predicate only bites
// when a subscription EXISTS and is not active/trialing.
const PUBLIC_SELLER_GATE = `AND (ci.metadata->>'seller_id' IS NULL OR EXISTS (
  SELECT 1 FROM public.sellers ps
   WHERE ps.id::text = ci.metadata->>'seller_id' AND ps.status = 'approved'
     AND (ps.tenant_id IS NULL OR EXISTS (
       SELECT 1 FROM public.tenants pt
        WHERE pt.id = ps.tenant_id
          AND (pt.stripe_subscription_id IS NULL
               OR pt.subscription_status IN ('active', 'trialing'))))))`

export async function getCatalogProductBySlug(slug: string): Promise<CatalogProduct | null> {
  const clean = slug.trim().toLowerCase()
  if (!clean) return null
  return (await withPg(async (client) => {
    const { rows } = await client.query(
      `${LIST_SQL} ${PUBLIC_SELLER_GATE} AND (LOWER(TRIM(ci.metadata->>'slug')) = $2 OR ci.id::text = $2 OR LOWER(TRIM(ci.name)) = $2) ${LIST_ORDER} LIMIT 1`,
      [DEFAULT_TENANT(), clean],
    )
    return rows[0] ? rowToCatalogProduct(rows[0]) : null
  })) ?? null
}

/**
 * getCatalogProductBySlug with failure visibility: a database failure
 * THROWS instead of reading as "no such product". The PDP route's
 * tracked loader uses this so a transient failure becomes an "error"
 * verdict (retry, never cached) rather than a "missing" verdict (a
 * 404 cached by ISR for a real product).
 */
export async function getCatalogProductBySlugStrict(slug: string): Promise<CatalogProduct | null> {
  const clean = slug.trim().toLowerCase()
  if (!clean) return null
  return withPgStrict(async (client) => {
    const { rows } = await client.query(
      `${LIST_SQL} ${PUBLIC_SELLER_GATE} AND (LOWER(TRIM(ci.metadata->>'slug')) = $2 OR ci.id::text = $2 OR LOWER(TRIM(ci.name)) = $2) ${LIST_ORDER} LIMIT 1`,
      [DEFAULT_TENANT(), clean],
    )
    return rows[0] ? rowToCatalogProduct(rows[0]) : null
  })
}

export async function getCatalogProductById(id: string): Promise<CatalogProduct | null> {
  return (await withPg(async (client) => {
    const { rows } = await client.query(`${LIST_SQL} AND ci.id = $2 ${LIST_ORDER} LIMIT 1`, [DEFAULT_TENANT(), id])
    return rows[0] ? rowToCatalogProduct(rows[0]) : null
  })) ?? null
}

export type ProductVariantOption = {
  id: string
  slug: string | null
  label: string
  priceCents: number | null
  compareAtPriceCents: number | null
  image: string | null
  inStock: boolean
  isActive: boolean
  /** Supplier-reported units for THIS variant record (null = unknown —
   *  unknown availability is not zero stock and never gates buying). */
  stockQuantity: number | null
  cjVid: string | null
  /** Named attributes parsed from the flat variant label (Color / Size /
   *  Dimensions / Count / Style) by lib/shop/catalog-text; the label is
   *  composed from these in canonical order when any were found. */
  attributes: { name: string; value: string }[]
}

/**
 * Fetch all variants for a product by family key (including inactive ones).
 * Used by the PDP to populate the variant selector in the buy box.
 * One product = one family = multiple variant records. The family key is
 * the item's cj_pid for CJ families, or its family_key for seller-import
 * families (X7: seller imports no longer stamp cj_pid — the two stamps
 * are matched as ONE family definition here).
 */
export async function getProductVariantsByCjPid(cjPid: string): Promise<ProductVariantOption[]> {
  if (!cjPid) return []
  return (await withPg(async (client) => {
    const { rows } = await client.query(
      `SELECT ci.id,
              ci.name,
              ci.metadata->>'cj_vid' as cj_vid,
              ci.metadata->>'slug' as slug,
              ci.active,
              ev.attributes->'axes' as stored_axes,
              ev.attributes->'cj_axes' as stored_axis_order,
              -- Prices are stored in DOLLARS in both commerce_prices and
              -- erp_product_skus (verified identical where both exist);
              -- convert to cents here. The old ::int cast truncated
              -- dollars and mislabeled them as cents.
              ROUND(COALESCE(cp.price, es.unit_price, 0) * 100)::int as price_cents,
              ROUND(COALESCE(cp.compare_at_price, 0) * 100)::int as compare_at_cents,
              (SELECT url FROM commerce_product_media WHERE catalog_item_id = ci.id ORDER BY sort_order ASC LIMIT 1) as image,
              COALESCE((ev.attributes->>'in_stock')::bool, true) as in_stock,
              (ev.attributes->>'stock_quantity')::int as stock_quantity
         FROM commerce_catalog_items ci
         -- price_list_id is a UUID; the old literal 'retail' made this
         -- query throw 22P02 on every call, so the PDP variant selector
         -- silently rendered empty for every CJ product.
         LEFT JOIN commerce_prices cp ON cp.catalog_item_id = ci.id
           AND cp.price_list_id = (SELECT id FROM commerce_price_lists WHERE tenant_id = ci.tenant_id AND code = 'RETAIL' AND active LIMIT 1)
           AND (cp.valid_to IS NULL OR cp.valid_to >= now())
         LEFT JOIN erp_product_skus es ON es.id = ci.sku_id
         LEFT JOIN erp_product_variants ev ON ev.id = es.variant_id
        WHERE ci.tenant_id = $1
          AND (ci.metadata->>'cj_pid' = $2 OR ci.metadata->>'family_key' = $2)
        ORDER BY price_cents ASC`,
      [DEFAULT_TENANT(), cjPid]
    )
    // Labels: sibling names share the family base name; what differs
    // IS the option ("...Khaki 30x35x30cm" vs "...Dark Grey 30x35x30cm").
    // Strip the family's longest common prefix before falling back to
    // single-name parsing — the old fallback gave every sibling the
    // same first-40-chars label, making options indistinguishable.
    const names = rows.map((r: Record<string, unknown>) => String(r.name))
    let prefix = names.length > 1 ? names[0] : ""
    for (const n of names.slice(1)) {
      let i = 0
      while (i < prefix.length && i < n.length && prefix[i] === n[i]) i++
      prefix = prefix.slice(0, i)
    }
    const familyLabel = (name: string): string | null => {
      if (!prefix || !name.startsWith(prefix)) return null
      const rest = name.slice(prefix.length).replace(/^[\s\-–—:,]+/, "").trim()
      return rest.length >= 2 && rest.length <= 48 ? rest : null
    }
    return rows.map((r: Record<string, unknown>) => {
      // Stored axes (stage-2 CJ enrichment: erp_product_variants.attributes
      // .axes + .cj_axes) are the source of truth when present — the label
      // is the stored axis values joined in axis order, and the attribute
      // list is the stored map itself. Name parsing below remains the
      // fallback for un-enriched families only.
      const storedAxes = (r.stored_axes && typeof r.stored_axes === "object" && !Array.isArray(r.stored_axes))
        ? (r.stored_axes as Record<string, unknown>)
        : null
      const storedOrder = Array.isArray(r.stored_axis_order)
        ? (r.stored_axis_order as unknown[]).map(String)
        : []
      const storedAttrs: { name: string; value: string }[] = []
      if (storedAxes) {
        const keys = [
          ...storedOrder.filter((k) => k in storedAxes),
          ...Object.keys(storedAxes).filter((k) => !storedOrder.includes(k)),
        ]
        for (const k of keys) {
          const v = storedAxes[k]
          if (typeof v === "string" && v.trim()) storedAttrs.push({ name: k, value: v })
        }
      }
      if (storedAttrs.length > 0) {
        return {
          id: String(r.id),
          slug: r.slug ? String(r.slug) : null,
          label: storedAttrs.map((a) => a.value).join(" · "),
          priceCents: r.price_cents ? Number(r.price_cents) : null,
          compareAtPriceCents: r.compare_at_cents ? Number(r.compare_at_cents) : null,
          image: r.image ? String(r.image) : null,
          inStock: Boolean(r.in_stock),
          isActive: Boolean(r.active),
          stockQuantity: r.stock_quantity != null && Number.isFinite(Number(r.stock_quantity)) ? Number(r.stock_quantity) : null,
          cjVid: r.cj_vid ? String(r.cj_vid) : null,
          attributes: storedAttrs,
        }
      }
      const baseLabel = familyLabel(String(r.name)) ?? extractVariantLabel(String(r.name))
      const parsed = parseVariantAttributes(baseLabel)
      return {
        id: String(r.id),
        slug: r.slug ? String(r.slug) : null,
        label: parsed.attributes.length > 0 ? parsed.label : baseLabel,
        priceCents: r.price_cents ? Number(r.price_cents) : null,
        compareAtPriceCents: r.compare_at_cents ? Number(r.compare_at_cents) : null,
        image: r.image ? String(r.image) : null,
        inStock: Boolean(r.in_stock),
        isActive: Boolean(r.active),
        stockQuantity: r.stock_quantity != null && Number.isFinite(Number(r.stock_quantity)) ? Number(r.stock_quantity) : null,
        cjVid: r.cj_vid ? String(r.cj_vid) : null,
        attributes: parsed.attributes,
      }
    })
  })) ?? []
}

/**
 * Extract a clean variant label from the product name.
 * e.g. "Cross-Border Yegbong Dog Anti-Chewing Spray, Blue" -> "Blue"
 * Falls back to the full name if no variant pattern is found.
 */
function extractVariantLabel(name: string): string {
  // Try to find color/size at the end after comma or dash
  const patterns = [
    /,\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*$/,  // ", Blue" or ", Light Blue"
    /-\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*$/,   // "- Blue"
    /\b(XXS|XS|S|M|L|XL|XXL|XXXL|\d+\s*(?:oz|ml|g|kg|lb|in|cm))\b/i,  // sizes
  ]
  for (const p of patterns) {
    const m = name.match(p)
    if (m) return m[1].trim()
  }
  return name.slice(0, 40)
}

// ============================================================================
// READ — taxonomy-scoped grid query (PLP) — paged, no full-catalog loads.
//
// Replaces the flat products/product_nodes join: the live-taxonomy mapping
// lives on commerce_catalog_items.metadata.taxonomy_node_ids (uuid array),
// probed with the jsonb ?| operator (GIN-indexed). Scope = the passed node
// ids UNION all their descendants (expanded in-process from the cached
// tree map; recursive CTE kept as the cold path — see gridCoreSql). One card per slug
// (variant-group dedup — the canonical card is the cheapest active listing).
// ============================================================================

export type EntGridFilters = {
  minPrice?: number
  maxPrice?: number
  priceBucket?: string | null
  rating?: number | null
  availability?: string[]
  q?: string | null
  brands?: string[]
  /** Attribute facets (Size, Flavor, Material, …) — attribute_value slugs
   *  keyed by attribute slug, exactly as the URL-param filter system passes
   *  them (?size=large,medium&flavor=bacon). */
  facets?: Record<string, string[]>
}

export type EntGridItem = {
  id: string
  slug: string
  name: string
  brand: string | null
  image: string | null
  shortDescription: string | null
  priceCents: number
  compareAtPriceCents: number | null
  isOnSale: boolean
  isNew: boolean
  isBestseller: boolean
  isSalonFavorite: boolean
  inStock: boolean
  createdAt: string | null
  /** Real review aggregates (product_reviews, visible only). Null avg = no reviews. */
  ratingAvg: number | null
  ratingCount: number
}

export type EntGridResult = {
  items: EntGridItem[]
  total: number
  page: number
  pages: number
}

// ---------------------------------------------------------------------------
// Taxonomy scope expansion — IN-PROCESS (DB Reports fix, 2026-10-16).
//
// The grid used to re-walk the taxonomy tree with a WITH RECURSIVE CTE
// inside BOTH statements of every uncached render (rows + count). The tree
// is 436 nodes and changes rarely, so the parent→children map is loaded
// once per process (5-min TTL — the same idiom as taxonomy-db's node
// index) and subtrees expand by JS BFS; the hot statements then take the
// finished scope as a plain text[] parameter into the GIN && overlap filter. The
// map load mirrors the CTE exactly (no status filter — the recursion never
// had one). If the map cannot be loaded, expandScopeIds returns null and
// the statements keep the recursive CTE as the cold path.
// ---------------------------------------------------------------------------
const SCOPE_MAP_TTL_MS = 5 * 60 * 1000
let scopeChildrenCache: { children: Map<string, string[]>; at: number } | null = null
let scopeChildrenInflight: Promise<Map<string, string[]> | null> | null = null

type QueryClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

async function loadScopeChildren(client: QueryClient): Promise<Map<string, string[]> | null> {
  if (scopeChildrenCache && Date.now() - scopeChildrenCache.at < SCOPE_MAP_TTL_MS) {
    return scopeChildrenCache.children
  }
  if (!scopeChildrenInflight) {
    scopeChildrenInflight = (async () => {
      try {
        const { rows } = await client.query(
          `SELECT id::text AS id, parent_id::text AS parent_id FROM public.taxonomy_nodes`,
        )
        const children = new Map<string, string[]>()
        for (const r of rows) {
          if (!r.parent_id) continue
          const arr = children.get(r.parent_id)
          if (arr) arr.push(r.id)
          else children.set(r.parent_id, [r.id])
        }
        scopeChildrenCache = { children, at: Date.now() }
        return children
      } catch {
        return null
      } finally {
        scopeChildrenInflight = null
      }
    })()
  }
  return scopeChildrenInflight
}

/** Root ids + all descendants, expanded in-process. Null = cold path. */
async function expandScopeIds(client: QueryClient, rootIds: string[]): Promise<string[] | null> {
  const children = await loadScopeChildren(client)
  if (!children) return null
  const out = new Set<string>(rootIds)
  const stack = [...rootIds]
  while (stack.length) {
    const cur = stack.pop()!
    for (const c of children.get(cur) ?? []) {
      if (!out.has(c)) {
        out.add(c)
        stack.push(c)
      }
    }
  }
  return [...out]
}

// The grid CORE: scope filter + item scan + variant-group dedup, ending at
// the `ranked` CTE. It deliberately computes NEITHER the per-row media
// lookup NOR the review aggregates — those run only for the page actually
// served (rows tail) and never for the count or facet tails. (Measured
// 2026-10-16, dog scope, EXPLAIN ANALYZE: media subquery loops
// 8,014 -> 48; rows 357 -> 302 ms; count 230 -> 220 ms with its dedup
// sort narrowed from 13.3 MB to 0.9 MB.) $1 = scope ids (hot:
// pre-expanded subtree as text[]; cold: root uuid[] the recursive CTE
// expands), $2 = tenant.
function gridCoreSql(expandedScope: boolean): string {
  const itemsCte = (scopePredicate: string) => `
  items AS (
    SELECT
      ci.id,
      ci.metadata->>'slug' AS slug,
      ci.name,
      ci.brand,
      ci.short_description,
      ci.created_at,
      COALESCE(cp.price, es.unit_price) AS price,
      cp.compare_at_price AS compare_at,
      COALESCE((ev.attributes->>'in_stock')::bool, true) AS in_stock,
      ev.attributes->>'option_size' AS option_size,
      ev.attributes->>'option_color' AS option_color,
      ci.metadata->>'cj_pid' AS cj_pid,
      COALESCE((ep.metadata->>'is_new')::bool, (ci.metadata->>'is_new')::bool, false) AS is_new,
      COALESCE((ep.metadata->>'is_best_seller')::bool, (ci.metadata->>'is_best_seller')::bool, false) AS is_best_seller,
      COALESCE((ep.metadata->>'is_salon_favorite')::bool, (ci.metadata->>'is_salon_favorite')::bool, false) AS is_house_favorite,
      ROW_NUMBER() OVER (
        PARTITION BY ci.metadata->>'slug'
        ORDER BY COALESCE(cp.price, es.unit_price) ASC NULLS LAST, ci.created_at DESC
      ) AS slug_rn
    FROM commerce_catalog_items ci
    JOIN erp_product_skus es ON es.id = ci.sku_id
    JOIN erp_products ep ON ep.id = es.product_id
    LEFT JOIN erp_product_variants ev ON ev.id = es.variant_id
    LEFT JOIN commerce_prices cp ON cp.catalog_item_id = ci.id
      AND cp.price_list_id = (SELECT id FROM commerce_price_lists WHERE tenant_id = ci.tenant_id AND code = 'RETAIL' AND active LIMIT 1)
      AND (cp.valid_to IS NULL OR cp.valid_to >= now())
    WHERE ci.tenant_id = $2::uuid
      AND ci.active = true
      AND ci.sellable = true
      AND ci.ecommerce_enabled = true
      AND COALESCE(ci.metadata->>'slug', '') <> ''
      AND COALESCE(cp.price, es.unit_price) > 0
      AND (ci.metadata->>'seller_id' IS NULL OR EXISTS (
        SELECT 1 FROM public.sellers ps
         WHERE ps.id::text = ci.metadata->>'seller_id' AND ps.status = 'approved'))
      AND ${scopePredicate}
  ),
  ranked AS (
    SELECT * FROM items WHERE slug_rn = 1
  )`
  if (expandedScope) {
    return `WITH ${itemsCte(`ci.metadata->'taxonomy_node_ids' ?| $1::text[]`)}`
  }
  return `
  WITH RECURSIVE scope AS (
    SELECT id FROM taxonomy_nodes WHERE id = ANY($1::uuid[])
    UNION
    SELECT tn.id FROM taxonomy_nodes tn JOIN scope s ON tn.parent_id = s.id
  ),${itemsCte(`ci.metadata->'taxonomy_node_ids' ?| (SELECT ARRAY(SELECT id::text FROM scope))`)}`
}

// Rows tail: paginate the deduped set FIRST, then pay the media lookup and
// the review aggregates for the <=48 served rows only. The review aggregate
// is filtered to the page's own product ids BEFORE it groups (never a
// pre-group of the whole visible-review table) and joined after paging,
// so it feeds one page of rows, not the whole aisle.
function gridRowsTail(where: string, orderBy: string, perPage: number, offset: number): string {
  return `,
  page AS (
    SELECT * FROM ranked
     WHERE price IS NOT NULL${where}
     ORDER BY ${orderBy}
     LIMIT ${perPage} OFFSET ${offset}
  )
  SELECT page.id, page.slug, page.name, page.brand, page.short_description, page.created_at,
         page.price, page.compare_at,
         (SELECT m.url FROM commerce_product_media m
           WHERE m.catalog_item_id = page.id
           ORDER BY m.is_primary DESC, m.sort_order ASC NULLS LAST
           LIMIT 1) AS image,
         page.in_stock, page.is_new, page.is_best_seller, page.is_house_favorite,
         review.n AS review_n, review.avg AS review_avg
    FROM page
    LEFT JOIN (
      SELECT rr."productId" AS pid, count(*)::int AS n, avg(rr.rating) AS avg
        FROM product_reviews rr
       WHERE rr.visible = true
         AND rr."productId" = ANY(SELECT id::text FROM page)
       GROUP BY rr."productId"
    ) review ON review.pid = page.id::text
   ORDER BY ${orderBy}`
}

const GRID_SORT: Record<string, string> = {
  "best-selling": `is_best_seller DESC, created_at DESC NULLS LAST, price ASC`,
  newest: `created_at DESC NULLS LAST`,
  "price-asc": `price ASC`,
  "price-desc": `price DESC`,
  "top-rated": `is_best_seller DESC, created_at DESC NULLS LAST`,
}

function gridFilterWhere(filters: EntGridFilters, params: unknown[], startIdx: number, ctx: "live" | "table" = "live"): string {
  const clauses: string[] = []
  // PRICE UNITS: the grid's `price` column is DOLLARS (COALESCE(cp.price,
  // es.unit_price) — e.g. 17.49). Callers hand minPrice/maxPrice/priceBucket
  // bounds in DOLLARS (parseSearchParams' CENT bounds are converted once in
  // queryTaxProducts). Push them through UNCONVERTED — the old cents()
  // multiply made every price filter 100× too large (a $10–$25 bucket
  // queried price >= $1000).
  if (filters.priceBucket) {
    // Dollar bounds, mirroring parseSearchParams' canonical bucket bounds
    // (inclusive max, 5001/10001-style mins): max uses `<` so 25 ⇒ ≤ $24.99.
    const map: Record<string, [number | null, number | null]> = {
      "under-10": [null, 10],
      "10-25": [10, 25],
      "25-50": [25, 50.01],
      "50-100": [50.01, 100.01],
      "over-100": [100.01, null],
    }
    const b = map[filters.priceBucket]
    if (b) {
      if (b[0] != null) clauses.push(`price >= $${params.push(b[0]) + startIdx}`)
      if (b[1] != null) clauses.push(`price < $${params.push(b[1]) + startIdx}`)
    }
  }
  if (filters.minPrice != null) {
    clauses.push(`price >= $${params.push(filters.minPrice) + startIdx}`)
  }
  if (filters.maxPrice != null) {
    clauses.push(`price <= $${params.push(filters.maxPrice) + startIdx}`)
  }
  if (filters.availability && filters.availability.length > 0 && filters.availability.length < 2) {
    clauses.push(filters.availability[0] === "in-stock" ? `in_stock = true` : `in_stock = false`)
  }
  if (filters.q && filters.q.trim().length >= 2) {
    const tokens = filters.q.trim().toLowerCase().split(/\s+/).slice(0, 6)
    for (const t of tokens) {
      clauses.push(`(LOWER(COALESCE(name, '')) LIKE $${params.push("%" + t + "%") + startIdx} OR LOWER(COALESCE(brand, '')) LIKE $${params.push("%" + t + "%") + startIdx})`)
    }
  }
  if (filters.brands && filters.brands.length > 0) {
    const list = filters.brands.map((b) => b.toLowerCase())
    clauses.push(`LOWER(COALESCE(brand, '')) = ANY($${params.push(list) + startIdx}::text[])`)
  }
  // ---- Attribute facets (Size, Flavor, Material, …) ----
  // Values arrive as attribute_value slugs (from the owner's node_filter
  // values). The enterprise catalog carries no product_attribute_values rows
  // today, so matching uses the same honest-fallback semantics the feed path
  // defined: listing-name text match per selected value ("extra-large" →
  // "extra%large"), plus option_size/option_color for those two keys.
  // Different facets AND together; values within one facet OR.
  if (filters.facets) {
    for (const [key, values] of Object.entries(filters.facets)) {
      if (!Array.isArray(values) || values.length === 0) continue
      const clean = values.map((v) => String(v).toLowerCase().slice(0, 80)).filter(Boolean)
      if (clean.length === 0) continue
      const perValue: string[] = []
      for (const v of clean) {
        if (v.replace(/[^a-z0-9]/g, "").length < 3) continue
        const like = `%${v.replace(/-/g, "%")}%`
        perValue.push(`name ILIKE $${params.push(like) + startIdx}`)
      }
      if (key === "size" || key === "color") {
        // Identifier is from the fixed pair above — never user input.
        const colName = key === "size" ? "option_size" : "option_color"
        const norm = clean.map((v) => v.replace(/[^a-z0-9]/g, ""))
        const normParam = `$${params.push(norm) + startIdx}::text[]`
        perValue.push(
          `lower(regexp_replace(COALESCE(${colName}, ''), '[^a-z0-9]', '', 'g')) = ANY(${normParam})`,
        )
        // FAMILY-AWARE (stage-2 CJ axes): the canonical row's own option
        // is only one variant's value — a family matches when ANY of its
        // variant records carries the value. Live path: `ranked` carries
        // the family's cj_pid. Materialized path: shop_grid_cards has no
        // cj_pid column, so correlate through the card's item row.
        // Normalization here lowercases BEFORE stripping (the own-option
        // clause above strips first, which eats uppercase letters from
        // stored values like "Christmas" — the family leg must not
        // inherit that; it also subsumes the own-option leg for CJ
        // families, since the canonical is its own sibling).
        const familyMatch = `regexp_replace(lower(COALESCE(sev.attributes->>'${colName}', '')), '[^a-z0-9]', '', 'g') = ANY(${normParam})`
        if (ctx === "live") {
          perValue.push(
            `EXISTS (SELECT 1 FROM commerce_catalog_items sib
                       JOIN erp_product_skus ss ON ss.id = sib.sku_id
                       JOIN erp_product_variants sev ON sev.id = ss.variant_id
                      WHERE sib.metadata->>'cj_pid' IS NOT NULL
                        AND sib.metadata->>'cj_pid' = cj_pid
                        AND ${familyMatch})`,
          )
        } else {
          perValue.push(
            `EXISTS (SELECT 1 FROM commerce_catalog_items self
                       JOIN commerce_catalog_items sib
                         ON sib.metadata->>'cj_pid' = self.metadata->>'cj_pid'
                       JOIN erp_product_skus ss ON ss.id = sib.sku_id
                       JOIN erp_product_variants sev ON sev.id = ss.variant_id
                      WHERE self.id = item_id
                        AND self.metadata->>'cj_pid' IS NOT NULL
                        AND ${familyMatch})`,
          )
        }
      }
      if (perValue.length > 0) clauses.push(`(${perValue.join(" OR ")})`)
    }
  }
  return clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : ""
}

// ---------------------------------------------------------------------------
// GRID MEMO — the taxonomy grid query (recursive node expansion + jsonb ?|
// over the whole catalog) is the most expensive read in the storefront (~90s
// on throttled Supabase compute) and runs TWICE per uncached render (rows +
// count). Wrap it in the app's SWR cache with a 5-minute TTL: the first
// visitor per (scope, filters, sort, page) pays the query once, everyone
// after gets instant results, and after expiry stale results are served
// immediately while one background refresh runs. 5min >> the 90s query cost,
// so the refresher stays quiet instead of hammering a throttled compute.
// ---------------------------------------------------------------------------
const TAX_GRID_TTL_MS = 5 * 60 * 1000;

export async function queryEnterpriseTaxProducts(opts: {
  nodeIds: string[]
  sort?: string
  page?: number
  perPage?: number
  filters?: EntGridFilters
}): Promise<EntGridResult> {
  // CANONICAL GRID KEY (slice 1c): the hero slider and the PLP grid ask
  // for the SAME unfiltered page-1 result but spell the filters
  // differently — the slider passes {} while the grid passes
  // { priceBucket: null, rating: null, facets: {}, … } (JSON keeps the
  // nulls, drops the undefineds), and the node list arrives in
  // different orders. The old key baked the raw spelling in, so the
  // slider re-ran the heaviest grid query under a second key. The
  // canonical form below collapses every spelling that gridFilterWhere
  // treats identically (null/undefined/empty, case, order) into one key,
  // so the slider reuses the grid's result at BOTH cache layers.
  // v3 — key-shape bump so entries parked by the pre-canonical code
  // can never shadow the unified key.
  // v4 — family-aware size/color facet matching (stage-2 CJ axes) alters
  // grid payloads for the same canonical key; parked v3 entries must not
  // shadow the new matching.
  const key = `ent:taxgrid:v4:${canonicalGridKey(opts.nodeIds, opts.sort, opts.page, opts.perPage, opts.filters)}`
  // SHARED Next data cache (owner directive 2026-10-21): one execution
  // serves every instance; the closure captures opts, so the full key
  // string rides as the keyPart.
  return unstable_cache(
    () => queryEnterpriseTaxProductsUncached(opts),
    [key],
    { revalidate: TAX_GRID_TTL_MS / 1000, tags: ["catalog", "taxgrid"] },
  )()
}

async function queryEnterpriseTaxProductsUncached(opts: {
  nodeIds: string[]
  sort?: string
  page?: number
  perPage?: number
  filters?: EntGridFilters
}): Promise<EntGridResult> {
  const perPage = Math.max(1, Math.min(48, opts.perPage ?? 48))
  const page = Math.max(1, opts.page ?? 1)
  const sort = GRID_SORT[opts.sort || "best-selling"] ? (opts.sort || "best-selling") : "best-selling"
  const filters = opts.filters ?? {}

  // Cross-request TTL cache: the isolated scope filter takes 90s on Supabase's
  // throttled free-tier compute. Cache grid results for 5 minutes so repeated
  // browsing doesn't re-run the scan. Stale-while-revalidate means the first
  // view pays the cost, every view after is instant. The key is the SAME
  // canonical form as the outer layer, so the slider and the grid share
  // this entry too (see queryEnterpriseTaxProducts).
  const cacheKey = `grid:v2:${canonicalGridKey(opts.nodeIds, sort, page, perPage, filters)}`

  return cached(cacheKey, 5 * 60 * 1000, () => buildGridResult(opts.nodeIds, sort, page, perPage, filters))
}

/**
 * Canonical identity of one grid query. Two option spellings map to one
 * key exactly when gridFilterWhere builds the same WHERE clause from
 * them: null/undefined/empty facets and availability are all "no
 * clause"; priceBucket/rating null is "no clause"; q and brands are
 * lowercased by the filter builder, facet values are lowercased too,
 * and multi-value lists are conjunctions/disjunctions whose order does
 * not change the clause. Node ids are sorted (scope is a SET). The
 * original opts are still passed to buildGridResult untouched — only
 * the key is canonicalized, so a normalization slip can cost a cache
 * hit, never a wrong result.
 */
function canonicalGridKey(
  nodeIds: string[],
  sort: string | undefined,
  page: number | undefined,
  perPage: number | undefined,
  filters: EntGridFilters | undefined,
): string {
  const nodes = [...nodeIds].sort()
  const normSort = GRID_SORT[sort || "best-selling"] ? (sort || "best-selling") : "best-selling"
  const normPage = Math.max(1, page ?? 1)
  const normPerPage = Math.max(1, Math.min(48, perPage ?? 48))
  const f = filters ?? {}
  const canon: Record<string, unknown> = {}
  if (f.minPrice != null) canon.minPrice = f.minPrice
  if (f.maxPrice != null) canon.maxPrice = f.maxPrice
  if (f.priceBucket) canon.priceBucket = f.priceBucket
  if (f.rating != null) canon.rating = f.rating
  if (f.availability && f.availability.length > 0) canon.availability = [...f.availability].sort()
  if (f.q && f.q.trim().length > 0) canon.q = f.q.trim().toLowerCase()
  if (f.brands && f.brands.length > 0) canon.brands = f.brands.map((b) => b.toLowerCase()).sort()
  if (f.facets) {
    const facets: Record<string, string[]> = {}
    for (const k of Object.keys(f.facets).sort()) {
      const vals = (f.facets[k] ?? []).map((v) => String(v).toLowerCase()).filter(Boolean)
      if (vals.length > 0) facets[k] = [...vals].sort()
    }
    if (Object.keys(facets).length > 0) canon.facets = facets
  }
  return JSON.stringify([nodes, normSort, normPage, normPerPage, canon])
}

/** Shared row shape: the live grid tail and the materialized
 *  shop_grid_cards read both select these aliases (id, slug, name,
 *  brand, short_description, created_at, price, compare_at, image,
 *  in_stock, is_new, is_best_seller, is_house_favorite, review_avg,
 *  review_n), so one mapper serves both paths and the two can never
 *  drift apart on card semantics. */
function toEntGridItems(rows: any[]): EntGridItem[] {
  return rows.map((r: any) => {
    const priceCents = Math.round(Number(r.price) * 100)
    const compareCents = r.compare_at != null ? Math.round(Number(r.compare_at) * 100) : null
    return {
      id: String(r.id),
      slug: String(r.slug),
      name: String(r.name || ""),
      brand: r.brand || null,
      image: r.image || null,
      shortDescription: r.short_description || null,
      priceCents,
      compareAtPriceCents: compareCents,
      isOnSale: compareCents != null && compareCents > priceCents,
      isNew: r.is_new === true,
      isBestseller: r.is_best_seller === true,
      isSalonFavorite: r.is_house_favorite === true,
      inStock: r.in_stock !== false,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      ratingAvg: r.review_avg != null ? Math.round(Number(r.review_avg) * 10) / 10 : null,
      ratingCount: Number(r.review_n) || 0,
    }
  })
}

async function buildGridResult(
  nodeIds: string[],
  sort: string,
  page: number,
  perPage: number,
  filters: EntGridFilters,
): Promise<EntGridResult> {
  const orderBy = GRID_SORT[sort]
  const offset = (page - 1) * perPage
  const tenant = DEFAULT_TENANT()

  const result = await withPg(async (client) => {
    const paramsRows: unknown[] = []
    const where = gridFilterWhere(filters, paramsRows, 2)
    // Scope resolves in-process when the cached children map is available;
    // $1 then carries the whole pre-expanded subtree. Null → cold path:
    // $1 carries the root ids and gridCoreSql keeps the recursive CTE.
    const scopeIds = await expandScopeIds(client, nodeIds)
    const rowsParams = [scopeIds ?? nodeIds, tenant, ...paramsRows]

    // MATERIALIZED GRID FIRST (shop_grid_cards, 20261181): rows + count
    // from one small indexed table instead of the full-catalog core.
    // Fallback rule — the table must be BOTH present and non-empty, and
    // the scope must be pre-expanded (the table's && filter takes the
    // finished subtree; the recursive-CTE cold path stays on the live
    // grid). Any probe failure (table not yet migrated, empty after a
    // failed refresh) falls through to the live path below, so a
    // missing/stale table can never serve an empty shelf or an error.
    let tableReady = false
    if (scopeIds != null) {
      try {
        const { rows: probe } = await client.query(
          `SELECT EXISTS (SELECT 1 FROM public.shop_grid_cards LIMIT 1) AS has`,
        )
        tableReady = probe[0]?.has === true
      } catch {
        tableReady = false
      }
    }
    if (tableReady) {
      // PARAM LAYOUT: the table SQL is pre-tenanted — it never references
      // the live path's $2 (tenant). Rebuild the filter clause with its
      // OWN numbering (scope=$1, filters from $2) instead of reusing the
      // live layout's `where` (whose filters are numbered $3+ and would
      // dangle). The old code bound the full rowsParams (scope+tenant+
      // filters) against a statement referencing only $1: with no filters
      // active that failed at bind time ("supplies 2 parameters, but
      // prepared statement requires 1") and every grid read threw.
      const tableFilterParams: unknown[] = []
      const tableWhere = gridFilterWhere(filters, tableFilterParams, 1, "table")
      const tableParams = [scopeIds, ...tableFilterParams]
      const { rows } = await client.query(
        `SELECT item_id AS id, slug, name, brand, short_description, created_at,
                price, compare_at, image, in_stock, is_new, is_best_seller,
                is_house_favorite, rating_avg AS review_avg, rating_count AS review_n
           FROM public.shop_grid_cards
          WHERE taxonomy_node_ids && $1::text[]
            AND price IS NOT NULL${tableWhere}
          ORDER BY ${orderBy}
          LIMIT ${perPage} OFFSET ${offset}`,
        tableParams,
      )
      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM public.shop_grid_cards
          WHERE taxonomy_node_ids && $1::text[]
            AND price IS NOT NULL${tableWhere}`,
        tableParams,
      )
      const total = Number(countRows[0]?.n) || 0
      return { items: toEntGridItems(rows), total, page, pages: Math.max(1, Math.ceil(total / perPage)) }
    }

    const coreSql = gridCoreSql(scopeIds != null)
    const { rows } = await client.query(
      coreSql + gridRowsTail(where, orderBy, perPage, offset),
      rowsParams,
    )

    const { rows: countRows } = await client.query(
      coreSql +
      ` SELECT COUNT(*)::int AS n FROM ranked WHERE price IS NOT NULL${where}`,
      rowsParams,
    )

    const total = Number(countRows[0]?.n) || 0
    const items = toEntGridItems(rows)
    return { items, total, page, pages: Math.max(1, Math.ceil(total / perPage)) }
  })
  // withPg swallows query errors into null (throttle cancels, pooler 504s…).
  // Returning an empty grid here would get PARKED in the 5-min SWR cache —
  // one transient timeout would serve "no products" to every visitor.
  // Throwing instead: cached() never caches rejections, stale results keep
  // being served, and every caller already .catch(() => null).
  if (!result) throw new Error("[ent:taxgrid] db read failed — refusing to cache an empty grid")
  return result
}

export type EntSearchResult = {
  items: EntGridItem[]
  total: number
  page: number
  pages: number
  brands: { name: string; count: number }[]
}

/**
 * Batch stock lookup by catalog item id — the SAME derivation the category
 * grid and storefront search use (erp_product_variants.attributes.in_stock,
 * defaulting true when the supplier has not reported: unknown availability
 * is not sold out). For surfaces whose product list comes from somewhere
 * else (Algolia-driven chat cards) and need the catalog's stock truth
 * joined back on. Unresolvable ids are simply absent from the map.
 */
export async function getCatalogStockByIds(ids: string[]): Promise<Map<string, boolean>> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const clean = [...new Set(ids.filter((id) => uuid.test(id)))]
  const out = new Map<string, boolean>()
  if (!clean.length) return out
  const rows = await withPg(async (client) => {
    const { rows } = await client.query(
      `SELECT ci.id, COALESCE((ev.attributes->>'in_stock')::bool, true) AS in_stock
         FROM commerce_catalog_items ci
         JOIN erp_product_skus es ON es.id = ci.sku_id
         LEFT JOIN erp_product_variants ev ON ev.id = es.variant_id
        WHERE ci.tenant_id = $2::uuid AND ci.id = ANY($1::uuid[])`,
      [clean, DEFAULT_TENANT()],
    )
    return rows
  })
  for (const r of rows || []) out.set(String(r.id), r.in_stock !== false)
  return out
}

/**
 * Storefront search — calls the search_enterprise_products() RPC (name, brand
 * and description, with trigram typo tolerance), then hydrates each hit with
 * the same price / image / slug the category grid uses. Brand and price
 * filters, sort and paging run over the ranked hits.
 */
export async function searchEnterpriseProducts(opts: {
  q: string
  page?: number
  perPage?: number
  sort?: string
  brands?: string[]
  minPrice?: number
  maxPrice?: number
}): Promise<EntSearchResult> {
  const q = opts.q.trim().slice(0, 120)
  const perPage = Math.max(1, Math.min(48, opts.perPage ?? 24))
  const page = Math.max(1, opts.page ?? 1)
  const empty: EntSearchResult = { items: [], total: 0, page, pages: 1, brands: [] }
  if (q.length < 2) return empty

  return (await withPg(async (client) => {
    const hits = await client.query(
      `SELECT catalog_item_id, rank FROM search_enterprise_products($1, 240, 0, $2::uuid)`,
      [q, DEFAULT_TENANT()],
    )
    const ids: string[] = hits.rows.map((r: any) => String(r.catalog_item_id))
    if (!ids.length) return empty

    const { rows } = await client.query(
      `SELECT ci.id, ci.metadata->>'slug' AS slug, ci.name, ci.brand, ci.short_description, ci.created_at,
              COALESCE(cp.price, es.unit_price) AS price, cp.compare_at_price AS compare_at,
              COALESCE((ev.attributes->>'in_stock')::bool, true) AS in_stock,
              (SELECT m.url FROM commerce_product_media m WHERE m.catalog_item_id = ci.id
                ORDER BY m.is_primary DESC, m.sort_order ASC NULLS LAST LIMIT 1) AS image,
              review.n AS review_n, review.avg AS review_avg
         FROM commerce_catalog_items ci
         JOIN erp_product_skus es ON es.id = ci.sku_id
         LEFT JOIN erp_product_variants ev ON ev.id = es.variant_id
         LEFT JOIN commerce_prices cp ON cp.catalog_item_id = ci.id
           AND cp.price_list_id = (SELECT id FROM commerce_price_lists WHERE tenant_id = ci.tenant_id AND code = 'RETAIL' AND active LIMIT 1)
           AND (cp.valid_to IS NULL OR cp.valid_to >= now())
         LEFT JOIN (
           SELECT rr."productId" AS pid, count(*)::int AS n, avg(rr.rating) AS avg
             FROM product_reviews rr
            WHERE rr.visible = true AND rr."productId" = ANY($2::text[])
            GROUP BY rr."productId"
         ) review ON review.pid = ci.id::text
        WHERE ci.id = ANY($1::uuid[]) AND COALESCE(ci.metadata->>'slug','') <> ''
          AND COALESCE(cp.price, es.unit_price) > 0`,
      [ids, ids],
    )
    const byId = new Map(rows.map((r: any) => [String(r.id), r]))
    const seen = new Set<string>()
    let items: EntGridItem[] = []
    for (const id of ids) {
      const r: any = byId.get(id)
      if (!r || seen.has(r.slug)) continue
      seen.add(r.slug)
      const priceCents = Math.round(Number(r.price) * 100)
      const compareCents = r.compare_at != null ? Math.round(Number(r.compare_at) * 100) : null
      items.push({
        id: String(r.id), slug: String(r.slug), name: String(r.name || ""), brand: r.brand || null,
        image: r.image || null, shortDescription: r.short_description || null, priceCents,
        compareAtPriceCents: compareCents, isOnSale: compareCents != null && compareCents > priceCents,
        isNew: false, isBestseller: false, isSalonFavorite: false, inStock: r.in_stock !== false,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        ratingAvg: r.review_avg != null ? Math.round(Number(r.review_avg) * 10) / 10 : null,
        ratingCount: Number(r.review_n) || 0,
      })
    }

    const brandCounts = new Map<string, number>()
    for (const it of items) if (it.brand) brandCounts.set(it.brand, (brandCounts.get(it.brand) || 0) + 1)
    const brands = [...brandCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 30)

    if (opts.brands?.length) items = items.filter((i) => i.brand && opts.brands!.includes(i.brand))
    if (opts.minPrice != null) items = items.filter((i) => i.priceCents >= opts.minPrice! * 100)
    if (opts.maxPrice != null) items = items.filter((i) => i.priceCents <= opts.maxPrice! * 100)
    if (opts.sort === "price-asc") items.sort((a, b) => a.priceCents - b.priceCents)
    else if (opts.sort === "price-desc") items.sort((a, b) => b.priceCents - a.priceCents)

    const total = items.length
    const pages = Math.max(1, Math.ceil(total / perPage))
    const cur = Math.min(page, pages)
    return { items: items.slice((cur - 1) * perPage, cur * perPage), total, page: cur, pages, brands }
  })) ?? empty
}

/** Facet source rows for the scoped set (brand / price / stock) — no pagination. */
export async function queryEnterpriseFacetRows(nodeIds: string[]): Promise<
  { brand: string | null; priceCents: number; inStock: boolean }[]
> {
  // SHARED Next data cache — same treatment the grid got (2026-10-21
  // directive), extended 2026-10-24: this is the heaviest read on the
  // category path (the full ranked-CTE scan, up to 20,000 rows pulled
  // to compute brand/price buckets), and unlike the grid it was only
  // behind the PER-INSTANCE in-process cache, so every warm Vercel
  // instance re-ran the full scan per TTL window and crawler rotation
  // across instances multiplied it straight into the pooler. One
  // execution now serves every instance for 5 minutes; a failed read
  // is not cached (unstable_cache does not park rejections), so the
  // caller's existing failure semantics are unchanged.
  const key = `ent:taxfacets:v1:${JSON.stringify([...nodeIds].sort())}`
  return unstable_cache(
    () => queryEnterpriseFacetRowsUncached(nodeIds),
    [key],
    { revalidate: TAX_GRID_TTL_MS / 1000, tags: ["catalog", "taxfacets"] },
  )()
}

async function queryEnterpriseFacetRowsUncached(nodeIds: string[]): Promise<
  { brand: string | null; priceCents: number; inStock: boolean }[]
> {
  const tenant = DEFAULT_TENANT()
  return (await withPg(async (client) => {
    const scopeIds = await expandScopeIds(client, nodeIds)
    // MATERIALIZED FACETS FIRST (shop_grid_cards, 20261181): brand /
    // price / stock counts for the scoped set come from the indexed
    // table — the third full-scope execution on the category path
    // (rows + count + this scan) and the one that pushed /shop/dog
    // past the 8s statement ceiling into 500s. Same fallback rule as
    // the grid: table present AND non-empty AND scope pre-expanded,
    // else the live ranked-CTE scan below. Shape is unchanged
    // (brand / priceCents / inStock), so getTaxFacets' bucket math is
    // identical on either path.
    if (scopeIds != null) {
      let tableReady = false
      try {
        const { rows: probe } = await client.query(
          `SELECT EXISTS (SELECT 1 FROM public.shop_grid_cards LIMIT 1) AS has`,
        )
        tableReady = probe[0]?.has === true
      } catch {
        tableReady = false
      }
      if (tableReady) {
        const { rows } = await client.query(
          `SELECT brand, price, in_stock
             FROM public.shop_grid_cards
            WHERE taxonomy_node_ids && $1::text[]
              AND price IS NOT NULL
            LIMIT 20000`,
          [scopeIds],
        )
        return rows.map((r: any) => ({
          brand: r.brand || null,
          priceCents: Math.round(Number(r.price) * 100),
          inStock: r.in_stock !== false,
        }))
      }
    }
    const { rows } = await client.query(
      gridCoreSql(scopeIds != null) +
      ` SELECT brand, price, in_stock
        FROM ranked
        WHERE price IS NOT NULL
        LIMIT 20000`,
      [scopeIds ?? nodeIds, tenant],
    )
    return rows.map((r: any) => ({
      brand: r.brand || null,
      priceCents: Math.round(Number(r.price) * 100),
      inStock: r.in_stock !== false,
    }))
  })) ?? []
}

// ---- row → CatalogProduct (the normalizer) ----
function rowToCatalogProduct(r: any): CatalogProduct {
  const ciMeta = typeof r.ci_metadata === "string" ? safeJson(r.ci_metadata) : (r.ci_metadata || {})
  const epMeta = typeof r.ep_metadata === "string" ? safeJson(r.ep_metadata) : (r.ep_metadata || {})
  const media = typeof r.media === "string" ? safeJson(r.media) : (r.media || [])
  const priceCents = toCents(r.price ?? r.sku_unit_price)
  const compareAtCents = r.compare_at_price != null ? toCents(r.compare_at_price) : null
  const isOnSale = compareAtCents != null && compareAtCents > priceCents
  const primary = Array.isArray(media) ? media.find((m: any) => m.isPrimary) || media[0] : null
  return {
    id: r.id,
    productId: r.productId,
    skuId: r.skuId,
    sku: r.sku,
    slug: ciMeta.slug || "",
    name: r.name,
    description: r.description,
    shortDescription: r.shortDescription,
    brand: r.brand,
    brandId: epMeta.brand_id || null,
    priceCents,
    compareAtPriceCents: compareAtCents,
    salePriceCents: isOnSale ? priceCents : null,
    isOnSale,
    media: Array.isArray(media) ? media : [],
    image: primary?.url || null,
    alt: primary?.altText || r.name,
    stock: Number(r.stock) || 0,
    supplierStock: r.supplier_stock != null ? Number(r.supplier_stock) : null,
    ecommerceEnabled: r.ecommerceEnabled,
    active: r.active,
    featured: epMeta.featured === true,
    badge: epMeta.badge || null,
    visible: r.active === true && r.ecommerceEnabled === true && epMeta.is_hidden !== true,
    categoryId: epMeta.category_id ?? null,
    // Assigned taxonomy only (LIST_SQL's taxcat lateral); the former
    // epMeta.category read presented a legacy label that ~0 live
    // products carry.
    category: r.assigned_category ?? null,
    specs: epMeta.specs || null,
    materials: epMeta.materials || null,
    ingredients: epMeta.ingredients || null,
    directions: epMeta.directions || null,
    warranty: epMeta.warranty || null,
    stripeProductId: epMeta.stripe_product_id || null,
    stripePriceId: epMeta.stripe_price_id || null,
    sortOrder: Number(ciMeta.sort_order) || 99,
    taxonomyNodeIds: Array.isArray(ciMeta.taxonomy_node_ids)
      ? ciMeta.taxonomy_node_ids.filter((x: unknown): x is string => typeof x === "string")
      : [],
    isNew: epMeta.is_new === true,
    isBestseller: epMeta.is_best_seller === true,
    isSalonFavorite: epMeta.is_salon_favorite === true,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    // X7: seller-import families carry family_key, not cj_pid — the PDP
    // family lookup accepts either stamp (see getProductVariantsByCjPid).
    cjPid: ciMeta.cj_pid || ciMeta.family_key || null,
  }
}

function toCents(n: any): number {
  const v = Number(n)
  return Number.isFinite(v) ? Math.round(v * 100) : 0
}
function safeJson(s: string): any {
  try { return JSON.parse(s) } catch { return {} }
}

// ============================================================================
// WRITE — create a catalog product across the normalized tables (transaction)
// ============================================================================

export type CatalogProductInput = {
  name: string
  slug?: string
  description?: string
  shortDescription?: string
  brand?: string
  brandId?: string
  // pricing (dollars → stored as numeric)
  price: number
  compareAtPrice?: number | null
  // media (array — multi-image support)
  media?: { url: string; altText?: string; isPrimary?: boolean }[]
  // inventory (opening stock — becomes an erp_inventory_movements 'opening' row)
  openingStock?: number
  // flags
  featured?: boolean
  badge?: string
  ecommerceEnabled?: boolean
  // Sellable in the POS register (commerce_catalog_items.pos_enabled).
  // Defaults to true — a product created in admin is sellable in-store
  // unless the caller explicitly opts out.
  posEnabled?: boolean
  categoryId?: number | null
  category?: string
  // detail fields
  specs?: string
  materials?: string
  ingredients?: string
  directions?: string
  warranty?: string
  // stripe
  stripeProductId?: string
  stripePriceId?: string
  // sort
  sortOrder?: number
}

export async function createCatalogProduct(input: CatalogProductInput): Promise<CatalogProduct | null> {
  return withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    const slug = input.slug || slugify(input.name)
    if (!slug) throw new Error("Cannot create a product without a slug")

    await client.query("BEGIN")
    try {
      // 1. erp_products (base — no price, no image)
      const { rows: ep } = await client.query(`
        INSERT INTO public.erp_products
          (tenant_id, name, description, brand, product_type, is_inventory_item,
           is_sellable, is_purchasable, is_active, default_unit_price, metadata)
        VALUES ($1, $2, $3, $4, 'physical', true, true, true, true, $5, $6)
        RETURNING id
      `, [
        tenant, input.name, input.description || null, input.brand || null,
        input.price,
        JSON.stringify({
          slug, short_description: input.shortDescription || null,
          specs: input.specs || null, materials: input.materials || null,
          ingredients: input.ingredients || null, directions: input.directions || null,
          warranty: input.warranty || null, badge: input.badge || null,
          featured: input.featured || false,
          category_id: input.categoryId ?? null, category: input.category || null,
          sort_order: input.sortOrder ?? 99,
          stripe_product_id: input.stripeProductId || null,
          stripe_price_id: input.stripePriceId || null,
          brand_id: input.brandId || null,
        }),
      ])
      const productId = ep[0].id

      // 2. erp_product_skus (the sellable unit)
      const skuCode = slug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) + "-" + Math.random().toString(36).slice(2, 6).toUpperCase()
      const { rows: sk } = await client.query(`
        INSERT INTO public.erp_product_skus
          (tenant_id, product_id, sku, uom, unit_price, is_active)
        VALUES ($1, $2, $3, 'EA', $4, true)
        RETURNING id, sku
      `, [tenant, productId, skuCode, input.price])
      const skuId = sk[0].id
      const sku = sk[0].sku

      // 3. commerce_catalog_items (the ecommerce bridge)
      const ecommerceEnabled = input.ecommerceEnabled !== false
      const posEnabled = input.posEnabled !== false
      const { rows: ci } = await client.query(`
        INSERT INTO public.commerce_catalog_items
          (tenant_id, sku_id, item_type, sku, name, description, short_description,
           brand, taxable, active, ecommerce_enabled, pos_enabled, purchasable, sellable, metadata)
        VALUES ($1, $2, 'product', $3, $4, $5, $6, $7, true, true, $8, $9, true, true, $10)
        RETURNING id
      `, [
        tenant, skuId, sku, input.name, input.description || null,
        input.shortDescription || null, input.brand || null, ecommerceEnabled, posEnabled,
        JSON.stringify({ slug, product_id: productId, sort_order: input.sortOrder ?? 99 }),
      ])
      const catalogItemId = ci[0].id

      // 4. commerce_prices (pricing lives HERE)
      const priceListId = await ensureRetailPriceList(client, tenant)
      await client.query(`
        INSERT INTO public.commerce_prices
          (tenant_id, price_list_id, catalog_item_id, price, compare_at_price, valid_from)
        VALUES ($1, $2, $3, $4, $5, now())
      `, [tenant, priceListId, catalogItemId, input.price, input.compareAtPrice ?? null])

      // 5. commerce_product_media (multi-image)
      if (Array.isArray(input.media)) {
        for (let i = 0; i < input.media.length; i++) {
          const m = input.media[i]
          if (!m.url) continue
          await client.query(`
            INSERT INTO public.commerce_product_media
              (tenant_id, catalog_item_id, media_type, url, alt_text, sort_order, is_primary)
            VALUES ($1, $2, 'image', $3, $4, $5, $6)
          `, [
            tenant, catalogItemId, m.url, m.altText || input.name, i,
            m.isPrimary ?? (i === 0),
          ])
        }
      }

      // 6. erp_inventory_movements (opening stock)
      if (input.openingStock && input.openingStock > 0) {
        const warehouseId = await ensureMainWarehouse(client, tenant)
        await client.query(`
          INSERT INTO public.erp_inventory_movements
            (tenant_id, movement_type, sku_id, warehouse_id, quantity, unit_cost,
             source_type, source_id, reason, occurred_at)
          VALUES ($1, 'opening', $2, $3, $4, 0, 'admin', $5, 'Opening stock on product creation', now())
        `, [tenant, skuId, warehouseId, input.openingStock, catalogItemId])
      }

      // Sync delivery (migration 20261080): the write enqueues its own
      // Algolia reindex in-transaction — a published change is delivered,
      // and the job row is the proof. Savepoint-safe pre-migration.
      await enqueueCatalogItemSync(client as any, tenant, catalogItemId, "admin_catalog_create")

      await client.query("COMMIT")
      revalidateShopPaths()
      return await getCatalogProductById(catalogItemId)
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    }
  })
}

// ============================================================================
// WRITE — variant families (flat-file / bulk imports): ONE erp_products
// with one system SKU per variant row — the Amazon/eBay parent/child
// shape. createCatalogProduct above is the single-SKU writer; this is
// its multi-SKU sibling for importers (the seller catalog CSV import).
// Same tables, same conventions, same transaction discipline:
//
//   * The SYSTEM assigns the SKU code (same generator as
//     createCatalogProduct) and every id. A caller's own SKU never
//     becomes the system SKU — it stays on the caller's records
//     (e.g. seller_listings.sku, the seller-scoped match key).
//   * The GTIN lands on erp_product_skus.barcode + catalog_gtins.
//   * One transaction per product: SPU → per variant (erp_product_
//     variants when axes exist → erp_product_skus → commerce_catalog_
//     items → commerce_prices on the RETAIL list → catalog_gtins →
//     media → opening inventory movement) → taxonomy link → sync
//     enqueue per item.
// ============================================================================

export type CatalogVariantInput = {
  /** This variant item's metadata slug (canonical variant = product slug). */
  slug: string
  /** Typed variant axes ({ size: "28.3 oz" }); empty = the plain variant. */
  axes?: Record<string, string>
  axisSignature?: string | null
  /** erp_product_variants.name; defaults to product name + axis label. */
  variantName?: string
  /** GTIN (digits) → erp_product_skus.barcode + catalog_gtins. */
  gtin?: string | null
  /** catalog_gtins.gtin_type label for the GTIN (caller-validated). */
  gtinType?: string | null
  // pricing (dollars)
  price: number
  compareAtPrice?: number | null
  costPrice?: number | null
  /** Sale window → commerce_prices.valid_from / valid_to. */
  saleFrom?: string | null
  saleTo?: string | null
  /** Opening stock → erp_inventory_movements 'opening' row. */
  openingStock?: number
  weight?: number | null
  weightUnit?: string | null
  length?: number | null
  width?: number | null
  height?: number | null
  dimensionUnit?: string | null
  media?: { url: string; altText?: string; isPrimary?: boolean }[]
  /** commerce_catalog_items flag set for this variant's item. */
  active: boolean
  ecommerceEnabled: boolean
  purchasable?: boolean
  sellable?: boolean
  posEnabled?: boolean
}

export type CatalogFamilyInput = CatalogProductInput & {
  variants: CatalogVariantInput[]
  /** product_taxonomy_nodes link for the SPU. */
  taxonomyNodeId?: string | null
  /** Stamped on every variant item's metadata (seller_id, family_key, …). */
  itemMetadata?: Record<string, unknown>
  /** Merged into erp_products.metadata after the standard detail keys. */
  productMetadata?: Record<string, unknown>
  taxable?: boolean
  taxCodeId?: string | null
  /** erp_inventory_movements.source_type for opening rows. */
  movementSourceType?: string
  /** enqueueCatalogItemSync source label. */
  syncSource?: string
}

export type CatalogFamilyItem = {
  catalogItemId: string
  skuId: string
  /** The SYSTEM-assigned SKU code. */
  sku: string
  variantId: string | null
}

export type CatalogFamilyResult = {
  productId: string
  items: CatalogFamilyItem[]
}

/** The system SKU generator — the same scheme createCatalogProduct uses. */
function generateSystemSkuCode(slugForCode: string): string {
  return slugForCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) + "-" + Math.random().toString(36).slice(2, 6).toUpperCase()
}

async function insertCatalogVariant(
  client: pg.Client,
  tenant: string,
  args: {
    productId: string
    productName: string
    productDescription: string | null
    productShortDescription: string | null
    productBrand: string | null
    variant: CatalogVariantInput
    itemMetadata: Record<string, unknown>
    taxable: boolean
    taxCodeId: string | null
    priceListId: string
    movementSourceType: string
    syncSource: string
  },
): Promise<CatalogFamilyItem> {
  const v = args.variant
  let variantId: string | null = null
  const axes = v.axes ?? {}
  if (Object.keys(axes).length > 0) {
    const label = Object.values(axes).join(" / ")
    const { rows } = await client.query(`
      INSERT INTO public.erp_product_variants
        (tenant_id, product_id, name, attributes, is_active, option_signature)
      VALUES ($1, $2, $3, $4, true, $5)
      RETURNING id
    `, [tenant, args.productId, v.variantName || `${args.productName} — ${label}`, JSON.stringify(axes), v.axisSignature ?? null])
    variantId = rows[0].id
  }

  const skuCode = generateSystemSkuCode(v.slug)
  const { rows: sk } = await client.query(`
    INSERT INTO public.erp_product_skus
      (tenant_id, product_id, variant_id, sku, barcode, uom, unit_price, standard_cost,
       weight, weight_uom, length, width, height, dimension_uom, is_active)
    VALUES ($1, $2, $3, $4, $5, 'EA', $6, $7, $8, $9, $10, $11, $12, $13, true)
    RETURNING id, sku
  `, [
    tenant, args.productId, variantId, skuCode, v.gtin || null, v.price, v.costPrice ?? 0,
    v.weight ?? null, v.weightUnit ?? null, v.length ?? null, v.width ?? null,
    v.height ?? null, v.dimensionUnit ?? null,
  ])
  const skuId = sk[0].id

  const { rows: ci } = await client.query(`
    INSERT INTO public.commerce_catalog_items
      (tenant_id, sku_id, item_type, sku, name, description, short_description,
       brand, unit_of_measure, taxable, tax_code_id, active, ecommerce_enabled,
       pos_enabled, purchasable, sellable, metadata)
    VALUES ($1, $2, 'product', $3, $4, $5, $6, $7, 'each', $8, $9,
            $10, $11, $12, $13, $14, $15)
    RETURNING id
  `, [
    tenant, skuId, skuCode, args.productName, args.productDescription,
    args.productShortDescription, args.productBrand, args.taxable, args.taxCodeId,
    v.active, v.ecommerceEnabled, v.posEnabled ?? false,
    v.purchasable ?? v.ecommerceEnabled, v.sellable ?? v.ecommerceEnabled,
    JSON.stringify({
      slug: v.slug,
      product_id: args.productId,
      erp_product_id: args.productId,
      sort_order: 99,
      ...args.itemMetadata,
    }),
  ])
  const catalogItemId = ci[0].id

  await client.query(`
    INSERT INTO public.commerce_prices
      (tenant_id, price_list_id, catalog_item_id, price, compare_at_price, cost_price, valid_from, valid_to, shipping_cost)
    VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), $8::timestamptz, 0)
  `, [tenant, args.priceListId, catalogItemId, v.price, v.compareAtPrice ?? null, v.costPrice ?? null, v.saleFrom ?? null, v.saleTo ?? null])

  if (v.gtin) {
    await client.query(`
      INSERT INTO public.catalog_gtins
        (tenant_id, catalog_item_id, gtin, gtin_type, is_primary, source)
      VALUES ($1, $2, $3, $4, true, 'import')
    `, [tenant, catalogItemId, v.gtin, v.gtinType || "GTIN-14"])
  }

  if (Array.isArray(v.media)) {
    for (let i = 0; i < v.media.length; i++) {
      const m = v.media[i]
      if (!m.url) continue
      await client.query(`
        INSERT INTO public.commerce_product_media
          (tenant_id, catalog_item_id, media_type, url, alt_text, sort_order, is_primary)
        VALUES ($1, $2, 'image', $3, $4, $5, $6)
      `, [tenant, catalogItemId, m.url, m.altText || args.productName, i, m.isPrimary ?? (i === 0)])
    }
  }

  if (v.openingStock && v.openingStock > 0) {
    const warehouseId = await ensureMainWarehouse(client, tenant)
    await client.query(`
      INSERT INTO public.erp_inventory_movements
        (tenant_id, movement_type, sku_id, warehouse_id, quantity, unit_cost,
         source_type, source_id, reason, occurred_at)
      VALUES ($1, 'opening', $2, $3, $4, 0, $5, $6, 'Opening stock on product import', now())
    `, [tenant, skuId, warehouseId, v.openingStock, args.movementSourceType, catalogItemId])
  }

  await enqueueCatalogItemSync(client as any, tenant, catalogItemId, args.syncSource)
  return { catalogItemId, skuId, sku: skuCode, variantId }
}

export async function createCatalogProductFamily(input: CatalogFamilyInput): Promise<CatalogFamilyResult | null> {
  if (!input.variants || input.variants.length === 0) return null
  return withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    const slug = input.slug || slugify(input.name)
    if (!slug) throw new Error("Cannot create a product without a slug")
    await client.query("BEGIN")
    try {
      const { rows: ep } = await client.query(`
        INSERT INTO public.erp_products
          (tenant_id, name, description, brand, product_type, is_inventory_item,
           is_sellable, is_purchasable, is_active, default_unit_price, metadata)
        VALUES ($1, $2, $3, $4, 'physical', true, true, true, true, $5, $6)
        RETURNING id
      `, [
        tenant, input.name, input.description || null, input.brand || null,
        input.variants[0].price,
        JSON.stringify({
          slug, short_description: input.shortDescription || null,
          specs: input.specs || null, materials: input.materials || null,
          ingredients: input.ingredients || null, directions: input.directions || null,
          warranty: input.warranty || null, badge: input.badge || null,
          featured: input.featured || false,
          category_id: input.categoryId ?? null, category: input.category || null,
          sort_order: input.sortOrder ?? 99,
          stripe_product_id: input.stripeProductId || null,
          stripe_price_id: input.stripePriceId || null,
          brand_id: input.brandId || null,
          ...(input.productMetadata ?? {}),
        }),
      ])
      const productId = ep[0].id

      if (input.taxonomyNodeId) {
        await client.query(`
          INSERT INTO public.product_taxonomy_nodes (tenant_id, product_id, taxonomy_node_id, is_primary)
          VALUES ($1, $2, $3, true)
        `, [tenant, productId, input.taxonomyNodeId])
      }

      const priceListId = await ensureRetailPriceList(client, tenant)
      const items: CatalogFamilyItem[] = []
      for (const variant of input.variants) {
        items.push(await insertCatalogVariant(client, tenant, {
          productId,
          productName: input.name,
          productDescription: input.description || null,
          productShortDescription: input.shortDescription || null,
          productBrand: input.brand || null,
          variant,
          itemMetadata: input.itemMetadata ?? {},
          taxable: input.taxable !== false,
          taxCodeId: input.taxCodeId ?? null,
          priceListId,
          movementSourceType: input.movementSourceType || "import",
          syncSource: input.syncSource || "catalog_import",
        }))
      }
      await client.query("COMMIT")
      revalidateShopPaths()
      return { productId, items }
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    }
  })
}

/**
 * Append variant siblings to an EXISTING erp_products (a re-import that
 * adds new seller SKUs to a product the seller already sells). Same
 * per-variant writer as createCatalogProductFamily, one transaction.
 */
export async function appendCatalogProductVariants(args: {
  productId: string
  variants: CatalogVariantInput[]
  itemMetadata?: Record<string, unknown>
  taxable?: boolean
  taxCodeId?: string | null
  movementSourceType?: string
  syncSource?: string
}): Promise<CatalogFamilyItem[] | null> {
  if (!args.variants || args.variants.length === 0) return null
  return withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    await client.query("BEGIN")
    try {
      const { rows: ep } = await client.query(
        `SELECT name, description, brand, metadata FROM public.erp_products WHERE id = $1 AND tenant_id = $2`,
        [args.productId, tenant],
      )
      if (ep.length === 0) throw new Error("Product not found")
      const priceListId = await ensureRetailPriceList(client, tenant)
      const items: CatalogFamilyItem[] = []
      for (const variant of args.variants) {
        items.push(await insertCatalogVariant(client, tenant, {
          productId: args.productId,
          productName: String(ep[0].name),
          productDescription: ep[0].description ?? null,
          productShortDescription:
            (typeof ep[0].metadata === "object" && ep[0].metadata !== null
              ? (ep[0].metadata as Record<string, unknown>).short_description as string | null
              : null) ?? null,
          productBrand: ep[0].brand ?? null,
          variant,
          itemMetadata: args.itemMetadata ?? {},
          taxable: args.taxable !== false,
          taxCodeId: args.taxCodeId ?? null,
          priceListId,
          movementSourceType: args.movementSourceType || "import",
          syncSource: args.syncSource || "catalog_import",
        }))
      }
      await client.query("COMMIT")
      revalidateShopPaths()
      return items
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    }
  })
}

// ============================================================================
// WRITE — update a catalog product (touches the right subset of tables)
// ============================================================================

export async function updateCatalogProduct(
  catalogItemId: string,
  patch: Partial<CatalogProductInput> & { visible?: boolean; isHidden?: boolean },
): Promise<CatalogProduct | null> {
  return withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    await client.query("BEGIN")
    try {
      // Load current row to get productId / skuId
      const { rows: cur } = await client.query(`
        SELECT ci.id, ci.sku_id, sku.product_id, ci.metadata AS ci_meta, ep.metadata AS ep_meta
        FROM public.commerce_catalog_items ci
        JOIN public.erp_product_skus sku ON sku.id = ci.sku_id
        JOIN public.erp_products ep ON ep.id = sku.product_id
        WHERE ci.id = $1 AND ci.tenant_id = $2
      `, [catalogItemId, tenant])
      if (cur.length === 0) throw new Error("Catalog item not found")
      const row = cur[0]
      const ciMeta = mergeMeta(row.ci_meta, { slug: patch.slug })
      const epMeta = mergeMeta(row.ep_meta, {
        short_description: patch.shortDescription,
        specs: patch.specs, materials: patch.materials,
        ingredients: patch.ingredients, directions: patch.directions,
        warranty: patch.warranty, badge: patch.badge,
        featured: patch.featured,
        category_id: patch.categoryId, category: patch.category,
        sort_order: patch.sortOrder,
        stripe_product_id: patch.stripeProductId,
        stripe_price_id: patch.stripePriceId,
        brand_id: patch.brandId,
        is_hidden: patch.isHidden ?? (patch.visible === false ? true : patch.visible === true ? false : undefined),
      })

      // erp_products
      await client.query(`
        UPDATE public.erp_products SET
          name = COALESCE($2, name),
          description = COALESCE($3, description),
          brand = COALESCE($4, brand),
          metadata = $5,
          updated_at = now()
        WHERE id = $1
      `, [row.product_id, patch.name || null, patch.description || null, patch.brand || null, JSON.stringify(epMeta)])

      // erp_product_skus (unit_price mirrors the base price)
      if (patch.price != null) {
        await client.query(`
          UPDATE public.erp_product_skus SET unit_price = $2, updated_at = now()
          WHERE id = $1
        `, [row.sku_id, patch.price])
      }

      // commerce_catalog_items
      await client.query(`
        UPDATE public.commerce_catalog_items SET
          name = COALESCE($2, name),
          description = COALESCE($3, description),
          short_description = COALESCE($4, short_description),
          brand = COALESCE($5, brand),
          metadata = $6,
          updated_at = now()
        WHERE id = $1
      `, [catalogItemId, patch.name || null, patch.description || null, patch.shortDescription || null, patch.brand || null, JSON.stringify(ciMeta)])

      // commerce_prices (upsert the retail price row)
      if (patch.price != null || patch.compareAtPrice !== undefined) {
        const priceListId = await ensureRetailPriceList(client, tenant)
        await client.query(`
          INSERT INTO public.commerce_prices
            (tenant_id, price_list_id, catalog_item_id, price, compare_at_price, valid_from)
          VALUES ($1, $2, $3, $4, $5, now())
          ON CONFLICT DO NOTHING
        `, [tenant, priceListId, catalogItemId, patch.price, patch.compareAtPrice ?? null])
        // Always update the existing row if present
        await client.query(`
          UPDATE public.commerce_prices SET
            price = COALESCE($2, price),
            compare_at_price = CASE WHEN $3::numeric IS NULL THEN compare_at_price ELSE $3 END,
            valid_from = now()
          WHERE catalog_item_id = $1
            AND price_list_id = (SELECT id FROM public.commerce_price_lists WHERE tenant_id = $4 AND code = 'RETAIL' LIMIT 1)
        `, [catalogItemId, patch.price, patch.compareAtPrice ?? null, tenant])
      }

      // commerce_product_media (replace-all on patch.media)
      if (Array.isArray(patch.media)) {
        await client.query(`DELETE FROM public.commerce_product_media WHERE catalog_item_id = $1`, [catalogItemId])
        for (let i = 0; i < patch.media.length; i++) {
          const m = patch.media[i]
          if (!m.url) continue
          await client.query(`
            INSERT INTO public.commerce_product_media
              (tenant_id, catalog_item_id, media_type, url, alt_text, sort_order, is_primary)
            VALUES ($1, $2, 'image', $3, $4, $5, $6)
          `, [tenant, catalogItemId, m.url, m.altText || patch.name || "", i, m.isPrimary ?? (i === 0)])
        }
      }

      // Sync delivery (migration 20261080): the write enqueues its own
      // Algolia reindex in-transaction — a published change is delivered,
      // and the job row is the proof. Savepoint-safe pre-migration.
      await enqueueCatalogItemSync(client as any, tenant, catalogItemId, "admin_catalog_update")

      await client.query("COMMIT")
      revalidateShopPaths()
      return await getCatalogProductById(catalogItemId)
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    }
  })
}

// ============================================================================
// WRITE — delete a catalog product (cascades across all tables)
// ============================================================================

export async function deleteCatalogProduct(catalogItemId: string): Promise<boolean> {
  return (await withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    await client.query("BEGIN")
    try {
      const { rows } = await client.query(`
        SELECT sku_id, product_id FROM public.commerce_catalog_items
        WHERE id = $1 AND tenant_id = $2
      `, [catalogItemId, tenant])
      if (rows.length === 0) { await client.query("ROLLBACK"); return false }
      const { sku_id, product_id } = rows[0]
      // delete in dependency order
      await client.query(`DELETE FROM public.commerce_product_media WHERE catalog_item_id = $1`, [catalogItemId])
      await client.query(`DELETE FROM public.commerce_prices WHERE catalog_item_id = $1`, [catalogItemId])
      await client.query(`DELETE FROM public.erp_inventory_movements WHERE sku_id = $1`, [sku_id])
      await client.query(`DELETE FROM public.commerce_catalog_items WHERE id = $1`, [catalogItemId])
      await client.query(`DELETE FROM public.erp_product_skus WHERE id = $1`, [sku_id])
      await client.query(`DELETE FROM public.erp_products WHERE id = $1`, [product_id])
      await client.query("COMMIT")
      revalidateShopPaths()
      return true
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    }
  })) ?? false
}

// ============================================================================
// INVENTORY — adjust stock via a movement (the ONLY way stock changes)
// ============================================================================

export async function adjustInventory(
  skuId: string,
  delta: number,
  movementType: string = "adjustment",
  reason?: string,
): Promise<number | null> {
  return withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    const warehouseId = await ensureMainWarehouse(client, tenant)
    // erp_inventory_movements.quantity has CHECK (quantity > 0): direction
    // is encoded in movement_type, NEVER in the sign of quantity. The stock
    // reads (here, getStockOnHand, POS) subtract the outbound types
    // ('sale','damage','scrap','ship') and add everything else. Writing a
    // negative delta raw was rejected by the CHECK — every negative stock
    // adjustment failed. So a negative delta becomes a POSITIVE quantity
    // under a removal type: the caller's own type when it already removes,
    // else 'sale' (the same write shape decrementInventoryForCartItems
    // uses), with the requested type preserved in the reason text.
    const REMOVAL_TYPES = ["sale", "damage", "scrap", "ship"]
    let effectiveType = movementType
    let effectiveReason = reason || `Manual ${movementType}`
    const qty = Math.abs(delta)
    if (delta < 0 && !REMOVAL_TYPES.includes(movementType)) {
      effectiveType = "sale"
      effectiveReason = `${effectiveReason} (negative ${movementType} recorded as a sale-type removal: quantity is always positive, direction lives in movement_type)`
    }
    if (qty > 0) {
      await client.query(`
      INSERT INTO public.erp_inventory_movements
        (tenant_id, movement_type, sku_id, warehouse_id, quantity, unit_cost,
         source_type, reason, occurred_at)
      VALUES ($1, $2, $3, $4, $5, 0, 'admin', $6, now())
    `, [tenant, effectiveType, skuId, warehouseId, qty, effectiveReason])
    }
    // return new stock-on-hand
    const { rows } = await client.query(`SELECT COALESCE(SUM(CASE WHEN movement_type IN ('sale','damage','scrap','ship') THEN -quantity ELSE quantity END), 0) AS qty FROM public.erp_inventory_movements WHERE sku_id = $1`, [skuId])
    return Number(rows[0].qty) || 0
  })
}

export async function getStockOnHand(skuId: string): Promise<number> {
  return (await withPg(async (client) => {
    const { rows } = await client.query(`SELECT COALESCE(SUM(CASE WHEN movement_type IN ('sale','damage','scrap','ship') THEN -quantity ELSE quantity END), 0) AS qty FROM public.erp_inventory_movements WHERE sku_id = $1`, [skuId])
    return Number(rows[0].qty) || 0
  })) ?? 0
}

// ---------------------------------------------------------------------------
// decrementInventoryForCartItems — called by the Stripe webhook after a
// successful shop payment. For each cart line, looks up the catalog item →
// its sku_id → writes an erp_inventory_movements row (movement_type='sale',
// POSITIVE quantity — the table's CHECK (quantity > 0) encodes direction in
// movement_type, and stock reads subtract the outbound types. A negative
// quantity insert is rejected by the constraint and silently never lands).
// This is the ONLY way stock decreases — no flat integer column updates.
// ---------------------------------------------------------------------------
export async function decrementInventoryForCartItems(
  cartItems: { productId?: string; id?: string; quantity?: number; qty?: number; name?: string }[],
  sourceId: string,
): Promise<void> {
  await withPg(async (client) => {
    const tenant = DEFAULT_TENANT()
    const warehouseId = await ensureMainWarehouse(client, tenant)
    // Aggregate per SKU first: the dedupe below keys on the SKU, so two
    // cart lines for the same SKU must land as ONE movement, not two.
    const bySku = new Map<string, { qty: number; name: string }>()
    for (const ci of cartItems) {
      const catalogItemId = String(ci?.productId || ci?.id || "")
      const qty = Math.max(1, Number(ci?.quantity || ci?.qty || 1))
      if (!catalogItemId) continue
      // Look up the sku_id for this catalog item.
      const { rows } = await client.query(
        `SELECT sku_id FROM public.commerce_catalog_items WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [catalogItemId, tenant],
      )
      if (rows.length === 0 || !rows[0].sku_id) continue
      const skuId = String(rows[0].sku_id)
      const prev = bySku.get(skuId)
      bySku.set(skuId, {
        qty: (prev?.qty || 0) + qty,
        name: prev?.name || ci?.name || catalogItemId,
      })
    }
    for (const [skuId, agg] of bySku) {
      // SOURCE DEDUPE (contract step 7, business idempotency): a sale
      // movement already recorded for this (source, SKU) IS this
      // decrement — a redelivered webhook event, a worker re-drive, or
      // the session/PI event pair for one order must never decrement
      // twice. Finalization always decrements the whole cart at once,
      // so an existing movement means the whole line was applied.
      const { rows: existing } = await client.query(
        `SELECT id FROM public.erp_inventory_movements
          WHERE tenant_id = $1 AND movement_type = 'sale'
            AND source_type = 'ecommerce_order' AND source_id = $2 AND sku_id = $3
          LIMIT 1`,
        [tenant, sourceId, skuId],
      )
      if (existing.length > 0) continue
      await client.query(`
        INSERT INTO public.erp_inventory_movements
          (tenant_id, movement_type, sku_id, warehouse_id, quantity, unit_cost,
           source_type, source_id, reason, occurred_at)
        VALUES ($1, 'sale', $2, $3, $4, 0, 'ecommerce_order', $5, $6, now())
      `, [tenant, skuId, warehouseId, agg.qty, sourceId, `Sale — ${agg.name} x${agg.qty}`])
    }
  })
}

// ============================================================================
// helpers
// ============================================================================

function slugify(s: string): string {
  return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

function mergeMeta(current: any, patch: Record<string, any>): any {
  const base = typeof current === "string" ? safeJson(current) : (current || {})
  const out: any = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    out[k] = v
  }
  return out
}

async function ensureRetailPriceList(client: pg.Client, tenant: string): Promise<string> {
  const { rows } = await client.query(`
    INSERT INTO public.commerce_price_lists (tenant_id, code, name, currency, list_type, active)
    VALUES ($1, 'RETAIL', 'Retail Price List', 'USD', 'retail', true)
    ON CONFLICT (tenant_id, code) DO UPDATE SET active = true
    RETURNING id
  `, [tenant])
  return rows[0].id
}

async function ensureMainWarehouse(client: pg.Client, tenant: string): Promise<string> {
  const { rows } = await client.query(`
    INSERT INTO public.erp_warehouses (tenant_id, code, name, warehouse_type, is_active)
    VALUES ($1, 'MAIN', 'Main Warehouse', 'warehouse', true)
    ON CONFLICT (tenant_id, code) DO UPDATE SET is_active = true
    RETURNING id
  `, [tenant])
  return rows[0].id
}

function revalidateShopPaths() {
  try {
    revalidateTag("catalog", { expire: 0 })
    revalidatePath("/shop", "page")
    revalidatePath("/shop/[...slug]", "page")
    revalidatePath("/product/[id]", "page")
    revalidatePath("/seller/[slug]", "page")
    revalidatePath("/", "page")
  } catch { /* non-fatal during build */ }
}

// ---------------------------------------------------------------------------
// Header type-ahead suggestions — light query for the search dropdown.
// Same search_enterprise_products() RPC as the /shop results page, hydrated
// with the RETAIL price and primary image per hit. One card per slug.
// ---------------------------------------------------------------------------
export type EntSuggestion = {
  id: string
  slug: string
  name: string
  brand: string | null
  image: string | null
  priceCents: number
}

export async function searchEnterpriseSuggestions(qRaw: string, limit = 8): Promise<EntSuggestion[]> {
  const q = qRaw.trim().slice(0, 120)
  if (q.length < 2) return []
  return (await withPg(async (client) => {
    const hits = await client.query(
      `SELECT catalog_item_id FROM search_enterprise_products($1, $2, 0, $3::uuid)`,
      [q, limit, DEFAULT_TENANT()],
    )
    const ids: string[] = hits.rows.map((r: any) => String(r.catalog_item_id))
    if (!ids.length) return [] as EntSuggestion[]

    const { rows } = await client.query(
      `SELECT ci.id, ci.metadata->>'slug' AS slug, ci.name, ci.brand,
              COALESCE(cp.price, es.unit_price) AS price,
              (SELECT m.url FROM commerce_product_media m WHERE m.catalog_item_id = ci.id
                ORDER BY m.is_primary DESC, m.sort_order ASC NULLS LAST LIMIT 1) AS image
         FROM commerce_catalog_items ci
         JOIN erp_product_skus es ON es.id = ci.sku_id
         LEFT JOIN commerce_prices cp ON cp.catalog_item_id = ci.id
           AND cp.price_list_id = (SELECT id FROM commerce_price_lists WHERE tenant_id = ci.tenant_id AND code = 'RETAIL' AND active LIMIT 1)
           AND (cp.valid_to IS NULL OR cp.valid_to >= now())
        WHERE ci.id = ANY($1::uuid[]) AND COALESCE(ci.metadata->>'slug','') <> ''
          AND COALESCE(cp.price, es.unit_price) > 0`,
      [ids],
    )
    const byId = new Map(rows.map((r: any) => [String(r.id), r]))
    const items: EntSuggestion[] = []
    const seen = new Set<string>()
    for (const id of ids) {
      const r: any = byId.get(id)
      if (!r || seen.has(r.slug)) continue
      seen.add(r.slug)
      items.push({
        id, slug: String(r.slug), name: String(r.name || ""), brand: r.brand || null,
        image: r.image || null, priceCents: Math.round(Number(r.price) * 100),
      })
      if (items.length >= limit) break
    }
    return items
  })) ?? []
}

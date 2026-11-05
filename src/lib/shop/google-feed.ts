import { unstable_cache } from "next/cache"
import { pgQuery } from "@/lib/pg"
import { TENANT_ID } from "@/lib/crm/enterprise"
import { SITE_URL } from "@/lib/site-url"

// ---------------------------------------------------------------------------
// Google Shopping product feed (owner ask, 2026-10-22): an RSS 2.0 + g:
// XML feed Merchant Center can fetch on a schedule, carrying for every
// sellable product: title, REAL description, price (with sale price when
// the catalog has a compare-at), image, availability, brand, GTIN when the
// SKU carries a barcode, category, and a per-item ESTIMATED SHIPPING cost
// taken from the backend's own data (commerce_prices.shipping_cost — the
// same figure checkout reads). Merchant Center applies the item's shipping
// entry for the shopper's location (US); the value is the product's real
// backend shipping cost, never a site-wide invented flat rate.
//
// "Sellable" mirrors the shop grid's own definition exactly (gridCoreSql in
// src/lib/enterprise/catalog.ts): tenant-scoped, active + sellable +
// ecommerce-enabled, non-empty slug, a current RETAIL price (or SKU unit
// price) above zero, deduped to one row per slug (cheapest first). The
// items query is shared-cached for an hour so crawler fetches never fan
// out against the database.
//
// The SAME item set is the catalog source for the Merchant API sync
// (src/lib/google-merchant): every product the feed serves flows to
// Google Shopping through the API as well. The loader therefore also
// carries the fields only the API mapping needs — the catalog item id
// (the sync ledger's identity), the CJ family key (cj_pid, falling
// back to family_key — the grouping the PDP/checkout variant bridges
// use), and every media URL (the primary stays `image`; the rest are
// the API's additionalImageLinks). One sellable definition, two
// submission paths — never a forked second query.
// ---------------------------------------------------------------------------

export type GoogleFeedItem = {
  id: string
  slug: string
  name: string
  brand: string | null
  description: string | null
  shortDescription: string | null
  price: number
  compareAt: number | null
  shippingCost: number | null
  inStock: boolean
  /** The variant's live count (erp_product_variants.attributes
   *  stock_quantity — for CJ products, the CJ inventory sync's number).
   *  Null when no count has ever been recorded for the variant. */
  stockQuantity: number | null
  image: string | null
  additionalImages: string[]
  barcode: string | null
  categoryName: string | null
  familyKey: string | null
}

export const getGoogleFeedItems = unstable_cache(
  async (): Promise<GoogleFeedItem[]> => {
    const rows = await pgQuery<{
      id: string
      slug: string
      name: string
      brand: string | null
      description: string | null
      short_description: string | null
      price: string | number
      compare_at: string | number | null
      shipping_cost: string | number | null
      in_stock: boolean
      stock_quantity: string | number | null
      image: string | null
      all_images: string[] | null
      barcode: string | null
      category_name: string | null
      family_key: string | null
    }>(
      `WITH items AS (
         SELECT
           ci.id,
           ci.metadata->>'slug' AS slug,
           ci.name,
           ci.brand,
           ci.description,
           ci.short_description,
           COALESCE(cp.price, es.unit_price) AS price,
           cp.compare_at_price AS compare_at,
           cp.shipping_cost AS shipping_cost,
           COALESCE((ev.attributes->>'in_stock')::bool, true) AS in_stock,
           (ev.attributes->>'stock_quantity')::int AS stock_quantity,
           es.barcode AS barcode,
           COALESCE(ci.metadata->>'cj_pid', ci.metadata->>'family_key') AS family_key,
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
         WHERE ci.tenant_id = $1::uuid
           AND ci.active = true
           AND ci.sellable = true
           AND ci.ecommerce_enabled = true
           AND COALESCE(ci.metadata->>'slug', '') <> ''
           AND COALESCE(cp.price, es.unit_price) > 0
       )
       SELECT i.id::text AS id, i.slug, i.name, i.brand, i.description, i.short_description,
              i.price, i.compare_at, i.shipping_cost, i.in_stock, i.stock_quantity, i.barcode,
              i.family_key,
              (SELECT m.url FROM commerce_product_media m
                WHERE m.catalog_item_id = i.id
                ORDER BY m.is_primary DESC, m.sort_order ASC NULLS LAST
                LIMIT 1) AS image,
              (SELECT COALESCE(array_agg(m.url ORDER BY m.is_primary DESC, m.sort_order ASC NULLS LAST), ARRAY[]::text[])
                 FROM commerce_product_media m
                WHERE m.catalog_item_id = i.id) AS all_images,
              (SELECT COALESCE(n.display_name, n.name)
                 FROM erp_product_skus es2
                 JOIN product_taxonomy_nodes ptn ON ptn.product_id = es2.product_id AND ptn.is_primary
                 JOIN taxonomy_nodes n ON n.id = ptn.taxonomy_node_id
                WHERE es2.id = (SELECT sku_id FROM commerce_catalog_items WHERE id = i.id)
                LIMIT 1) AS category_name
         FROM items i
        WHERE i.slug_rn = 1
        ORDER BY i.name`,
      [TENANT_ID()],
    )
    return rows.map((r) => {
      const image = r.image || null
      const allImages = Array.isArray(r.all_images) ? r.all_images.filter(Boolean) : []
      return {
        id: String(r.id),
        slug: r.slug,
        name: r.name,
        brand: r.brand || null,
        description: r.description || null,
        shortDescription: r.short_description || null,
        price: Number(r.price),
        compareAt: r.compare_at != null ? Number(r.compare_at) : null,
        shippingCost: r.shipping_cost != null ? Number(r.shipping_cost) : null,
        inStock: r.in_stock !== false,
        stockQuantity:
          r.stock_quantity != null && Number.isFinite(Number(r.stock_quantity))
            ? Math.max(0, Math.trunc(Number(r.stock_quantity)))
            : null,
        image,
        // Every media URL except the primary (order preserved).
        additionalImages: allImages.filter((u) => u !== image),
        barcode: r.barcode || null,
        categoryName: r.category_name || null,
        familyKey: r.family_key || null,
      }
    })
  },
  ["google-shopping-feed-items-v2"],
  { revalidate: 3600, tags: ["catalog", "google-feed"] },
)

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function money(n: number): string {
  return `${n.toFixed(2)} USD`
}

function itemXml(item: GoogleFeedItem): string {
  const description = stripHtml(item.description || item.shortDescription || item.name).slice(0, 5000)
  const title = item.name.slice(0, 150)
  const onSale = item.compareAt != null && item.compareAt > item.price
  const lines: string[] = [
    "    <item>",
    `      <g:id>${xmlEscape(item.slug)}</g:id>`,
    `      <g:title>${xmlEscape(title)}</g:title>`,
    `      <g:description>${xmlEscape(description)}</g:description>`,
    `      <g:link>${xmlEscape(`${SITE_URL}/products/${item.slug}`)}</g:link>`,
  ]
  if (item.image) lines.push(`      <g:image_link>${xmlEscape(item.image)}</g:image_link>`)
  lines.push(`      <g:availability>${item.inStock ? "in_stock" : "out_of_stock"}</g:availability>`)
  // The count itself, when the catalog holds one (Merchant Center asks
  // for it on every product; a missing count is what kept the catalog
  // unpublished). Omitted only when no count has ever been recorded.
  if (item.stockQuantity != null) {
    lines.push(`      <g:quantity>${item.stockQuantity}</g:quantity>`)
  }
  if (onSale) {
    lines.push(`      <g:price>${money(item.compareAt as number)}</g:price>`)
    lines.push(`      <g:sale_price>${money(item.price)}</g:sale_price>`)
  } else {
    lines.push(`      <g:price>${money(item.price)}</g:price>`)
  }
  lines.push("      <g:condition>new</g:condition>")
  if (item.brand) lines.push(`      <g:brand>${xmlEscape(item.brand)}</g:brand>`)
  // GTIN only when the SKU barcode is a plausible GTIN (8–14 digits).
  if (item.barcode && /^\d{8,14}$/.test(item.barcode.trim())) {
    lines.push(`      <g:gtin>${xmlEscape(item.barcode.trim())}</g:gtin>`)
  }
  if (item.categoryName) {
    lines.push(`      <g:product_type>${xmlEscape(item.categoryName)}</g:product_type>`)
  }
  if (item.shippingCost != null && Number.isFinite(item.shippingCost)) {
    lines.push(
      "      <g:shipping>",
      "        <g:country>US</g:country>",
      "        <g:service>Standard</g:service>",
      `        <g:price>${money(Math.max(0, item.shippingCost))}</g:price>`,
      "      </g:shipping>",
    )
  }
  lines.push("    </item>")
  return lines.join("\n")
}

export async function buildGoogleShoppingFeedXml(): Promise<string> {
  const items = await getGoogleFeedItems()
  const body = items.map(itemXml).join("\n")
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "  <channel>",
    "    <title>UnSaid Memories</title>",
    `    <link>${xmlEscape(SITE_URL)}</link>`,
    "    <description>UnSaid Memories product catalog — pet supplies for dogs, cats, birds, reptiles, small pets and fish.</description>",
    body,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n")
}

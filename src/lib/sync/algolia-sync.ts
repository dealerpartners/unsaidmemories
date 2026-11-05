import { algoliasearch } from "algoliasearch"
import { algoliaAppId, ALGOLIA_PRODUCTS_INDEX, cleanProductName } from "@/lib/algolia"

// ---------------------------------------------------------------------------
// Supabase → Algolia product reindex, ported from scripts/index-algolia.ts
// (the hand-run script) into a lib handler the sync_jobs runner executes.
// Record shaping is the script's, unchanged: brand comes from the brand
// COLUMN (never metadata.brand, which is never set), only active items are
// indexed, prices/media join from commerce_prices / commerce_product_media.
//
// Modes:
//   single — one catalog item. Active → saveObject. Inactive or deleted →
//            deleteObject, so an unpublished product leaves the index
//            instead of lingering as a published thing never delivered.
//   full   — every active item, batched, plus the index settings the
//            script applies.
// Writes require ALGOLIA_ADMIN_API_KEY; without it the handler throws a
// configuration error the runner records on the job.
// ---------------------------------------------------------------------------

type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

export function algoliaSyncConfigured(): boolean {
  return Boolean(process.env.ALGOLIA_ADMIN_API_KEY)
}

function getAdminClient() {
  const key = process.env.ALGOLIA_ADMIN_API_KEY
  if (!key) {
    throw new Error("ALGOLIA_ADMIN_API_KEY is not configured — cannot write the Algolia index")
  }
  return algoliasearch(algoliaAppId(), key)
}

type CatalogRow = {
  id: string
  name: string
  brand: string | null
  metadata: Record<string, any> | null
  active: boolean
  price: string | number | null
  compare_at_price: string | number | null
  media: { url: string; is_primary: boolean }[]
}

async function loadItems(c: PgClient, ids: string[] | null): Promise<CatalogRow[]> {
  const { rows } = await c.query(
    `SELECT ci.id, ci.name, ci.brand, ci.metadata, ci.active,
            (SELECT cp.price FROM public.commerce_prices cp
              WHERE cp.catalog_item_id = ci.id LIMIT 1) AS price,
            (SELECT cp.compare_at_price FROM public.commerce_prices cp
              WHERE cp.catalog_item_id = ci.id LIMIT 1) AS compare_at_price,
            COALESCE((
              SELECT json_agg(json_build_object('url', mm.url, 'is_primary', mm.is_primary)
                              ORDER BY mm.sort_order)
                FROM public.commerce_product_media mm
               WHERE mm.catalog_item_id = ci.id
            ), '[]'::json) AS media
       FROM public.commerce_catalog_items ci
      WHERE ($1::uuid[] IS NULL OR ci.id = ANY($1::uuid[]))`,
    [ids],
  )
  return rows as CatalogRow[]
}

export function shapeAlgoliaRecord(item: CatalogRow): Record<string, unknown> {
  const media = Array.isArray(item.media) ? item.media : []
  const primary = media.find((m) => m.is_primary) || media[0]
  return {
    objectID: item.id,
    name: cleanProductName(String(item.name || "").substring(0, 200)),
    slug: item.metadata?.slug || "",
    // Brand comes from the column, NOT metadata.brand (which is never set)
    brand: String(item.brand || "").substring(0, 100),
    price_cents: item.price != null ? Math.round(Number(item.price) * 100) : 0,
    compare_at_cents:
      item.compare_at_price != null ? Math.round(Number(item.compare_at_price) * 100) : null,
    image: primary?.url || null,
    // Limit to 5 images to stay under the 10KB record limit
    images: media.slice(0, 5).map((m) => m.url),
    taxonomy_node_ids: (item.metadata?.taxonomy_node_ids || []).slice(0, 20),
  }
}

export type AlgoliaSyncResult = {
  mode: "single" | "full"
  indexed: number
  removed: number
}

export async function reindexProductsToAlgolia(
  c: PgClient,
  productIds: string[] | null,
): Promise<AlgoliaSyncResult> {
  const client = getAdminClient()
  const items = await loadItems(c, productIds)
  const mode: AlgoliaSyncResult["mode"] = productIds ? "single" : "full"

  if (productIds) {
    // Single mode: every requested id resolves to save (active) or remove.
    let indexed = 0
    let removed = 0
    const byId = new Map(items.map((i) => [i.id, i]))
    for (const id of productIds) {
      const item = byId.get(id)
      if (item && item.active) {
        await client.saveObject({
          indexName: ALGOLIA_PRODUCTS_INDEX,
          body: shapeAlgoliaRecord(item) as any,
        })
        indexed++
      } else {
        await client.deleteObject({ indexName: ALGOLIA_PRODUCTS_INDEX, objectID: id })
        removed++
      }
    }
    return { mode, indexed, removed }
  }

  const active = items.filter((i) => i.active)
  const BATCH = 200
  let indexed = 0
  for ( let off = 0; off < active.length; off += BATCH) {
    const slice = active.slice(off, off + BATCH)
    await client.saveObjects({
      indexName: ALGOLIA_PRODUCTS_INDEX,
      objects: slice.map((i) => shapeAlgoliaRecord(i) as any),
    })
    indexed += slice.length
  }
  await client.setSettings({
    indexName: ALGOLIA_PRODUCTS_INDEX,
    indexSettings: {
      searchableAttributes: ["name", "brand"],
      attributesForFaceting: ["brand", "taxonomy_node_ids"],
    },
  })
  return { mode, indexed, removed: 0 }
}

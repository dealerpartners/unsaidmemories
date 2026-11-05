import Stripe from "stripe"

// ---------------------------------------------------------------------------
// Product → Stripe sync, executed by the sync_jobs runner and the manual
// product-sync endpoint against the SAME code path.
// Supabase is the source of truth, and the LIVE catalog is
// commerce_catalog_items — NOT the legacy commerce_products table the
// previous implementation read (8 rows). Catalog item ids never match
// commerce_products rows, so per-id syncs silently dropped every row
// (filter(Boolean) hid every miss) and full syncs priced 8 legacy rows.
//   1. Load the catalog item + its ERP product (via sku) + the
//      commerce_prices price (dollars) + primary media.
//   2. Create the Stripe product when no linkage exists, otherwise update
//      its name / description / image in place.
//   3. Reuse the linked Stripe price whenever it is still active and its
//      unit_amount matches the catalog price; otherwise create a new price
//      and deactivate the old one (non-fatal on failure).
//   4. Write stripe_product_id + stripe_price_id back into
//      erp_products.metadata — the linkage checkout's managed-price path
//      reads (getCatalogProductById → epMeta). Never commerce_products.
// TAX: Stripe Price objects carry no tax_behavior; the checkout declares
// tax_behavior:"inclusive" on the line and enables automatic_tax, so the
// managed price flows through the same inclusive-tax path as ad-hoc
// prices. No tax code is invented here.
// Per-id misses and unsellable items land in failed[] — never silently
// dropped. A job that "succeeds" with an empty synced list and an empty
// failed list is a lie this file no longer tells.
// ---------------------------------------------------------------------------

type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

let _stripe: Stripe | null = null
function getStripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  return _stripe
}

export function stripeSyncConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

// Same parsing as src/app/api/shop/checkout/route.ts: catalog prices are
// dollars (commerce_prices), Stripe wants integer cents.
function parseCents(price: string | number | null | undefined): number | null {
  if (price == null) return null
  const v = parseFloat(String(price).replace(/[^0-9.]/g, ""))
  if (!isFinite(v) || v <= 0) return null
  return Math.round(v * 100)
}

// Stripe only accepts absolute http(s) image URLs (Supabase Storage public
// URLs qualify; local /assets/... paths must be omitted).
const isHttpUrl = (s: unknown) => typeof s === "string" && /^https?:\/\//i.test(s)

export type StripeSyncedItem = {
  productId: string
  name: string
  stripeProductId: string
  stripePriceId: string
  priceChanged: boolean
}

type CatalogSyncRow = {
  id: string
  name: string
  brand: string | null
  metadata: Record<string, any> | null
  active: boolean
  ecommerce_enabled: boolean
  short_description: string | null
  erp_product_id: string | null
  ep_metadata: Record<string, any> | null
  price: string | number | null
  image: string | null
}

async function loadItems(c: PgClient, ids: string[] | null): Promise<CatalogSyncRow[]> {
  const { rows } = await c.query(
    `SELECT ci.id, ci.name, ci.brand, ci.metadata, ci.active, ci.ecommerce_enabled,
            ci.short_description,
            sku.product_id AS erp_product_id, ep.metadata AS ep_metadata,
            (SELECT cp.price FROM public.commerce_prices cp
              WHERE cp.catalog_item_id = ci.id LIMIT 1) AS price,
            (SELECT mm.url FROM public.commerce_product_media mm
              WHERE mm.catalog_item_id = ci.id AND mm.is_primary
              ORDER BY mm.sort_order LIMIT 1) AS image
       FROM public.commerce_catalog_items ci
       LEFT JOIN public.erp_product_skus sku ON sku.id = ci.sku_id
       LEFT JOIN public.erp_products ep ON ep.id = sku.product_id
      WHERE ($1::uuid[] IS NULL OR ci.id = ANY($1::uuid[]))`,
    [ids],
  )
  return rows as CatalogSyncRow[]
}

function epMetaOf(item: CatalogSyncRow): Record<string, any> {
  const m = item.ep_metadata
  if (m && typeof m === "object") return m
  if (typeof m === "string") {
    try {
      const parsed = JSON.parse(m)
      if (parsed && typeof parsed === "object") return parsed
    } catch { /* fall through to empty */ }
  }
  return {}
}

export async function syncProductToStripe(
  c: PgClient,
  item: CatalogSyncRow,
): Promise<StripeSyncedItem> {
  const stripe = getStripe()
  const cents = parseCents(item.price)
  if (cents == null) throw new Error(`No valid price to sync (price: "${item.price ?? ""}")`)
  if (!item.erp_product_id) {
    throw new Error("No ERP product linked (catalog item has no sku) — cannot store Stripe linkage")
  }
  const epMeta = epMetaOf(item)
  const description = String(
    item.short_description || item.metadata?.short_description || "",
  ).slice(0, 350)

  // ---- 1. Stripe product (create or update) ----
  let stripeProductId: string = String(epMeta.stripe_product_id || "")
  if (!stripeProductId) {
    const sp = await stripe.products.create({
      name: item.name,
      ...(description ? { description } : {}),
      ...(isHttpUrl(item.image) ? { images: [item.image as string] } : {}),
      metadata: {
        supabaseProductId: item.id,
        ...(item.metadata?.slug ? { slug: String(item.metadata.slug) } : {}),
      },
    })
    stripeProductId = sp.id
  } else {
    await stripe.products.update(stripeProductId, {
      name: item.name,
      ...(description ? { description } : {}),
      ...(isHttpUrl(item.image) ? { images: [item.image as string] } : {}),
    })
  }

  // ---- 2. Stripe price (reuse when active + amount matches) ----
  let stripePriceId: string = String(epMeta.stripe_price_id || "")
  let reusable = false
  if (stripePriceId) {
    try {
      const price = await stripe.prices.retrieve(stripePriceId)
      if (price.active && price.unit_amount === cents) reusable = true
    } catch {
      // Unusable/deleted price — fall through and create a fresh one.
    }
  }

  let priceChanged = false
  if (!reusable) {
    const newPrice = await stripe.prices.create({
      product: stripeProductId,
      unit_amount: cents,
      currency: "usd",
      nickname: `${item.name} — one-time`,
    })
    if (stripePriceId) {
      try { await stripe.prices.update(stripePriceId, { active: false }) } catch { /* non-fatal */ }
    }
    stripePriceId = newPrice.id
    priceChanged = true
  }

  // ---- 3. Write linkage back to the ERP product metadata ----
  // This is the linkage checkout reads (getCatalogProductById → epMeta).
  const merged = { ...epMeta, stripe_product_id: stripeProductId, stripe_price_id: stripePriceId }
  await c.query(
    `UPDATE public.erp_products SET metadata = $2, updated_at = now() WHERE id = $1`,
    [item.erp_product_id, JSON.stringify(merged)],
  )

  return { productId: item.id, name: item.name, stripeProductId, stripePriceId, priceChanged }
}

export type StripeSyncBatchResult = {
  synced: StripeSyncedItem[]
  failed: { productId: string; name: string; error: string }[]
}

/**
 * Sync the given catalog item ids (explicit ids sync regardless of
 * visibility, but unsellable items fail honestly instead of vanishing),
 * or — when ids is null — ALL sellable catalog items (active +
 * ecommerce_enabled). Per-item failures never abort the batch; they land
 * in failed[].
 */
export async function syncProductsToStripe(
  c: PgClient,
  ids: string[] | null,
): Promise<StripeSyncBatchResult> {
  const items = await loadItems(c, ids)
  const synced: StripeSyncedItem[] = []
  const failed: StripeSyncBatchResult["failed"] = []

  if (ids) {
    const byId = new Map(items.map((i) => [i.id, i]))
    for (const id of ids) {
      const item = byId.get(id)
      if (!item) {
        failed.push({ productId: id, name: "", error: "Catalog item not found" })
        continue
      }
      if (!item.active || !item.ecommerce_enabled) {
        failed.push({
          productId: id,
          name: item.name,
          error: "Not sellable (active/ecommerce_enabled false) — no managed Stripe price",
        })
        continue
      }
      try {
        synced.push(await syncProductToStripe(c, item))
      } catch (e: any) {
        failed.push({ productId: id, name: item.name, error: e?.message || "Sync failed" })
      }
    }
    return { synced, failed }
  }

  const sellable = items.filter((i) => i.active && i.ecommerce_enabled)
  for (const item of sellable) {
    try {
      synced.push(await syncProductToStripe(c, item))
    } catch (e: any) {
      failed.push({ productId: item.id, name: item.name, error: e?.message || "Sync failed" })
    }
  }
  return { synced, failed }
}

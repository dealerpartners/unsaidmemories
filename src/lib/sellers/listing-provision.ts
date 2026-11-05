// ---------------------------------------------------------------------------
// sellers/listing-provision.ts — publish-at-creation provisioning for
// seller listings (owner policy, 2026-10-16).
//
// THE POLICY: seller approval is the ONLY gate. An approved seller's
// products publish immediately when created — there is no per-product
// review step anywhere in this path. Whatever internal linkage a
// shop-visible listing needs rides along automatically and silently.
//
// THE ENTERPRISE APPROACH (owner ruling, same standard as Amazon /
// eBay): the product chain is NOT hand-rolled here. The platform's own
// catalog writer — lib/enterprise/catalog.ts createCatalogProduct —
// creates it transactionally (erp_products SPU → erp_product_skus →
// commerce_catalog_items with sku_id SET and the shop flags on →
// commerce_prices on the RETAIL list, in dollars → media → Algolia
// sync enqueue). The SYSTEM assigns the SKU code and the product ids;
// the seller's own SKU is only their store-scoped key, carried on the
// governed offer row (seller_listings.sku — the key bulk edit and
// re-import match on) and in the item's seller signature.
//
// What this helper adds around the writer is the SELLER side:
//   - the seller signature on the item (ci.metadata seller_id + the
//     seller's own sku + status 'approved' — the token the admin
//     catalog queue itself uses; leg (a) of order attribution and the
//     seller's own catalog reads key on the seller_id stamp);
//   - born LIVE in the governed vocabulary: seller_listings.status
//     'approved', the value the public storefront leg, the PDP
//     "Sold by" door, and the attribution writer all require;
//   - the governed offer + stock rows (the inventory entrance);
//   - idempotency on the seller's SKU: re-running a create for a SKU
//     the seller already carries refreshes that listing through the
//     writer's update path instead of duplicating it, and an item
//     born bare (created while the seller was still pending, or
//     before this policy) is superseded by a writer-built canonical
//     item with the governed listing re-pointed at it.
//
// A seller who is NOT yet approved cannot sell anyway; their creates
// keep the pre-policy shape exactly (metadata-born item, governed
// listing 'pending_review', no ERP chain, no shop flags) and provision
// fully if re-run once they are approved. Platform governance is
// never undone here: a rejected/suppressed item keeps its metadata
// state, and a retired item (active = false — the seller's own
// switch) stays retired; reactivate lives in the PATCH route.
// ---------------------------------------------------------------------------

import type { SellerQueryFn } from "./attribution"
import {
  ensureSellerInventoryRow,
  ensureSellerListingRow,
} from "./inventory-entrance"
import {
  createCatalogProduct,
  updateCatalogProduct,
} from "@/lib/enterprise/catalog"
import { TENANT_ID } from "@/lib/crm/enterprise"

export type { SellerQueryFn }

export type ProvisionSellerListingArgs = {
  tenantId: string
  sellerId: string
  /** The seller's own approval state — the only gate (owner policy). */
  sellerApproved: boolean
  title: string
  brand?: string | null
  /** The seller's own SKU — their store-scoped key, never the system
   * SKU code. Absent → the offer row carries an empty key. */
  sku?: string | null
  gtin?: string | null
  description?: string | null
  shortDescription?: string | null
  /** Dollars — commerce_prices.price and erp_product_skus.unit_price. */
  priceDollars?: number | null
  compareAtDollars?: number | null
  taxonomyNodeIds?: string[] | null
  categoryId?: number | null
  category?: string | null
  stock?: number
}

export type ProvisionSellerListingResult =
  | {
      conflict: string
    }
  | {
      catalogItemId: string
      /** The catalog item's SKU code (system-assigned once the item is
       * provisioned; the seller's own text while it is still bare). */
      sku: string
      slug: string
      erpProductId: string | null
      erpSkuId: string | null
      listingId: string
      createdItem: boolean
      /** True when the item carries the full main-shop linkage. */
      shopLinked: boolean
    }

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 120)
}

function randomSuffix(len: number): string {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase()
}

/** Upsert the item's price row on the tenant's active RETAIL list.
 * Used only where the enterprise writer does not run (a not-yet-
 * approved seller's priced create keeps its price row exactly as the
 * products route has always written it). commerce_prices is unique
 * per (catalog_item_id, price_list_id), so the write converges on one
 * row; the list is named because price_list_id is NOT NULL with no
 * default. Dollars, never cents. */
async function upsertRetailPrice(
  q: SellerQueryFn,
  tenantId: string,
  catalogItemId: string,
  priceDollars: number,
  compareAtDollars: number | null,
): Promise<void> {
  await q(
    `INSERT INTO public.commerce_prices
       (tenant_id, price_list_id, catalog_item_id, price, compare_at_price, valid_from)
     VALUES ($1,
             (SELECT id FROM public.commerce_price_lists
               WHERE tenant_id = $1 AND code = 'RETAIL' AND active = true LIMIT 1),
             $2::uuid, $3, $4, now())
     ON CONFLICT (catalog_item_id, price_list_id)
     DO UPDATE SET price = EXCLUDED.price,
                   compare_at_price = EXCLUDED.compare_at_price,
                   valid_from = now()`,
    [tenantId, catalogItemId, priceDollars, compareAtDollars],
  )
}

type CiRow = {
  id: string
  sku_id: string | null
  sku: string
  active: boolean
  ecommerce_enabled: boolean
  metadata: Record<string, unknown>
}

async function loadItem(q: SellerQueryFn, tenantId: string, itemId: string): Promise<CiRow | null> {
  const rows = await q(
    `SELECT id, sku_id, sku, active, ecommerce_enabled, metadata
       FROM public.commerce_catalog_items
      WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
    [tenantId, itemId],
  )
  const r = rows[0]
  if (!r) return null
  return {
    id: String(r.id),
    sku_id: r.sku_id ? String(r.sku_id) : null,
    sku: String(r.sku || ""),
    active: r.active === true,
    ecommerce_enabled: r.ecommerce_enabled === true,
    metadata: (r.metadata || {}) as Record<string, unknown>,
  }
}

/** The seller signature + born-live status on a writer-built item.
 * A metadata MERGE (jsonb ||), never a replace: the writer's own keys
 * (slug, product_id, sort_order) survive. Only the pending states move
 * to 'approved' — rejected/suppressed are platform decisions and are
 * left exactly as governance left them. */
async function stampSellerSignature(
  q: SellerQueryFn,
  args: {
    tenantId: string
    sellerId: string
    itemId: string
    sellerSku: string
    currentStatus: unknown
    taxonomyNodeIds?: string[] | null
  },
): Promise<void> {
  const stamp: Record<string, unknown> = { seller_id: args.sellerId }
  if (args.sellerSku) stamp.sku = args.sellerSku
  if (
    args.currentStatus == null ||
    args.currentStatus === "" ||
    args.currentStatus === "pending_review"
  ) {
    stamp.status = "approved"
  }
  if (args.taxonomyNodeIds?.length) stamp.taxonomy_node_ids = args.taxonomyNodeIds
  await q(
    `UPDATE public.commerce_catalog_items
        SET metadata = metadata || $3::jsonb, updated_at = now()
      WHERE tenant_id = $1 AND id = $2::uuid`,
    [args.tenantId, args.itemId, JSON.stringify(stamp)],
  )
}

/** The born-live flag set for an approved seller's item. `active` is
 * NOT touched: it is the seller's own retire switch (PATCH owns it). */
async function setShopFlags(q: SellerQueryFn, tenantId: string, itemId: string): Promise<void> {
  await q(
    `UPDATE public.commerce_catalog_items
        SET ecommerce_enabled = true, sellable = true, purchasable = true,
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2::uuid`,
    [tenantId, itemId],
  )
}

/** A slug no other shop-visible item carries. The partial unique index
 * (uq_cci_slug_sellable) is global — it has no tenant column — and only
 * bites on active + sellable + ecommerce_enabled rows, which is
 * exactly what the writer is about to create. */
async function uniqueShopSlug(
  q: SellerQueryFn,
  baseSlug: string,
  sellerId: string,
): Promise<string> {
  const taken = async (slug: string): Promise<boolean> => {
    const rows = await q(
      `SELECT 1 AS x FROM public.commerce_catalog_items
        WHERE metadata->>'slug' = $1 AND active = true AND sellable = true
          AND ecommerce_enabled = true LIMIT 1`,
      [slug],
    )
    return Boolean(rows[0])
  }
  if (!(await taken(baseSlug))) return baseSlug
  const sellerSlug = `${baseSlug}-${sellerId.replace(/-/g, "").slice(0, 6)}`
  if (!(await taken(sellerSlug))) return sellerSlug
  return `${sellerSlug}-${randomSuffix(4).toLowerCase()}`
}

/** Build the canonical product through the enterprise writer, then
 * attach the seller signature. The writer assigns the system SKU code
 * and ids, writes the RETAIL price in dollars, and enqueues the shop
 * sync — this function's only additions are the signature stamp and
 * the GTIN → barcode landing (the writer has no GTIN input; the
 * barcode column on its sku row is where GTIN lives). */
async function createViaWriter(
  q: SellerQueryFn,
  args: ProvisionSellerListingArgs & {
    sellerSku: string
    baseSlug: string
    priceDollars: number | null
    compareAtDollars: number | null
  },
): Promise<{ itemId: string; sku: string; slug: string; erpProductId: string; erpSkuId: string }> {
  const slug = await uniqueShopSlug(q, args.baseSlug, args.sellerId)
  const product = await createCatalogProduct({
    name: args.title.trim(),
    slug,
    description: args.description ?? undefined,
    shortDescription: args.shortDescription ?? undefined,
    brand: args.brand ?? undefined,
    price: args.priceDollars ?? 0,
    compareAtPrice: args.compareAtDollars,
    ecommerceEnabled: true,
    categoryId: args.categoryId ?? null,
    category: args.category ?? undefined,
  })
  if (!product) throw new Error("Catalog writer returned no product")
  await stampSellerSignature(q, {
    tenantId: args.tenantId,
    sellerId: args.sellerId,
    itemId: product.id,
    sellerSku: args.sellerSku,
    currentStatus: null,
    taxonomyNodeIds: args.taxonomyNodeIds,
  })
  if (args.gtin) {
    await q(
      `UPDATE public.erp_product_skus SET barcode = $2 WHERE id = $1::uuid`,
      [product.skuId, args.gtin],
    )
  }
  return {
    itemId: product.id,
    sku: product.sku,
    slug: product.slug,
    erpProductId: product.productId,
    erpSkuId: product.skuId,
  }
}

/**
 * Provision one seller listing end to end (see the file header for the
 * policy and the shapes). Sequential steps, so a retry after a partial
 * failure converges instead of duplicating.
 */
export async function provisionSellerListing(
  q: SellerQueryFn,
  args: ProvisionSellerListingArgs,
): Promise<ProvisionSellerListingResult> {
  const tenant = args.tenantId
  const sellerId = args.sellerId
  const title = args.title.trim()
  const sellerSku = (args.sku || "").trim()
  const baseSlug = slugify(title)
  const approved = args.sellerApproved
  const listingStatus = approved ? "approved" : "pending_review"
  const priceDollars =
    args.priceDollars != null && args.priceDollars > 0 ? args.priceDollars : null
  const compareAtDollars =
    args.compareAtDollars != null && args.compareAtDollars > 0
      ? args.compareAtDollars
      : null
  // The enterprise writer is tenant-fixed (DEFAULT_TENANT = TENANT_ID(),
  // the same source the seller routes resolve), so composition is
  // exact today; the guard keeps a future franchise-tenant divergence
  // from ever splitting a listing across tenants — such a tenant
  // falls back to the legacy bare-item shape until the writer itself
  // is tenant-parameterized.
  const writerTenantOk = tenant === TENANT_ID()

  // ---- Find the seller's existing item (idempotency anchors) ----
  let existing: CiRow | null = null
  if (sellerSku) {
    // (1) The governed offer row carries the seller's own SKU key.
    const offers = await q(
      `SELECT product_id FROM public.seller_listings
        WHERE tenant_id = $1 AND seller_id = $2::uuid AND sku = $3
        ORDER BY created_at ASC LIMIT 1`,
      [tenant, sellerId, sellerSku],
    )
    if (offers[0]) existing = await loadItem(q, tenant, String(offers[0].product_id))
    // (2) The signature stamp on the item itself.
    if (!existing) {
      const rows = await q(
        `SELECT id FROM public.commerce_catalog_items
          WHERE tenant_id = $1 AND metadata->>'seller_id' = $2
            AND metadata->>'sku' = $3
          ORDER BY created_at ASC LIMIT 1`,
        [tenant, sellerId, sellerSku],
      )
      if (rows[0]) existing = await loadItem(q, tenant, String(rows[0].id))
    }
    // (3) The SKU text naming ANOTHER listing's item is a conflict:
    // the seller matches that product and attaches an offer instead
    // of duplicating it (the Match Catalog path).
    if (!existing) {
      const rows = await q(
        `SELECT id, metadata FROM public.commerce_catalog_items
          WHERE tenant_id = $1 AND sku = $2 LIMIT 1`,
        [tenant, sellerSku],
      )
      if (rows[0]) {
        const meta = (rows[0].metadata || {}) as Record<string, unknown>
        if (String(meta.seller_id || "") !== String(sellerId)) {
          return {
            conflict:
              "That SKU already exists in the catalog under another listing — use Match Catalog to sell it as your own offer instead of creating a duplicate.",
          }
        }
        existing = await loadItem(q, tenant, String(rows[0].id))
      }
    }
  }
  if (!existing && !sellerSku) {
    // SKU-less re-run: the seller's own item under this slug.
    const rows = await q(
      `SELECT id FROM public.commerce_catalog_items
        WHERE tenant_id = $1 AND metadata->>'seller_id' = $2
          AND metadata->>'slug' = $3
        ORDER BY created_at ASC LIMIT 1`,
      [tenant, sellerId, baseSlug],
    )
    if (rows[0]) existing = await loadItem(q, tenant, String(rows[0].id))
  }

  // ---- Attach the governed offer + stock rows for an item ----
  // `frozen` = platform governance has decided against this item
  // (catalog metadata rejected/suppressed — IP complaint, safety
  // recall, policy): provisioning then touches nothing but the offer
  // row's existence, at a non-live status, and never flips it live.
  const attachOffer = async (
    itemId: string,
    offerSku: string,
    frozen = false,
  ): Promise<string> => {
    const listing = await ensureSellerListingRow(q, {
      tenantId: tenant,
      sellerId,
      productId: itemId,
      sku: offerSku,
      title,
      description: args.description ?? null,
      brand: args.brand ?? null,
      gtin: args.gtin ?? null,
      priceDollars,
      stock: args.stock ?? 0,
      status: frozen ? "pending_review" : listingStatus,
    })
    if (approved && !frozen) {
      // A governed listing still parked from before the policy (or
      // from the seller's pending era): the same one-way upgrade,
      // pending → live. Decided states are never downgraded.
      await q(
        `UPDATE public.seller_listings SET status = 'approved', updated_at = now()
          WHERE id = $1::uuid AND status = 'pending_review'`,
        [listing.listingId],
      )
    }
    await ensureSellerInventoryRow(q, {
      tenantId: tenant,
      sellerId,
      listingId: listing.listingId,
      sku: offerSku,
      initialAvailable: args.stock ?? 0,
    })
    return listing.listingId
  }

  // ================= UPDATE / LINK path =================
  if (existing) {
    let item = existing
    let createdItem = false
    const governanceFrozen =
      item.metadata.status === "rejected" || item.metadata.status === "suppressed"

    if (approved && !item.sku_id && writerTenantOk && !governanceFrozen) {
      // Born bare (the seller created it while pending, or before this
      // policy): the canonical product is built by the writer now,
      // the governed listing re-points at it, and the bare item is
      // retired as superseded — stamp removed, so the seller's own
      // reads and the storefront legs stop surfacing it, while the
      // record itself stays for audit. It was never shop-visible and
      // never orderable, so nothing downstream references it.
      const built = await createViaWriter(q, {
        ...args,
        sellerSku,
        baseSlug,
        priceDollars,
        compareAtDollars,
      })
      await q(
        `UPDATE public.seller_listings SET product_id = $3::uuid, updated_at = now()
          WHERE tenant_id = $1 AND seller_id = $2::uuid AND product_id = $4::uuid`,
        [tenant, sellerId, built.itemId, item.id],
      )
      await q(
        `UPDATE public.commerce_catalog_items
            SET active = false, ecommerce_enabled = false,
                metadata = (metadata - 'seller_id') || $3::jsonb,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [
          tenant,
          item.id,
          JSON.stringify({ status: "superseded", superseded_by: built.itemId }),
        ],
      )
      const fresh = await loadItem(q, tenant, built.itemId)
      if (fresh) item = fresh
      createdItem = true
      const listingId = await attachOffer(item.id, sellerSku)
      return {
        catalogItemId: item.id,
        sku: item.sku,
        slug: String(item.metadata.slug || baseSlug),
        erpProductId: built.erpProductId,
        erpSkuId: built.erpSkuId,
        listingId,
        createdItem,
        shopLinked: true,
      }
    }

    if (approved && item.sku_id && !governanceFrozen) {
      // Refresh through the writer's update path (name / description /
      // brand / price + the erp sku unit_price mirror), then the
      // seller-side completion the writer does not own: born-live
      // flags and the signature/status stamp. mergeMeta inside the
      // writer preserves the stamp; the stamp runs after regardless.
      if (writerTenantOk) {
        await updateCatalogProduct(item.id, {
          name: title,
          description: args.description ?? undefined,
          brand: args.brand ?? undefined,
          price: priceDollars ?? undefined,
          compareAtPrice: compareAtDollars,
        })
      } else if (priceDollars != null) {
        await upsertRetailPrice(q, tenant, item.id, priceDollars, compareAtDollars)
      }
      await setShopFlags(q, tenant, item.id)
      await stampSellerSignature(q, {
        tenantId: tenant,
        sellerId,
        itemId: item.id,
        sellerSku,
        currentStatus: item.metadata.status,
        taxonomyNodeIds: args.taxonomyNodeIds,
      })
      if (args.gtin) {
        await q(
          `UPDATE public.erp_product_skus SET barcode = $2 WHERE id = $1::uuid`,
          [item.sku_id, args.gtin],
        )
      }
    }

    const listingId = await attachOffer(item.id, sellerSku, governanceFrozen)
    let erpProductId: string | null = null
    if (item.sku_id) {
      const s = await q(
        `SELECT product_id FROM public.erp_product_skus WHERE id = $1::uuid LIMIT 1`,
        [item.sku_id],
      )
      erpProductId = s[0] ? String(s[0].product_id) : null
    }
    return {
      catalogItemId: item.id,
      sku: item.sku,
      slug: String(item.metadata.slug || baseSlug),
      erpProductId,
      erpSkuId: item.sku_id,
      listingId,
      createdItem: false,
      shopLinked: Boolean(item.sku_id) && (approved || item.ecommerce_enabled),
    }
  }

  // ================= CREATE path =================
  if (approved && writerTenantOk) {
    const built = await createViaWriter(q, {
      ...args,
      sellerSku,
      baseSlug,
      priceDollars,
      compareAtDollars,
    })
    const listingId = await attachOffer(built.itemId, sellerSku)
    return {
      catalogItemId: built.itemId,
      sku: built.sku,
      slug: built.slug,
      erpProductId: built.erpProductId,
      erpSkuId: built.erpSkuId,
      listingId,
      createdItem: true,
      shopLinked: true,
    }
  }

  // Not yet approved (or a tenant the writer does not serve): the
  // pre-policy shape exactly — a metadata-born item on the seller
  // storefront only, no ERP chain, no shop flags. The item's sku
  // column carries the seller's own text, or a generated unique code
  // when they gave none: (tenant_id, sku) is unique, so an empty code
  // would make every second SKU-less listing collide.
  const bareSku =
    sellerSku ||
    `${baseSlug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20)}-${randomSuffix(4)}`
  const rows = await q(
    `INSERT INTO public.commerce_catalog_items
       (tenant_id, sku, name, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      tenant,
      bareSku,
      title,
      JSON.stringify({
        slug: baseSlug,
        seller_id: sellerId,
        brand: args.brand || "",
        sku: sellerSku,
        description: args.description || "",
        status: "pending_review",
      }),
    ],
  )
  const itemId = String(rows[0].id)
  if (priceDollars != null) {
    await upsertRetailPrice(q, tenant, itemId, priceDollars, compareAtDollars)
  }
  const listingId = await attachOffer(itemId, sellerSku)
  return {
    catalogItemId: itemId,
    sku: bareSku,
    slug: baseSlug,
    erpProductId: null,
    erpSkuId: null,
    listingId,
    createdItem: true,
    shopLinked: false,
  }
}

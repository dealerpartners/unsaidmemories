// ---------------------------------------------------------------------------
// sellers/inventory-entrance.ts — THE seller_inventory entrance (tree §3).
//
// The break this closes: §3 is a closed loop with no entrance — the stock
// editor, the movement ledger, the low-stock derivation, and the overview
// counts all read/write seller_inventory, but NO code path anywhere
// created a seller_inventory row, so every store in the section was
// unpopulatable from the portal.
//
// How the readers resolve a row (followed exactly):
//   - seller_inventory.listing_id points at the seller's governed listing
//     record, seller_listings.id — the stock and low-stock pages join the
//     inventory rows to /api/seller/catalog's listings (seller_listings)
//     for title and SKU. A row keyed to anything else renders title-less.
//   - seller_inventory.sku carries the listing's SKU text; available
//     starts at the quantity the listing was created/imported with
//     (the import row's stock, else 0) and the stock editor's adjustment
//     POST is the designed path that changes it from there.
//
// Entrance points (listing creation): POST /api/seller/products (single
// listing), POST /api/seller/imports (both the canonical-match attach and
// the new-product create). Both helpers are check-then-insert — creating
// the same listing twice never duplicates the listing record or its
// inventory row. Callers failure-isolate them: a listing that was created
// must not fail to be reported because its inventory entrance hiccuped.
// ---------------------------------------------------------------------------

import type { SellerQueryFn } from "./attribution"

export type { SellerQueryFn }

/**
 * The seller's governed listing record for one of their catalog products
 * (seller_listings), created when absent. The editor-created listing
 * previously produced only a commerce_catalog_items row, so no
 * seller_listings record existed for the inventory row to join to — and
 * the listing never reached the review-queue/quality readers either,
 * which all read seller_listings.
 */
export async function ensureSellerListingRow(
  q: SellerQueryFn,
  args: {
    tenantId: string
    sellerId: string
    productId: string
    sku: string
    title: string
    description?: string | null
    brand?: string | null
    gtin?: string | null
    priceDollars?: number | null
    stock?: number
    status?: string
  },
): Promise<{ listingId: string; created: boolean }> {
  const found = await q(
    `SELECT id FROM public.seller_listings
      WHERE tenant_id = $1 AND seller_id = $2::uuid AND product_id = $3::uuid
      LIMIT 1`,
    [args.tenantId, args.sellerId, args.productId],
  )
  if (found[0]) return { listingId: String(found[0].id), created: false }

  const rows = await q(
    `INSERT INTO public.seller_listings
       (tenant_id, seller_id, product_id, sku, title, description, brand,
        gtin, price, stock, status)
     VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      args.tenantId,
      args.sellerId,
      args.productId,
      // seller_listings.sku is NOT NULL in the live schema — an empty
      // string for a SKU-less listing, never NULL.
      args.sku ?? "",
      args.title,
      args.description ?? null,
      args.brand || null,
      args.gtin || null,
      args.priceDollars ?? null,
      Math.max(0, Math.trunc(args.stock ?? 0)),
      args.status || "pending_review",
    ],
  )
  return { listingId: String(rows[0].id), created: true }
}

/**
 * The seller_inventory row for one listing, created when absent, at the
 * listing's initial available quantity.
 */
export async function ensureSellerInventoryRow(
  q: SellerQueryFn,
  args: {
    tenantId: string
    sellerId: string
    listingId: string
    sku: string
    initialAvailable?: number
  },
): Promise<{ created: boolean }> {
  const found = await q(
    `SELECT id FROM public.seller_inventory
      WHERE tenant_id = $1 AND seller_id = $2::uuid AND listing_id = $3::uuid
      LIMIT 1`,
    [args.tenantId, args.sellerId, args.listingId],
  )
  if (found[0]) return { created: false }

  await q(
    `INSERT INTO public.seller_inventory
       (tenant_id, seller_id, listing_id, sku, available, reserved)
     VALUES ($1, $2::uuid, $3::uuid, $4, $5, 0)`,
    [
      args.tenantId,
      args.sellerId,
      args.listingId,
      args.sku,
      Math.max(0, Math.trunc(args.initialAvailable ?? 0)),
    ],
  )
  return { created: true }
}

// ---------------------------------------------------------------------------
// sellers/public-bust.ts — the visibility contract for seller-side and
// admin-side writes (owner's product test: what a seller does must show
// up in the public store; what admin does must show up in the seller
// portal and on public pages).
//
// The public faces are ISR pages (daily revalidate) over 5-minute
// shared data caches. The enterprise catalog writers bust the page
// routes on every write (lib/enterprise/catalog.ts revalidateShopPaths)
// — that is the platform's freshness contract. Seller-side writes
// (listing retire/price/edit, stock, media, shop page) and admin seller
// decisions historically wrote the database and busted NOTHING, so a
// seller's own change stayed invisible on their own shop page for up
// to a day. Every such write now ends with this bust: the same path
// set the enterprise writers use, so a seller's action and an admin's
// action have the same public latency as a catalog edit.
//
// Best-effort by construction (revalidatePath during build or outside
// a request scope throws; the write already landed and the caches'
// own TTLs remain the backstop — the same floor live.ts documents).
// ---------------------------------------------------------------------------

import { revalidatePath, revalidateTag } from "next/cache"
import { invalidate } from "@/lib/cache"

export function bustPublicShopFaces(): void {
  try {
    revalidatePath("/shop", "page")
    revalidatePath("/shop/[...slug]", "page")
    revalidateTag("catalog", { expire: 0 })
    revalidatePath("/product/[id]", "page")
    revalidatePath("/seller/[slug]", "page")
    revalidatePath("/", "page")
  } catch {
    /* non-fatal — the shared caches expire on their own TTLs */
  }
}

/**
 * Product-write bust: the PDP's data loader (lib/shop/pdp) parks each
 * product in the process TTL cache (lib/cache, key `pdp:<slug>`, SWR)
 * UNDER the ISR page. revalidatePath alone purges the page, but the
 * regeneration then re-reads the loader's still-fresh entry and bakes
 * the OLD price into a new 24h ISR page — a seller's price edit stayed
 * invisible for a day (live-proven 2026-10-24: price 24.99 → 19.99 in
 * commerce_prices, PDP served 24.99 through two busts). A product write
 * must drop the loader entry FIRST, then bust the faces, so the
 * regeneration reads the database. Pass the product's slug for a
 * targeted drop; omit it (bulk repricing) to drop every PDP entry.
 */
export function bustProductFaces(slug?: string | null): void {
  try {
    invalidate(slug ? `pdp:${slug.toLowerCase()}` : "pdp:")
  } catch {
    /* non-fatal — the loader cache expires on its own TTL */
  }
  bustPublicShopFaces()
}

/** One seller's shop faces, by slug — the targeted form for writes
 * that concern a single shop (live flips, shop-page edits). */
export function bustSellerShopFaceBySlug(slug: string | null | undefined): void {
  if (!slug) return
  try {
    revalidatePath(`/seller/${slug}`, "page")
    revalidatePath(`/seller/${slug}/live`, "page")
  } catch {
    /* non-fatal */
  }
}

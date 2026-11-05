import "server-only"

// ---------------------------------------------------------------------------
// sellers/sold-by.ts — bulk "Sold by" resolution for product surfaces.
//
// The PDP door (lib/sellers/storefront.ts loadProductSellers) resolves ONE
// product's attributable sellers. Every grid, rail, search result and
// collection on the shop renders DOZENS of cards per page, so this module
// resolves a whole page of catalog items in ONE query — the exact same two
// attribution legs, run in reverse from the item set:
//
//   A. seller_listings — an APPROVED, non-suppressed governed offer on
//      the catalog item, from an APPROVED seller with a storefront slug.
//   B. the seller's own catalog item — commerce_catalog_items carrying
//      metadata->>'seller_id' for an APPROVED seller, the item active and
//      not withdrawn (metadata status rejected/suppressed).
//
// An item with no attributable seller is platform stock — the platform is
// the dropshipper for the house catalog — and renders "Sold by Portal Shop"
// (soldByAttribution's house default). Items absent from the returned map
// are house items; callers stamp `map.get(id) ?? soldByAttribution([])`.
//
// Fail-soft like the PDP door: a failed read returns an empty map (every
// item falls back to the house line) and never breaks a page render.
// ---------------------------------------------------------------------------

import { pgQuery } from "@/lib/pg"
import { TENANT_ID } from "@/lib/crm/enterprise"
import {
  soldByAttribution,
  type SoldByAttribution,
} from "@/lib/shop/types"

const SOLD_BY_SQL = `
  SELECT item_id, display_name, slug FROM (
    SELECT sl.product_id::text AS item_id, s.display_name AS display_name, s.slug AS slug
      FROM public.seller_listings sl
      JOIN public.sellers s ON s.id = sl.seller_id
     WHERE sl.tenant_id = $2 AND sl.product_id = ANY($1::uuid[])
       AND sl.status = 'approved'
       AND COALESCE(sl.suppression_reason, '') = ''
       AND s.tenant_id = $2 AND s.status = 'approved'
       AND COALESCE(s.slug, '') <> ''
    UNION
    SELECT ci.id::text AS item_id, s.display_name AS display_name, s.slug AS slug
      FROM public.commerce_catalog_items ci
      JOIN public.sellers s ON s.id::text = ci.metadata->>'seller_id'
     WHERE ci.id = ANY($1::uuid[]) AND ci.tenant_id = $2
       AND ci.active = true
       AND COALESCE(ci.metadata->>'status', '') NOT IN ('rejected', 'suppressed')
       AND s.tenant_id = $2 AND s.status = 'approved'
       AND COALESCE(s.slug, '') <> ''
  ) attributed
  ORDER BY item_id ASC, display_name ASC
`

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** "Sold by" attribution for a set of catalog items, keyed by item id.
 *  Only seller-sold items appear in the map — absence means the house
 *  shop (Portal Shop) sells the item. */
export async function loadSoldByForItems(
  itemIds: string[],
): Promise<Map<string, SoldByAttribution>> {
  const out = new Map<string, SoldByAttribution>()
  const ids = [...new Set(itemIds.filter((id) => id && UUID_RE.test(id)))]
  if (ids.length === 0) return out
  try {
    const rows = await pgQuery<{ item_id: string; display_name: string; slug: string }>(
      SOLD_BY_SQL,
      [ids, TENANT_ID()],
    )
    const byItem = new Map<string, { displayName: string; slug: string }[]>()
    for (const r of rows) {
      const list = byItem.get(r.item_id) ?? []
      list.push({ displayName: String(r.display_name ?? r.slug), slug: String(r.slug) })
      byItem.set(r.item_id, list)
    }
    for (const [itemId, sellers] of byItem) {
      out.set(itemId, soldByAttribution(sellers))
    }
  } catch (err) {
    console.error("[sold-by] loadSoldByForItems failed:", err)
  }
  return out
}

/** The house shop's storefront slug — the approved first-party seller in
 *  the site tenant. soldByAttribution deliberately leaves the house
 *  line unlinked on cards and grids (the platform is the seller of
 *  record there), but the PDP's seller door routes EVERY product to a
 *  shop: an attributed seller's own /seller/[slug], or the house shop
 *  for platform stock. Fail-soft: null leaves the PDP door unlinked. */
export async function loadHouseShopSlug(): Promise<string | null> {
  try {
    const rows = await pgQuery<{ slug: string }>(
      `SELECT slug FROM public.sellers
        WHERE tenant_id = $1 AND seller_type = 'first_party'
          AND status = 'approved' AND COALESCE(slug, '') <> ''
        ORDER BY created_at ASC
        LIMIT 1`,
      [TENANT_ID()],
    )
    return rows[0]?.slug ? String(rows[0].slug) : null
  } catch (err) {
    console.error("[sold-by] loadHouseShopSlug failed:", err)
    return null
  }
}

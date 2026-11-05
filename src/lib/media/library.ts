// ---------------------------------------------------------------------------
// BL-13 · Media — the shared media library chain (one library, both portals).
//
// Before this module the platform had two media stores with NO shared
// chain (census G1): the admin media library browsed raw objects in the
// cms-media storage bucket (/api/admin/media), while seller media lived
// as records in seller_listing_media (governed — the moderation chain
// runs on it) and commerce_product_media (storefront — what shoppers
// see). This accessor is the ONE library chain: every media-library
// surface reads through it and sees the same records —
//   - governed records  (seller_listing_media): listing media under
//     moderation, joined to their listing + seller;
//   - storefront records (commerce_product_media): catalog media,
//     joined to their catalog item + seller.
// The cms-media bucket remains what it physically is — blob storage
// both portals' uploads land in; the URLs the records hold point there.
// The admin library face (/admin/media) renders this chain's records
// beside the bucket browser, and the seller catalog media surface reads
// this same accessor scoped to the signed-in seller.
//
// Physical one-table merge is the named schema step for the coordinator
// (moderation columns exist only on the governed store; the governed
// store's listing_id is NOT NULL, so instore/dropship catalog media
// cannot live there) — until that step lands, this chain is the single
// library both portals share.
// ---------------------------------------------------------------------------

import type { PgClient } from "@/lib/crm/enterprise";

export interface LibraryMediaRow {
  id: string;
  store: "commerce" | "governed";
  product_id: string | null;
  listing_id: string | null;
  listing_title: string | null;
  seller_name: string | null;
  media_type: string;
  url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  moderation_status: string | null;
  created_at: string | null;
}

export interface LibraryMediaOptions {
  /** Scope to one seller (the seller portal's own library). */
  sellerId?: string;
  /** Substring match on listing title / seller name / URL. */
  q?: string;
  limit?: number;
}

export async function listLibraryMedia(
  c: PgClient,
  tenant: string,
  opts: LibraryMediaOptions = {},
): Promise<LibraryMediaRow[]> {
  const sellerId = opts.sellerId ?? null;
  const q = opts.q?.trim() ? `%${opts.q.trim()}%` : null;
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 2000);

  const [commerce, governed] = await Promise.all([
    c.query(
      `SELECT m.id::text AS id, 'commerce' AS store,
              m.catalog_item_id::text AS product_id, NULL::text AS listing_id,
              ci.name AS listing_title,
              s.display_name AS seller_name,
              m.media_type, m.url, m.alt_text, m.sort_order, m.is_primary,
              NULL::text AS moderation_status, m.created_at::text AS created_at
         FROM public.commerce_product_media m
         JOIN public.commerce_catalog_items ci
           ON ci.id = m.catalog_item_id AND ci.tenant_id = m.tenant_id
         LEFT JOIN public.sellers s
           ON s.id::text = ci.metadata->>'seller_id' AND s.tenant_id = m.tenant_id
        WHERE m.tenant_id = $1
          AND ($2::text IS NULL OR ci.metadata->>'seller_id' = $2)
          AND ($3::text IS NULL OR ci.name ILIKE $3 OR m.url ILIKE $3 OR s.display_name ILIKE $3)
        ORDER BY ci.name ASC, m.sort_order ASC
        LIMIT $4`,
      [tenant, sellerId, q, limit],
    ),
    c.query(
      `SELECT m.id::text AS id, 'governed' AS store,
              sl.product_id::text AS product_id, m.listing_id::text AS listing_id,
              sl.title AS listing_title,
              s.display_name AS seller_name,
              'image' AS media_type, m.url, m.alt_text, m.sort_order, m.is_primary,
              m.moderation_status, m.created_at::text AS created_at
         FROM public.seller_listing_media m
         JOIN public.seller_listings sl
           ON sl.id = m.listing_id AND sl.tenant_id = m.tenant_id
         LEFT JOIN public.sellers s
           ON s.id = sl.seller_id AND s.tenant_id = m.tenant_id
        WHERE m.tenant_id = $1
          AND ($2::text IS NULL OR sl.seller_id = $2::uuid)
          AND ($3::text IS NULL OR sl.title ILIKE $3 OR m.url ILIKE $3 OR s.display_name ILIKE $3)
        ORDER BY sl.title ASC, m.sort_order ASC
        LIMIT $4`,
      [tenant, sellerId, q, limit],
    ),
  ]);

  const rows = [...commerce.rows, ...governed.rows] as unknown as LibraryMediaRow[];
  return rows.sort((a, b) =>
    (a.listing_title ?? "").localeCompare(b.listing_title ?? "") || a.sort_order - b.sort_order,
  );
}

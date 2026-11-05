// ---------------------------------------------------------------------------
// sellers/brand-registry.ts — the PREFILLED brand registry (owner ruling
// 2026-10-22; migration 20261161): the platform's listing-time gate for
// brands whose own policies restrict marketplace sales.
//
// Two tiers, seeded from the brand-policy research (each row carries
// its evidence in gated_brands.evidence_note):
//   hard_ban        — the brand's dealer terms bar marketplace sales
//                     (Birkenstock, Patagonia, Petmate incl. Chuckit!,
//                     JW Pet, Aspen Pet). Listing is blocked outright.
//                     No ticket, no appeal path in the flow.
//   authorized_only — the brand sells through authorized sellers only
//                     (Nike, Hill's, Royal Canin, Chanel, Apple). A
//                     seller without a VERIFIED authorization on file
//                     gets the listing saved as a held draft; the
//                     portal asks for proof — a commercial invoice from
//                     the brand or an authorized distributor dated
//                     within 180 days, or a letter of authorization
//                     from the brand/rights owner. Purchase orders are
//                     NOT accepted proof (Amazon expressly rejects
//                     them; no marketplace program accepts them).
//
// This layer sits BESIDE lib/sellers/brand-gate.ts, not inside it: the
// registry gate there governs brands the platform has registered for
// authorization management (public.brands); this one governs the
// prefilled policy registry (public.gated_brands), matched by
// normalized brand NAME (punctuation-insensitive, so "Chuckit" matches
// the registered "Chuckit!"). Listing writers consult this layer
// FIRST: a hard ban refuses before anything is written; an
// authorized-only hold is stamped on the governed listing row as
// seller_listings.suppression_reason = 'brand_hold:<Brand>' with the
// listing parked at 'pending_review' — the same non-live posture the
// writers already use, so no public reader can ever serve a held
// listing. Verification at the admin desk (api/admin/sellers/
// verification, decide_brand) releases the holds by re-running the
// listing provisioning with the seller approved — the writers' own
// one-way upgrade — and clearing the marker.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

import { brandGate } from "./brand-gate";
import { provisionSellerListing } from "./listing-provision";
import type { SellerQueryFn } from "./attribution";

export type GatedTier = "hard_ban" | "authorized_only";

export interface GatedBrand {
  id: string;
  brand: string;
  tier: GatedTier;
  evidenceNote: string;
}

/** The match rule: lowercase, strip everything that isn't a letter or
 *  digit. Mirrors the match_key values seeded by migration 20261161. */
export function normalizeBrandKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const BRAND_HOLD_PREFIX = "brand_hold:";

export function brandHoldMarker(brandName: string): string {
  return `${BRAND_HOLD_PREFIX}${brandName}`;
}

/** The prefilled-registry row for a brand name, or null when the brand
 *  is not gated. Inactive rows do not gate. */
export async function prefilledBrandGate(
  c: any,
  brandName: string | null | undefined,
): Promise<GatedBrand | null> {
  const name = String(brandName || "").trim();
  if (!name) return null;
  const key = normalizeBrandKey(name);
  if (!key) return null;
  const r = await c.query(
    `SELECT id::text AS id, brand, tier, evidence_note
       FROM public.gated_brands
      WHERE match_key = $1 AND active = true
      LIMIT 1`,
    [key],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    brand: row.brand,
    tier: row.tier as GatedTier,
    evidenceNote: row.evidence_note,
  };
}

/** Every active gated brand (the portal's gate panel reads this). */
export async function listGatedBrands(c: any): Promise<GatedBrand[]> {
  const r = await c.query(
    `SELECT id::text AS id, brand, tier, evidence_note
       FROM public.gated_brands
      WHERE active = true
      ORDER BY tier DESC, brand ASC`,
  );
  return (r.rows as any[]).map((row) => ({
    id: row.id,
    brand: row.brand,
    tier: row.tier as GatedTier,
    evidenceNote: row.evidence_note,
  }));
}

/** True when the seller holds a verified (approved, in-window)
 *  authorization for the brand in the platform registry — the same
 *  verdict lib/sellers/brand-gate.ts computes. */
export async function sellerHasVerifiedBrandAuthorization(
  c: any,
  tenant: string,
  sellerId: string,
  brandName: string,
): Promise<boolean> {
  const gate = await brandGate(c, tenant, sellerId, brandName);
  return gate.authorizationStatus === "approved";
}

/** Stamp the brand hold on a governed listing row (the create paths
 *  call this right after the held listing is written). */
export async function markListingBrandHeld(
  c: any,
  tenant: string,
  sellerId: string,
  listingId: string,
  brandName: string,
): Promise<void> {
  await c.query(
    `UPDATE public.seller_listings
        SET status = 'pending_review', suppression_reason = $4, updated_at = now()
      WHERE tenant_id = $1 AND seller_id = $2::uuid AND id = $3::uuid`,
    [tenant, sellerId, listingId, brandHoldMarker(brandName)],
  );
}

/** The seller's currently held listings (portal prompt + release). */
export async function heldBrandListings(
  c: any,
  tenant: string,
  sellerId: string,
  brandName?: string,
): Promise<Array<Record<string, any>>> {
  const params: unknown[] = [tenant, sellerId];
  let brandClause = "";
  if (brandName) {
    params.push(brandName);
    brandClause = `AND lower(brand) = lower($${params.length})`;
  }
  const r = await c.query(
    `SELECT id::text AS id, product_id::text AS product_id, sku, title, brand,
            price, status, suppression_reason, created_at
       FROM public.seller_listings
      WHERE tenant_id = $1 AND seller_id = $2::uuid
        AND suppression_reason LIKE 'brand_hold:%'
        ${brandClause}
      ORDER BY created_at ASC`,
    params,
  );
  return r.rows as Array<Record<string, any>>;
}

/** Release a seller's held listings for one brand after the desk
 *  verifies the authorization: each held listing is re-provisioned
 *  through the writers' own publish path (sellerApproved — the one-way
 *  upgrade that builds the canonical item and flips the listing live),
 *  then the hold marker clears. Listings the writer refuses (a SKU
 *  conflict) stay held and are counted as skipped. */
export async function releaseHeldBrandListings(
  c: any,
  tenant: string,
  sellerId: string,
  brandName: string,
): Promise<{ released: number; skipped: number }> {
  const held = await heldBrandListings(c, tenant, sellerId, brandName);
  let released = 0;
  let skipped = 0;
  const q: SellerQueryFn = async (sql, params) =>
    (await c.query(sql, params as unknown[])).rows as Record<string, unknown>[];
  for (const row of held) {
    const out = await provisionSellerListing(q, {
      tenantId: tenant,
      sellerId,
      sellerApproved: true,
      title: String(row.title || ""),
      brand: (row.brand as string) || null,
      sku: (row.sku as string) || null,
      priceDollars: row.price != null ? Number(row.price) : null,
      stock: 0,
    }).catch(() => ({ conflict: "provisioning failed" }) as { conflict: string });
    if ("conflict" in out) {
      skipped += 1;
      continue;
    }
    await c.query(
      `UPDATE public.seller_listings
          SET suppression_reason = NULL, updated_at = now()
        WHERE tenant_id = $1 AND seller_id = $2::uuid AND id = $3::uuid
          AND suppression_reason LIKE 'brand_hold:%'`,
      [tenant, sellerId, row.id],
    );
    released += 1;
  }
  return { released, skipped };
}

/** Plain-language refusal for a hard-ban brand (functional copy — the
 *  brand's policy is the reason, stated once). */
export function hardBanMessage(brandName: string): string {
  return `"${brandName}" can't be sold on UnSaid Memories. The brand's own policy does not allow its products to be sold on marketplaces like this one, so listings under this brand are blocked.`;
}

/** Plain-language hold notice for an authorized-only brand. */
export function brandHoldMessage(brandName: string): string {
  return `"${brandName}" sells through authorized sellers only. Your listing has been saved as a draft on hold — submit proof of authorization (a commercial invoice from the brand or an authorized distributor dated within the last 180 days, or a letter of authorization from the brand) under Brands → Authorizations, and the listing releases once the platform verifies it. You can keep selling everything else meanwhile.`;
}

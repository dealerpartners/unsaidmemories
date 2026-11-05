import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/placements — Ads v2 placement catalog: the rows of
 * ad_placements (post-20261165 these are the only placements; the
 * legacy uuid table is ad_legacy_placements) with the going CPM
 * from the ACTIVE rate card (cheapest tier price per placement —
 * the wizard's GET /api/ads/inventory carries the full per-tier
 * matrix). `key` is the placement code, the field every portal
 * consumer has always read. shop_grid_top is retired by ruling and
 * is not a v2 placement, so it can never appear here.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const placements = await pgQueryStrict(
      `SELECT p.id::text AS id, p.code AS key, p.name, p.description,
              p.max_per_page, p.active,
              (SELECT MIN(i.cpm_cents)::int
                 FROM public.ad_rate_cards rc
                 JOIN public.ad_rate_card_items i ON i.rate_card_id = rc.id
                WHERE rc.active AND i.placement_id = p.id) AS cpm_cents
         FROM public.ad_placements p
        ORDER BY p.code`,
    );
    return NextResponse.json({ placements });
  } catch {
    return NextResponse.json({ error: "placements_unavailable" }, { status: 503 });
  }
}

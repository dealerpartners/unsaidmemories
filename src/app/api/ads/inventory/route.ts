import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/inventory — what an advertiser can buy, from the Ads
 * v2 tables only: the delivery tiers (ad_tiers), the placements
 * (ad_placements), and the ACTIVE rate card's price for every
 * tier x placement (ad_rate_card_items). The create wizard renders
 * its tier cards, placement checkboxes, and rate-card estimate from
 * this one read. Prices shown here are the prices launch snapshots.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const [tiers, placements, items, card] = await Promise.all([
      pgQueryStrict(
        `SELECT code, name, priority, max_ads_per_page, frequency_cap_daily
           FROM public.ad_tiers WHERE active = true ORDER BY priority ASC`,
      ),
      pgQueryStrict(
        `SELECT id, code, name, max_per_page FROM public.ad_placements
          WHERE active = true ORDER BY code`,
      ),
      pgQueryStrict<{
        placement_id: number;
        tier_code: string;
        cpm_cents: number;
      }>(
        `SELECT i.placement_id, t.code AS tier_code, i.cpm_cents
           FROM public.ad_rate_card_items i
           JOIN public.ad_rate_cards rc
             ON rc.id = i.rate_card_id AND rc.active = true
           JOIN public.ad_tiers t ON t.id = i.tier_id
          WHERE i.active = true`,
      ),
      pgQueryStrict<{ id: number; name: string }>(
        `SELECT id, name FROM public.ad_rate_cards
          WHERE active = true ORDER BY id ASC LIMIT 1`,
      ),
    ]);
    const ratesByPlacement = new Map<number, Record<string, number>>();
    for (const it of items) {
      const m = ratesByPlacement.get(it.placement_id) ?? {};
      m[it.tier_code] = it.cpm_cents;
      ratesByPlacement.set(it.placement_id, m);
    }
    return NextResponse.json({
      rate_card: card[0] ?? null,
      tiers,
      placements: (
        placements as { id: number; code: string; name: string; max_per_page: number }[]
      ).map((p) => ({
        code: p.code,
        name: p.name,
        max_per_page: p.max_per_page,
        rates: ratesByPlacement.get(p.id) ?? {},
      })),
    });
  } catch {
    return NextResponse.json({ error: "inventory_unavailable" }, { status: 503 });
  }
}

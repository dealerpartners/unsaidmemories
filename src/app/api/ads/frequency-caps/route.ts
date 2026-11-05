import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { getAdvertiserForUser } from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/frequency-caps — frequency capping (Y14/U16) on the
 * Ads v2 model. There is no per-campaign cap store in v2: the cap
 * is a property of the campaign's DELIVERY TIER (ad_tiers
 * .frequency_cap_daily — "automatically determined by tier"), and
 * serve enforces exactly that number per viewer per day, tracked
 * in ad_frequency. This route is the read model: one row per
 * caller campaign carrying its tier's cap, in the shape the portal
 * has always rendered. Changing a cap means changing tiers (the
 * admin console owns tier definitions; the campaign edit page owns
 * a campaign's tier) — there is deliberately no write here, because
 * a per-campaign write would be a number serve never reads.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const advertiser = await getAdvertiserForUser(user.id);
    if (!advertiser) return NextResponse.json({ caps: [] });
    const caps = await pgQueryStrict(
      `SELECT c.id::text AS id, c.id::text AS campaign_id,
              c.name AS campaign_name, c.status AS campaign_status,
              'tier' AS scope,
              t.frequency_cap_daily AS max_impressions,
              24 AS window_hours,
              t.code AS tier_code
         FROM public.ad_campaigns c
         JOIN public.ad_tiers t ON t.id = c.tier_id
        WHERE c.advertiser_id = $1
        ORDER BY c.created_at DESC
        LIMIT 200`,
      [advertiser.id],
    );
    return NextResponse.json({ caps });
  } catch {
    return NextResponse.json({ error: "caps_unavailable" }, { status: 503 });
  }
}

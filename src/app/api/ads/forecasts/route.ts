import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/forecasts — the inventory forecasting engine surface
 * (U19 + the inventory leg of Y13) on the Ads v2 tables. One entry
 * per active v2 placement: the next 14 days of projected vs booked
 * impressions plus the placement's live rate. Forecast rows in
 * ad_inventory_forecasts (a retained table) are keyed by the LEGACY
 * placement uuid, so they join through ad_legacy_placements to the
 * v2 placement code — forecasts written against the old inventory
 * stay attached to the same surface. The CPM is the cheapest paid
 * tier price on the active rate card; house is never priced. A
 * placement with no forecast rows reports has_forecast=false and
 * zeros — the engine has not projected it yet; nothing is invented.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const rows = await pgQueryStrict(
      `SELECT p.id::text AS placement_id, p.code AS key, p.name,
              COALESCE((SELECT MIN(i.cpm_cents)
                          FROM public.ad_rate_cards rc
                          JOIN public.ad_rate_card_items i
                            ON i.rate_card_id = rc.id
                          JOIN public.ad_tiers t ON t.id = i.tier_id
                         WHERE rc.active AND i.placement_id = p.id
                           AND t.code <> 'house'), 0) AS cpm_cents,
              COALESCE(f.projected, 0)::float AS projected,
              COALESCE(f.booked, 0)::float AS booked,
              COALESCE(f.days, 0)::int AS forecast_days
         FROM public.ad_placements p
         LEFT JOIN (
           SELECT lp.key AS code,
                  sum(f.projected_impressions) AS projected,
                  sum(f.booked_impressions) AS booked,
                  count(*) AS days
             FROM public.ad_inventory_forecasts f
             JOIN public.ad_legacy_placements lp ON lp.id = f.placement_id
            WHERE f.date >= CURRENT_DATE AND f.date < CURRENT_DATE + 14
            GROUP BY lp.key
         ) f ON f.code = p.code
        WHERE p.active = true
        ORDER BY p.code`,
    );
    const placements = rows.map((r) => ({
      placement_id: r.placement_id,
      key: r.key,
      name: r.name,
      cpm_cents: Number(r.cpm_cents),
      projected: Number(r.projected),
      booked: Number(r.booked),
      available: Math.max(0, Number(r.projected) - Number(r.booked)),
      has_forecast: Number(r.forecast_days) > 0,
    }));
    return NextResponse.json({
      placements,
      totals: {
        projected: placements.reduce((a, p) => a + p.projected, 0),
        booked: placements.reduce((a, p) => a + p.booked, 0),
        available: placements.reduce((a, p) => a + p.available, 0),
      },
    });
  } catch {
    return NextResponse.json({ error: "forecasts_unavailable" }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { getAdvertiserForUser } from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * POST /api/ads/estimates — estimated results + delivery likelihood
 * (Y9/Y10). Every input is a live Ads v2 table: the ACTIVE rate
 * card (ad_rate_card_items, priced at the caller's delivery tier
 * when they have one) prices the selected placements,
 * ad_inventory_forecasts booked-vs-projected sets how much
 * inventory is already committed (its rows key the legacy placement
 * uuids, joined through ad_legacy_placements to the v2 codes),
 * competing active campaigns share what remains, and click/lead
 * rates come from the caller's own v2 delivery history
 * (ad_campaign_daily + ad_leads; platform defaults only when the
 * advertiser has no history yet, labeled in the response as
 * `basis`). An estimate recommends; it never allocates.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const budget = Number(body.budget);
  const days = Math.max(1, Math.min(92, Number(body.days) || 7));
  const keys = Array.isArray(body.placement_keys)
    ? body.placement_keys.map((k) => String(k)).filter(Boolean)
    : [];
  if (!Number.isFinite(budget) || budget <= 0)
    return NextResponse.json({ error: "budget_required" }, { status: 400 });
  if (keys.length === 0)
    return NextResponse.json({ error: "placement_keys_required" }, { status: 400 });
  try {
    const advertiser = await getAdvertiserForUser(user.id);
    const [rates, forecasts, history, competing] = await Promise.all([
      pgQueryStrict<{ code: string; cpm_cents: number }>(
        `SELECT p.code, MIN(i.cpm_cents)::int AS cpm_cents
           FROM public.ad_rate_cards rc
           JOIN public.ad_rate_card_items i ON i.rate_card_id = rc.id
           JOIN public.ad_placements p ON p.id = i.placement_id
           JOIN public.ad_tiers t ON t.id = i.tier_id
          WHERE rc.active AND p.code = ANY($1) AND t.code <> 'house'
          GROUP BY p.code`,
        [keys],
      ),
      pgQueryStrict<{ projected: number; booked: number }>(
        `SELECT COALESCE(sum(f.projected_impressions), 0)::float AS projected,
                COALESCE(sum(f.booked_impressions), 0)::float AS booked
           FROM public.ad_inventory_forecasts f
           JOIN public.ad_legacy_placements lp ON lp.id = f.placement_id
          WHERE lp.key = ANY($1) AND f.date >= CURRENT_DATE AND f.date < CURRENT_DATE + $2::int`,
        [keys, days],
      ),
      advertiser
        ? pgQueryStrict<{ impressions: number; clicks: number; conversions: number }>(
            `SELECT COALESCE(sum(d.impressions), 0)::float AS impressions,
                    COALESCE(sum(d.clicks), 0)::float AS clicks,
                    (SELECT count(*) FROM public.ad_leads l
                      WHERE l.campaign_v2_id IN
                        (SELECT id FROM public.ad_campaigns
                          WHERE advertiser_id = $1))::float AS conversions
               FROM public.ad_campaign_daily d
               JOIN public.ad_campaigns c ON c.id = d.campaign_id
              WHERE c.advertiser_id = $1`,
            [advertiser.id],
          )
        : Promise.resolve(
            [] as Array<{ impressions: number; clicks: number; conversions: number }>,
          ),
      pgQueryStrict<{ n: number }>(
        `SELECT count(DISTINCT c.id)::int AS n
           FROM public.ad_campaigns c
          WHERE c.status = 'active'
            AND (c.starts_at IS NULL OR c.starts_at <= now())
            AND (c.ends_at IS NULL OR c.ends_at >= now())`,
      ),
    ]);
    const rateMap = new Map(rates.map((r) => [r.code, Number(r.cpm_cents)]));
    const cpms = keys
      .map((k) => rateMap.get(k))
      .filter((c): c is number => c != null && c > 0);
    const avgCpmCents = cpms.length ? cpms.reduce((a, b) => a + b, 0) / cpms.length : 0;

    const rawImpressions = avgCpmCents > 0 ? (budget * 100 * 1000) / avgCpmCents : 0;
    const projected = Number(forecasts[0]?.projected ?? 0);
    const booked = Number(forecasts[0]?.booked ?? 0);
    const competitors = Number(competing[0]?.n ?? 0);

    let likelihood: number;
    let basis: string;
    if (projected > 0) {
      const freeShare = Math.max(0, Math.min(1, (projected - booked) / projected));
      likelihood = Math.round(15 + freeShare * 80);
      basis = "inventory_forecasts";
    } else {
      // No forecast rows yet: likelihood degrades with the number of
      // campaigns already competing for the same open inventory.
      likelihood = Math.max(30, 90 - competitors * 8);
      basis = "open_inventory_competition";
    }
    const capped = projected > 0 ? Math.min(rawImpressions, Math.max(0, projected - booked)) : rawImpressions;

    const h = history[0];
    const hasHistory = h && Number(h.impressions) > 0;
    const ctr = hasHistory ? Number(h.clicks) / Number(h.impressions) : 0.01;
    const convRate = hasHistory && Number(h.clicks) > 0 ? Number(h.conversions) / Number(h.clicks) : 0.02;

    const mid = Math.round(capped);
    return NextResponse.json({
      estimate: {
        impressions: { low: Math.round(mid * 0.75), mid, high: Math.round(mid * 1.25) },
        clicks: Math.round(mid * ctr),
        conversions: Math.round(mid * ctr * convRate),
        avg_cpm_cents: avgCpmCents,
        ctr_used: ctr,
        delivery_likelihood: likelihood,
        basis,
        rates_basis: hasHistory ? "advertiser_history" : "platform_defaults",
        competing_campaigns: competitors,
        forecast: projected > 0 ? { projected, booked } : null,
      },
    });
  } catch {
    return NextResponse.json({ error: "estimates_unavailable" }, { status: 503 });
  }
}

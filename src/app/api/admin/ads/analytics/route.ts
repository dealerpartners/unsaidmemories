import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads/analytics — the W9 platform-wide performance read
 * over the v2 subsystem. Combines:
 *   - ad_campaign_daily: spend, impressions, clicks by day (the accrual
 *     counter serve updates), rolled here into a day series + totals;
 *   - ad_events: raw impression/click counts for the same window (the
 *     ledger the event beacon writes), as a cross-check pair;
 *   - top campaigns by lifetime spend (ad_campaigns.lifetime_spend_cents
 *     joined to advertiser + tier);
 *   - top placements by served impressions (ad_events grouped by
 *     placement_id → ad_placements.code).
 * Filters: ?from=, ?to= (ISO dates; default last 30 days). Admin only.
 */
function parseDate(v: string | null, fallback: Date): Date {
  if (!v) return fallback;
  const d = new Date(v);
  return isNaN(d.getTime()) ? fallback : d;
}

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const now = new Date();
  const from = parseDate(url.searchParams.get("from"), new Date(Date.now() - 30 * 86400000));
  const to = parseDate(url.searchParams.get("to"), now);
  if (to <= from) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  try {
    const [daily, totals, eventCounts, topCampaigns, topPlacements, spendByTier] =
      await Promise.all([
        // Day series from the delivery counter.
        pgQueryStrict<{ delivery_date: string; impressions: number; clicks: number; spend_cents: number }>(
          `SELECT delivery_date::text AS delivery_date,
                  COALESCE(sum(impressions),0)::bigint AS impressions,
                  COALESCE(sum(clicks),0)::bigint AS clicks,
                  COALESCE(sum(spend_cents),0)::bigint AS spend_cents
             FROM public.ad_campaign_daily
            WHERE delivery_date >= $1::date AND delivery_date <= $2::date
            GROUP BY delivery_date
            ORDER BY delivery_date ASC`,
          [fromIso, toIso],
        ),
        // Window totals from the same counter.
        pgQueryStrict<{ impressions: number; clicks: number; spend_cents: number }>(
          `SELECT COALESCE(sum(impressions),0)::bigint AS impressions,
                  COALESCE(sum(clicks),0)::bigint AS clicks,
                  COALESCE(sum(spend_cents),0)::bigint AS spend_cents
             FROM public.ad_campaign_daily
            WHERE delivery_date >= $1::date AND delivery_date <= $2::date`,
          [fromIso, toIso],
        ),
        // Raw ledger counts (cross-check against the counter).
        pgQueryStrict<{ event_type: string; n: number }>(
          `SELECT event_type, count(*)::bigint AS n
             FROM public.ad_events
            WHERE event_time >= $1 AND event_time <= $2
            GROUP BY event_type`,
          [fromIso, toIso],
        ),
        // Top campaigns by lifetime spend (all-time, not windowed — the
        // leaderboard the desk actually wants).
        pgQueryStrict(
          `SELECT c.id::text AS id, c.name, c.status,
                  t.code AS tier_code,
                  a.display_name AS advertiser_name,
                  c.lifetime_spend_cents::text AS lifetime_spend_cents
             FROM public.ad_campaigns c
             JOIN public.ad_advertisers a ON a.id = c.advertiser_id
             JOIN public.ad_tiers t ON t.id = c.tier_id
            WHERE c.lifetime_spend_cents > 0
            ORDER BY c.lifetime_spend_cents DESC
            LIMIT 20`,
        ),
        // Top placements by served impressions in the window.
        pgQueryStrict(
          `SELECT p.id::text AS id, p.code, p.name,
                  count(*) FILTER (WHERE e.event_type = 'impression')::bigint AS impressions,
                  count(*) FILTER (WHERE e.event_type = 'click')::bigint AS clicks
             FROM public.ad_events e
             JOIN public.ad_placements p ON p.id = e.placement_id
            WHERE e.event_time >= $1 AND e.event_time <= $2
            GROUP BY p.id, p.code, p.name
            ORDER BY impressions DESC
            LIMIT 20`,
          [fromIso, toIso],
        ),
        // Spend by delivery tier (where the money is concentrated).
        pgQueryStrict<{ tier_code: string; campaigns: number; spend_cents: number }>(
          `SELECT t.code AS tier_code,
                  count(*)::int AS campaigns,
                  COALESCE(sum(c.lifetime_spend_cents),0)::bigint AS spend_cents
             FROM public.ad_campaigns c
             JOIN public.ad_tiers t ON t.id = c.tier_id
            GROUP BY t.code
            ORDER BY spend_cents DESC`,
        ),
      ]);

    const events: Record<string, number> = {};
    for (const r of eventCounts) events[r.event_type] = Number(r.n);

    return NextResponse.json({
      window: { from: fromIso, to: toIso },
      daily,
      totals: totals[0] ?? { impressions: 0, clicks: 0, spend_cents: 0 },
      events,
      top_campaigns: topCampaigns,
      top_placements: topPlacements,
      spend_by_tier: spendByTier,
    });
  } catch {
    return NextResponse.json({ error: "analytics_unavailable" }, { status: 503 });
  }
}

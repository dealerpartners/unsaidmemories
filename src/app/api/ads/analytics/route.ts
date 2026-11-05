import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { getAdvertiserForUser } from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/analytics — Ads v2 reporting read model for the
 * caller's advertiser. Response shape is the long-standing portal
 * contract (totals / byCampaign / byPlacement, spend in dollars);
 * the sources are the v2 tables:
 *   - totals + byCampaign delivery: ad_campaign_daily (the rollup
 *     serve writes per impression reservation — spend is exact:
 *     millicents / 100000 = dollars),
 *   - reach: distinct ad_uid in ad_events,
 *   - byPlacement: ad_events joined to the campaign's launch rate
 *     snapshot (ad_campaign_rates), so placement spend is the
 *     snapshot CPM x impressions — the same price serve charged,
 *   - leads: ad_leads rows tied to v2 campaigns (campaign_v2_id,
 *     migration 20261168).
 * Conversions: the v2 event ledger has no conversion event type —
 * conversions are lead captures, reported in `leads`; the
 * `conversions` field stays in the contract at an honest 0 rather
 * than being fabricated from another counter.
 */

const TIER_LABELS: Record<string, string> = {
  platinum: "Platinum",
  gold: "Gold",
  silver: "Silver",
  house: "House",
};

const EMPTY = {
  totals: {
    impressions: 0,
    clicks: 0,
    conversions: 0,
    spend: 0,
    reach: 0,
    ctr: 0,
    cpa: 0,
  },
  byCampaign: [] as unknown[],
  byPlacement: [] as unknown[],
};

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const days = Math.min(
    365,
    Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 30) || 30),
  );
  try {
    const advertiser = await getAdvertiserForUser(user.id);
    if (!advertiser) return NextResponse.json(EMPTY);
    const adv = advertiser.id;

    const [totals, reachRows, byCampaign, leadRows, byPlacement, reachByCampaign] =
      await Promise.all([
        pgQueryStrict<{
          impressions: number;
          clicks: number;
          spend: number;
        }>(
          `SELECT COALESCE(SUM(d.impressions), 0)::int AS impressions,
                  COALESCE(SUM(d.clicks), 0)::int AS clicks,
                  COALESCE(SUM(d.spend_millicents), 0)::float8 / 100000 AS spend
             FROM public.ad_campaign_daily d
             JOIN public.ad_campaigns c ON c.id = d.campaign_id
            WHERE c.advertiser_id = $1
              AND d.delivery_date >= CURRENT_DATE - $2::int`,
          [adv, days - 1],
        ),
        pgQueryStrict<{ reach: number }>(
          `SELECT COUNT(DISTINCT e.ad_uid)::int AS reach
             FROM public.ad_events e
             JOIN public.ad_campaigns c ON c.id = e.campaign_id
            WHERE c.advertiser_id = $1 AND e.event_type = 'impression'
              AND e.event_time >= now() - ($2::int || ' days')::interval`,
          [adv, days],
        ),
        pgQueryStrict<{
          id: string;
          name: string;
          status: string;
          tier_code: string;
          impressions: number;
          clicks: number;
          spend: number;
        }>(
          `SELECT c.id::text AS id, c.name, c.status, t.code AS tier_code,
                  COALESCE(SUM(d.impressions), 0)::int AS impressions,
                  COALESCE(SUM(d.clicks), 0)::int AS clicks,
                  COALESCE(SUM(d.spend_millicents), 0)::float8 / 100000 AS spend
             FROM public.ad_campaigns c
             JOIN public.ad_tiers t ON t.id = c.tier_id
             LEFT JOIN public.ad_campaign_daily d
               ON d.campaign_id = c.id
              AND d.delivery_date >= CURRENT_DATE - $2::int
            WHERE c.advertiser_id = $1
            GROUP BY c.id, t.code
            ORDER BY impressions DESC`,
          [adv, days - 1],
        ),
        pgQueryStrict<{ campaign_id: string; leads: number }>(
          `SELECT l.campaign_v2_id::text AS campaign_id,
                  COUNT(*)::int AS leads
             FROM public.ad_leads l
             JOIN public.ad_campaigns c ON c.id = l.campaign_v2_id
            WHERE c.advertiser_id = $1
              AND l.created_at >= now() - ($2::int || ' days')::interval
            GROUP BY l.campaign_v2_id`,
          [adv, days],
        ),
        pgQueryStrict<{
          placement: string;
          impressions: number;
          clicks: number;
          spend: number;
        }>(
          `SELECT p.code AS placement,
                  COUNT(*) FILTER (WHERE e.event_type = 'impression')::int AS impressions,
                  COUNT(*) FILTER (WHERE e.event_type = 'click')::int AS clicks,
                  COALESCE(SUM(r.cpm_cents) FILTER (WHERE e.event_type = 'impression'), 0)::float8 / 100000 AS spend
             FROM public.ad_events e
             JOIN public.ad_campaigns c ON c.id = e.campaign_id
             JOIN public.ad_placements p ON p.id = e.placement_id
             LEFT JOIN public.ad_campaign_rates r
               ON r.campaign_id = e.campaign_id AND r.placement_id = e.placement_id
            WHERE c.advertiser_id = $1
              AND e.event_time >= now() - ($2::int || ' days')::interval
            GROUP BY p.code
            ORDER BY impressions DESC`,
          [adv, days],
        ),
        pgQueryStrict<{ campaign_id: string; reach: number }>(
          `SELECT c.id::text AS campaign_id,
                  COUNT(DISTINCT e.ad_uid)::int AS reach
             FROM public.ad_events e
             JOIN public.ad_campaigns c ON c.id = e.campaign_id
            WHERE c.advertiser_id = $1 AND e.event_type = 'impression'
              AND e.event_time >= now() - ($2::int || ' days')::interval
            GROUP BY c.id`,
          [adv, days],
        ),
      ]);

    const leadsByCampaign = new Map(
      leadRows.map((r) => [r.campaign_id, Number(r.leads)]),
    );
    // byCampaign reach was hardcoded 0 while totals reach counted the
    // same impressions — the per-campaign row must carry its own
    // distinct-viewer count (proven in the 2026-10-24 walk: totals
    // reach 1, byCampaign reach 0).
    const reachByCampaignMap = new Map(
      reachByCampaign.map((r) => [r.campaign_id, Number(r.reach)]),
    );
    const t = totals[0] ?? { impressions: 0, clicks: 0, spend: 0 };
    const totalLeads = [...leadsByCampaign.values()].reduce((a, b) => a + b, 0);
    return NextResponse.json({
      totals: {
        impressions: Number(t.impressions),
        clicks: Number(t.clicks),
        conversions: 0,
        spend: Number(t.spend),
        reach: Number(reachRows[0]?.reach ?? 0),
        ctr: t.impressions > 0 ? Number(t.clicks) / Number(t.impressions) : 0,
        cpa: totalLeads > 0 ? Number(t.spend) / totalLeads : 0,
      },
      byCampaign: byCampaign.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        objective: TIER_LABELS[r.tier_code] ?? r.tier_code,
        impressions: Number(r.impressions),
        clicks: Number(r.clicks),
        conversions: 0,
        spend: Number(r.spend),
        reach: reachByCampaignMap.get(r.id) ?? 0,
        leads: leadsByCampaign.get(r.id) ?? 0,
      })),
      byPlacement: byPlacement.map((r) => ({
        placement: r.placement,
        impressions: Number(r.impressions),
        clicks: Number(r.clicks),
        spend: Number(r.spend),
      })),
    });
  } catch {
    return NextResponse.json({ error: "analytics_unavailable" }, { status: 503 });
  }
}

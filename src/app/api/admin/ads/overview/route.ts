import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads/overview — W9 console summary over the v2
 * subsystem: advertisers by status, campaigns by lifecycle status,
 * the two review queues (preflight campaigns, pending creatives),
 * today's delivery, and the house advertiser's state. Admin only.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const [advertisers, campaigns, queues, delivery, house] =
      await Promise.all([
        pgQueryStrict<{ status: string; n: number }>(
          `SELECT status, count(*)::int AS n FROM public.ad_advertisers
            GROUP BY status ORDER BY status`,
        ),
        pgQueryStrict<{ status: string; n: number }>(
          `SELECT status, count(*)::int AS n FROM public.ad_campaigns
            GROUP BY status ORDER BY status`,
        ),
        pgQueryStrict<{ preflight: number; special: number; creatives: number }>(
          `SELECT
             (SELECT count(*)::int FROM public.ad_campaigns
               WHERE status = 'preflight') AS preflight,
             (SELECT count(*)::int FROM public.ad_campaigns
               WHERE status = 'preflight'
                 AND special_category IS NOT NULL
                 AND btrim(special_category) <> '') AS special,
             (SELECT count(*)::int FROM public.ad_creatives
               WHERE status = 'pending_review') AS creatives`,
        ),
        pgQueryStrict<{ impressions: number; clicks: number; spend_cents: number }>(
          `SELECT COALESCE(sum(impressions),0)::bigint AS impressions,
                  COALESCE(sum(clicks),0)::bigint AS clicks,
                  COALESCE(sum(spend_cents),0)::bigint AS spend_cents
             FROM public.ad_campaign_daily
            WHERE delivery_date = CURRENT_DATE`,
        ),
        pgQueryStrict<{ campaigns: number; active: number }>(
          `SELECT count(*)::int AS campaigns,
                  count(*) FILTER (WHERE c.status = 'active')::int AS active
             FROM public.ad_campaigns c
             JOIN public.ad_advertisers a
               ON a.id = c.advertiser_id AND a.is_system`,
        ),
      ]);
    return NextResponse.json({
      advertisers,
      campaigns,
      review_queue: queues[0] ?? { preflight: 0, special: 0, creatives: 0 },
      today: delivery[0] ?? { impressions: 0, clicks: 0, spend_cents: 0 },
      house: house[0] ?? { campaigns: 0, active: 0 },
    });
  } catch {
    return NextResponse.json({ error: "overview_unavailable" }, { status: 503 });
  }
}

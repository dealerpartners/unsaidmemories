import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser, isAdmin } from "@/lib/auth/server";
import {
  loadCampaign,
  loadOwnedCampaign,
} from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/campaigns/:id/report — delivery reporting (AA1/AA2)
 * aggregated from the two engine ledgers: ad_campaign_daily (the
 * hot counters: impressions, clicks, exact spend) and ad_events
 * (the append-only audit trail, used for the per-creative split).
 * Nothing here is a stored metric that can drift from what served.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const owned = await loadOwnedCampaign(user.id, id);
    const campaign =
      owned?.campaign ??
      ((await isAdmin()) ? await loadCampaign(id) : null);
    if (!campaign) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const [totals, daily, creatives] = await Promise.all([
      pgQueryStrict<{
        impressions: number;
        clicks: number;
        spend_cents: number;
        spend_millicents: number;
      }>(
        // Spend derives from the millicent ledger serve writes; the
        // integer spend_cents column is never updated (always 0).
        `SELECT COALESCE(SUM(impressions), 0)::int AS impressions,
                COALESCE(SUM(clicks), 0)::int AS clicks,
                COALESCE(ROUND(SUM(spend_millicents) / 1000.0), 0)::int AS spend_cents,
                COALESCE(SUM(spend_millicents), 0)::int AS spend_millicents
           FROM public.ad_campaign_daily WHERE campaign_id = $1`,
        [id],
      ),
      pgQueryStrict(
        `SELECT delivery_date, impressions::int AS impressions,
                clicks::int AS clicks,
                ROUND(spend_millicents / 1000.0)::int AS spend_cents,
                spend_millicents::int AS spend_millicents
           FROM public.ad_campaign_daily
          WHERE campaign_id = $1
          ORDER BY delivery_date DESC LIMIT 30`,
        [id],
      ),
      pgQueryStrict(
        `SELECT creative_id::text AS creative_id,
                event_type,
                count(*)::int AS n
           FROM public.ad_events
          WHERE campaign_id = $1 AND event_type IN ('impression', 'click')
          GROUP BY creative_id, event_type
          ORDER BY creative_id`,
        [id],
      ),
    ]);
    const t = totals[0] ?? { impressions: 0, clicks: 0, spend_cents: 0, spend_millicents: 0 };
    return NextResponse.json({
      campaign_id: id,
      status: campaign.status,
      totals: {
        impressions: t.impressions,
        clicks: t.clicks,
        spend_cents: t.spend_cents,
        spend_millicents: t.spend_millicents,
        ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
      },
      daily,
      creatives,
    });
  } catch {
    return NextResponse.json({ error: "report_unavailable" }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { authenticateLicensee } from "@/lib/licensee/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — OLAP reporting reads for the caller's campaigns only:
// daily counters (ad_event_counters, the rollup the edge function and
// the webhook both increment) + daily delivery (ad_campaign_daily).
// ?campaign_id= narrows to one campaign.
export async function GET(req: Request) {
  const auth = await authenticateLicensee(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const campaignId = new URL(req.url).searchParams.get("campaign_id");
  const counters = await pgQueryStrict<{
    impressions: number;
    clicks: number;
    conversions: number;
  }>(
    `SELECT ec.day, ec.campaign_id::text AS campaign_id,
            ec.creative_id::text AS creative_id, ec.placement_key,
            ec.impressions, ec.clicks, ec.conversions
       FROM public.ad_event_counters ec
       JOIN public.ad_campaigns c ON c.id = ec.campaign_id
      WHERE c.advertiser_id = $1
        AND ($2::bigint IS NULL OR ec.campaign_id = $2::bigint)
      ORDER BY ec.day DESC, ec.campaign_id
      LIMIT 500`,
    [auth.adAdvertiserId, campaignId ?? null],
  );
  const daily = await pgQueryStrict(
    `SELECT d.campaign_id::text AS campaign_id, d.delivery_date,
            d.impressions, d.clicks, d.spend_millicents
       FROM public.ad_campaign_daily d
       JOIN public.ad_campaigns c ON c.id = d.campaign_id
      WHERE c.advertiser_id = $1
        AND ($2::bigint IS NULL OR d.campaign_id = $2::bigint)
      ORDER BY d.delivery_date DESC
      LIMIT 500`,
    [auth.adAdvertiserId, campaignId ?? null],
  );
  const totals = counters.reduce(
    (acc, row) => {
      acc.impressions += Number(row.impressions ?? 0);
      acc.clicks += Number(row.clicks ?? 0);
      acc.conversions += Number(row.conversions ?? 0);
      return acc;
    },
    { impressions: 0, clicks: 0, conversions: 0 },
  );
  return NextResponse.json({ totals, counters, daily });
}

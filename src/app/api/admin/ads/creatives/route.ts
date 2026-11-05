import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads/creatives — the W9 creative desk: v2 creatives
 * across advertisers with campaign context. Filters: ?status=
 * (pending_review is the approval queue), ?campaign_id=. Decisions
 * are written through the [id] route. Admin only.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const campaignId = url.searchParams.get("campaign_id");
  try {
    const creatives = await pgQueryStrict(
      `SELECT cr.id::text AS id, cr.campaign_id::text AS campaign_id,
              cr.group_id::text AS group_id, cr.name, cr.status,
              cr.asset_url, cr.click_url, cr.headline, cr.body, cr.cta,
              cr.width, cr.height, cr.created_at,
              c.name AS campaign_name, c.status AS campaign_status,
              a.display_name AS advertiser_name,
              (SELECT count(*)::int FROM public.ad_creative_assets x
                WHERE x.creative_id = cr.id) AS asset_count
         FROM public.ad_creatives cr
         JOIN public.ad_campaigns c ON c.id = cr.campaign_id
         JOIN public.ad_advertisers a ON a.id = c.advertiser_id
        WHERE ($1::text IS NULL OR cr.status = $1)
          AND ($2::text IS NULL OR cr.campaign_id = $2::bigint)
        ORDER BY cr.created_at DESC
        LIMIT 500`,
      [status, campaignId],
    );
    return NextResponse.json({ creatives });
  } catch {
    return NextResponse.json({ error: "creatives_unavailable" }, { status: 503 });
  }
}

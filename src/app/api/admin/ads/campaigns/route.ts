import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads/campaigns — the W9 campaign desk: every v2
 * campaign across advertisers, with tier, advertiser, Y3
 * special-category declaration, and delivery totals. Filters:
 * ?status=, ?tier= (tier code), ?q= (name search). Status writes
 * live on the [id] route. Admin only.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const tier = url.searchParams.get("tier");
  const q = url.searchParams.get("q");
  try {
    const campaigns = await pgQueryStrict(
      `SELECT c.id::text AS id, c.advertiser_id::text AS advertiser_id,
              a.display_name AS advertiser_name, a.is_system,
              a.status AS advertiser_status,
              t.code AS tier_code, c.name, c.status, c.special_category,
              c.category_match_mode, c.starts_at, c.ends_at,
              c.daily_budget_cents::text AS daily_budget_cents,
              c.lifetime_budget_cents::text AS lifetime_budget_cents,
              c.lifetime_spend_cents::text AS lifetime_spend_cents,
              COALESCE(td.impressions,0)::bigint AS impressions_today,
              COALESCE(td.clicks,0)::bigint AS clicks_today,
              c.created_at, c.updated_at
         FROM public.ad_campaigns c
         JOIN public.ad_advertisers a ON a.id = c.advertiser_id
         JOIN public.ad_tiers t ON t.id = c.tier_id
         LEFT JOIN public.ad_campaign_daily td
           ON td.campaign_id = c.id AND td.delivery_date = CURRENT_DATE
        WHERE ($1::text IS NULL OR c.status = $1)
          AND ($2::text IS NULL OR t.code = $2)
          AND ($3::text IS NULL OR c.name ILIKE '%' || $3 || '%')
        ORDER BY c.created_at DESC
        LIMIT 500`,
      [status, tier, q],
    );
    return NextResponse.json({ campaigns });
  } catch {
    return NextResponse.json({ error: "campaigns_unavailable" }, { status: 503 });
  }
}

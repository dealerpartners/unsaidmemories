import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";
import { preflightChecks, type CampaignRow } from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads/review-queue — the W9 review desk in one read:
 * (1) campaigns waiting in 'preflight', each with its Y3
 * special-category declaration flagged and its preflight checks
 * computed from the same primitives serve uses, and (2) creatives in
 * 'pending_review' with their campaign/advertiser context. Decisions
 * are written through PATCH /api/admin/ads/campaigns/:id (approve /
 * return) and PATCH /api/admin/ads/creatives/:id (approve / reject).
 * Admin only.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const rows = await pgQueryStrict<Record<string, unknown>>(
      `SELECT c.id::text AS id, c.advertiser_id::text AS advertiser_id,
              a.display_name AS advertiser_name,
              a.status AS advertiser_status, a.is_system,
              c.tier_id, t.code AS tier_code, c.name, c.status, c.special_category,
              c.category_match_mode, c.starts_at, c.ends_at,
              c.daily_budget_cents::text AS daily_budget_cents,
              c.lifetime_budget_cents::text AS lifetime_budget_cents,
              c.lifetime_spend_cents::text AS lifetime_spend_cents,
              c.created_at, c.updated_at
         FROM public.ad_campaigns c
         JOIN public.ad_advertisers a ON a.id = c.advertiser_id
         JOIN public.ad_tiers t ON t.id = c.tier_id
        WHERE c.status = 'preflight'
        ORDER BY (c.special_category IS NOT NULL
                  AND btrim(c.special_category) <> '') DESC,
                 c.updated_at ASC
        LIMIT 200`,
    );
    const campaigns: any[] = [];
    for (const r of rows) {
      const campaign = {
        ...(r as unknown as CampaignRow),
        advertiser_name: r.advertiser_name,
        advertiser_status: r.advertiser_status,
        is_system: r.is_system,
        daily_budget_cents: Number(r.daily_budget_cents ?? 0),
        lifetime_budget_cents: Number(r.lifetime_budget_cents ?? 0),
        lifetime_spend_cents: Number(r.lifetime_spend_cents ?? 0),
        special_category_declared:
          typeof r.special_category === "string" &&
          r.special_category.trim() !== "",
      };
      campaigns.push({
        ...campaign,
        checks: await preflightChecks(campaign as CampaignRow),
      });
    }
    const creatives = await pgQueryStrict(
      `SELECT cr.id::text AS id, cr.campaign_id::text AS campaign_id,
              cr.group_id::text AS group_id, cr.name, cr.status,
              cr.asset_url, cr.click_url, cr.headline, cr.body, cr.cta,
              cr.width, cr.height, cr.created_at,
              c.name AS campaign_name, c.status AS campaign_status,
              c.special_category,
              a.display_name AS advertiser_name
         FROM public.ad_creatives cr
         JOIN public.ad_campaigns c ON c.id = cr.campaign_id
         JOIN public.ad_advertisers a ON a.id = c.advertiser_id
        WHERE cr.status = 'pending_review'
        ORDER BY cr.created_at ASC
        LIMIT 200`,
    );
    return NextResponse.json({ campaigns, creatives });
  } catch {
    return NextResponse.json({ error: "review_queue_unavailable" }, { status: 503 });
  }
}

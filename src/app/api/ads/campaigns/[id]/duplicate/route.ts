import { NextResponse } from "next/server";
import { getPgWithRetry } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { loadOwnedCampaign } from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * POST /api/ads/campaigns/:id/duplicate (Y11) — copy a campaign as a
 * fresh DRAFT under the Ads v2 schema: placements, category refs,
 * targeting, groups, creatives, and creative assets come along;
 * spend, delivery counters, and launch rate snapshots do NOT (the
 * copy snapshots fresh rates when it launches). Advertiser-scoped:
 * an id from another advertiser is not_found.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const owned = await loadOwnedCampaign(user.id, id).catch(() => null);
  if (!owned) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { campaign } = owned;
  const client = await getPgWithRetry();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      `INSERT INTO public.ad_campaigns
         (advertiser_id, tier_id, name, status, special_category,
          category_match_mode, starts_at, ends_at,
          daily_budget_cents, lifetime_budget_cents)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9)
       RETURNING id::text AS id`,
      [
        campaign.advertiser_id,
        campaign.tier_id,
        `${campaign.name} (copy)`,
        campaign.special_category,
        campaign.category_match_mode,
        campaign.starts_at,
        campaign.ends_at,
        campaign.daily_budget_cents,
        campaign.lifetime_budget_cents,
      ],
    );
    const newId = (ins.rows[0] as { id: string }).id;
    await client.query(
      `INSERT INTO public.ad_campaign_placements (campaign_id, placement_id)
       SELECT $1, placement_id FROM public.ad_campaign_placements
        WHERE campaign_id = $2`,
      [newId, id],
    );
    await client.query(
      `INSERT INTO public.ad_campaign_categories (campaign_id, category_id)
       SELECT $1, category_id FROM public.ad_campaign_categories
        WHERE campaign_id = $2`,
      [newId, id],
    );
    await client.query(
      `INSERT INTO public.ad_campaign_targeting
         (campaign_id, device_mask, languages, states,
          include_logged_in, include_anonymous)
       SELECT $1, device_mask, languages, states,
              include_logged_in, include_anonymous
         FROM public.ad_campaign_targeting WHERE campaign_id = $2`,
      [newId, id],
    );
    const groups = await client.query<{ id: string; name: string; status: string }>(
      `SELECT id::text AS id, name, status FROM public.ad_campaign_groups
        WHERE campaign_id = $1 ORDER BY id`,
      [id],
    );
    for (const g of groups.rows) {
      const ng = await client.query(
        `INSERT INTO public.ad_campaign_groups (campaign_id, name, status)
         VALUES ($1, $2, $3) RETURNING id::text AS id`,
        [newId, g.name, g.status],
      );
      const newGroupId = (ng.rows[0] as { id: string }).id;
      // Creatives copy in id order; assets follow by the same order.
      const oldCreatives = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM public.ad_creatives
          WHERE campaign_id = $1 AND group_id = $2 ORDER BY id`,
        [id, g.id],
      );
      const newCreatives = await client.query<{ id: string }>(
        `INSERT INTO public.ad_creatives
           (campaign_id, group_id, name, status, asset_url, click_url,
            headline, body, cta, width, height)
         SELECT $1, $2, name, 'pending_review', asset_url, click_url,
                headline, body, cta, width, height
           FROM public.ad_creatives
          WHERE campaign_id = $3 AND group_id = $4
          ORDER BY id
         RETURNING id::text AS id`,
        [newId, newGroupId, id, g.id],
      );
      for (let i = 0; i < oldCreatives.rows.length && i < newCreatives.rows.length; i++) {
        await client.query(
          `INSERT INTO public.ad_creative_assets (creative_id, kind, asset_url, meta)
           SELECT $1, kind, asset_url, meta FROM public.ad_creative_assets
            WHERE creative_id = $2`,
          [newCreatives.rows[i].id, oldCreatives.rows[i].id],
        );
      }
    }
    await client.query("COMMIT");
    return NextResponse.json({ campaign_id: newId });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ error: "duplicate_unavailable" }, { status: 503 });
  } finally {
    client.release();
  }
}

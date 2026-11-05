import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import {
  getAdvertiserForUser,
  loadOwnedCampaign,
} from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * /api/ads/creatives — the creative library's data path (Z4/Z6) on
 * the Ads v2 tables. A creative belongs to a campaign GROUP
 * (ad_campaign_groups); the library is scoped to the caller's
 * advertiser (ad_advertisers). Response rows keep the field names
 * the portal has always read (image_url/link_url aliases of
 * asset_url/click_url); the companion image and audio track are
 * ad_creative_assets rows (Z7), surfaced as companion_image /
 * audio_url. New creatives are born 'pending_review' (20261167):
 * they serve only after admin approval.
 */

const SELECT = `
  SELECT cr.id::text AS id, cr.group_id::text AS group_id,
         g.campaign_id::text AS campaign_id,
         cr.name, cr.status, cr.asset_url, cr.click_url,
         cr.asset_url AS image_url, cr.click_url AS link_url,
         cr.headline, cr.body, cr.cta, cr.width, cr.height,
         cr.created_at, cr.updated_at,
         c.name AS campaign_name, c.status AS campaign_status,
         g.name AS group_name,
         (SELECT a.asset_url FROM public.ad_creative_assets a
           WHERE a.creative_id = cr.id AND a.kind = 'companion_image'
           ORDER BY a.id LIMIT 1) AS companion_image,
         (SELECT a.asset_url FROM public.ad_creative_assets a
           WHERE a.creative_id = cr.id AND a.kind = 'audio'
           ORDER BY a.id LIMIT 1) AS audio_url,
         (SELECT a.asset_url FROM public.ad_creative_assets a
           WHERE a.creative_id = cr.id AND a.kind = 'video'
           ORDER BY a.id LIMIT 1) AS video_url,
         (SELECT COUNT(*)::int FROM public.ad_events e
           WHERE e.creative_id = cr.id AND e.event_type = 'impression')
           AS impressions,
         (SELECT COUNT(*)::int FROM public.ad_events e
           WHERE e.creative_id = cr.id AND e.event_type = 'click')
           AS clicks
    FROM public.ad_creatives cr
    JOIN public.ad_campaign_groups g ON g.id = cr.group_id
    JOIN public.ad_campaigns c ON c.id = g.campaign_id`;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const advertiser = await getAdvertiserForUser(user.id);
    if (!advertiser) return NextResponse.json({ creatives: [] });
    const creatives = await pgQueryStrict(
      `${SELECT}
        WHERE c.advertiser_id = $1
        ORDER BY cr.created_at DESC
        LIMIT 200`,
      [advertiser.id],
    );
    return NextResponse.json({
      creatives: creatives.map((cr) => ({
        ...cr,
        type: cr.video_url ? "video" : cr.audio_url ? "audio" : "image",
      })),
    });
  } catch {
    return NextResponse.json({ error: "creatives_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const campaignId = String(body.campaign_id ?? "").trim();
  if (!campaignId) {
    return NextResponse.json({ error: "campaign_required" }, { status: 400 });
  }
  try {
    const owned = await loadOwnedCampaign(user.id, campaignId);
    if (!owned) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Group: the one named, else the campaign's first, else a
    // fresh default group (the wizard's campaigns always have one).
    let groupId = body.group_id != null ? String(body.group_id) : null;
    if (groupId) {
      const g = await pgQueryStrict<{ id: string }>(
        `SELECT id::text AS id FROM public.ad_campaign_groups
          WHERE id = $1 AND campaign_id = $2`,
        [groupId, campaignId],
      );
      if (!g[0]) {
        return NextResponse.json({ error: "group_not_found" }, { status: 404 });
      }
    } else {
      const g = await pgQueryStrict<{ id: string }>(
        `SELECT id::text AS id FROM public.ad_campaign_groups
          WHERE campaign_id = $1 ORDER BY id ASC LIMIT 1`,
        [campaignId],
      );
      if (g[0]) {
        groupId = g[0].id;
      } else {
        const created = await pgQueryStrict<{ id: string }>(
          `INSERT INTO public.ad_campaign_groups (campaign_id, name, status)
           VALUES ($1, 'Primary group', 'active') RETURNING id::text AS id`,
          [campaignId],
        );
        groupId = created[0].id;
      }
    }

    const rows = await pgQueryStrict<{ id: string }>(
      `INSERT INTO public.ad_creatives
         (campaign_id, group_id, name, asset_url, click_url, headline,
          body, cta, width, height, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending_review')
       RETURNING id::text AS id`,
      [
        campaignId,
        groupId,
        body.name != null ? String(body.name) : "Creative",
        body.image_url != null
          ? String(body.image_url)
          : body.asset_url != null
            ? String(body.asset_url)
            : "",
        String(body.link_url ?? body.click_url ?? "/shop"),
        body.headline != null ? String(body.headline) : null,
        body.body != null ? String(body.body) : null,
        String(body.cta ?? "Learn more"),
        // ad_creatives.width/height are NOT NULL (> 0): the studio and
        // AI-studio saves send no dimensions, so an unsized creative is
        // declared at the platform's standard display canvas (1200×628,
        // the house creative's size) instead of failing the insert.
        body.width != null && Math.floor(Number(body.width)) > 0
          ? Math.floor(Number(body.width))
          : 1200,
        body.height != null && Math.floor(Number(body.height)) > 0
          ? Math.floor(Number(body.height))
          : 628,
      ],
    );
    const creativeId = rows[0].id;
    const assets: Array<[string, unknown]> = [
      ["companion_image", body.companion_image],
      ["audio", body.audio_url],
      ["video", body.video_url],
    ];
    for (const [kind, url] of assets) {
      if (url != null && String(url)) {
        await pgQueryStrict(
          `INSERT INTO public.ad_creative_assets (creative_id, kind, asset_url)
           VALUES ($1, $2, $3)`,
          [creativeId, kind, String(url)],
        );
      }
    }
    const full = await pgQueryStrict(
      `${SELECT} WHERE cr.id = $1`,
      [creativeId],
    );
    return NextResponse.json({ creative: full[0] });
  } catch {
    return NextResponse.json({ error: "creative_create_unavailable" }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { loadOwnedCampaign } from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * POST /api/ads/campaigns/:id/creatives — add a creative to one of
 * the campaign's groups (Z4/Z6). The group is named by group_id, or
 * group_name (created on first use), or defaults to the campaign's
 * first group. Companion assets (Z7) may ride along as
 * assets: [{ kind, asset_url, meta }] into ad_creative_assets.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const assetUrl = String(body.asset_url ?? "").trim();
  const clickUrl = String(body.click_url ?? "").trim();
  if (!assetUrl || !clickUrl) {
    return NextResponse.json(
      { error: "asset_and_click_url_required" },
      { status: 400 },
    );
  }
  try {
    const owned = await loadOwnedCampaign(user.id, id);
    if (!owned) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    let groupId: string | null = null;
    if (body.group_id != null && /^\d+$/.test(String(body.group_id))) {
      const g = await pgQueryStrict<{ id: string }>(
        `SELECT id::text AS id FROM public.ad_campaign_groups
          WHERE id = $1 AND campaign_id = $2 LIMIT 1`,
        [String(body.group_id), id],
      );
      groupId = g[0]?.id ?? null;
      if (!groupId) {
        return NextResponse.json({ error: "unknown_group" }, { status: 400 });
      }
    } else if (body.group_name != null && String(body.group_name).trim()) {
      const gname = String(body.group_name).trim();
      const existing = await pgQueryStrict<{ id: string }>(
        `SELECT id::text AS id FROM public.ad_campaign_groups
          WHERE campaign_id = $1 AND name = $2 ORDER BY id LIMIT 1`,
        [id, gname],
      );
      if (existing[0]) {
        groupId = existing[0].id;
      } else {
        const created = await pgQueryStrict<{ id: string }>(
          `INSERT INTO public.ad_campaign_groups (campaign_id, name, status)
           VALUES ($1, $2, 'active') RETURNING id::text AS id`,
          [id, gname],
        );
        groupId = created[0].id;
      }
    } else {
      const g = await pgQueryStrict<{ id: string }>(
        `SELECT id::text AS id FROM public.ad_campaign_groups
          WHERE campaign_id = $1 ORDER BY id LIMIT 1`,
        [id],
      );
      groupId = g[0]?.id ?? null;
      if (!groupId) {
        const created = await pgQueryStrict<{ id: string }>(
          `INSERT INTO public.ad_campaign_groups (campaign_id, name, status)
           VALUES ($1, 'Group 1', 'active') RETURNING id::text AS id`,
          [id],
        );
        groupId = created[0].id;
      }
    }

    const width = Number(body.width ?? 1200);
    const height = Number(body.height ?? 628);
    const rows = await pgQueryStrict(
      `INSERT INTO public.ad_creatives
         (campaign_id, group_id, name, status, asset_url, click_url,
          headline, body, cta, width, height)
       VALUES ($1, $2, $3, 'pending_review', $4, $5, $6, $7, $8, $9, $10)
       RETURNING id::text AS id, group_id::text AS group_id, name, status,
                 asset_url, click_url, headline, body, cta, width, height`,
      [
        id,
        groupId,
        String(body.name ?? "Creative"),
        assetUrl,
        clickUrl,
        body.headline != null ? String(body.headline) : null,
        body.body != null ? String(body.body) : null,
        body.cta != null ? String(body.cta) : null,
        Number.isFinite(width) && width > 0 ? Math.floor(width) : 1200,
        Number.isFinite(height) && height > 0 ? Math.floor(height) : 628,
      ],
    );
    const creative = rows[0] as { id: string };

    const assetsIn = Array.isArray(body.assets) ? body.assets : [];
    for (const a of assetsIn as Record<string, unknown>[]) {
      const kind = String(a.kind ?? "");
      const url = String(a.asset_url ?? "").trim();
      if (
        !["audio", "video", "companion_image", "captions", "logo"].includes(kind) ||
        !url
      ) {
        continue;
      }
      await pgQueryStrict(
        `INSERT INTO public.ad_creative_assets (creative_id, kind, asset_url, meta)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          creative.id,
          kind,
          url,
          a.meta != null ? JSON.stringify(a.meta) : null,
        ],
      );
    }
    return NextResponse.json({ creative: rows[0] });
  } catch {
    return NextResponse.json({ error: "creative_create_unavailable" }, { status: 503 });
  }
}

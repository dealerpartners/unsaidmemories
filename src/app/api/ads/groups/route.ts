import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import {
  getAdvertiserForUser,
  loadOwnedCampaign,
} from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * /api/ads/groups — ad groups (Y12) on the Ads v2 tables:
 * ad_campaign_groups. In v2 a group is a creative organizer inside
 * one campaign — the only group-level facts serve reads are its
 * name, its status (a non-active group's creatives never serve),
 * and which creatives it holds. Placements, categories, targeting,
 * and budgets are CAMPAIGN-level in v2, so GET returns them as
 * read-through context from the parent campaign (placements as
 * codes, targeting as the campaign's compact row reshaped to the
 * shape the portal has always rendered) and writes accept only
 * name + status. The legacy per-group budget / delivery-type /
 * frequency documents have no v2 meaning and are not stored.
 *
 * GET ?campaign_id= scopes to one campaign; without it, all the
 * caller's groups with their campaign context.
 */

const SELECT = `
  SELECT g.id::text AS id, g.campaign_id::text AS campaign_id,
         g.name, g.status, g.created_at, g.updated_at,
         c.name AS campaign_name,
         (SELECT COUNT(*)::int FROM public.ad_creatives cr
           WHERE cr.group_id = g.id) AS creative_count,
         (SELECT COALESCE(jsonb_agg(p.code ORDER BY p.code), '[]'::jsonb)
            FROM public.ad_campaign_placements cp
            JOIN public.ad_placements p ON p.id = cp.placement_id
           WHERE cp.campaign_id = c.id) AS placements,
         (SELECT jsonb_build_object(
                   'locations', COALESCE(t.state_codes, ARRAY[]::text[]),
                   'languages', COALESCE(t.language_codes, ARRAY[]::text[]),
                   'devices', ARRAY(SELECT d FROM (VALUES
                       (CASE WHEN t.device_mask & 1 = 1 THEN 'desktop' END),
                       (CASE WHEN t.device_mask & 2 = 2 THEN 'tablet' END),
                       (CASE WHEN t.device_mask & 4 = 4 THEN 'mobile' END)
                     ) AS x(d) WHERE d IS NOT NULL))
            FROM public.ad_campaign_targeting t
           WHERE t.campaign_id = c.id) AS targeting
    FROM public.ad_campaign_groups g
    JOIN public.ad_campaigns c ON c.id = g.campaign_id`;

function present(rows: Array<Record<string, unknown>>) {
  return rows.map((g) => ({
    ...g,
    budget: null,
    delivery_type: null,
    frequency_capping: null,
  }));
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const campaignId = new URL(req.url).searchParams.get("campaign_id");
  try {
    const advertiser = await getAdvertiserForUser(user.id);
    if (!advertiser) return NextResponse.json({ groups: [] });
    const groups = campaignId
      ? await pgQueryStrict(
          `${SELECT}
            WHERE g.campaign_id = $1 AND c.advertiser_id = $2
            ORDER BY g.created_at ASC LIMIT 200`,
          [campaignId, advertiser.id],
        )
      : await pgQueryStrict(
          `${SELECT}
            WHERE c.advertiser_id = $1
            ORDER BY g.created_at DESC LIMIT 200`,
          [advertiser.id],
        );
    return NextResponse.json({ groups: present(groups) });
  } catch {
    return NextResponse.json({ error: "groups_unavailable" }, { status: 503 });
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
  const campaignId = String(body.campaign_id ?? "");
  const name = String(body.name ?? "").trim();
  if (!campaignId || !name) {
    return NextResponse.json(
      { error: "campaign_and_name_required" },
      { status: 400 },
    );
  }
  try {
    const owned = await loadOwnedCampaign(user.id, campaignId);
    if (!owned) {
      return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
    }
    const rows = await pgQueryStrict<{ id: string }>(
      `INSERT INTO public.ad_campaign_groups (campaign_id, name, status)
       VALUES ($1, $2, 'active') RETURNING id::text AS id`,
      [campaignId, name],
    );
    const full = await pgQueryStrict(
      `${SELECT} WHERE g.id = $1`,
      [rows[0].id],
    );
    return NextResponse.json({ group: present(full)[0] });
  } catch {
    return NextResponse.json({ error: "group_create_unavailable" }, { status: 503 });
  }
}

async function loadOwnedGroup(userId: string, groupId: string) {
  const rows = await pgQueryStrict<{ id: string }>(
    `SELECT g.id::text AS id
       FROM public.ad_campaign_groups g
       JOIN public.ad_campaigns c ON c.id = g.campaign_id
       JOIN public.ad_advertisers a ON a.id = c.advertiser_id
      WHERE g.id = $1 AND a.user_id = $2`,
    [groupId, userId],
  );
  return rows[0] ?? null;
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  const sets: string[] = [];
  const values: unknown[] = [];
  if (body.name !== undefined) {
    values.push(String(body.name));
    sets.push(`name = $${values.length}`);
  }
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!["active", "paused", "archived"].includes(status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    values.push(status);
    sets.push(`status = $${values.length}`);
  }
  if (!sets.length) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }
  try {
    if (!(await loadOwnedGroup(user.id, id))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    values.push(id);
    await pgQueryStrict(
      `UPDATE public.ad_campaign_groups
          SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $${values.length}`,
      values,
    );
    const full = await pgQueryStrict(`${SELECT} WHERE g.id = $1`, [id]);
    return NextResponse.json({ group: present(full)[0] });
  } catch {
    return NextResponse.json({ error: "group_update_unavailable" }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    if (!(await loadOwnedGroup(user.id, id))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const used = await pgQueryStrict<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM public.ad_creatives WHERE group_id = $1`,
      [id],
    );
    if ((used[0]?.n ?? 0) > 0) {
      return NextResponse.json(
        { error: "group_has_creatives", detail: "move or delete its creatives first" },
        { status: 409 },
      );
    }
    await pgQueryStrict(
      `DELETE FROM public.ad_campaign_groups WHERE id = $1`,
      [id],
    );
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "group_delete_unavailable" }, { status: 503 });
  }
}

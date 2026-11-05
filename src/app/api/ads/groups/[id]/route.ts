import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { getAdvertiserForUser } from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * /api/ads/groups/:id — a single ad group, resolved with its parent
 * campaign. Groups live under campaigns (Y12) and carry no serving
 * dimensions of their own; this route exists so the portal's group
 * pages can address a group directly. Owner-scoped throughout.
 */
async function loadOwnedGroup(userId: string, groupId: string) {
  if (!/^\d+$/.test(groupId)) return null;
  const advertiser = await getAdvertiserForUser(userId).catch(() => null);
  if (!advertiser) return null;
  const rows = await pgQueryStrict<{
    id: string; name: string; status: string; created_at: string;
    campaign_id: string; campaign_name: string; campaign_status: string;
  }>(
    `SELECT g.id::text AS id, g.name, g.status, g.created_at,
            c.id::text AS campaign_id, c.name AS campaign_name,
            c.status AS campaign_status
       FROM public.ad_campaign_groups g
       JOIN public.ad_campaigns c ON c.id = g.campaign_id
      WHERE g.id = $1 AND c.advertiser_id = $2`,
    [groupId, advertiser.id],
  ).catch(() => []);
  return rows[0] ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const group = await loadOwnedGroup(user.id, id);
    if (!group) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const creatives = await pgQueryStrict(
      `SELECT id::text AS id, name, status, asset_url, click_url, cta,
              width, height, created_at
         FROM public.ad_creatives WHERE group_id = $1 ORDER BY id`,
      [id],
    ).catch(() => []);
    return NextResponse.json({ group, creatives });
  } catch {
    return NextResponse.json({ error: "group_unavailable" }, { status: 503 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const group = await loadOwnedGroup(user.id, id);
    if (!group) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const name = body.name != null ? String(body.name).trim() : group.name;
    if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
    const status =
      body.status === "active" || body.status === "paused" ? body.status : group.status;
    const rows = await pgQueryStrict(
      `UPDATE public.ad_campaign_groups SET name = $1, status = $2
        WHERE id = $3
        RETURNING id::text AS id, name, status, created_at`,
      [name, status, id],
    );
    return NextResponse.json({ group: rows[0] });
  } catch {
    return NextResponse.json({ error: "group_update_unavailable" }, { status: 503 });
  }
}

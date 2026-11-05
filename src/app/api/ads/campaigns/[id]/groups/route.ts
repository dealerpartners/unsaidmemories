import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { loadOwnedCampaign } from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * /api/ads/campaigns/:id/groups — ad group management (Y12).
 * Groups organize a campaign's creatives (Campaign -> Groups ->
 * Creatives); they carry no serving dimensions of their own.
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
    if (!owned) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const groups = await pgQueryStrict(
      `SELECT g.id::text AS id, g.name, g.status, g.created_at,
              (SELECT count(*)::int FROM public.ad_creatives cr
                WHERE cr.group_id = g.id) AS creative_count
         FROM public.ad_campaign_groups g
        WHERE g.campaign_id = $1 ORDER BY g.id`,
      [id],
    );
    return NextResponse.json({ groups });
  } catch {
    return NextResponse.json({ error: "groups_unavailable" }, { status: 503 });
  }
}

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
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }
  try {
    const owned = await loadOwnedCampaign(user.id, id);
    if (!owned) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const rows = await pgQueryStrict(
      `INSERT INTO public.ad_campaign_groups (campaign_id, name, status)
       VALUES ($1, $2, 'active')
       RETURNING id::text AS id, name, status, created_at`,
      [id, name],
    );
    return NextResponse.json({ group: rows[0] });
  } catch {
    return NextResponse.json({ error: "group_create_unavailable" }, { status: 503 });
  }
}

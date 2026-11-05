import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { orgIdForUser } from "@/lib/ads-server";
import {
  getAdvertiserForUser,
  loadOwnedCampaign,
} from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * /api/ads/smart-links — smart links & pre-save (ad_smart_links, W8).
 * A smart link hangs off one of the advertiser's campaigns; the
 * public /l/[slug] route resolves it, counts the click on this row,
 * and redirects to the destination. Split by engine (20261169):
 * links on v2 campaigns carry campaign_v2_id (advertiser-scoped);
 * historical links carry the legacy uuid campaign_id and resolve
 * through ad_legacy_campaigns (org-scoped), flagged `legacy: true`.
 * The slug resolver reads this table by slug alone and is untouched.
 */
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const rand = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${rand}` : rand;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const [advertiser, organizationId] = await Promise.all([
      getAdvertiserForUser(user.id),
      orgIdForUser(user.id),
    ]);
    const [v2, legacy] = await Promise.all([
      advertiser
        ? pgQueryStrict(
            `SELECT l.id, l.campaign_v2_id::text AS campaign_id, l.campaign_v2_id,
                    false AS legacy,
                    l.slug, l.destination_url, l.title, l.metadata,
                    l.clicks, l.active, l.created_at, l.updated_at,
                    c.name AS campaign_name
               FROM public.ad_smart_links l
               JOIN public.ad_campaigns c ON c.id = l.campaign_v2_id
              WHERE c.advertiser_id = $1
              ORDER BY l.created_at DESC
              LIMIT 100`,
            [advertiser.id],
          )
        : Promise.resolve([] as Array<Record<string, unknown>>),
      organizationId
        ? pgQueryStrict(
            `SELECT l.id, l.campaign_id::text AS campaign_id, NULL::bigint AS campaign_v2_id,
                    true AS legacy,
                    l.slug, l.destination_url, l.title, l.metadata,
                    l.clicks, l.active, l.created_at, l.updated_at,
                    c.name AS campaign_name
               FROM public.ad_smart_links l
               JOIN public.ad_legacy_campaigns c ON c.id = l.campaign_id
              WHERE c.organization_id = $1
              ORDER BY l.created_at DESC
              LIMIT 100`,
            [organizationId],
          )
        : Promise.resolve([] as Array<Record<string, unknown>>),
    ]);
    const links = [...v2, ...legacy]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 100);
    return NextResponse.json({ links });
  } catch {
    return NextResponse.json({ error: "smart_links_unavailable" }, { status: 503 });
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
  const campaignRef = String(body.campaign_v2_id ?? body.campaign_id ?? "");
  const destination = String(body.destination_url ?? "").trim();
  const title = String(body.title ?? "").trim();
  if (!campaignRef || !destination || !title)
    return NextResponse.json({ error: "campaign_destination_title_required" }, { status: 400 });
  if (!/^https?:\/\//i.test(destination))
    return NextResponse.json({ error: "destination_must_be_http_url" }, { status: 400 });
  try {
    let campaignId: string | null = null;
    let campaignV2Id: string | null = null;
    if (/^\d+$/.test(campaignRef)) {
      const owned = await loadOwnedCampaign(user.id, campaignRef);
      if (!owned) return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
      campaignV2Id = campaignRef;
    } else {
      const organizationId = await orgIdForUser(user.id);
      if (!organizationId) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const owned = await pgQueryStrict<{ id: string }>(
        `SELECT id FROM public.ad_legacy_campaigns WHERE id = $1 AND organization_id = $2`,
        [campaignRef, organizationId],
      );
      if (!owned[0]) return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
      campaignId = campaignRef;
    }
    const rows = await pgQueryStrict(
      `INSERT INTO public.ad_smart_links (campaign_id, campaign_v2_id, slug, destination_url, title, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, campaign_id, campaign_v2_id, slug, destination_url, title, metadata, clicks, active, created_at, updated_at`,
      [
        campaignId,
        campaignV2Id,
        slugify(title),
        destination,
        title,
        JSON.stringify(body.metadata ?? {}),
      ],
    );
    return NextResponse.json({ link: rows[0] });
  } catch {
    return NextResponse.json({ error: "smart_link_create_unavailable" }, { status: 503 });
  }
}

async function loadOwnedLink(userId: string, id: string) {
  const rows = await pgQueryStrict<{
    id: string;
    campaign_id: string | null;
    campaign_v2_id: string | null;
  }>(
    `SELECT id, campaign_id, campaign_v2_id::text AS campaign_v2_id
       FROM public.ad_smart_links WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.campaign_v2_id) {
    const owned = await loadOwnedCampaign(userId, row.campaign_v2_id);
    return owned ? row : null;
  }
  if (row.campaign_id) {
    const organizationId = await orgIdForUser(userId);
    if (!organizationId) return null;
    const owned = await pgQueryStrict<{ id: string }>(
      `SELECT id FROM public.ad_legacy_campaigns WHERE id = $1 AND organization_id = $2`,
      [row.campaign_id, organizationId],
    );
    return owned[0] ? row : null;
  }
  return null;
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
  if (!id || body.active === undefined)
    return NextResponse.json({ error: "id_and_active_required" }, { status: 400 });
  try {
    if (!(await loadOwnedLink(user.id, id)))
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    const rows = await pgQueryStrict(
      `UPDATE public.ad_smart_links SET active = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, active`,
      [id, body.active === true],
    );
    return NextResponse.json({ link: rows[0] });
  } catch {
    return NextResponse.json({ error: "smart_link_update_unavailable" }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    if (!(await loadOwnedLink(user.id, id)))
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    await pgQueryStrict(`DELETE FROM public.ad_smart_links WHERE id = $1`, [id]);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "smart_link_delete_unavailable" }, { status: 503 });
  }
}

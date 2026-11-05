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
 * /api/ads/sponsors — direct sponsor campaign manager
 * (ad_sponsor_campaigns, U18). A sponsor record attaches sponsor
 * identity + disclosure + flight dates to one of the advertiser's
 * campaigns; status is the lifecycle (draft → active → paused →
 * ended). Split by engine (20261169): records on v2 campaigns carry
 * campaign_v2_id (scoped by the caller's advertiser); historical
 * records carry the legacy uuid campaign_id and resolve through
 * ad_legacy_campaigns (org-scoped), flagged `legacy: true`. GET
 * merges both; the row's campaign_id is normalized to the id of
 * whichever campaign it references.
 */

async function callerScope(userId: string) {
  const [advertiser, organizationId] = await Promise.all([
    getAdvertiserForUser(userId),
    orgIdForUser(userId),
  ]);
  return { advertiser, organizationId };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { advertiser, organizationId } = await callerScope(user.id);
    const [v2, legacy] = await Promise.all([
      advertiser
        ? pgQueryStrict(
            `SELECT s.id, s.campaign_v2_id::text AS campaign_id,
                    s.campaign_v2_id, NULL::uuid AS legacy_campaign_id,
                    false AS legacy,
                    s.sponsor_name, s.sponsor_logo_url, s.sponsor_url,
                    s.disclosure, s.starts_at, s.ends_at, s.status,
                    s.created_at, s.updated_at, c.name AS campaign_name
               FROM public.ad_sponsor_campaigns s
               JOIN public.ad_campaigns c ON c.id = s.campaign_v2_id
              WHERE c.advertiser_id = $1
              ORDER BY s.created_at DESC
              LIMIT 100`,
            [advertiser.id],
          )
        : Promise.resolve([] as Array<Record<string, unknown>>),
      organizationId
        ? pgQueryStrict(
            `SELECT s.id, s.campaign_id::text AS campaign_id,
                    NULL::bigint AS campaign_v2_id, s.campaign_id AS legacy_campaign_id,
                    true AS legacy,
                    s.sponsor_name, s.sponsor_logo_url, s.sponsor_url,
                    s.disclosure, s.starts_at, s.ends_at, s.status,
                    s.created_at, s.updated_at, c.name AS campaign_name
               FROM public.ad_sponsor_campaigns s
               JOIN public.ad_legacy_campaigns c ON c.id = s.campaign_id
              WHERE c.organization_id = $1
              ORDER BY s.created_at DESC
              LIMIT 100`,
            [organizationId],
          )
        : Promise.resolve([] as Array<Record<string, unknown>>),
    ]);
    const sponsors = [...v2, ...legacy]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 100);
    return NextResponse.json({ sponsors });
  } catch {
    return NextResponse.json({ error: "sponsors_unavailable" }, { status: 503 });
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
  const sponsorName = String(body.sponsor_name ?? "").trim();
  if (!campaignRef || !sponsorName)
    return NextResponse.json({ error: "campaign_and_sponsor_required" }, { status: 400 });
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
      `INSERT INTO public.ad_sponsor_campaigns
         (campaign_id, campaign_v2_id, sponsor_name, sponsor_logo_url, sponsor_url, disclosure, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
       RETURNING id, campaign_id, campaign_v2_id, sponsor_name, sponsor_logo_url, sponsor_url, disclosure, starts_at, ends_at, status, created_at, updated_at`,
      [
        campaignId,
        campaignV2Id,
        sponsorName,
        body.sponsor_logo_url ? String(body.sponsor_logo_url) : null,
        body.sponsor_url ? String(body.sponsor_url) : null,
        body.disclosure ? String(body.disclosure) : null,
        body.starts_at ? String(body.starts_at) : null,
        body.ends_at ? String(body.ends_at) : null,
      ],
    );
    return NextResponse.json({ sponsor: rows[0] });
  } catch {
    return NextResponse.json({ error: "sponsor_create_unavailable" }, { status: 503 });
  }
}

async function loadOwnedSponsor(userId: string, id: string) {
  const rows = await pgQueryStrict<{
    id: string;
    campaign_id: string | null;
    campaign_v2_id: string | null;
  }>(
    `SELECT id, campaign_id, campaign_v2_id::text AS campaign_v2_id
       FROM public.ad_sponsor_campaigns WHERE id = $1`,
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
  const status = String(body.status ?? "");
  if (!id || !["draft", "active", "paused", "ended"].includes(status))
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  try {
    if (!(await loadOwnedSponsor(user.id, id)))
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    const rows = await pgQueryStrict(
      `UPDATE public.ad_sponsor_campaigns SET status = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, status`,
      [id, status],
    );
    return NextResponse.json({ sponsor: rows[0] });
  } catch {
    return NextResponse.json({ error: "sponsor_update_unavailable" }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    if (!(await loadOwnedSponsor(user.id, id)))
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    await pgQueryStrict(
      `DELETE FROM public.ad_sponsor_campaigns WHERE id = $1`,
      [id],
    );
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "sponsor_delete_unavailable" }, { status: 503 });
  }
}

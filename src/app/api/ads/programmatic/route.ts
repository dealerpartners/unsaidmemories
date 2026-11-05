import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { orgIdForUser } from "@/lib/ads-server";

export const dynamic = "force-dynamic";

/**
 * /api/ads/programmatic — programmatic SSP & exchange integration
 * (ad_exchange_partners + ad_programmatic_deals, AC5/U17). Both tables
 * existed live with zero code references. Partners are platform-level
 * (the exchanges the platform is integrated with); deals bind one of
 * the org's campaigns to a partner. NOTE the honest boundary: partner
 * endpoints/protocols are registered here and deals are tracked here,
 * but no live external SSP handshake exists in the codebase — a deal's
 * status records the commercial state, it does not open a socket.
 *
 * Ads v2 classification (node map): AC5/U17-as-programmatic is NOT
 * PART OF THIS ENGINE — the Direct Ad Marketplace replaces it, and
 * both tables are dropped by the retirement script on the owner's
 * order. Until then this surface is LEGACY-ONLY by design: deals
 * reference legacy campaigns, read explicitly from
 * ad_legacy_campaigns; v2 campaigns do not take programmatic deals.
 *
 * GET: partners + the org's deals. POST { partner_id, campaign_id,
 * deal_type, floor_price, starts_at, ends_at }: create a deal.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const organizationId = await orgIdForUser(user.id);
    const [partners, deals, legacyCampaigns] = await Promise.all([
      pgQueryStrict(
        `SELECT id, name, protocol, endpoint, status, revenue_share, created_at
           FROM public.ad_exchange_partners
          ORDER BY name ASC`,
      ),
      organizationId
        ? pgQueryStrict(
            `SELECT d.id, d.partner_id, d.campaign_id, d.deal_type, d.floor_price,
                    d.status, d.starts_at, d.ends_at, d.created_at,
                    p.name AS partner_name, c.name AS campaign_name
               FROM public.ad_programmatic_deals d
               JOIN public.ad_exchange_partners p ON p.id = d.partner_id
               JOIN public.ad_legacy_campaigns c ON c.id = d.campaign_id
              WHERE c.organization_id = $1
              ORDER BY d.created_at DESC
              LIMIT 100`,
            [organizationId],
          )
        : Promise.resolve([]),
      // The deal picker serves legacy campaigns only (see the header
      // note): the org's pre-v2 campaigns, id + name.
      organizationId
        ? pgQueryStrict(
            `SELECT id, name FROM public.ad_legacy_campaigns
              WHERE organization_id = $1
              ORDER BY created_at DESC
              LIMIT 200`,
            [organizationId],
          )
        : Promise.resolve([]),
    ]);
    return NextResponse.json({ partners, deals, legacy_campaigns: legacyCampaigns });
  } catch {
    return NextResponse.json({ error: "programmatic_unavailable" }, { status: 503 });
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
  const partnerId = String(body.partner_id ?? "");
  const campaignId = String(body.campaign_id ?? "");
  const dealType = String(body.deal_type ?? "preferred");
  if (!partnerId || !campaignId)
    return NextResponse.json({ error: "partner_and_campaign_required" }, { status: 400 });
  try {
    const organizationId = await orgIdForUser(user.id);
    if (!organizationId) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const [partner, owned] = await Promise.all([
      pgQueryStrict<{ id: string }>(
        `SELECT id FROM public.ad_exchange_partners WHERE id = $1`,
        [partnerId],
      ),
      pgQueryStrict<{ id: string }>(
        `SELECT id FROM public.ad_legacy_campaigns WHERE id = $1 AND organization_id = $2`,
        [campaignId, organizationId],
      ),
    ]);
    if (!partner[0]) return NextResponse.json({ error: "partner_not_found" }, { status: 404 });
    if (!owned[0]) return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
    const rows = await pgQueryStrict(
      `INSERT INTO public.ad_programmatic_deals
         (partner_id, campaign_id, deal_type, floor_price, status, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, 'draft', $5, $6)
       RETURNING id, partner_id, campaign_id, deal_type, floor_price, status, starts_at, ends_at, created_at`,
      [
        partnerId,
        campaignId,
        dealType,
        body.floor_price == null ? null : Number(body.floor_price),
        body.starts_at ? String(body.starts_at) : null,
        body.ends_at ? String(body.ends_at) : null,
      ],
    );
    return NextResponse.json({ deal: rows[0] });
  } catch {
    return NextResponse.json({ error: "deal_create_unavailable" }, { status: 503 });
  }
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
    const organizationId = await orgIdForUser(user.id);
    if (!organizationId) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const rows = await pgQueryStrict(
      `UPDATE public.ad_programmatic_deals d SET status = $3, updated_at = now()
         FROM public.ad_legacy_campaigns c
        WHERE d.id = $1 AND d.campaign_id = c.id AND c.organization_id = $2
        RETURNING d.id, d.status`,
      [id, organizationId, status],
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ deal: rows[0] });
  } catch {
    return NextResponse.json({ error: "deal_update_unavailable" }, { status: 503 });
  }
}

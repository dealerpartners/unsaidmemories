import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { MASTER_TENANT_ID } from "@/lib/site-tenant";
import { getCurrentUser } from "@/lib/auth/server";
import { orgIdForUser } from "@/lib/ads-server";
import { getAdvertiserForUser } from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * /api/ads/leads — AA3/AA4, split by engine (20261168).
 * GET: the signed-in advertiser's lead list, newest first, with
 *      campaign names. V2 leads (campaign_v2_id set) resolve their
 *      campaign through the caller's advertiser; historical leads
 *      (legacy uuid campaign_id) resolve through the org's legacy
 *      campaigns (ad_legacy_campaigns — the 20261165 rename kept the
 *      FK valid) and are flagged `legacy: true` in the payload.
 * POST (public): lead capture from a served creative — body
 *      { creative_id?, campaign_id?, name?, first_name?, last_name?,
 *      email, phone?, source? }. creative_id is the V2 creative id
 *      the serve click path carries (bigint): the lead records
 *      campaign_v2_id + creative_v2_id (campaign_id stays NULL) and
 *      the lead row itself is the conversion record — the v2 event
 *      ledger has no conversion event type and the old ad_analytics
 *      write is retired with that table.
 *
 * NAMED REMAINDER (pre-existing, out of this step's scope): the
 * AdSlot only renders its lead form when the served ad carries
 * objective === 'lead_generation'; the v2 serve payload has no
 * objective field, so the form does not render under v2 and this
 * POST's live caller is the API itself. Wiring a v2 lead-form
 * trigger (e.g. a creative/campaign lead flag) is a product
 * decision for the coordinator, not a silent change here.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const [advertiser, organizationId] = await Promise.all([
      getAdvertiserForUser(user.id),
      orgIdForUser(user.id),
    ]);
    const [v2Leads, legacyLeads] = await Promise.all([
      advertiser
        ? pgQueryStrict(
            `SELECT l.id, l.first_name, l.last_name, l.email, l.phone,
                    l.source, l.status, l.created_at,
                    l.campaign_v2_id::text AS campaign_id,
                    l.campaign_v2_id, l.creative_v2_id,
                    false AS legacy, c.name AS campaign_name
               FROM public.ad_leads l
               JOIN public.ad_campaigns c ON c.id = l.campaign_v2_id
              WHERE c.advertiser_id = $1
              ORDER BY l.created_at DESC
              LIMIT 200`,
            [advertiser.id],
          )
        : Promise.resolve([] as Array<Record<string, unknown>>),
      organizationId
        ? pgQueryStrict(
            `SELECT l.id, l.first_name, l.last_name, l.email, l.phone,
                    l.source, l.status, l.created_at,
                    l.campaign_id, NULL::bigint AS campaign_v2_id,
                    NULL::bigint AS creative_v2_id,
                    true AS legacy, c.name AS campaign_name
               FROM public.ad_leads l
               JOIN public.ad_legacy_campaigns c ON c.id = l.campaign_id
              WHERE c.tenant_id = $1 AND c.organization_id = $2
              ORDER BY l.created_at DESC
              LIMIT 200`,
            [MASTER_TENANT_ID, organizationId],
          )
        : Promise.resolve([] as Array<Record<string, unknown>>),
    ]);
    const leads = [...v2Leads, ...legacyLeads]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 200);
    return NextResponse.json({ leads });
  } catch {
    return NextResponse.json({ error: "leads_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "valid_email_required" }, { status: 400 });
  }
  const fullName = String(body.name ?? "").trim();
  const [firstFromName, ...rest] = fullName.split(/\s+/);
  const firstName =
    String(body.first_name ?? "").trim() || firstFromName || null;
  const lastName =
    String(body.last_name ?? "").trim() || rest.join(" ") || null;
  const phone = String(body.phone ?? "").trim() || null;
  const source = String(body.source ?? "ad_form").trim() || "ad_form";
  const creativeId = String(body.creative_id ?? "").trim() || null;
  const campaignId = String(body.campaign_id ?? "").trim() || null;

  try {
    // Resolve the v2 campaign + creative. Serve carries bigint ids;
    // a uuid here is a pre-v2 creative reference and cannot be
    // resolved into the v2 model — it is rejected, not guessed at.
    let campaignV2Id: string | null =
      campaignId && /^\d+$/.test(campaignId) ? campaignId : null;
    let creativeV2Id: string | null =
      creativeId && /^\d+$/.test(creativeId) ? creativeId : null;
    if (creativeV2Id) {
      const rows = await pgQueryStrict<{ campaign_id: string }>(
        `SELECT g.campaign_id::text AS campaign_id
           FROM public.ad_creatives cr
           JOIN public.ad_campaign_groups g ON g.id = cr.group_id
          WHERE cr.id = $1 LIMIT 1`,
        [creativeV2Id],
      );
      if (!rows[0]) {
        return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
      }
      campaignV2Id = rows[0].campaign_id;
    }
    if (!campaignV2Id) {
      return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
    }
    const inserted = await pgQueryStrict<{ id: string }>(
      `INSERT INTO public.ad_leads
         (campaign_id, campaign_v2_id, creative_v2_id,
          first_name, last_name, email, phone, source, status, metadata)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, 'new', $8::jsonb)
       RETURNING id`,
      [
        campaignV2Id,
        creativeV2Id,
        firstName,
        lastName,
        email,
        phone,
        source,
        JSON.stringify({ creative_id: creativeV2Id }),
      ],
    );
    return NextResponse.json({ ok: true, lead_id: inserted[0]?.id ?? null });
  } catch {
    return NextResponse.json({ error: "lead_capture_unavailable" }, { status: 503 });
  }
}

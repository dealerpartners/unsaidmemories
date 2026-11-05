import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads/leads — the W9 lead desk across every advertiser.
 * Mirrors the licensee /api/ads/leads split by engine (20261168): v2
 * leads resolve campaign_v2_id through ad_campaigns → ad_advertisers;
 * legacy leads resolve campaign_id through ad_legacy_campaigns. Admin
 * sees both, unioned, with the owning advertiser (v2) or organization
 * (legacy) surfaced. Filters: ?status= (lead status), ?campaign_id=
 * (matches either engine's campaign ref), ?q= (name/email search),
 * ?legacy=true (legacy only) / ?legacy=false (v2 only). Newest first,
 * capped at 500. Admin only.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const campaignId = url.searchParams.get("campaign_id");
  const q = url.searchParams.get("q")?.trim() || null;
  const legacyParam = url.searchParams.get("legacy");
  const wantV2 = legacyParam !== "true";
  const wantLegacy = legacyParam !== "false";

  const v2Params: unknown[] = [];
  const legParams: unknown[] = [];

  // v2 leads: ad_leads.campaign_v2_id → ad_campaigns → ad_advertisers
  let v2Sql = `SELECT l.id, l.first_name, l.last_name, l.email, l.phone,
                      l.source, l.status, l.created_at, l.updated_at,
                      l.campaign_v2_id::text AS campaign_id,
                      l.creative_v2_id::text AS creative_id,
                      false AS legacy,
                      c.name AS campaign_name,
                      c.status AS campaign_status,
                      a.id::text AS advertiser_id,
                      a.display_name AS advertiser_name
                 FROM public.ad_leads l
                 JOIN public.ad_campaigns c ON c.id = l.campaign_v2_id
                 JOIN public.ad_advertisers a ON a.id = c.advertiser_id
                WHERE l.campaign_v2_id IS NOT NULL`;
  if (status) {
    v2Params.push(status);
    v2Sql += ` AND l.status = $${v2Params.length}`;
  }
  if (campaignId && /^\d+$/.test(campaignId)) {
    v2Params.push(campaignId);
    v2Sql += ` AND l.campaign_v2_id::text = $${v2Params.length}`;
  }
  if (q) {
    v2Params.push(`%${q}%`);
    v2Sql += ` AND (l.email ILIKE $${v2Params.length}
                    OR l.first_name ILIKE $${v2Params.length}
                    OR l.last_name ILIKE $${v2Params.length})`;
  }

  // legacy leads: ad_leads.campaign_id → ad_legacy_campaigns (uuid)
  let legSql = `SELECT l.id, l.first_name, l.last_name, l.email, l.phone,
                        l.source, l.status, l.created_at, l.updated_at,
                        l.campaign_id::text AS campaign_id,
                        NULL::text AS creative_id,
                        true AS legacy,
                        c.name AS campaign_name,
                        NULL::text AS campaign_status,
                        NULL::text AS advertiser_id,
                        c.organization_id::text AS advertiser_name
                   FROM public.ad_leads l
                   JOIN public.ad_legacy_campaigns c ON c.id = l.campaign_id
                  WHERE l.campaign_id IS NOT NULL`;
  if (status) {
    legParams.push(status);
    legSql += ` AND l.status = $${legParams.length}`;
  }
  if (campaignId && !/^\d+$/.test(campaignId)) {
    legParams.push(campaignId);
    legSql += ` AND l.campaign_id::text = $${legParams.length}`;
  }
  if (q) {
    legParams.push(`%${q}%`);
    legSql += ` AND (l.email ILIKE $${legParams.length}
                    OR l.first_name ILIKE $${legParams.length}
                    OR l.last_name ILIKE $${legParams.length})`;
  }

  if (!wantV2 && !wantLegacy) {
    return NextResponse.json({ leads: [], counts: { v2: 0, legacy: 0 } });
  }

  try {
    // pgQueryStrict takes one params array; the two subqueries are
    // independently numbered (each starts at $1) so we run them
    // separately and merge in JS — UNION ALL with two independent
    // $N spaces is not expressible in one prepared statement.
    const [v2Leads, legacyLeads] = await Promise.all([
      wantV2
        ? pgQueryStrict(`${v2Sql} ORDER BY l.created_at DESC LIMIT 500`, v2Params)
        : Promise.resolve([] as Record<string, unknown>[]),
      wantLegacy
        ? pgQueryStrict(`${legSql} ORDER BY l.created_at DESC LIMIT 500`, legParams)
        : Promise.resolve([] as Record<string, unknown>[]),
    ]);
    const leads = [...v2Leads, ...legacyLeads]
      .sort((a, b) =>
        String(b.created_at).localeCompare(String(a.created_at)),
      )
      .slice(0, 500);
    return NextResponse.json({
      leads,
      counts: { v2: v2Leads.length, legacy: legacyLeads.length },
    });
  } catch {
    return NextResponse.json({ error: "leads_unavailable" }, { status: 503 });
  }
}

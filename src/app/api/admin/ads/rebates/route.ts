import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads/rebates — every rebate offer across every ad
 * account (ad_rebates, Y11). Mirrors the licensee /api/ads/rebates
 * dual-engine campaign resolution (campaign_v2_id → ad_campaigns for
 * v2, campaign_id → ad_legacy_campaigns for legacy uuid) but drops the
 * account scoping: admin sees the platform's whole rebate book with
 * the owning account + organization + campaign context. Filters:
 * ?status= (draft/active/paused/ended), ?account_id=. Newest first,
 * capped at 500. Admin only.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const accountId = url.searchParams.get("account_id");

  const conds: string[] = [];
  const params: unknown[] = [];
  if (status) {
    params.push(status);
    conds.push(`r.status = $${params.length}`);
  }
  if (accountId) {
    params.push(accountId);
    conds.push(`r.account_id = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  try {
    const rebates = await pgQueryStrict(
      `SELECT r.id, r.account_id, r.campaign_id, r.campaign_v2_id,
              COALESCE(r.campaign_v2_id::text, r.campaign_id::text) AS campaign_ref,
              (r.campaign_id IS NOT NULL) AS legacy,
              r.name, r.rebate_type, r.amount, r.percent,
              r.conditions, r.status, r.starts_at, r.ends_at,
              r.created_at, r.updated_at,
              ac.name AS account_name,
              ac.organization_id,
              org.name AS organization_name,
              COALESCE(cv.name, cl.name) AS campaign_name
         FROM public.ad_rebates r
         LEFT JOIN public.ad_accounts ac ON ac.id = r.account_id
         LEFT JOIN public.organizations org ON org.id = ac.organization_id
         LEFT JOIN public.ad_campaigns cv ON cv.id = r.campaign_v2_id
         LEFT JOIN public.ad_legacy_campaigns cl ON cl.id = r.campaign_id
         ${where}
        ORDER BY r.created_at DESC
        LIMIT 500`,
      params,
    );
    return NextResponse.json({ rebates });
  } catch {
    return NextResponse.json({ error: "rebates_unavailable" }, { status: 503 });
  }
}

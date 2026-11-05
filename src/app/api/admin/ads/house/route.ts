import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads/house — the House desk: the system advertiser
 * and its campaigns (the fill inventory that guarantees every page
 * has something to render), with their placements and zero-CPM
 * snapshots. House status is controlled through the campaigns [id]
 * route like any other campaign; the house advertiser itself cannot
 * be suspended. Admin only.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const [advertiser, campaigns] = await Promise.all([
      pgQueryStrict(
        `SELECT id::text AS id, display_name, status, created_at
           FROM public.ad_advertisers WHERE is_system LIMIT 1`,
      ),
      pgQueryStrict(
        `SELECT c.id::text AS id, c.name, c.status, c.starts_at, c.ends_at,
                c.created_at,
                (SELECT json_agg(json_build_object(
                    'code', p.code, 'cpm_cents', r.cpm_cents)
                    ORDER BY p.code)
                   FROM public.ad_campaign_placements cp
                   JOIN public.ad_placements p ON p.id = cp.placement_id
                   LEFT JOIN public.ad_campaign_rates r
                     ON r.campaign_id = c.id AND r.placement_id = p.id
                  WHERE cp.campaign_id = c.id) AS placements,
                (SELECT count(*)::int FROM public.ad_creatives cr
                  WHERE cr.campaign_id = c.id
                    AND cr.status = 'active') AS active_creatives
           FROM public.ad_campaigns c
           JOIN public.ad_advertisers a
             ON a.id = c.advertiser_id AND a.is_system
          ORDER BY c.created_at ASC`,
      ),
    ]);
    return NextResponse.json({
      advertiser: advertiser[0] ?? null,
      campaigns,
    });
  } catch {
    return NextResponse.json({ error: "house_unavailable" }, { status: 503 });
  }
}

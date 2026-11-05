import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads/advertisers — every v2 advertiser (one row per
 * marketplace user, plus the system/house row) with campaign counts
 * and lifetime spend. Admin only. Suspension lives on the [id] route.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const status = new URL(req.url).searchParams.get("status");
  try {
    const advertisers = await pgQueryStrict(
      `SELECT a.id::text AS id, a.user_id, a.display_name, a.is_system,
              a.status, a.created_at, a.updated_at,
              count(DISTINCT c.id)::int AS campaigns,
              count(DISTINCT c.id) FILTER (WHERE c.status = 'active')::int
                AS active_campaigns,
              COALESCE(sum(c.lifetime_spend_cents),0)::bigint
                AS lifetime_spend_cents
         FROM public.ad_advertisers a
         LEFT JOIN public.ad_campaigns c ON c.advertiser_id = a.id
        WHERE ($1::text IS NULL OR a.status = $1)
        GROUP BY a.id
        ORDER BY a.is_system DESC, a.created_at ASC
        LIMIT 500`,
      [status],
    );
    return NextResponse.json({ advertisers });
  } catch {
    return NextResponse.json({ error: "advertisers_unavailable" }, { status: 503 });
  }
}

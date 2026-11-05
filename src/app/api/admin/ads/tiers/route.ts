import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads/tiers — the v2 DELIVERY tier catalog (ad_tiers),
 * the admin-owned reference data the frequency-caps read model derives
 * from (ad_tiers.frequency_cap_daily) and the campaign create flow
 * validates tiers against (ad_tiers.code + active). Distinct from
 * ad_account_tiers (business-account standing, AB7) and ad_budget_tiers
 * (budget-band recommendations, Y10) — neither of which this route
 * touches. Ordered by priority asc so the console renders the buy
 * ladder the serve queue also walks. Admin only.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const tiers = await pgQueryStrict(
      `SELECT id::text AS id, code, name, priority,
              max_ads_per_page, frequency_cap_daily, active
         FROM public.ad_tiers
        ORDER BY priority ASC, id ASC`,
    );
    return NextResponse.json({ tiers });
  } catch {
    return NextResponse.json({ error: "tiers_unavailable" }, { status: 503 });
  }
}

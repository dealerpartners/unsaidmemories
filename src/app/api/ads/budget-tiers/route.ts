import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * /api/ads/budget-tiers — budget tier recommendations (ad_budget_tiers,
 * Y10). Platform reference data (seeded like ad_rate_card): the tier
 * whose daily-budget band contains the requested budget is the
 * recommendation. GET ?daily_budget= also returns that match.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const tiers = await pgQueryStrict(
      `SELECT id, name, min_daily_budget, max_daily_budget, recommendation, features, sort_order
         FROM public.ad_budget_tiers
        ORDER BY sort_order ASC`,
    );
    const daily = Number(new URL(req.url).searchParams.get("daily_budget"));
    const recommended =
      Number.isFinite(daily) && daily > 0
        ? tiers.find(
            (t) =>
              daily >= Number(t.min_daily_budget) &&
              (t.max_daily_budget == null || daily <= Number(t.max_daily_budget)),
          ) ?? null
        : null;
    return NextResponse.json({ tiers, recommended });
  } catch {
    return NextResponse.json({ error: "budget_tiers_unavailable" }, { status: 503 });
  }
}

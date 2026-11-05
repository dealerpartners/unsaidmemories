import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { orgIdForUser } from "@/lib/ads-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/tiers — the account tier system (ad_account_tiers, AB7,
 * business-account tiers — retained reference data, distinct from the
 * v2 DELIVERY tiers in ad_tiers). The catalog is platform reference
 * data; the account's standing is computed from its real lifetime ad
 * spend — Ads v2: SUM(ad_campaigns.lifetime_spend_cents) across the
 * caller's advertiser row (ad_advertisers, one per marketplace user),
 * the same counter serve accrues. The stored ad_accounts.tier label
 * is returned alongside for comparison.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const organizationId = await orgIdForUser(user.id);
    const [catalog, spendRows, accountRows] = await Promise.all([
      pgQueryStrict(
        `SELECT id, name, spend_threshold, benefits, sort_order
           FROM public.ad_account_tiers ORDER BY sort_order ASC`,
      ),
      pgQueryStrict<{ spent: number }>(
        `SELECT COALESCE(sum(lifetime_spend_cents), 0)::float8 / 100 AS spent
           FROM public.ad_campaigns
          WHERE advertiser_id =
            (SELECT id FROM public.ad_advertisers WHERE user_id = $1)`,
        [user.id],
      ),
      organizationId
        ? pgQueryStrict<{ tier: string | null }>(
            `SELECT tier FROM public.ad_accounts WHERE organization_id = $1
              ORDER BY created_at ASC LIMIT 1`,
            [organizationId],
          )
        : Promise.resolve([] as Array<{ tier: string | null }>),
    ]);
    const spent = Number(spendRows[0]?.spent ?? 0);
    let current: (typeof catalog)[number] | null = null;
    let next: (typeof catalog)[number] | null = null;
    for (const t of catalog) {
      if (spent >= Number(t.spend_threshold)) current = t;
      else if (!next) next = t;
    }
    return NextResponse.json({
      tiers: catalog,
      lifetime_spend: spent,
      current,
      next,
      progress_to_next: next
        ? Math.min(1, spent / Math.max(1, Number(next.spend_threshold)))
        : 1,
      stored_tier_label: accountRows[0]?.tier ?? null,
    });
  } catch {
    return NextResponse.json({ error: "tiers_unavailable" }, { status: 503 });
  }
}

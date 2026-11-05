import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { getAdvertiserForUser } from "@/lib/ads/advertiser";
import { preflightChecks, type CampaignRow } from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/campaigns/:id/preflight — the advertiser-facing preflight
 * read (the same primitive the admin review-queue uses, exposed to the
 * advertiser who owns the campaign). Returns the 5 launch-gate checks
 * serve itself enforces, so the right rail's Policy Warnings panel and
 * the campaign review step can show real blockers (no placement, no
 * active creative, bad flight window, missing rate-card price, no
 * payment method) BEFORE the advertiser hits publish — not after.
 *
 * Scoped to the caller's own advertiser row: an advertiser can only
 * preflight their own campaign. The checks are read-only; no state
 * changes. `ok` is true only when every check passes.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const advertiser = await getAdvertiserForUser(user.id);
    if (!advertiser) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const rows = await pgQueryStrict<CampaignRow>(
      `SELECT c.id::text AS id, c.advertiser_id::text AS advertiser_id,
              c.tier_id, t.code AS tier_code, c.name, c.status,
              c.special_category, c.category_match_mode,
              c.starts_at::text AS starts_at, c.ends_at::text AS ends_at,
              c.daily_budget_cents, c.lifetime_budget_cents,
              c.lifetime_spend_cents, c.lifetime_spend_millicents,
              c.created_at::text AS created_at, c.updated_at::text AS updated_at
         FROM public.ad_campaigns c
         JOIN public.ad_tiers t ON t.id = c.tier_id
        WHERE c.id = $1 AND c.advertiser_id = $2
        LIMIT 1`,
      [id, advertiser.id],
    );
    const campaign = rows[0];
    if (!campaign) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const checks = await preflightChecks(campaign);
    return NextResponse.json({
      campaign_id: id,
      status: campaign.status,
      ok: checks.every((c) => c.ok),
      checks,
    });
  } catch {
    return NextResponse.json(
      { error: "preflight_unavailable" },
      { status: 503 },
    );
  }
}

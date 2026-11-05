import { NextResponse } from "next/server";
import { getPgWithRetry, pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import {
  advertiserPaymentState,
  loadOwnedCampaign,
  preflightChecks,
} from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * POST /api/ads/campaigns/:id/launch — the P3 lifecycle driver.
 *
 *   draft | scheduled -> runs preflight; on success the campaign
 *     moves to 'preflight' and waits for the admin review act
 *     (W9: PATCH status 'approved' by an admin session).
 *   preflight -> 409 awaiting_review (approval is not self-serve).
 *   approved  -> SNAPSHOTS the per-placement rates from the active
 *     rate card into ad_campaign_rates (spec section 11: the price
 *     a campaign launched at is the price it is billed at, whatever
 *     the card does later), then activates.
 *   paused    -> resumes to 'active' (snapshots already exist).
 *   active | ended -> 409.
 *
 * Suspended advertisers cannot launch (their advertiser row's
 * status gates every transition here). House-tier campaigns belong
 * to the system advertiser and are not launched through this route.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const owned = await loadOwnedCampaign(user.id, id);
    if (!owned) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const { campaign, advertiser } = owned;
    if (advertiser.status !== "active") {
      return NextResponse.json(
        { error: "advertiser_not_active" },
        { status: 403 },
      );
    }

    if (campaign.status === "draft" || campaign.status === "scheduled") {
      const checks = await preflightChecks(campaign);
      const failed = checks.filter((c) => !c.ok);
      if (failed.length) {
        return NextResponse.json(
          { error: "preflight_failed", checks },
          { status: 422 },
        );
      }
      await pgQueryStrict(
        `UPDATE public.ad_campaigns SET status = 'preflight', updated_at = now()
          WHERE id = $1`,
        [id],
      );
      return NextResponse.json({
        campaign_id: id,
        status: "preflight",
        awaiting: "admin_review",
        checks,
      });
    }

    if (campaign.status === "preflight") {
      return NextResponse.json(
        { error: "awaiting_review", status: "preflight" },
        { status: 409 },
      );
    }

    if (campaign.status === "paused") {
      // Resume re-checks the one preflight fact that can deteriorate
      // while a campaign sits paused: the ability to charge it.
      const payment = await advertiserPaymentState(campaign.advertiser_id);
      if (!payment.isSystem && payment.methods === 0) {
        return NextResponse.json(
          {
            error: "preflight_failed",
            checks: [
              {
                key: "payment",
                ok: false,
                detail:
                  "no payment method on file — add one in Billing before this campaign can run",
              },
            ],
          },
          { status: 422 },
        );
      }
      await pgQueryStrict(
        `UPDATE public.ad_campaigns SET status = 'active', updated_at = now()
          WHERE id = $1`,
        [id],
      );
      return NextResponse.json({ campaign_id: id, status: "active" });
    }

    if (campaign.status !== "approved") {
      return NextResponse.json(
        { error: "invalid_transition", from: campaign.status, to: "active" },
        { status: 409 },
      );
    }

    // approved -> active, with the launch rate snapshot in the same
    // transaction: either every placement is priced and the campaign
    // activates, or nothing changes.
    const checks = await preflightChecks(campaign);
    const failed = checks.filter((c) => !c.ok);
    if (failed.length) {
      return NextResponse.json(
        { error: "preflight_failed", checks },
        { status: 422 },
      );
    }
    const client = await getPgWithRetry();
    try {
      await client.query("BEGIN");
      const placements = await client.query<{ placement_id: number }>(
        `SELECT placement_id FROM public.ad_campaign_placements
          WHERE campaign_id = $1`,
        [id],
      );
      const rates: { placement_id: number; cpm_cents: number }[] = [];
      for (const p of placements.rows) {
        const item = await client.query<{
          id: string;
          cpm_cents: number;
        }>(
          `SELECT i.id::text AS id, i.cpm_cents
             FROM public.ad_rate_card_items i
             JOIN public.ad_rate_cards rc
               ON rc.id = i.rate_card_id AND rc.active = true
            WHERE i.tier_id = $1 AND i.placement_id = $2 AND i.active = true
            ORDER BY rc.id ASC LIMIT 1`,
          [campaign.tier_id, p.placement_id],
        );
        if (!item.rows[0]) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "rate_missing", placement_id: p.placement_id },
            { status: 422 },
          );
        }
        await client.query(
          `INSERT INTO public.ad_campaign_rates
             (campaign_id, placement_id, cpm_cents, rate_card_item_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (campaign_id, placement_id) DO UPDATE
             SET cpm_cents = EXCLUDED.cpm_cents,
                 rate_card_item_id = EXCLUDED.rate_card_item_id,
                 created_at = now()`,
          [id, p.placement_id, item.rows[0].cpm_cents, item.rows[0].id],
        );
        rates.push({
          placement_id: p.placement_id,
          cpm_cents: item.rows[0].cpm_cents,
        });
      }
      await client.query(
        `UPDATE public.ad_campaigns SET status = 'active', updated_at = now()
          WHERE id = $1`,
        [id],
      );
      await client.query("COMMIT");
      return NextResponse.json({ campaign_id: id, status: "active", rates });
    } catch {
      await client.query("ROLLBACK").catch(() => {});
      return NextResponse.json({ error: "launch_unavailable" }, { status: 503 });
    } finally {
      client.release();
    }
  } catch {
    return NextResponse.json({ error: "launch_unavailable" }, { status: 503 });
  }
}

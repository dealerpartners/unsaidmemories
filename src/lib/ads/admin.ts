import "server-only";
import { getPgWithRetry, pgQueryStrict } from "@/lib/pg";
import { advertiserPaymentState, loadCampaign, preflightChecks, type CampaignRow } from "@/lib/ads/advertiser";

// ============================================================================
// admin.ts — the W9 Advertising Operations console's server helpers
// (Sunny's Production Ad Architecture, 2026-10-23: W9 is the admin /
// operator console over the SAME engine — campaign status, advertiser
// suspension, creative approval, special-category review, rate cards,
// placements, house campaigns. There is no separate ad-management
// database; everything here reads and writes the v2 subsystem tables).
//
// Status authority: admins walk the same P3 lifecycle the advertiser
// routes expose, plus the two acts that are theirs alone — approving a
// preflight campaign and returning one for changes. Activation from
// 'approved' performs the launch route's rate-snapshot transaction so
// an admin-activated campaign is priced exactly like a self-serve one.
// ============================================================================

export const ADMIN_TRANSITIONS: Record<string, string[]> = {
  draft: ["ended"],
  scheduled: ["preflight", "ended"],
  preflight: ["approved", "draft", "ended"],
  approved: ["active", "ended"],
  active: ["paused", "ended"],
  paused: ["active", "ended"],
  ended: [],
};

export type StatusResult =
  | { ok: true; campaign: CampaignRow; rates?: { placement_id: number; cpm_cents: number }[] }
  | { ok: false; status: number; error: string; detail?: unknown };

/**
 * Move a campaign to `to` under the admin transition map. The
 * approved -> active move snapshots per-placement rates from the
 * active rate card inside the same transaction (spec section 11),
 * exactly like POST /api/ads/campaigns/:id/launch. A suspended or
 * closed advertiser's campaign cannot be activated (the system/house
 * advertiser is exempt: house inventory is the platform's own).
 */
export async function adminSetCampaignStatus(
  campaignId: string,
  to: string,
): Promise<StatusResult> {
  const campaign = await loadCampaign(campaignId);
  if (!campaign) return { ok: false, status: 404, error: "not_found" };

  const allowed = ADMIN_TRANSITIONS[campaign.status] ?? [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      status: 409,
      error: "invalid_transition",
      detail: { from: campaign.status, to },
    };
  }

  if (to !== "active") {
    await pgQueryStrict(
      `UPDATE public.ad_campaigns SET status = $2, updated_at = now()
        WHERE id = $1`,
      [campaignId, to],
    );
    const updated = await loadCampaign(campaignId);
    return { ok: true, campaign: updated ?? campaign };
  }

  // Activation. Paused -> active resumes on existing snapshots;
  // approved -> active must snapshot first (or verify they exist).
  const adv = await pgQueryStrict<{ status: string; is_system: boolean }>(
    `SELECT status, is_system FROM public.ad_advertisers WHERE id = $1`,
    [campaign.advertiser_id],
  );
  if (!adv[0]) return { ok: false, status: 404, error: "advertiser_not_found" };
  if (!adv[0].is_system && adv[0].status !== "active") {
    return { ok: false, status: 403, error: "advertiser_not_active" };
  }

  if (campaign.status === "paused") {
    // Resume re-checks the one preflight fact that can deteriorate
    // while a campaign sits paused: the ability to charge it.
    const payment = await advertiserPaymentState(campaign.advertiser_id);
    if (!payment.isSystem && payment.methods === 0) {
      return { ok: false, status: 422, error: "preflight_failed" };
    }
    await pgQueryStrict(
      `UPDATE public.ad_campaigns SET status = 'active', updated_at = now()
        WHERE id = $1`,
      [campaignId],
    );
    const updated = await loadCampaign(campaignId);
    return { ok: true, campaign: updated ?? campaign };
  }

  const checks = await preflightChecks(campaign);
  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    return { ok: false, status: 422, error: "preflight_failed", detail: checks };
  }

  const client = await getPgWithRetry();
  try {
    await client.query("BEGIN");
    const placements = await client.query<{ placement_id: number }>(
      `SELECT placement_id FROM public.ad_campaign_placements
        WHERE campaign_id = $1`,
      [campaignId],
    );
    const rates: { placement_id: number; cpm_cents: number }[] = [];
    const isHouse = campaign.tier_code === "house";
    for (const p of placements.rows) {
      if (isHouse) {
        await client.query(
          `INSERT INTO public.ad_campaign_rates
             (campaign_id, placement_id, cpm_cents, rate_card_item_id)
           VALUES ($1, $2, 0, NULL)
           ON CONFLICT (campaign_id, placement_id) DO UPDATE
             SET cpm_cents = 0, rate_card_item_id = NULL, created_at = now()`,
          [campaignId, p.placement_id],
        );
        rates.push({ placement_id: p.placement_id, cpm_cents: 0 });
        continue;
      }
      const item = await client.query<{ id: string; cpm_cents: number }>(
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
        return {
          ok: false,
          status: 422,
          error: "rate_missing",
          detail: { placement_id: p.placement_id },
        };
      }
      await client.query(
        `INSERT INTO public.ad_campaign_rates
           (campaign_id, placement_id, cpm_cents, rate_card_item_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (campaign_id, placement_id) DO UPDATE
           SET cpm_cents = EXCLUDED.cpm_cents,
               rate_card_item_id = EXCLUDED.rate_card_item_id,
               created_at = now()`,
        [campaignId, p.placement_id, item.rows[0].cpm_cents, item.rows[0].id],
      );
      rates.push({
        placement_id: p.placement_id,
        cpm_cents: item.rows[0].cpm_cents,
      });
    }
    await client.query(
      `UPDATE public.ad_campaigns SET status = 'active', updated_at = now()
        WHERE id = $1`,
      [campaignId],
    );
    await client.query("COMMIT");
    const updated = await loadCampaign(campaignId);
    return { ok: true, campaign: updated ?? campaign, rates };
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return { ok: false, status: 503, error: "activation_unavailable" };
  } finally {
    client.release();
  }
}

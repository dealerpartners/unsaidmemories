import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser, isAdmin } from "@/lib/auth/server";
import {
  loadCampaign,
  loadOwnedCampaign,
} from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/campaigns/:id/delivery-status — the Y8 surface,
 * redefined as the "Eligibility & Delivery" status panel.
 *
 * Not a prediction and not a probability: the seven checks the
 * serving contract itself evaluates (Eligible / Flight / Targeting /
 * Placement / Budget / Frequency / Tier), computed live from the
 * same tables serve reads, so the panel can never promise what the
 * engine will not do.
 */

const PANEL_COPY =
  "Eligibility never guarantees an advertiser impressions; it guarantees every page has something to render.";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const owned = await loadOwnedCampaign(user.id, id);
    const campaign =
      owned?.campaign ??
      ((await isAdmin()) ? await loadCampaign(id) : null);
    if (!campaign) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const advertiserActive = owned
      ? owned.advertiser.status === "active"
      : true;
    const now = new Date();
    const starts = new Date(campaign.starts_at);
    const ends = new Date(campaign.ends_at);
    const [daily, placements, tier] = await Promise.all([
      pgQueryStrict<{ impressions: number; spend_millicents: number }>(
        `SELECT COALESCE(impressions, 0)::int AS impressions,
                COALESCE(spend_millicents, 0)::int AS spend_millicents
           FROM public.ad_campaign_daily
          WHERE campaign_id = $1 AND delivery_date = CURRENT_DATE`,
        [id],
      ),
      pgQueryStrict<{ n: number; with_rate: number }>(
        `SELECT count(*)::int AS n,
                count(r.cpm_cents)::int AS with_rate
           FROM public.ad_campaign_placements cp
           LEFT JOIN public.ad_campaign_rates r
             ON r.campaign_id = cp.campaign_id
            AND r.placement_id = cp.placement_id
          WHERE cp.campaign_id = $1`,
        [id],
      ),
      pgQueryStrict<{
        code: string;
        priority: number;
        frequency_cap_daily: number;
        max_ads_per_page: number;
      }>(
        `SELECT code, priority, frequency_cap_daily, max_ads_per_page
           FROM public.ad_tiers WHERE id = $1`,
        [campaign.tier_id],
      ),
    ]);
    // Spend is read from the millicent ledger serve actually writes —
    // the integer spend_cents columns are never updated and would
    // report 0 forever (a real delivered impression read "today 0c").
    const spentTodayMs = daily[0]?.spend_millicents ?? 0;
    const lifetimeSpentMs = campaign.lifetime_spend_millicents ?? 0;
    const fmtC = (ms: number) => {
      const c = ms / 1000;
      return Number.isInteger(c) ? `${c}c` : `${(Math.round(c * 10) / 10).toFixed(1)}c`;
    };
    const dailyBudgetOk =
      campaign.daily_budget_cents === 0 ||
      spentTodayMs < campaign.daily_budget_cents * 1000;
    const lifetimeBudgetOk =
      campaign.lifetime_budget_cents === 0 ||
      lifetimeSpentMs < campaign.lifetime_budget_cents * 1000;
    const flightState =
      now < starts ? "upcoming" : now >= ends ? "ended" : "in_flight";

    return NextResponse.json({
      campaign_id: id,
      status: campaign.status,
      panel_copy: PANEL_COPY,
      checks: {
        eligible: {
          ok: advertiserActive && campaign.status === "active",
          detail: !advertiserActive
            ? "advertiser is not active"
            : campaign.status === "active"
              ? "advertiser and campaign are active"
              : `campaign status is ${campaign.status}`,
        },
        flight: {
          ok: flightState === "in_flight",
          detail: `${flightState}: ${campaign.starts_at} -> ${campaign.ends_at}`,
        },
        targeting: {
          ok: true,
          detail:
            "category + compact targeting are evaluated per request from what the request proves (device, language, state)",
        },
        placement: {
          ok: (placements[0]?.n ?? 0) > 0,
          detail: `${placements[0]?.n ?? 0} placement(s) attached, ${placements[0]?.with_rate ?? 0} with a launch rate snapshot`,
        },
        budget: {
          ok: dailyBudgetOk && lifetimeBudgetOk,
          detail: `today ${fmtC(spentTodayMs)} of ${campaign.daily_budget_cents === 0 ? "unlimited" : `${campaign.daily_budget_cents}c`}; lifetime ${fmtC(lifetimeSpentMs)} of ${campaign.lifetime_budget_cents === 0 ? "unlimited" : `${campaign.lifetime_budget_cents}c`}`,
        },
        frequency: {
          ok: true,
          detail: `tier cap ${tier[0]?.frequency_cap_daily ?? 0} impressions per viewer per day`,
        },
        tier: {
          ok: !!tier[0],
          detail: tier[0]
            ? `${tier[0].code} (priority ${tier[0].priority}, up to ${tier[0].max_ads_per_page} per page)`
            : "tier not found",
        },
      },
      delivered_today: daily[0]?.impressions ?? 0,
    });
  } catch {
    return NextResponse.json({ error: "delivery_status_unavailable" }, { status: 503 });
  }
}

import "server-only";
import { pgQueryStrict } from "@/lib/pg";
import { MASTER_TENANT_ID } from "@/lib/site-tenant-shared";

// ============================================================================
// advertiser.ts — the Ads v2 advertiser identity + campaign helpers.
//
// K1: the ad_advertisers row IS the account upgrade. Activation is a
// get-or-create keyed on the signed-in user's id (one row per user,
// idempotent, race-safe). Onboarding on top of it is a business
// profile experience, not an eligibility gate.
// ============================================================================

export interface Advertiser {
  id: string;
  user_id: string | null;
  display_name: string | null;
  is_system: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignRow {
  id: string;
  advertiser_id: string;
  tier_id: number;
  tier_code: string;
  name: string;
  status: string;
  special_category: string | null;
  category_match_mode: string;
  starts_at: string;
  ends_at: string;
  daily_budget_cents: number;
  lifetime_budget_cents: number;
  lifetime_spend_cents: number;
  lifetime_spend_millicents: number;
  created_at: string;
  updated_at: string;
}

const CAMPAIGN_SELECT = `
  SELECT c.id::text AS id, c.advertiser_id::text AS advertiser_id,
         c.tier_id, t.code AS tier_code, c.name, c.status,
         c.special_category, c.category_match_mode,
         c.starts_at, c.ends_at,
         c.daily_budget_cents::text AS daily_budget_cents,
         c.lifetime_budget_cents::text AS lifetime_budget_cents,
         c.lifetime_spend_cents::text AS lifetime_spend_cents,
         c.lifetime_spend_millicents::text AS lifetime_spend_millicents,
         c.created_at, c.updated_at
    FROM public.ad_campaigns c
    JOIN public.ad_tiers t ON t.id = c.tier_id`;

function mapCampaign(r: Record<string, unknown>): CampaignRow {
  return {
    ...(r as unknown as CampaignRow),
    daily_budget_cents: Number(r.daily_budget_cents ?? 0),
    lifetime_budget_cents: Number(r.lifetime_budget_cents ?? 0),
    // Spend truth: serve accumulates the MILLICENT ledger
    // (ad_campaigns.lifetime_spend_millicents); the integer cents
    // column is never written and sits at 0 forever. The cents field
    // is derived from the ledger (nearest cent) so every reader of a
    // campaign row reports real spend; the raw ledger rides along.
    lifetime_spend_cents: Math.round(
      Number(r.lifetime_spend_millicents ?? 0) / 1000,
    ),
    lifetime_spend_millicents: Number(r.lifetime_spend_millicents ?? 0),
  };
}

export async function getAdvertiserForUser(
  userId: string,
): Promise<Advertiser | null> {
  const rows = await pgQueryStrict<Advertiser>(
    `SELECT id::text AS id, user_id, display_name, is_system, status,
            created_at, updated_at
       FROM public.ad_advertisers WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * The Ad Center identity grant: activation adjoins the "ads" portal to
 * the ONE identity (identity_grants), the same mechanism every other
 * portal uses — it is what lets the account switcher offer the Ad
 * Center and /api/auth/switch primary it. Ranked last in
 * GRANT_SOURCE_RANK (source ad_center_activation) so it never becomes
 * the identity's primary over a customer or work portal. Idempotent.
 */
export async function ensureAdsIdentityGrant(
  userId: string,
  displayName: string | null,
): Promise<void> {
  await pgQueryStrict(
    `INSERT INTO public.identity_grants
       (user_id, scope, role, membership_role, tenant_id, display_name, status, source)
     SELECT $1, 'ads', 'advertiser', 'advertiser', $2, $3, 'active', 'ad_center_activation'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.identity_grants
         WHERE user_id = $1 AND scope = 'ads' AND status = 'active')`,
    [userId, MASTER_TENANT_ID, displayName],
  );
}

/** K1 activation: get-or-create the caller's advertiser row. */
export async function activateAdvertiser(
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null },
  displayName?: string | null,
): Promise<Advertiser> {
  const existing = await getAdvertiserForUser(user.id);
  if (existing) {
    await ensureAdsIdentityGrant(user.id, existing.display_name);
    return existing;
  }
  const meta = user.user_metadata ?? {};
  const name =
    displayName?.trim() ||
    (typeof meta.company_name === "string" && meta.company_name) ||
    (typeof meta.display_name === "string" && meta.display_name) ||
    (user.email ? user.email.split("@")[0] : null) ||
    "Advertiser";
  await pgQueryStrict(
    `INSERT INTO public.ad_advertisers (user_id, display_name, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (user_id) DO NOTHING`,
    [user.id, name],
  );
  const created = await getAdvertiserForUser(user.id);
  if (!created) throw new Error("advertiser_activation_failed");
  await ensureAdsIdentityGrant(user.id, created.display_name);
  return created;
}

export async function loadCampaign(
  campaignId: string,
): Promise<CampaignRow | null> {
  if (!/^\d+$/.test(campaignId)) return null;
  const rows = await pgQueryStrict<Record<string, unknown>>(
    `${CAMPAIGN_SELECT} WHERE c.id = $1 LIMIT 1`,
    [campaignId],
  );
  return rows[0] ? mapCampaign(rows[0]) : null;
}

/** A campaign is owned when its advertiser belongs to the user. */
export async function loadOwnedCampaign(
  userId: string,
  campaignId: string,
): Promise<{ campaign: CampaignRow; advertiser: Advertiser } | null> {
  const advertiser = await getAdvertiserForUser(userId);
  if (!advertiser) return null;
  const campaign = await loadCampaign(campaignId);
  if (!campaign || campaign.advertiser_id !== advertiser.id) return null;
  return { campaign, advertiser };
}

// ---------------------------------------------------------------------------
// Preflight (P3): the checks a campaign must pass to leave preflight
// for approval, and to activate. Also the factual basis of the Y8
// "Eligibility & Delivery" panel. Read-only.
// ---------------------------------------------------------------------------

export interface PreflightCheck {
  key: string;
  ok: boolean;
  detail: string;
}

/**
 * Whether the advertiser behind a campaign can be charged: an active
 * saved payment method on their ad account. The billing spine keys
 * accounts by organization (developer_profiles), the same chain the
 * /api/ads/billing routes resolve — advertiser user → organization →
 * ad account → active methods. System (house) advertisers are exempt:
 * the platform does not charge itself.
 */
export async function advertiserPaymentState(
  advertiserId: string,
): Promise<{ isSystem: boolean; methods: number }> {
  const rows = await pgQueryStrict<{ is_system: boolean; methods: number }>(
    `SELECT adv.is_system,
            (SELECT count(*)::int
               FROM public.ad_payment_methods pm
               JOIN public.ad_accounts aa ON aa.id = pm.account_id
               JOIN public.developer_profiles dp
                 ON dp.organization_id = aa.organization_id
              WHERE dp.user_id = adv.user_id AND pm.status = 'active') AS methods
       FROM public.ad_advertisers adv
      WHERE adv.id = $1`,
    [advertiserId],
  );
  return {
    isSystem: rows[0]?.is_system ?? false,
    methods: rows[0]?.methods ?? 0,
  };
}

export async function preflightChecks(
  campaign: CampaignRow,
): Promise<PreflightCheck[]> {
  const [placements, creatives, rates, payment] = await Promise.all([
    pgQueryStrict<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.ad_campaign_placements cp
        JOIN public.ad_placements p ON p.id = cp.placement_id AND p.active = true
        WHERE cp.campaign_id = $1`,
      [campaign.id],
    ),
    pgQueryStrict<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.ad_creatives cr
        JOIN public.ad_campaign_groups g
          ON g.id = cr.group_id AND g.status = 'active'
        WHERE cr.campaign_id = $1 AND cr.status = 'active'`,
      [campaign.id],
    ),
    pgQueryStrict<{ placement_id: number; cpm_cents: number | null }>(
      `SELECT cp.placement_id,
              (SELECT i.cpm_cents FROM public.ad_rate_card_items i
                JOIN public.ad_rate_cards rc
                  ON rc.id = i.rate_card_id AND rc.active = true
                WHERE i.tier_id = $2 AND i.placement_id = cp.placement_id
                  AND i.active = true
                ORDER BY rc.id ASC LIMIT 1) AS cpm_cents
         FROM public.ad_campaign_placements cp
        WHERE cp.campaign_id = $1`,
      [campaign.id, campaign.tier_id],
    ),
    advertiserPaymentState(campaign.advertiser_id),
  ]);
  const isHouse = campaign.tier_code === "house";
  const missingRates = isHouse
    ? []
    : rates.filter((r) => r.cpm_cents == null);
  return [
    {
      key: "placements",
      ok: (placements[0]?.n ?? 0) > 0,
      detail: `${placements[0]?.n ?? 0} active placement(s) attached`,
    },
    {
      key: "creatives",
      ok: (creatives[0]?.n ?? 0) > 0,
      detail: `${creatives[0]?.n ?? 0} active creative(s) in active groups`,
    },
    {
      key: "flight",
      ok: new Date(campaign.ends_at) > new Date(campaign.starts_at),
      detail: `${campaign.starts_at} -> ${campaign.ends_at}`,
    },
    {
      key: "rates",
      ok: missingRates.length === 0,
      detail: isHouse
        ? "house inventory is priced at 0"
        : missingRates.length === 0
          ? "a rate-card price exists for every placement"
          : `${missingRates.length} placement(s) have no rate-card price`,
    },
    {
      key: "payment",
      ok: payment.isSystem || payment.methods > 0,
      detail: payment.isSystem
        ? "platform account — no payment method required"
        : payment.methods > 0
          ? `${payment.methods} payment method(s) on file`
          : "no payment method on file — add one in Billing before this campaign can run",
    },
  ];
}

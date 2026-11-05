import {
  isPayoutDelayDays,
  type PayoutDelayDays,
} from "@/lib/stripe-connect-payloads";

// ---------------------------------------------------------------------------
// sellers/payout-delay.ts — the payout-delay policy + derivation for the
// decided Connect model (agency model, destination charges; Sunny,
// 2026-10-14). NO live Stripe calls happen here — this module reads the
// platform's own records and derives the delay a seller's connected
// account schedule must carry. The payload that SETS it lives in
// src/lib/stripe-connect-payloads.ts (buildPayoutScheduleUpdatePayload).
//
// WHERE THE POLICY LIVES (firsthand census, 2026-10-14):
//   public.policy_settings — the platform's per-tenant configuration
//   store (UNIQUE (tenant_id, scope, key); scopes in use: deposits,
//   refunds). The payout-delay policy is scope 'payout_delay':
//     key 'tier:<tier name>'  value '3' | '5' | '7'   (one row per band)
//     key 'default_tier'      value '<tier name>'    (the band a seller
//                              with no recorded tier falls under)
//   Tier NAMES are the tenant's own bands — no delivered text names a
//   tier vocabulary, so the Trust Center policy editor defines them.
//   The delay VALUES are the ruling's three: 3, 5, or 7 days. A stored
//   value outside that set is invalid data and derives as unconfigured,
//   never silently honored.
//
// WHERE THE TIER LIVES:
//   public.seller_capabilities.pro_tier (text, nullable) — the designed
//   tier carrier, one row per (tenant_id, seller_id) (unique index
//   idx_seller_capabilities_unique). Its only other writer
//   (/api/admin/users/permissions) writes is_pro / can_advertise /
//   can_bulk_import / status and never pro_tier, so the Trust Center
//   control is pro_tier's first writer. NO performance score exists to
//   derive a tier from (seller_kpi_*, seller_metric_*, seller_insights
//   hold no usable rows; sellers carries no score column) — the tier is
//   an ADMIN-ASSIGNED RECORD until the A4 KPI machinery computes one.
//   Nothing here computes or invents a score.
//
// CONNECTED ACCOUNT STATE:
//   public.seller_stripe_accounts (migration 20261082) is the seller's
//   connected-account store — one row per (tenant_id, seller_id) with
//   Stripe's own flags. Its writer is lib/sellers/connect.ts (BL-1,
//   2026-10-23): seller-facing Connect onboarding creates the account
//   and the row; the account.updated webhook and the on-demand sync
//   keep the flags current. The derivation below reads the store, so
//   connectedAccount.recorded is the seller's real state — false means
//   THIS seller has not connected yet, never "no store exists".
// ---------------------------------------------------------------------------

type PgClientLike = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

export const PAYOUT_DELAY_SCOPE = "payout_delay";
const TIER_KEY_PREFIX = "tier:";

export interface PayoutDelayPolicy {
  /** Configured bands, in the order the policy rows were created. */
  tiers: Array<{ tier: string; delayDays: PayoutDelayDays }>;
  /** The band applied to sellers with no recorded tier, when set. */
  defaultTier: string | null;
}

/** Read the tenant's payout-delay policy from policy_settings. */
export async function readPayoutDelayPolicy(
  client: PgClientLike,
  tenantId: string,
): Promise<PayoutDelayPolicy> {
  const { rows } = await client.query(
    `SELECT key, value FROM public.policy_settings
      WHERE tenant_id = $1 AND scope = $2
      ORDER BY key ASC`,
    [tenantId, PAYOUT_DELAY_SCOPE],
  );
  const tiers: Array<{ tier: string; delayDays: PayoutDelayDays }> = [];
  let defaultTier: string | null = null;
  for (const r of rows) {
    const key = String(r.key);
    const value = String(r.value ?? "");
    if (key === "default_tier") {
      defaultTier = value || null;
    } else if (key.startsWith(TIER_KEY_PREFIX)) {
      const tier = key.slice(TIER_KEY_PREFIX.length);
      const days = Number(value);
      // Only the ruling's three values are a policy. Anything else in
      // the store is invalid data — surfaced as unconfigured, not used.
      if (tier && isPayoutDelayDays(days)) tiers.push({ tier, delayDays: days });
    }
  }
  if (defaultTier && !tiers.some((t) => t.tier === defaultTier)) {
    // A default pointing at an unconfigured band is no default.
    defaultTier = null;
  }
  return { tiers, defaultTier };
}

/**
 * The pure derivation, shared by the single-seller read and the Trust
 * Center list so the two can never drift: recorded tier band → its
 * delay; else the configured default band; else unconfigured (null).
 */
export function deriveDelayFromRecord(
  policy: PayoutDelayPolicy,
  recordedTier: string | null,
): { delayDays: PayoutDelayDays | null; source: SellerPayoutDelay["source"] } {
  const byTier = new Map(policy.tiers.map((t) => [t.tier, t.delayDays]));
  if (recordedTier && byTier.has(recordedTier)) {
    return { delayDays: byTier.get(recordedTier)!, source: "tier" };
  }
  if (policy.defaultTier && byTier.has(policy.defaultTier)) {
    return { delayDays: byTier.get(policy.defaultTier)!, source: "default_tier" };
  }
  return { delayDays: null, source: "unconfigured" };
}

export interface SellerPayoutDelay {
  sellerId: string;
  /** The tier recorded on seller_capabilities.pro_tier, when any. */
  recordedTier: string | null;
  /** seller_capabilities.status for the seller's row, when any. */
  capabilitiesStatus: string | null;
  delayDays: PayoutDelayDays | null;
  /** How the delay was derived — or why none could be. */
  source: "tier" | "default_tier" | "unconfigured";
  /** The seller's real Connect state from seller_stripe_accounts. */
  connectedAccount: {
    recorded: boolean;
    stripeAccountId: string | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    onboardingComplete: boolean;
    note: string;
  };
}

export const CONNECTED_ACCOUNT_NOTE =
  "Connected accounts live in seller_stripe_accounts — written by seller Connect onboarding (lib/sellers/connect.ts) and kept current by Stripe's account.updated webhook. recorded = false means this seller has not connected yet. Tenant/franchise Connect accounts live in tenant_stripe_accounts and are a different actor.";

/**
 * Derive one seller's payout delay from the RECORDED tier + the tenant's
 * RECORDED policy. Nothing is computed from performance data and no
 * default is invented: with neither a recorded tier nor a configured
 * default band, the delay is null (unconfigured) and the pane says why.
 */
export async function deriveSellerPayoutDelay(
  client: PgClientLike,
  tenantId: string,
  sellerId: string,
  policy?: PayoutDelayPolicy,
): Promise<SellerPayoutDelay> {
  const pol = policy ?? (await readPayoutDelayPolicy(client, tenantId));
  const { rows } = await client.query(
    `SELECT pro_tier, status FROM public.seller_capabilities
      WHERE tenant_id = $1 AND seller_id = $2::uuid LIMIT 1`,
    [tenantId, sellerId],
  );
  const cap = rows[0];
  const recordedTier = cap?.pro_tier ? String(cap.pro_tier) : null;
  const capabilitiesStatus = cap?.status ? String(cap.status) : null;
  const { delayDays, source } = deriveDelayFromRecord(pol, recordedTier);
  const { rows: acctRows } = await client.query(
    `SELECT stripe_account_id, charges_enabled, payouts_enabled,
            onboarding_complete
       FROM public.seller_stripe_accounts
      WHERE tenant_id = $1 AND seller_id = $2::uuid LIMIT 1`,
    [tenantId, sellerId],
  );
  const acct = acctRows[0];
  return {
    sellerId,
    recordedTier,
    capabilitiesStatus,
    delayDays,
    source,
    connectedAccount: acct?.stripe_account_id
      ? {
          recorded: true,
          stripeAccountId: String(acct.stripe_account_id),
          chargesEnabled: Boolean(acct.charges_enabled),
          payoutsEnabled: Boolean(acct.payouts_enabled),
          onboardingComplete: Boolean(acct.onboarding_complete),
          note: "Connected account recorded in seller_stripe_accounts.",
        }
      : {
          recorded: false,
          stripeAccountId: null,
          chargesEnabled: false,
          payoutsEnabled: false,
          onboardingComplete: false,
          note: CONNECTED_ACCOUNT_NOTE,
        },
  };
}

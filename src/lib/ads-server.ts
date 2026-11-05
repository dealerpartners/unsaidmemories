import "server-only";
import { pgQueryStrict } from "@/lib/pg";
import { getStripe } from "@/lib/stripe";

// ============================================================================
// ads-server.ts — shared server machinery for the Ad Center (public.ad_*).
//
// Before BL-5 each /api/ads/* route re-implemented its own slice of this:
// org resolution lived only in the campaigns route, ad_accounts had no
// writer anywhere, targeting was written as '{}' and never read, and
// serve was anonymous so frequency caps could not exist. This module is
// the one home for: the advertiser's organization bridge, the ad account
// writer, the targeting contract (normalize + evaluate), the viewer
// identity serve prices caps against, and the unbilled-spend ledger math
// the billing writer charges.
// ============================================================================

// ---------------------------------------------------------------------------
// Organization bridge — campaigns belong to the organization the developer
// portal provisions for the signed-in user (developer_profiles link).
// ---------------------------------------------------------------------------

export async function orgIdForUser(userId: string): Promise<string | null> {
  const rows = await pgQueryStrict<{ organization_id: string | null }>(
    `SELECT organization_id FROM public.developer_profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0]?.organization_id ?? null;
}

// ---------------------------------------------------------------------------
// Ad account writer (ad_accounts) — get-or-create the ad account for an
// organization. Called from campaign creation and every billing route, so
// an advertiser's account exists before any money moves. Name follows the
// organization; status starts 'active'; tier defaults in the table.
// ---------------------------------------------------------------------------

export interface AdAccount {
  id: string;
  organization_id: string;
  tenant_id: string | null;
  name: string;
  status: string | null;
  verified: boolean | null;
  tier: string | null;
  stripe_customer_id: string | null;
}

export async function ensureAdAccount(
  organizationId: string,
  tenantId: string | null,
  name: string,
): Promise<AdAccount> {
  const existing = await pgQueryStrict<AdAccount>(
    `SELECT id, organization_id, tenant_id, name, status, verified, tier, stripe_customer_id
       FROM public.ad_accounts WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [organizationId],
  );
  if (existing[0]) return existing[0];
  const inserted = await pgQueryStrict<AdAccount>(
    `INSERT INTO public.ad_accounts (organization_id, tenant_id, name, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING id, organization_id, tenant_id, name, status, verified, tier, stripe_customer_id`,
    [organizationId, tenantId, name || "Advertiser"],
  );
  return inserted[0];
}

// ---------------------------------------------------------------------------
// Targeting contract — stored on ad_groups.targeting (jsonb) at campaign
// creation, READ by /api/ads/serve on every request (B11.4). Dimensions
// serve can honestly evaluate from the request itself:
//   locations → viewer's US state (state signal: ?state= or profile state)
//   languages → Accept-Language primary tag
//   devices   → User-Agent class
// age_range / gender are stored with the targeting record (they are part
// of the advertiser's audience definition and of saved ad_audiences
// criteria) but serve has no truthful viewer signal for them on the
// public storefront, so they do not gate delivery — pretending otherwise
// would be a filter that silently never matches.
// ---------------------------------------------------------------------------

export interface AdTargeting {
  locations?: string[];
  languages?: string[];
  devices?: Array<"mobile" | "tablet" | "desktop">;
  age_range?: string;
  gender?: string;
  audience_ids?: string[];
}

const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  "district of columbia": "DC",
};

function stringList(value: unknown, cap = 24): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
      .slice(0, cap);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, cap);
  }
  return [];
}

export function normalizeTargeting(input: unknown): AdTargeting {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const out: AdTargeting = {};
  const locations = stringList(raw.locations);
  if (locations.length) out.locations = locations;
  const languages = stringList(raw.languages ?? raw.language);
  if (languages.length) out.languages = languages;
  const devices = stringList(raw.devices)
    .map((d) => d.toLowerCase())
    .filter((d): d is "mobile" | "tablet" | "desktop" =>
      d === "mobile" || d === "tablet" || d === "desktop",
    );
  if (devices.length) out.devices = devices;
  const audienceIds = stringList(raw.audience_ids ?? raw.audience_id);
  if (audienceIds.length) out.audience_ids = audienceIds;
  if (typeof raw.age_range === "string" && raw.age_range.trim()) {
    out.age_range = raw.age_range.trim();
  }
  if (typeof raw.gender === "string" && raw.gender.trim()) {
    out.gender = raw.gender.trim();
  }
  return out;
}

export interface ViewerContext {
  device: "mobile" | "tablet" | "desktop";
  language: string; // ISO primary tag, e.g. "en"
  state: string | null; // US state code, e.g. "TN"
}

export function viewerContextFromRequest(req: Request): ViewerContext {
  const ua = req.headers.get("user-agent") ?? "";
  const device: ViewerContext["device"] = /ipad|tablet/i.test(ua)
    ? "tablet"
    : /mobile|iphone|android/i.test(ua)
      ? "mobile"
      : "desktop";
  const accept = req.headers.get("accept-language") ?? "en";
  const language = (accept.split(",")[0] ?? "en").split("-")[0].trim().toLowerCase() || "en";
  const stateParam = new URL(req.url).searchParams.get("state")?.trim();
  const state = stateParam
    ? (US_STATES[stateParam.toLowerCase()] ?? stateParam.toUpperCase()).slice(0, 2)
    : null;
  return { device, language, state };
}

// (The legacy targeting evaluator that lived here — evaluateTargeting
// over the org-world targeting documents — was removed in the Ads
// finish: it had no callers since the v2 rebuild, and v2 targeting
// is evaluated inside src/lib/ads/serve-core.ts from the compact
// ad_campaign_targeting row.)

// ---------------------------------------------------------------------------
// Viewer identity. The serve and click routes carry the viewer's
// ad_uid in the aapw_avid cookie (1 year, httpOnly); v2 frequency
// and reach count that identity in ad_frequency / ad_events.
// ---------------------------------------------------------------------------

export const VIEWER_COOKIE = "aapw_avid";

// (The legacy frequency helpers that lived here — campaignFrequencyCap
// over ad_frequency_caps/ad_groups and viewerImpressionsInWindow over
// ad_analytics — were removed in the Ads finish: zero callers since
// the v2 rebuild, all three source tables retired, and v2 frequency
// is the delivery tier's cap enforced inside serve-core.)

// ---------------------------------------------------------------------------
// Billing ledger math — LEGACY campaigns only, read explicitly from
// ad_legacy_campaigns (the 20261165 rename): spend accrued on the
// legacy row's `spent` (the old serve wrote it per impression), and
// billed-through is the sum of the campaign's charge transactions
// (ad_transactions, whose campaign_id is the legacy uuid) that
// succeeded or are mid-flight 'pending', so a concurrent run cannot
// double-charge. Unbilled = spent − billed-through. Ads v2 campaign
// spend (ad_campaigns.lifetime_spend_cents) is NOT settled by this
// path — a v2 billing writer is a named remainder of the v2 rebuild.
// ---------------------------------------------------------------------------

export interface CampaignBilling {
  campaign_id: string;
  name: string;
  status: string;
  spent: number;
  billed: number;
  unbilled: number;
}

export async function unbilledByCampaign(
  organizationId: string,
): Promise<CampaignBilling[]> {
  const rows = await pgQueryStrict<{
    campaign_id: string; name: string; status: string;
    spent: number; billed: number;
  }>(
    `SELECT c.id AS campaign_id, c.name, c.status::text AS status,
            COALESCE(c.spent,0)::float AS spent,
            COALESCE((SELECT SUM(t.amount) FROM public.ad_transactions t
                       WHERE t.campaign_id = c.id AND t.type = 'charge'
                         AND t.status IN ('succeeded','pending')),0)::float AS billed
       FROM public.ad_legacy_campaigns c
      WHERE c.organization_id = $1
      ORDER BY c.created_at ASC`,
    [organizationId],
  );
  return rows.map((r) => ({
    ...r,
    unbilled: Math.max(0, Math.round((r.spent - r.billed) * 100) / 100),
  }));
}

// ---------------------------------------------------------------------------
// Billing ledger math — V2 campaigns (migration 20261190).
// Spend truth is the millicent ledger: ad_campaigns accumulates
// lifetime_spend_millicents (1 cent = 1000 millicents; the generated
// lifetime_spend_cents column is millicents / 1000 and is never the
// charge input). ad_transactions.campaign_id is UUID and cannot hold
// a v2 integer campaign id, so billed-through lives in
// ad_v2_campaign_billing, keyed by the v2 campaign id: billed (only
// succeeded charges advance it) plus pending (an in-flight charge),
// mirroring the legacy succeeded-plus-pending discipline so a
// concurrent or retried run can never double-charge. A failed charge
// clears pending without advancing billed, so it rides the next run.
// Unbilled millicents convert to whole cents (nearest cent); dust
// below one cent stays unbilled and rides future accrual — the
// writer bills charged cents x 1000 millicents, never the raw
// unbilled figure, so no sub-cent amount is ever written off.
// Stripe's minimum applies in cents, same threshold as the legacy
// leg: 50 cents. Report mode reads this math and writes nothing.
// ---------------------------------------------------------------------------

export const V2_MIN_CHARGE_CENTS = 50;

export interface V2CampaignBilling {
  campaign_id: number;
  name: string;
  status: string;
  spent_millicents: number;
  billed_millicents: number;
  pending_millicents: number;
  unbilled_millicents: number;
  unbilled_cents: number;
  unbilled_dollars: number;
  chargeable: boolean;
}

export async function unbilledV2ByCampaign(
  advertiserId: string,
): Promise<V2CampaignBilling[]> {
  const rows = await pgQueryStrict<{
    campaign_id: string; name: string; status: string;
    spent_millicents: string; billed_millicents: string;
    pending_millicents: string;
  }>(
    `SELECT c.id::text AS campaign_id, c.name, c.status::text AS status,
            c.lifetime_spend_millicents::text AS spent_millicents,
            COALESCE(b.billed_millicents, 0)::text AS billed_millicents,
            COALESCE(b.pending_millicents, 0)::text AS pending_millicents
       FROM public.ad_campaigns c
       LEFT JOIN public.ad_v2_campaign_billing b ON b.campaign_id = c.id
      WHERE c.advertiser_id = $1
      ORDER BY c.created_at ASC`,
    [advertiserId],
  );
  return rows.map((r) => {
    const spent = Number(r.spent_millicents ?? 0);
    const billed = Number(r.billed_millicents ?? 0);
    const pending = Number(r.pending_millicents ?? 0);
    const unbilledMillicents = Math.max(0, spent - billed - pending);
    const unbilledCents = Math.round(unbilledMillicents / 1000);
    return {
      campaign_id: Number(r.campaign_id),
      name: r.name,
      status: r.status,
      spent_millicents: spent,
      billed_millicents: billed,
      pending_millicents: pending,
      unbilled_millicents: unbilledMillicents,
      unbilled_cents: unbilledCents,
      unbilled_dollars: unbilledCents / 100,
      chargeable: unbilledCents >= V2_MIN_CHARGE_CENTS,
    };
  });
}

/**
 * Claim an in-flight v2 charge: set the marker's pending fields to
 * the transaction row the caller just inserted. The claim wins only
 * when no charge is already in flight for the campaign (the WHERE
 * clause); a lost claim returns false and the caller must fail its
 * transaction row at once so no orphan pending row lingers.
 */
export async function claimV2BillingPending(
  campaignId: number,
  accountId: string,
  millicents: number,
  transactionId: string,
): Promise<boolean> {
  const rows = await pgQueryStrict<{ campaign_id: string }>(
    `INSERT INTO public.ad_v2_campaign_billing
       (campaign_id, account_id, pending_millicents, pending_transaction_id, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (campaign_id) DO UPDATE
       SET account_id = EXCLUDED.account_id,
           pending_millicents = EXCLUDED.pending_millicents,
           pending_transaction_id = EXCLUDED.pending_transaction_id,
           updated_at = now()
     WHERE ad_v2_campaign_billing.pending_millicents = 0
     RETURNING campaign_id::text AS campaign_id`,
    [campaignId, accountId, millicents, transactionId],
  );
  return rows.length > 0;
}

/**
 * Settle a claimed v2 charge. Success folds pending into billed;
 * failure clears pending without advancing billed. The
 * pending_transaction_id guard means a settle can only move the
 * claim it belongs to — a stale or foreign settle changes nothing.
 */
export async function settleV2Billing(
  campaignId: number,
  transactionId: string,
  succeeded: boolean,
): Promise<void> {
  if (succeeded) {
    await pgQueryStrict(
      `UPDATE public.ad_v2_campaign_billing
          SET billed_millicents = billed_millicents + pending_millicents,
              pending_millicents = 0,
              pending_transaction_id = NULL,
              last_transaction_id = $2,
              last_charged_at = now(),
              updated_at = now()
        WHERE campaign_id = $1 AND pending_transaction_id = $2`,
      [campaignId, transactionId],
    );
  } else {
    await pgQueryStrict(
      `UPDATE public.ad_v2_campaign_billing
          SET pending_millicents = 0,
              pending_transaction_id = NULL,
              last_transaction_id = $2,
              updated_at = now()
        WHERE campaign_id = $1 AND pending_transaction_id = $2`,
      [campaignId, transactionId],
    );
  }
}

// ---------------------------------------------------------------------------
// The ad account's Stripe customer — attach-or-create, mirroring
// lib/stripe-customer.ts's discipline: created once, persisted on the
// account row, never accepted from a request body. Returns null when
// Stripe is not configured so callers answer honestly.
// ---------------------------------------------------------------------------

export async function ensureAdAccountStripeCustomer(
  account: AdAccount,
  email: string | null,
): Promise<string | null> {
  if (account.stripe_customer_id) return account.stripe_customer_id;
  const stripe = getStripe();
  if (!stripe) return null;
  const created = await stripe.customers.create({
    name: account.name,
    email: email ?? undefined,
    metadata: { ad_account_id: account.id, organization_id: account.organization_id },
  });
  await pgQueryStrict(
    `UPDATE public.ad_accounts SET stripe_customer_id = $2 WHERE id = $1`,
    [account.id, created.id],
  );
  return created.id;
}

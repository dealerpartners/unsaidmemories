import "server-only"
import type Stripe from "stripe"
import { writeSellerAudit } from "@/lib/sellers/audit"
import { deriveSellerPayoutDelay } from "@/lib/sellers/payout-delay"
import {
  applicationFeeCents,
  buildAccountOnboardingLinkPayload,
  buildSellerAccountCreatePayload,
} from "@/lib/stripe-connect-payloads"

// ============================================================================
// sellers/connect.ts — SELLER PAYOUTS VIA STRIPE CONNECT EXPRESS: THE
// WRITER (BL-1, built 2026-10-23).
//
// The break this closes (defect census, disease #1 + re-audit G.4/D.4):
// public.seller_stripe_accounts (migration 20261082) had exactly ONE
// reader — the payout executor's preflight SELECT
// (lib/sellers/payout-execution.ts) — and ZERO writers in the entire
// repo, so every marketplace payout failed NO_CONNECT_ACCOUNT and the
// onboarding bank step could only ever record last-four digits. This
// module is the missing writer, built to the telemedicine vet rail's
// exact discipline (lib/telemedicine/connect.ts — the same Connect
// Express agency model, owner ruling 2026-10-16: one rail for every
// payee type):
//
//   · Account + onboarding payloads come from the decided payload
//     library (lib/stripe-connect-payloads.ts) — no parallel shapes.
//   · The account is created on first use and PERSISTED to
//     seller_stripe_accounts BEFORE the onboarding link is minted, so
//     a seller who abandons hosted onboarding resumes the SAME account;
//     re-entry never duplicates (unique (tenant_id, seller_id)).
//   · The account is BORN with its payout window: delay_days derived
//     from the tenant's recorded tier policy (lib/sellers/payout-delay
//     — policy_settings scope 'payout_delay', seller_capabilities
//     .pro_tier). No policy → no account and a named refusal: a delay
//     is never invented.
//   · Status is Stripe's own flags (charges_enabled / payouts_enabled /
//     onboarding_complete = details_submitted), copied onto the store
//     from accounts.retrieve on demand (syncSellerConnectStatus), from
//     Stripe's account.updated webhook (syncSellerConnectByStripeId),
//     and refreshed by the Trust Center execute route before it runs
//     the executor's preflight, so the preflight reads truth.
//   · Bank details NEVER touch this app: onboarding is Stripe-hosted
//     (accountLinks), exactly like the tenant and vet flows.
//
// This module also carries the checkout half of BL-1:
// resolveSellerDestinationCharge prices a destination charge for one
// seller's order with the application fee resolved EXACTLY as the
// payments layer records it (the accrual engine's referral resolution:
// seller schedule → tenant-default schedule → sellers.commission_rate),
// and the order stamps the accrual engine reads to keep a
// destination-charged order out of the collect-then-transfer leg (the
// money already moved at charge time — accruing it again would pay the
// seller twice).
// ============================================================================

type PgClientLike = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>
}

export interface SellerConnectState {
  /** The seller's Express account id, when one is recorded. */
  stripeAccountId: string | null
  chargesEnabled: boolean
  payoutsEnabled: boolean
  /** details_submitted on the account (Stripe's onboarding-complete fact). */
  onboardingComplete: boolean
}

const EMPTY_STATE: SellerConnectState = {
  stripeAccountId: null,
  chargesEnabled: false,
  payoutsEnabled: false,
  onboardingComplete: false,
}

/** Read the seller's recorded Connect state (no live Stripe call). */
export async function resolveSellerConnectState(
  client: PgClientLike,
  tenantId: string,
  sellerId: string,
): Promise<SellerConnectState> {
  const { rows } = await client.query(
    `SELECT stripe_account_id, charges_enabled, payouts_enabled,
            onboarding_complete
       FROM public.seller_stripe_accounts
      WHERE tenant_id = $1 AND seller_id = $2::uuid
      LIMIT 1`,
    [tenantId, sellerId],
  )
  const row = rows[0]
  if (!row?.stripe_account_id) return EMPTY_STATE
  return {
    stripeAccountId: String(row.stripe_account_id),
    chargesEnabled: Boolean(row.charges_enabled),
    payoutsEnabled: Boolean(row.payouts_enabled),
    onboardingComplete: Boolean(row.onboarding_complete),
  }
}

/** Write Stripe's account flags onto the store (upsert on the
 *  (tenant_id, seller_id) seat — one account per seller, by schema). */
async function persistSellerConnectState(
  client: PgClientLike,
  tenantId: string,
  sellerId: string,
  account: Pick<
    Stripe.Account,
    "id" | "charges_enabled" | "payouts_enabled" | "details_submitted"
  >,
): Promise<void> {
  await client.query(
    `INSERT INTO public.seller_stripe_accounts
       (tenant_id, seller_id, stripe_account_id, charges_enabled,
        payouts_enabled, onboarding_complete)
     VALUES ($1, $2::uuid, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, seller_id) DO UPDATE
       SET stripe_account_id = EXCLUDED.stripe_account_id,
           charges_enabled = EXCLUDED.charges_enabled,
           payouts_enabled = EXCLUDED.payouts_enabled,
           onboarding_complete = EXCLUDED.onboarding_complete,
           updated_at = now()`,
    [
      tenantId,
      sellerId,
      account.id,
      Boolean(account.charges_enabled),
      Boolean(account.payouts_enabled),
      Boolean(account.details_submitted),
    ],
  )
}

export type SellerConnectErrorCode =
  | "SELLER_NOT_FOUND"
  | "PAYOUT_DELAY_UNCONFIGURED"
  | "STRIPE_UNCONFIGURED"
  | "STRIPE_ERROR"

export class SellerConnectError extends Error {
  code: SellerConnectErrorCode
  constructor(code: SellerConnectErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export interface StartSellerOnboardingInput {
  tenantId: string
  sellerId: string
  refreshUrl: string
  returnUrl: string
  actorId?: string | null
  ipAddress?: string | null
}

/**
 * Start (or resume) a seller's Express onboarding: create the account
 * on first use — born with the payout window the tenant's tier policy
 * derives for this seller, persisted BEFORE the link is minted — then
 * return Stripe's hosted onboarding URL. Re-running with an existing
 * account simply mints a fresh link (account links are single-use).
 */
export async function startSellerConnectOnboarding(
  client: PgClientLike,
  stripe: Stripe | null,
  input: StartSellerOnboardingInput,
): Promise<{ url: string; stripeAccountId: string; created: boolean }> {
  if (!stripe) {
    throw new SellerConnectError(
      "STRIPE_UNCONFIGURED",
      "Stripe is not configured — payout setup is unavailable until Stripe is configured.",
    )
  }
  const { rows: sellerRows } = await client.query(
    `SELECT id, email FROM public.sellers
      WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
    [input.tenantId, input.sellerId],
  )
  const seller = sellerRows[0]
  if (!seller) {
    throw new SellerConnectError(
      "SELLER_NOT_FOUND",
      "No seller record is attached to this sign-in.",
    )
  }

  const existing = await resolveSellerConnectState(
    client,
    input.tenantId,
    input.sellerId,
  )
  let accountId = existing.stripeAccountId
  let created = false
  let delayDays: number | null = null
  if (!accountId) {
    // The account is born with its payout window — the delay is a
    // recorded platform policy (tier band → default band), never a
    // default invented here. Unconfigured policy = named refusal,
    // exactly as the payout-delay derivation itself reports it.
    const delay = await deriveSellerPayoutDelay(
      client,
      input.tenantId,
      input.sellerId,
    )
    if (!delay.delayDays) {
      throw new SellerConnectError(
        "PAYOUT_DELAY_UNCONFIGURED",
        "Payout timing isn't configured for your account yet — the platform sets payout windows (3, 5, or 7 days) by seller tier. No Stripe account was created; contact the platform team.",
      )
    }
    delayDays = delay.delayDays
    let account: Stripe.Account
    try {
      account = await stripe.accounts.create(
        buildSellerAccountCreatePayload({
          sellerId: input.sellerId,
          tenantId: input.tenantId,
          email: seller.email ? String(seller.email) : null,
          delayDays: delay.delayDays,
        }),
      )
    } catch (e) {
      throw new SellerConnectError(
        "STRIPE_ERROR",
        e instanceof Error ? e.message : "Stripe could not create the payout account.",
      )
    }
    accountId = account.id
    created = true
    await persistSellerConnectState(client, input.tenantId, input.sellerId, account)
  }

  let link: Stripe.AccountLink
  try {
    link = await stripe.accountLinks.create(
      buildAccountOnboardingLinkPayload({
        accountId,
        refreshUrl: input.refreshUrl,
        returnUrl: input.returnUrl,
      }),
    )
  } catch (e) {
    throw new SellerConnectError(
      "STRIPE_ERROR",
      e instanceof Error ? e.message : "Stripe could not start onboarding.",
    )
  }

  await writeSellerAudit(client, {
    tenantId: input.tenantId,
    sellerId: input.sellerId,
    actorId: input.actorId ?? null,
    actorType: "seller",
    action: "connect.onboarding_started",
    entityType: "seller_stripe_account",
    entityId: null,
    afterState: {
      stripe_account_id: accountId,
      delay_days: delayDays,
      account_created: created,
    },
    ipAddress: input.ipAddress ?? null,
  })
  return { url: link.url, stripeAccountId: accountId, created }
}

/**
 * Refresh a seller's Connect state from Stripe (accounts.retrieve) and
 * persist the flags. Returns the fresh state. A seller with no account
 * gets the honest empty state — sync never creates one.
 */
export async function syncSellerConnectStatus(
  client: PgClientLike,
  stripe: Stripe | null,
  tenantId: string,
  sellerId: string,
): Promise<SellerConnectState> {
  if (!stripe) {
    throw new SellerConnectError(
      "STRIPE_UNCONFIGURED",
      "Stripe is not configured — payout status cannot be refreshed.",
    )
  }
  const current = await resolveSellerConnectState(client, tenantId, sellerId)
  if (!current.stripeAccountId) return current
  let account: Stripe.Account
  try {
    account = await stripe.accounts.retrieve(current.stripeAccountId)
  } catch (e) {
    throw new SellerConnectError(
      "STRIPE_ERROR",
      e instanceof Error ? e.message : "Stripe could not return the payout account.",
    )
  }
  await persistSellerConnectState(client, tenantId, sellerId, account)
  return resolveSellerConnectState(client, tenantId, sellerId)
}

/**
 * Webhook leg (account.updated): sync whichever seller owns the Stripe
 * account, by account id. Best-effort by contract — the webhook handler
 * calls this inside its own try/catch; an account that belongs to no
 * seller is a no-op.
 */
export async function syncSellerConnectByStripeId(
  client: PgClientLike,
  account: Stripe.Account,
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT tenant_id::text AS tenant_id, seller_id::text AS seller_id
       FROM public.seller_stripe_accounts
      WHERE stripe_account_id = $1 LIMIT 1`,
    [account.id],
  )
  const row = rows[0]
  if (!row) return false
  await persistSellerConnectState(
    client,
    String(row.tenant_id),
    String(row.seller_id),
    account,
  )
  return true
}

// ---------------------------------------------------------------------------
// Checkout half — destination charges (BL-1 leg 2).
// ---------------------------------------------------------------------------

export interface SellerDestinationCharge {
  sellerId: string
  destinationAccountId: string
  applicationFeeCents: number
}

/**
 * Resolve the destination charge for ONE seller's order, or null when
 * the charge must stay a direct platform charge (the collect-then-
 * transfer leg — accrual → wallet → payout execution — then carries
 * the money, as it does today):
 *   · the seller has no recorded Connect account, or it is not
 *     charges_enabled (a buyer is never blocked by a seller's
 *     onboarding state — the platform collects and pays out later);
 *   · no application fee resolves. The fee is the payments layer's
 *     REFERRAL fee, resolved in the accrual engine's own order
 *     (seller schedule → tenant-default schedule →
 *     sellers.commission_rate, its legacy fallback) — a rate is never
 *     invented here, and a fee that is not a proper strip of the
 *     charge (≤ 0 or ≥ the charge) is not a destination charge.
 */
export async function resolveSellerDestinationCharge(
  client: PgClientLike,
  input: { tenantId: string; sellerId: string; amountCents: number },
): Promise<SellerDestinationCharge | null> {
  const state = await resolveSellerConnectState(
    client,
    input.tenantId,
    input.sellerId,
  )
  if (!state.stripeAccountId || !state.chargesEnabled) return null

  const { rows: feeRows } = await client.query(
    `SELECT seller_id, rate::float AS rate, flat_amount::float AS flat_amount
       FROM public.seller_fee_schedules
      WHERE tenant_id = $1 AND fee_type = 'referral' AND category_id IS NULL
        AND (seller_id = $2::uuid OR seller_id IS NULL)
        AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
        AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
      ORDER BY (seller_id IS NULL) ASC, created_at DESC
      LIMIT 1`,
    [input.tenantId, input.sellerId],
  )
  const feeRow = feeRows[0]
  let feeCents: number | null = null
  if (feeRow && (feeRow.rate !== null || feeRow.flat_amount !== null)) {
    // Schedule units are the store's own: rate is a PERCENT of the
    // basis, flat_amount is dollars per order capped at the basis —
    // the accrual engine's feeOnBasis semantics, in cents.
    feeCents =
      feeRow.rate !== null
        ? Math.round((input.amountCents * Number(feeRow.rate)) / 100)
        : Math.min(Math.round(Number(feeRow.flat_amount) * 100), input.amountCents)
  } else {
    const { rows: sellerRows } = await client.query(
      `SELECT commission_rate::float AS commission_rate
         FROM public.sellers
        WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
      [input.tenantId, input.sellerId],
    )
    // commission_rate is a 0..1 FRACTION (its CHECK) — the payload
    // library's applicationFeeCents is its exact converter, including
    // the null contract (no rate recorded → no fee invented).
    feeCents = applicationFeeCents(
      input.amountCents,
      sellerRows[0]?.commission_rate != null
        ? Number(sellerRows[0].commission_rate)
        : null,
    )
  }
  if (feeCents === null || feeCents < 1 || feeCents >= input.amountCents) {
    return null
  }
  return {
    sellerId: input.sellerId,
    destinationAccountId: state.stripeAccountId,
    applicationFeeCents: feeCents,
  }
}

/**
 * Record a destination charge on its order (commerce_orders.metadata
 * .destination_charge). This stamp is the contract the accrual engine
 * reads: a stamped order's net already moved to the seller's connected
 * account at charge time, so accrual records it (fee + statements) but
 * never credits the wallet or creates a payout for it — the
 * double-payment guard for the whole chain.
 */
export async function stampDestinationChargeOnOrder(
  client: PgClientLike,
  input: {
    tenantId: string
    orderId: string
    sellerId: string
    stripeAccountId: string
    applicationFeeCents: number
  },
): Promise<void> {
  await client.query(
    `UPDATE public.commerce_orders
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'destination_charge', jsonb_build_object(
                'model', 'destination_charge',
                'seller_id', $3::text,
                'stripe_account_id', $4::text,
                'application_fee_cents', $5::int)),
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [
      input.tenantId,
      input.orderId,
      input.sellerId,
      input.stripeAccountId,
      input.applicationFeeCents,
    ],
  )
}

/**
 * Webhook repair leg: stamp an order from the PaymentIntent that paid
 * it, when checkout's own stamp did not land. Keys on the payload
 * library's PI metadata contract (type='marketplace_destination_charge'
 * + seller_id) and Stripe's own PI fields (transfer_data.destination,
 * application_fee_amount) — nothing is inferred. Returns true when the
 * PI is a destination charge and the stamp was written.
 */
export async function stampDestinationChargeFromPaymentIntent(
  client: PgClientLike,
  tenantId: string,
  orderId: string,
  pi: {
    metadata?: Record<string, string> | null
    transfer_data?: { destination?: string | { id?: string } | null } | null
    application_fee_amount?: number | null
  },
): Promise<boolean> {
  if (pi?.metadata?.type !== "marketplace_destination_charge") return false
  const sellerId = pi.metadata.seller_id
  const destination = pi.transfer_data?.destination
  const destinationId =
    typeof destination === "string" ? destination : destination?.id
  if (!sellerId || !destinationId) return false
  // The PI's application_fee_amount can carry the exclusive-tax
  // holdback (the tax the platform retains to remit — stamped into
  // the PI metadata at creation by the checkout); the stamp records
  // the pure marketplace commission, exactly as checkout's own
  // stamp does, so a repaired order settles identically to an
  // unrepaired one.
  const taxHoldbackCents = Math.max(
    0,
    Math.trunc(Number(pi.metadata?.tax_holdback_cents || 0) || 0),
  )
  await stampDestinationChargeOnOrder(client, {
    tenantId,
    orderId,
    sellerId,
    stripeAccountId: String(destinationId),
    applicationFeeCents: Math.max(
      0,
      Number(pi.application_fee_amount ?? 0) - taxHoldbackCents,
    ),
  })
  return true
}

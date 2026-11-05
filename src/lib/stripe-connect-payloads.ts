import type Stripe from "stripe";

// ---------------------------------------------------------------------------
// stripe-connect-payloads.ts — the Stripe Connect payload library for the
// DECIDED marketplace money model (Sunny, 2026-10-14). PURE BUILDERS ONLY:
// every function returns the exact payload a production-side caller will
// hand to the Stripe API. Nothing in this file imports the Stripe client
// or makes a call — live processor keys exist ONLY in the production env
// (Sunny's standing rule), so execution lives production-side; the shapes
// here are the contract, and they are proven by deterministic assertions.
//
// THE MODEL (agency model, per the Master Terms of Service + Sunny's
// money-flow diagram):
//   · The seller appoints the platform as their legal agent to receive
//     payments; the buyer's obligation to the seller is satisfied at
//     checkout, so the platform is Merchant of Record (the buyer's card
//     statement shows the platform) and is NOT "transmitting money"
//     between independent parties.
//   · Checkout leg = Stripe Checkout. The destination charge rides the
//     Checkout Session's payment_intent_data: money lands in the
//     PLATFORM balance first, the platform strips its application fee
//     (→ platform revenue), and the net passes to the seller's Express
//     connected account via transfer_data.destination.
//   · Funds arrive in the seller's Express account instantly but stay
//     LOCKED by the account's payout schedule: payouts.schedule
//     .delay_days of 3, 5, or 7, keyed to the seller's performance tier
//     (the tier→delay mapping is per-tenant configuration — see
//     src/lib/sellers/payout-delay.ts; the three values are the ruling's).
//
// THE TWO-SCENARIO LIFECYCLE (Sunny's diagram, named exactly):
//   · Scenario A (smooth order): the delay window lapses and Stripe
//     releases automatically to the seller's bank — no per-transaction
//     action exists or is needed; the account schedule IS the mechanism.
//   · Scenario B (dispute filed): the buyer opens a Case in-app → that
//     transaction's payout freezes → the case works in the in-app
//     resolution portal → the PLATFORM INTERVENES with one of three
//     actions, recorded against the case: RELEASE (re-send the frozen
//     net to the seller), REFUND (make the buyer whole from the charge,
//     reversing the transfer + application fee), or REVERSE (the
//     transfer reversal stands permanently — funds stay with the
//     platform). The freeze instrument is the transfer reversal: it is
//     the transaction-scoped clawback Stripe provides, so a freeze never
//     touches the seller's other transactions.
//
// CONSISTENCY WITH THE EXISTING STACK (censused firsthand, 2026-10-14):
//   · Client: getStripe() in src/lib/stripe.ts (no apiVersion pin
//     anywhere in the codebase — builders therefore carry no version).
//   · Existing Connect code is TENANT-level (franchise businesses):
//     stripe.accounts.create({ type: "express", country: "US",
//     capabilities: { card_payments, transfers } }) in
//     /api/admin/stripe-connections/connect, ids in
//     tenant_stripe_accounts. The seller-account builder below mirrors
//     that exact shape and ADDS the payout schedule the ruling requires.
//   · Charges today are plain PaymentIntents (the booking/checkout
//     charge paths) with metadata { type, tenant_id, ... } — the
//     builders keep that metadata idiom and add the marketplace keys.
//   · Field names verified against the installed SDK (stripe 22.6.x):
//     settings.payouts.schedule.delay_days · PaymentIntent
//     application_fee_amount + transfer_data.destination · Checkout
//     payment_intent_data · Refund reverse_transfer +
//     refund_application_fee · Transfers.createReversal.
// ---------------------------------------------------------------------------

/** The ruling's three delay values. Nothing else is a valid delay. */
export type PayoutDelayDays = 3 | 5 | 7;

export const PAYOUT_DELAY_DAYS: readonly PayoutDelayDays[] = [3, 5, 7];

export function isPayoutDelayDays(v: unknown): v is PayoutDelayDays {
  return v === 3 || v === 5 || v === 7;
}

/**
 * The application fee (platform strip) in cents for a charge, from the
 * seller's recorded commission_rate — a FRACTION in [0, 1] (the live
 * sellers_commission_rate_check enforces the range). Rounds to the
 * nearest cent. A null rate yields null: the caller must resolve the
 * tenant's default fee schedule (seller_fee_schedules, seller_id NULL)
 * rather than inventing a rate here.
 */
export function applicationFeeCents(
  amountCents: number,
  commissionRate: number | null | undefined,
): number | null {
  if (commissionRate === null || commissionRate === undefined) return null;
  if (!Number.isFinite(amountCents) || amountCents <= 0) return null;
  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 1) return null;
  return Math.round(amountCents * commissionRate);
}

// ---------------------------------------------------------------------------
// (a) Seller Express connected-account creation + onboarding payloads.
// ---------------------------------------------------------------------------

export interface SellerAccountCreateInput {
  sellerId: string;
  tenantId: string;
  /** The seller's recorded email (sellers.email), when present. */
  email?: string | null;
  /** The tier-derived payout delay — the account is BORN with its window. */
  delayDays: PayoutDelayDays;
  country?: string;
}

/**
 * accounts.create payload for a SELLER's Express account under the agency
 * model. Mirrors the tenant Connect shape already in production and adds
 * settings.payouts.schedule { interval: "daily", delay_days } — the
 * Scenario A release mechanism. The platform (not the seller) controls
 * the payout schedule: that control is the leverage the ruling buys.
 */
export function buildSellerAccountCreatePayload(
  input: SellerAccountCreateInput,
): Stripe.AccountCreateParams {
  return {
    type: "express",
    country: input.country || "US",
    email: input.email || undefined,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: "individual",
    settings: {
      payouts: {
        schedule: { interval: "daily", delay_days: input.delayDays },
      },
    },
    metadata: {
      actor: "marketplace_seller",
      seller_id: input.sellerId,
      tenant_id: input.tenantId,
    },
  };
}

/** accountLinks.create payload — hosted onboarding, bank details never touch this app. */
export function buildAccountOnboardingLinkPayload(input: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Stripe.AccountLinkCreateParams {
  return {
    account: input.accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: "account_onboarding",
  };
}

// ---------------------------------------------------------------------------
// (c) Payout-schedule update — how a tier change reaches the account.
// ---------------------------------------------------------------------------

/**
 * accounts.update payload that moves a connected account to a new delay
 * window when the seller's tier changes. Stripe keeps delay_days at the
 * last configured value while interval is daily; the update is the whole
 * control surface — there is no per-payout delay in Stripe.
 */
export function buildPayoutScheduleUpdatePayload(input: {
  delayDays: PayoutDelayDays;
}): Stripe.AccountUpdateParams {
  return {
    settings: {
      payouts: {
        schedule: { interval: "daily", delay_days: input.delayDays },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// (b) Destination charges — the platform charge with the fee strip.
// ---------------------------------------------------------------------------

export interface DestinationChargeInput {
  amountCents: number;
  /** The platform strip in cents — from applicationFeeCents(). */
  applicationFeeCents: number;
  /** The seller's Express connected account id (acct_...). */
  destinationAccountId: string;
  tenantId: string;
  sellerId: string;
  orderId?: string | null;
  description?: string | null;
}

/**
 * paymentIntents.create payload for a destination charge OUTSIDE
 * Checkout (POS / payment-link legs): the charge settles to the
 * platform balance, application_fee_amount stays with the platform, and
 * the net transfers to the seller's connected account, where the
 * account's delay_days window locks it (Scenario A) until release.
 */
export function buildDestinationChargeIntentPayload(
  input: DestinationChargeInput,
): Stripe.PaymentIntentCreateParams {
  return {
    amount: input.amountCents,
    currency: "usd",
    payment_method_types: ["card"],
    application_fee_amount: input.applicationFeeCents,
    transfer_data: { destination: input.destinationAccountId },
    description: input.description || "UnSaid Memories — marketplace order",
    metadata: {
      type: "marketplace_destination_charge",
      tenant_id: input.tenantId,
      seller_id: input.sellerId,
      order_id: input.orderId || "",
    },
    // UNSAID SDK NOTE (transplant lane 2): stripe@23 types dropped
    // payment_method_types; assertion keeps runtime payload identical.
  } as unknown as Stripe.PaymentIntentCreateParams;
}

export interface MarketplaceCheckoutInput extends DestinationChargeInput {
  lineItems: Array<{
    name: string;
    amountCents: number;
    quantity: number;
  }>;
  successUrl: string;
  cancelUrl: string;
  /** The buyer's customer email, when known (Checkout receipt). */
  customerEmail?: string | null;
}

/**
 * checkout.sessions.create payload — THE checkout leg per Sunny's
 * diagram: the buyer checks out through Stripe Checkout and the
 * destination charge rides payment_intent_data (application fee →
 * platform revenue; transfer_data.destination → the seller's Express
 * account, locked by its payout delay window on arrival).
 */
export function buildMarketplaceCheckoutSessionPayload(
  input: MarketplaceCheckoutInput,
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    line_items: input.lineItems.map((li) => ({
      quantity: li.quantity,
      price_data: {
        currency: "usd",
        unit_amount: li.amountCents,
        product_data: { name: li.name },
      },
    })),
    payment_intent_data: {
      application_fee_amount: input.applicationFeeCents,
      transfer_data: { destination: input.destinationAccountId },
      description: input.description || "UnSaid Memories — marketplace order",
      metadata: {
        type: "marketplace_destination_charge",
        tenant_id: input.tenantId,
        seller_id: input.sellerId,
        order_id: input.orderId || "",
      },
    },
    customer_email: input.customerEmail || undefined,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      type: "marketplace_checkout",
      tenant_id: input.tenantId,
      seller_id: input.sellerId,
      order_id: input.orderId || "",
    },
  };
}

// ---------------------------------------------------------------------------
// (d) + (e) Scenario B — the case freeze and the platform interventions,
// plus the general buyer refund. Each returns a CALL DESCRIPTOR: the
// exact API call production-side execution will make, recorded against
// the case in seller_audit_log when the Trust Center records the action.
// `resolvesAtExecution` names the identifiers only the live charge can
// supply (the destination charge's transfer id; the seller's connected
// account id while no store records it) — the descriptor never invents
// an id it cannot know.
// ---------------------------------------------------------------------------

export interface StripeCallDescriptor {
  api:
    | "transfers.createReversal"
    | "transfers.create"
    | "refunds.create";
  /** The resource id the call acts on, when it is known at record time. */
  target?: string | null;
  params: Record<string, unknown>;
  resolvesAtExecution: string[];
}

export interface CaseActionInput {
  disputeId: string;
  tenantId: string;
  sellerId: string;
  orderId?: string | null;
  /** The charge's PaymentIntent id, when the order record carries it. */
  paymentIntentId?: string | null;
  /** The destination charge's transfer id, when known. */
  transferId?: string | null;
  /** The frozen net amount in cents (the transfer amount), when known. */
  amountCents?: number | null;
  /** The seller's Express connected account id, when recorded. */
  destinationAccountId?: string | null;
}

function caseMetadata(input: CaseActionInput, action: string) {
  return {
    type: "case_payout_action",
    case_action: action,
    dispute_id: input.disputeId,
    tenant_id: input.tenantId,
    seller_id: input.sellerId,
    order_id: input.orderId || "",
  };
}

/**
 * FREEZE (Scenario B opens): reverse the transaction's transfer, pulling
 * the net back to the platform balance where it stays locked while the
 * case works. Omitting the amount reverses the transfer's full remaining
 * amount — the descriptor omits it unless the frozen amount is known.
 */
export function buildCaseFreezeCall(input: CaseActionInput): StripeCallDescriptor {
  const params: Record<string, unknown> = {
    metadata: caseMetadata(input, "freeze"),
  };
  if (input.amountCents != null) params.amount = input.amountCents;
  return {
    api: "transfers.createReversal",
    target: input.transferId || null,
    params,
    resolvesAtExecution: input.transferId
      ? []
      : ["transfer_id (from the destination charge on the order's payment intent)"],
  };
}

/**
 * INTERVENE — RELEASE: the case resolves in the seller's favor; the
 * frozen net is re-sent to the seller's connected account as a fresh
 * transfer, where the account's payout schedule governs its release to
 * the seller's bank.
 */
export function buildCaseReleaseCall(input: CaseActionInput): StripeCallDescriptor {
  const params: Record<string, unknown> = {
    currency: "usd",
    destination: input.destinationAccountId || undefined,
    metadata: caseMetadata(input, "release"),
  };
  if (input.amountCents != null) params.amount = input.amountCents;
  const resolves: string[] = [];
  if (!input.destinationAccountId) {
    resolves.push("destination (the seller's connected account id — no store records it yet)");
  }
  if (input.amountCents == null) {
    resolves.push("amount (the frozen net recorded at freeze time)");
  }
  return { api: "transfers.create", target: null, params, resolvesAtExecution: resolves };
}

/**
 * INTERVENE — REFUND: the buyer is made whole from the charge. With a
 * destination charge, reverse_transfer pulls the net back from the
 * connected account (or from the frozen platform-held funds) and
 * refund_application_fee returns the platform strip, so the buyer
 * receives the full amount.
 */
export function buildCaseRefundCall(input: CaseActionInput): StripeCallDescriptor {
  const params: Record<string, unknown> = {
    payment_intent: input.paymentIntentId || undefined,
    reverse_transfer: true,
    refund_application_fee: true,
    metadata: caseMetadata(input, "refund"),
  };
  const resolves: string[] = [];
  if (!input.paymentIntentId) {
    resolves.push("payment_intent (from the order's recorded stripe_payment_intent_id)");
  }
  return { api: "refunds.create", target: null, params, resolvesAtExecution: resolves };
}

/**
 * INTERVENE — REVERSE: the freeze becomes permanent (fraud / policy
 * violation). The instrument is the same transfer reversal as the
 * freeze — if the freeze already executed, this records that it STANDS;
 * if not, it is the reversal itself, marked permanent in metadata.
 */
export function buildCaseReverseCall(input: CaseActionInput): StripeCallDescriptor {
  const params: Record<string, unknown> = {
    metadata: { ...caseMetadata(input, "reverse"), outcome: "reversal_stands_permanent" },
  };
  if (input.amountCents != null) params.amount = input.amountCents;
  return {
    api: "transfers.createReversal",
    target: input.transferId || null,
    params,
    resolvesAtExecution: input.transferId
      ? []
      : ["transfer_id (from the destination charge on the order's payment intent)"],
  };
}

/**
 * (e) The general buyer refund payload (outside a case): full-charge
 * refund of a destination charge, transfer reversed and fee returned —
 * the platform never keeps its strip on a refunded sale.
 */
export function buildRefundPayload(input: {
  paymentIntentId: string;
  tenantId: string;
  sellerId: string;
  orderId?: string | null;
  /** Partial refund in cents; omit for a full refund. */
  amountCents?: number | null;
}): Stripe.RefundCreateParams {
  const p: Stripe.RefundCreateParams = {
    payment_intent: input.paymentIntentId,
    reverse_transfer: true,
    refund_application_fee: true,
    metadata: {
      type: "marketplace_refund",
      tenant_id: input.tenantId,
      seller_id: input.sellerId,
      order_id: input.orderId || "",
    },
  };
  if (input.amountCents != null) p.amount = input.amountCents;
  return p;
}

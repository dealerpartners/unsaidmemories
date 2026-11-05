import "server-only"
import type pg from "pg"

// ============================================================================
// subscriptions/platform-subscriptions.ts — MY SUBSCRIPTIONS: the platform
// subscription system (Sunny's ruling, 2026-10-14 ~19:32 CDT).
//
// "We need to add my subscriptions to their My Account. This covers
// platform subscriptions. For services like shipping. AI services. Gift
// cards, UnSaid Memories subscription. Any subscription I put on the
// platform, that's where it lives. So whether it's a regular customer?
// A seller. Or a health care practice. Or an employee."
//
// ONE system: the platform defines OFFERS (records an admin authors —
// the store ships EMPTY; no name, price, or cadence is invented), and
// every account holder — customer, seller, healthcare practice,
// employee, all the ONE accretion identity (the auth user) — sees and
// manages their enrollments in My Account. Telemedicine §8.2's
// one-word "Subscriptions" rides THIS system, not a telemed-only store.
//
// THE STORES (migration 20261070, created live; the .sql is the record):
//   public.platform_subscription_offers        — per-tenant offer records
//   public.platform_account_subscriptions      — per-account enrollments
// Census that decided them (firsthand, 2026-10-14): the schema's other
// subscription-shaped tables are other domains' machinery —
// commerce_subscriptions (shop customer + pet product subscriptions),
// subscriptions/subscription_plans (the grooming Bath Club, dog-keyed),
// shipping_memberships (a legacy email-keyed Stripe record, no tenant,
// no identity, no offer link), membership_plans/customer_memberships
// (membership programs). None carries this system; none was ridden.
//
// STRIPE DISCIPLINE (the Connect-era rule): NO live Stripe call exists
// in this build. Subscribe and cancel are RECORDED acts — pure payload
// builders produce the exact Checkout / cancel descriptors, the records
// carry them, and the production executor performs them (activation
// flips pending → trialing/active through the Stripe webhook, which
// already handles customer.subscription.* events for other domains).
// ============================================================================

export const SUBSCRIPTION_USER_TYPES = [
  "customer",
  "seller",
  "healthcare",
  "employee",
] as const
export type SubscriptionUserType = (typeof SUBSCRIPTION_USER_TYPES)[number]

export const SUBSCRIPTION_CATEGORIES = [
  "shipping",
  "ai_services",
  "gift_cards",
  "platform",
  "other",
] as const
export type SubscriptionCategory = (typeof SUBSCRIPTION_CATEGORIES)[number]

export const SUBSCRIPTION_CADENCES = ["day", "week", "month", "year"] as const
export type SubscriptionCadence = (typeof SUBSCRIPTION_CADENCES)[number]

export const SUBSCRIPTION_STATUSES = [
  "pending",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "ended",
] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export interface SubscriptionOffer {
  id: string
  tenantId: string
  name: string
  category: SubscriptionCategory
  description: string | null
  priceCents: number
  cadence: SubscriptionCadence
  applicableUserTypes: SubscriptionUserType[]
  isActive: boolean
  stripeProductId: string | null
  stripePriceId: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface AccountSubscription {
  id: string
  tenantId: string
  offerId: string
  accountUserId: string
  accountEmail: string
  userType: SubscriptionUserType
  status: SubscriptionStatus
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  stripeCheckoutSessionId: string | null
  checkoutPayload: Record<string, unknown> | null
  cancelPayload: Record<string, unknown> | null
  cancelAtPeriodEnd: boolean
  startedAt: string | null
  currentPeriodEnd: string | null
  canceledAt: string | null
  endedAt: string | null
  createdAt: string
  updatedAt: string
  // Joined offer facts (the offer the enrollment points at).
  offerName: string
  offerCategory: SubscriptionCategory
  offerPriceCents: number
  offerCadence: SubscriptionCadence
}

const OFFER_COLS = `
  id, tenant_id, name, category, description, price_cents, cadence,
  applicable_user_types, is_active, stripe_product_id, stripe_price_id,
  created_by, updated_by, created_at, updated_at`

function rowToOffer(r: any): SubscriptionOffer {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    category: r.category,
    description: r.description ?? null,
    priceCents: r.price_cents,
    cadence: r.cadence,
    applicableUserTypes: (r.applicable_user_types ?? []) as SubscriptionUserType[],
    isActive: r.is_active === true,
    stripeProductId: r.stripe_product_id ?? null,
    stripePriceId: r.stripe_price_id ?? null,
    createdBy: r.created_by ?? null,
    updatedBy: r.updated_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function rowToAccountSubscription(r: any): AccountSubscription {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    offerId: r.offer_id,
    accountUserId: r.account_user_id,
    accountEmail: r.account_email,
    userType: r.user_type,
    status: r.status,
    stripeCustomerId: r.stripe_customer_id ?? null,
    stripeSubscriptionId: r.stripe_subscription_id ?? null,
    stripeCheckoutSessionId: r.stripe_checkout_session_id ?? null,
    checkoutPayload: r.checkout_payload ?? null,
    cancelPayload: r.cancel_payload ?? null,
    cancelAtPeriodEnd: r.cancel_at_period_end === true,
    startedAt: r.started_at ?? null,
    currentPeriodEnd: r.current_period_end ?? null,
    canceledAt: r.canceled_at ?? null,
    endedAt: r.ended_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    offerName: r.offer_name,
    offerCategory: r.offer_category,
    offerPriceCents: r.offer_price_cents,
    offerCadence: r.offer_cadence,
  }
}

// ----------------------------------------------------------------------------
// Offers — admin authoring (the values are the admin's; nothing invented).
// ----------------------------------------------------------------------------

export interface OfferInput {
  name: string
  category: SubscriptionCategory
  description?: string | null
  priceCents: number
  cadence: SubscriptionCadence
  applicableUserTypes: SubscriptionUserType[]
  stripeProductId?: string | null
  stripePriceId?: string | null
}

export function validateOfferInput(input: Partial<OfferInput>): string | null {
  if (input.name !== undefined && input.name.trim() === "") return "name_required"
  if (
    input.category !== undefined &&
    !SUBSCRIPTION_CATEGORIES.includes(input.category)
  )
    return "bad_category"
  if (
    input.priceCents !== undefined &&
    (!Number.isInteger(input.priceCents) || input.priceCents < 0)
  )
    return "bad_price"
  if (input.cadence !== undefined && !SUBSCRIPTION_CADENCES.includes(input.cadence))
    return "bad_cadence"
  if (input.applicableUserTypes !== undefined) {
    if (input.applicableUserTypes.length === 0) return "user_types_required"
    if (
      input.applicableUserTypes.some(
        (t) => !SUBSCRIPTION_USER_TYPES.includes(t),
      )
    )
      return "bad_user_type"
  }
  return null
}

export async function listOffersForAdmin(
  client: pg.Client,
  tenantId: string,
): Promise<SubscriptionOffer[]> {
  const res = await client.query(
    `SELECT ${OFFER_COLS} FROM public.platform_subscription_offers
      WHERE tenant_id = $1::uuid ORDER BY created_at ASC`,
    [tenantId],
  )
  return res.rows.map(rowToOffer)
}

export async function getOffer(
  client: pg.Client,
  tenantId: string,
  offerId: string,
): Promise<SubscriptionOffer | null> {
  const res = await client.query(
    `SELECT ${OFFER_COLS} FROM public.platform_subscription_offers
      WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`,
    [tenantId, offerId],
  )
  return res.rows[0] ? rowToOffer(res.rows[0]) : null
}

export async function createOffer(
  client: pg.Client,
  input: { tenantId: string; actorEmail: string | null } & OfferInput,
): Promise<SubscriptionOffer> {
  const res = await client.query(
    `INSERT INTO public.platform_subscription_offers
       (tenant_id, name, category, description, price_cents, cadence,
        applicable_user_types, stripe_product_id, stripe_price_id,
        created_by, updated_by)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $10)
     RETURNING ${OFFER_COLS}`,
    [
      input.tenantId,
      input.name.trim(),
      input.category,
      input.description ?? null,
      input.priceCents,
      input.cadence,
      input.applicableUserTypes,
      input.stripeProductId ?? null,
      input.stripePriceId ?? null,
      input.actorEmail,
    ],
  )
  return rowToOffer(res.rows[0])
}

export async function updateOffer(
  client: pg.Client,
  input: {
    tenantId: string
    offerId: string
    actorEmail: string | null
    patch: Partial<OfferInput> & { isActive?: boolean }
  },
): Promise<SubscriptionOffer | null> {
  const before = await getOffer(client, input.tenantId, input.offerId)
  if (!before) return null
  const p = input.patch
  const res = await client.query(
    `UPDATE public.platform_subscription_offers SET
       name = $3, category = $4, description = $5, price_cents = $6,
       cadence = $7, applicable_user_types = $8::text[], is_active = $9,
       stripe_product_id = $10, stripe_price_id = $11,
       updated_by = $12, updated_at = now()
      WHERE tenant_id = $1::uuid AND id = $2::uuid
      RETURNING ${OFFER_COLS}`,
    [
      input.tenantId,
      input.offerId,
      p.name !== undefined ? p.name.trim() : before.name,
      p.category ?? before.category,
      p.description !== undefined ? p.description : before.description,
      p.priceCents ?? before.priceCents,
      p.cadence ?? before.cadence,
      p.applicableUserTypes ?? before.applicableUserTypes,
      p.isActive !== undefined ? p.isActive : before.isActive,
      p.stripeProductId !== undefined ? p.stripeProductId : before.stripeProductId,
      p.stripePriceId !== undefined ? p.stripePriceId : before.stripePriceId,
      input.actorEmail,
    ],
  )
  return res.rows[0] ? rowToOffer(res.rows[0]) : null
}

// ----------------------------------------------------------------------------
// Offers + enrollments — the account holder's reads. Ownership lives in
// the SQL: an account's rows are selected by its own identity, never
// filtered after the fact.
// ----------------------------------------------------------------------------

/** Active offers whose applicable types include the account's type. */
export async function listOffersForAccount(
  client: pg.Client,
  tenantId: string,
  userType: SubscriptionUserType,
): Promise<SubscriptionOffer[]> {
  const res = await client.query(
    `SELECT ${OFFER_COLS} FROM public.platform_subscription_offers
      WHERE tenant_id = $1::uuid AND is_active = true
        AND applicable_user_types @> ARRAY[$2]::text[]
      ORDER BY created_at ASC`,
    [tenantId, userType],
  )
  return res.rows.map(rowToOffer)
}

const SUB_COLS = `
  s.id, s.tenant_id, s.offer_id, s.account_user_id, s.account_email,
  s.user_type, s.status, s.stripe_customer_id, s.stripe_subscription_id,
  s.stripe_checkout_session_id, s.checkout_payload, s.cancel_payload,
  s.cancel_at_period_end, s.started_at, s.current_period_end,
  s.canceled_at, s.ended_at, s.created_at, s.updated_at,
  o.name AS offer_name, o.category AS offer_category,
  o.price_cents AS offer_price_cents, o.cadence AS offer_cadence`

export async function listAccountSubscriptions(
  client: pg.Client,
  tenantId: string,
  accountUserId: string,
): Promise<AccountSubscription[]> {
  const res = await client.query(
    `SELECT ${SUB_COLS}
       FROM public.platform_account_subscriptions s
       JOIN public.platform_subscription_offers o
         ON o.tenant_id = s.tenant_id AND o.id = s.offer_id
      WHERE s.tenant_id = $1::uuid AND s.account_user_id = $2::uuid
      ORDER BY s.created_at DESC`,
    [tenantId, accountUserId],
  )
  return res.rows.map(rowToAccountSubscription)
}

export async function getAccountSubscription(
  client: pg.Client,
  tenantId: string,
  accountUserId: string,
  subscriptionId: string,
): Promise<AccountSubscription | null> {
  const res = await client.query(
    `SELECT ${SUB_COLS}
       FROM public.platform_account_subscriptions s
       JOIN public.platform_subscription_offers o
         ON o.tenant_id = s.tenant_id AND o.id = s.offer_id
      WHERE s.tenant_id = $1::uuid AND s.account_user_id = $2::uuid
        AND s.id = $3::uuid LIMIT 1`,
    [tenantId, accountUserId, subscriptionId],
  )
  return res.rows[0] ? rowToAccountSubscription(res.rows[0]) : null
}

// ----------------------------------------------------------------------------
// Pure Stripe descriptors — NO network. The production executor sends
// exactly these shapes; this build records them.
// ----------------------------------------------------------------------------

export interface SubscribeContext {
  tenantId: string
  accountUserId: string
  accountEmail: string
  userType: SubscriptionUserType
  /** Absolute return URLs the caller composes for its own portal. */
  successUrl: string
  cancelUrl: string
}

/**
 * The Checkout Session payload for a subscription subscribe act. When
 * the offer carries a recorded Stripe price id, the line item rides
 * it; otherwise the payload carries price_data built from the offer's
 * own recorded price + cadence (the executor resolves/creates the
 * Stripe Price from it — the recorded facts are identical either way).
 */
export function buildSubscriptionCheckoutPayload(
  offer: SubscriptionOffer,
  ctx: SubscribeContext,
): Record<string, unknown> {
  const lineItem = offer.stripePriceId
    ? { price: offer.stripePriceId, quantity: 1 }
    : {
        price_data: {
          currency: "usd",
          unit_amount: offer.priceCents,
          recurring: { interval: offer.cadence },
          product_data: { name: offer.name },
        },
        quantity: 1,
      }
  const metadata = {
    platform_offer_id: offer.id,
    platform_tenant_id: ctx.tenantId,
    account_user_id: ctx.accountUserId,
    user_type: ctx.userType,
    source: "platform_subscriptions",
  }
  return {
    mode: "subscription",
    customer_email: ctx.accountEmail,
    line_items: [lineItem],
    success_url: ctx.successUrl,
    cancel_url: ctx.cancelUrl,
    metadata,
    subscription_data: { metadata },
  }
}

/**
 * The cancel descriptor for the production executor: cancel the live
 * Stripe subscription when one exists; when the enrollment never
 * reached Stripe (still pending), void the pending checkout instead.
 */
export function buildCancelDescriptor(
  sub: AccountSubscription,
  atPeriodEnd: boolean,
): Record<string, unknown> {
  return {
    action: sub.stripeSubscriptionId
      ? "cancel_stripe_subscription"
      : "void_pending_checkout",
    platform_subscription_id: sub.id,
    platform_offer_id: sub.offerId,
    stripe_subscription_id: sub.stripeSubscriptionId,
    stripe_checkout_session_id: sub.stripeCheckoutSessionId,
    at_period_end: atPeriodEnd,
  }
}

// ----------------------------------------------------------------------------
// The recorded acts.
// ----------------------------------------------------------------------------

export type SubscribeResult =
  | { ok: true; subscription: AccountSubscription; checkoutPayload: Record<string, unknown> }
  | {
      ok: false
      error:
        | "offer_not_found"
        | "offer_inactive"
        | "offer_not_applicable"
        | "already_subscribed"
    }

/**
 * Subscribe = a RECORDED act: the offer must be active, in the
 * account's tenant, and applicable to the account's user type. The
 * enrollment is born 'pending' carrying the exact Checkout payload;
 * no charge is made and no Stripe call happens in this build. A
 * second live enrollment for the same offer is refused by the
 * store's partial UNIQUE index (23505) and reported honestly.
 */
export async function subscribeToOffer(
  client: pg.Client,
  input: SubscribeContext & { offerId: string },
): Promise<SubscribeResult> {
  const offer = await getOffer(client, input.tenantId, input.offerId)
  if (!offer) return { ok: false, error: "offer_not_found" }
  if (!offer.isActive) return { ok: false, error: "offer_inactive" }
  if (!offer.applicableUserTypes.includes(input.userType))
    return { ok: false, error: "offer_not_applicable" }

  const checkoutPayload = buildSubscriptionCheckoutPayload(offer, input)
  try {
    const res = await client.query(
      `INSERT INTO public.platform_account_subscriptions
         (tenant_id, offer_id, account_user_id, account_email, user_type,
          status, checkout_payload)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'pending', $6::jsonb)
       RETURNING id`,
      [
        input.tenantId,
        input.offerId,
        input.accountUserId,
        input.accountEmail,
        input.userType,
        JSON.stringify(checkoutPayload),
      ],
    )
    const mine = await getAccountSubscription(
      client,
      input.tenantId,
      input.accountUserId,
      res.rows[0].id,
    )
    if (!mine) return { ok: false, error: "offer_not_found" }
    return { ok: true, subscription: mine, checkoutPayload }
  } catch (e: any) {
    if (e?.code === "23505") return { ok: false, error: "already_subscribed" }
    throw e
  }
}

export type CancelResult =
  | { ok: true; subscription: AccountSubscription; cancelPayload: Record<string, unknown> }
  | { ok: false; error: "not_found" | "not_cancelable" }

const CANCELABLE: SubscriptionStatus[] = [
  "pending",
  "trialing",
  "active",
  "past_due",
]

/**
 * Cancel = a RECORDED act on the account's OWN enrollment (ownership
 * in the WHERE clause — another account's row reads as not_found).
 * The record is stamped canceled with the executor's descriptor; no
 * Stripe call happens in this build.
 */
export async function cancelAccountSubscription(
  client: pg.Client,
  input: {
    tenantId: string
    accountUserId: string
    subscriptionId: string
    atPeriodEnd?: boolean
  },
): Promise<CancelResult> {
  const sub = await getAccountSubscription(
    client,
    input.tenantId,
    input.accountUserId,
    input.subscriptionId,
  )
  if (!sub) return { ok: false, error: "not_found" }
  if (!CANCELABLE.includes(sub.status)) return { ok: false, error: "not_cancelable" }

  const atPeriodEnd = input.atPeriodEnd === true
  const cancelPayload = buildCancelDescriptor(sub, atPeriodEnd)
  const res = await client.query(
    `UPDATE public.platform_account_subscriptions SET
       status = 'canceled', canceled_at = now(),
       cancel_at_period_end = $4, cancel_payload = $5::jsonb,
       updated_at = now()
      WHERE tenant_id = $1::uuid AND account_user_id = $2::uuid
        AND id = $3::uuid AND status = ANY($6::text[])
      RETURNING id`,
    [
      input.tenantId,
      input.accountUserId,
      input.subscriptionId,
      atPeriodEnd,
      JSON.stringify(cancelPayload),
      CANCELABLE,
    ],
  )
  if (!res.rows[0]) return { ok: false, error: "not_cancelable" }
  const mine = await getAccountSubscription(
    client,
    input.tenantId,
    input.accountUserId,
    input.subscriptionId,
  )
  if (!mine) return { ok: false, error: "not_found" }
  return { ok: true, subscription: mine, cancelPayload }
}

import "server-only"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { withPg } from "@/lib/crm/enterprise"
import { completePosSale, type PosSaleInput } from "@/lib/enterprise/pos"
import {
  TENANT_STRIPE_NOT_CONNECTED_MESSAGE,
  destinationTransferFields,
  loadTenantChargeRouting,
  type TenantChargeRouting,
} from "@/lib/tenant-charge-routing"

// ============================================================================
// card-payments.ts — counter card payments with every tender choice.
//
// Sunny's ruling (2026-10-13): "You provide them with choice. You don't box
// anybody in that's in store." A card payment at the register (or from the
// header Process Payment modal) can complete four ways:
//   1. keyed   — staff types the card into the register (Stripe Elements),
//   2. link    — the customer pays on a Stripe Checkout page (link shown on
//                screen, optionally emailed to the address on file),
//   3. on_file — charge the customer's real saved Stripe payment method,
//   4. manual  — recorded only (the pre-existing take_payment / POS manual
//                tender paths; not handled here).
//
// Paths 1–3 all start by writing a stripe_pending_charges row that snapshots
// everything needed to finish the business write. When Stripe confirms the
// money, finalizePendingCharge() completes through the SAME code as a
// counter-paid sale — completePosSale for POS sales, the same
// commerce_payments insert finance take_payment makes for manual payments.
// No parallel money logic. Finalization claims the row atomically, so the
// client confirm call and the Stripe webhook can race safely.
//
// Cards on file live on the Stripe customer (customers."stripeCustomerId",
// reached from a CRM customer via crm_customers.source_customer_id). No local
// table stores Stripe payment-method ids; saved cards are listed live from
// Stripe and new ones land there via setup_future_usage.
// ============================================================================

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://aapawz.com"

export type PendingKind = "pos_sale" | "manual_payment"
export type PendingStatus = "awaiting_payment" | "completing" | "completed" | "failed" | "expired" | "cancelled"

export type SavedCard = {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
}

export type PendingCharge = {
  id: string
  tenant_id: string
  kind: PendingKind
  status: PendingStatus
  amount: number
  currency: string
  customer_id: string | null
  payload: any
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  sale_id: string | null
  payment_id: string | null
  error: string | null
  created_at: string
  expires_at: string
}

export class CardPaymentError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function stripeConfigured(): boolean {
  return getStripe() !== null
}

function requireStripe(): Stripe {
  const stripe = getStripe()
  if (!stripe) {
    throw new CardPaymentError(
      "Stripe is not configured for this register (STRIPE_SECRET_KEY is not set) — card charging is unavailable. Cash, check, gift card, or a manual card record still work.",
      503,
      "stripe_not_configured",
    )
  }
  return stripe
}

/**
 * The tenant's OWN Stripe routing for a charge (owner ruling 2026-10-17:
 * a franchise tenant's money settles to the TENANT's Stripe account, not
 * headquarters'). A non-master tenant without a connected, ready Stripe
 * account refuses here — BEFORE any pending charge or Stripe object
 * exists — because the alternative (settling their money on the platform
 * account) is exactly the silent misroute this fixes.
 */
async function requireTenantRouting(tenant: string): Promise<TenantChargeRouting> {
  const routing = await loadTenantChargeRouting(tenant)
  if (routing.mode === "unconnected") {
    throw new CardPaymentError(TENANT_STRIPE_NOT_CONNECTED_MESSAGE, 503, "stripe_not_connected")
  }
  return routing
}

async function pg<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const result = await withPg(fn)
  if (result === null || result === undefined) {
    throw new CardPaymentError("Database unavailable — the payment was not started.", 503, "db_unavailable")
  }
  return result
}

const cents = (amount: number) => Math.round(Number(amount) * 100)

// ---------------------------------------------------------------------------
// Customer resolution: CRM customer -> shop twin -> Stripe customer.
// ---------------------------------------------------------------------------

type ResolvedCustomer = {
  crmCustomerId: string | null
  email: string | null
  name: string | null
  shopCustomerId: string | null
  stripeCustomerId: string | null
}

export async function resolveStripeCustomer(
  tenant: string,
  crmCustomerId: string | null,
  opts: { createStripeCustomer?: boolean } = {},
): Promise<ResolvedCustomer> {
  const out: ResolvedCustomer = {
    crmCustomerId: crmCustomerId || null,
    email: null,
    name: null,
    shopCustomerId: null,
    stripeCustomerId: null,
  }
  if (!crmCustomerId) return out

  const row = await pg(async (client) => {
    const { rows } = await client.query(
      `SELECT cc.email,
              TRIM(COALESCE(cc.first_name,'') || ' ' || COALESCE(cc.last_name,'')) AS crm_name,
              cc.source_customer_id,
              s.id AS shop_id,
              s."stripeCustomerId" AS stripe_id,
              s.email AS shop_email,
              TRIM(COALESCE(s."firstName",'') || ' ' || COALESCE(s."lastName",'')) AS shop_name
         FROM public.crm_customers cc
         LEFT JOIN public.customers s ON s.id = cc.source_customer_id
        WHERE cc.id = $1 AND cc.tenant_id = $2
        LIMIT 1`,
      [crmCustomerId, tenant],
    )
    return rows[0] || null
  })
  if (!row) return out

  out.email = row.email || row.shop_email || null
  out.name = (row.crm_name || row.shop_name || "").trim() || null
  out.shopCustomerId = row.shop_id || null
  out.stripeCustomerId = row.stripe_id || null

  if (!out.stripeCustomerId && opts.createStripeCustomer) {
    const stripe = requireStripe()
    const created = await stripe.customers.create({
      email: out.email || undefined,
      name: out.name || undefined,
      metadata: { crm_customer_id: crmCustomerId, shop_customer_id: out.shopCustomerId || "" },
    })
    out.stripeCustomerId = created.id
    // Persist the link so the card saved on this charge is findable later.
    // A shop twin is created when the CRM customer has none — customers has
    // no required fields beyond defaults, so this is safe.
    await pg(async (client) => {
      if (!out.shopCustomerId) {
        const parts = (out.name || "").split(/\s+/)
        const { rows } = await client.query(
          `INSERT INTO public.customers (id, "firstName", "lastName", email, "stripeCustomerId", tenant_id, "createdAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, now())
           RETURNING id`,
          [parts[0] || "", parts.slice(1).join(" ") || "", out.email, created.id, tenant],
        )
        out.shopCustomerId = rows[0]?.id || null
        if (out.shopCustomerId) {
          await client.query(
            `UPDATE public.crm_customers SET source_customer_id = $1 WHERE id = $2 AND tenant_id = $3`,
            [out.shopCustomerId, crmCustomerId, tenant],
          )
        }
      } else {
        await client.query(
          `UPDATE public.customers SET "stripeCustomerId" = $1 WHERE id = $2`,
          [created.id, out.shopCustomerId],
        )
      }
    })
  }
  return out
}

export async function listSavedCards(tenant: string, crmCustomerId: string | null): Promise<SavedCard[]> {
  const stripe = getStripe()
  if (!stripe || !crmCustomerId) return []
  const resolved = await resolveStripeCustomer(tenant, crmCustomerId)
  if (!resolved.stripeCustomerId) return []
  // A failed Stripe read throws: an empty list here would read as "this
  // customer has no card on file" and misdirect the charge path.
  const list = await stripe.paymentMethods.list({ customer: resolved.stripeCustomerId, type: "card" })
  return list.data.map((pm) => ({
    id: pm.id,
    brand: pm.card?.brand || "card",
    last4: pm.card?.last4 || "????",
    expMonth: pm.card?.exp_month || 0,
    expYear: pm.card?.exp_year || 0,
  }))
}

/** Everything the tender UI needs to gate each card path honestly. */
export async function getCardOptions(tenant: string, crmCustomerId: string | null) {
  const configured = stripeConfigured()
  if (!configured) {
    return {
      configured: false,
      reason:
        "Stripe is not configured for this register (no STRIPE_SECRET_KEY) — card charging is unavailable. Cash, check, gift card, or a manual card record still work.",
      savedCards: [] as SavedCard[],
      customerEmail: null as string | null,
      stripeCustomerLinked: false,
      canSaveCard: false,
    }
  }
  // Tenant routing: a franchise tenant whose own Stripe isn't connected
  // can't take cards at their register — the tender UI must say so
  // instead of offering card paths that would settle to headquarters.
  const routing = await loadTenantChargeRouting(tenant)
  if (routing.mode === "unconnected") {
    return {
      configured: false,
      reason: TENANT_STRIPE_NOT_CONNECTED_MESSAGE,
      savedCards: [] as SavedCard[],
      customerEmail: null as string | null,
      stripeCustomerLinked: false,
      canSaveCard: false,
    }
  }
  const resolved = crmCustomerId ? await resolveStripeCustomer(tenant, crmCustomerId) : null
  const savedCards = crmCustomerId ? await listSavedCards(tenant, crmCustomerId) : []
  return {
    configured: true,
    reason: null as string | null,
    savedCards,
    customerEmail: resolved?.email || null,
    stripeCustomerLinked: !!resolved?.stripeCustomerId,
    // A card can be saved for future charges when the payment can be tied to
    // a customer record (an existing Stripe customer, or one we can create
    // and persist from the CRM record).
    canSaveCard: !!crmCustomerId,
  }
}

// ---------------------------------------------------------------------------
// Pending charges
// ---------------------------------------------------------------------------

export async function createPendingCharge(input: {
  tenant: string
  kind: PendingKind
  amount: number
  customerId?: string | null
  payload: any
  createdBy?: string | null
}): Promise<PendingCharge> {
  if (!(input.amount > 0)) throw new CardPaymentError("Amount must be greater than zero", 400)
  return pg(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO public.stripe_pending_charges
         (tenant_id, kind, amount, customer_id, payload, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.tenant, input.kind, input.amount, input.customerId || null, JSON.stringify(input.payload || {}), input.createdBy || null],
    )
    return rows[0]
  })
}

export async function getPendingCharge(tenant: string, pendingId: string): Promise<PendingCharge | null> {
  return pg(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM public.stripe_pending_charges WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [pendingId, tenant],
    )
    return rows[0] || null
  })
}

async function bindStripeObject(pendingId: string, fields: { sessionId?: string; paymentIntentId?: string }) {
  await pg(async (client) => {
    await client.query(
      `UPDATE public.stripe_pending_charges
          SET stripe_checkout_session_id = COALESCE($2, stripe_checkout_session_id),
              stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
              updated_at = now()
        WHERE id = $1`,
      [pendingId, fields.sessionId || null, fields.paymentIntentId || null],
    )
  })
}

export async function cancelPendingCharge(tenant: string, pendingId: string): Promise<PendingCharge | null> {
  return pg(async (client) => {
    const { rows } = await client.query(
      `UPDATE public.stripe_pending_charges
          SET status = 'cancelled', updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND status = 'awaiting_payment'
        RETURNING *`,
      [pendingId, tenant],
    )
    return rows[0] || (await client.query(
      `SELECT * FROM public.stripe_pending_charges WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [pendingId, tenant],
    )).rows[0] || null
  })
}

function chargeMetadata(pending: PendingCharge) {
  return {
    type: "card_payment",
    pending_charge_id: pending.id,
    kind: pending.kind,
    tenant_id: pending.tenant_id,
    customer_id: pending.customer_id || "",
  }
}

// ---------------------------------------------------------------------------
// Path 1 — keyed entry: create a PaymentIntent the register confirms with
// Stripe Elements. The sale completes via POST confirm or the webhook,
// whichever finalizes first.
// ---------------------------------------------------------------------------

export async function createKeyedIntent(input: {
  tenant: string
  kind: PendingKind
  amount: number
  customerId?: string | null
  payload: any
  saveCard?: boolean
  createdBy?: string | null
}): Promise<{ pendingId: string; clientSecret: string }> {
  const stripe = requireStripe()
  const routing = await requireTenantRouting(input.tenant)
  const resolved = await resolveStripeCustomer(input.tenant, input.customerId || null, {
    createStripeCustomer: !!input.saveCard && !!input.customerId,
  })
  const pending = await createPendingCharge(input)
  try {
    const pi = await stripe.paymentIntents.create({
      amount: cents(input.amount),
      currency: "usd",
      customer: resolved.stripeCustomerId || undefined,
      payment_method_types: ["card"],
      setup_future_usage: input.saveCard && resolved.stripeCustomerId ? "off_session" : undefined,
      ...destinationTransferFields(routing),
      metadata: chargeMetadata(pending),
      description: input.kind === "pos_sale" ? "All About Pawz — register sale" : "All About Pawz — counter payment",
      // UNSAID SDK NOTE (transplant lane 2): stripe@23 types dropped payment_method_types; cast keeps runtime params identical.
    } as any)
    await bindStripeObject(pending.id, { paymentIntentId: pi.id })
    if (!pi.client_secret) throw new CardPaymentError("Stripe did not return a client secret for this payment", 502)
    return { pendingId: pending.id, clientSecret: pi.client_secret }
  } catch (e) {
    await pg(async (client) => {
      await client.query(
        `UPDATE public.stripe_pending_charges SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
        [pending.id, e instanceof Error ? e.message : String(e)],
      )
    }).catch(() => {})
    throw e
  }
}

// ---------------------------------------------------------------------------
// Path 3 — charge the card on file (off-session). Authentication-required
// outcomes are returned, not thrown, so the UI can offer the link path.
// ---------------------------------------------------------------------------

export type OnFileResult =
  | { outcome: "completed"; pendingId: string; saleId: string | null; paymentId: string | null; paymentNumber: string | null; saleResult?: import("@/lib/enterprise/pos").PosSaleResult | null }
  | { outcome: "authentication_required"; pendingId: string; message: string }
  | { outcome: "declined"; pendingId: string; message: string }

export async function chargeCardOnFile(input: {
  tenant: string
  kind: PendingKind
  amount: number
  customerId?: string | null
  paymentMethodId?: string | null
  payload: any
  createdBy?: string | null
}): Promise<OnFileResult> {
  const stripe = requireStripe()
  if (!input.customerId) {
    throw new CardPaymentError("Attach a customer to charge a card on file.", 400, "no_customer")
  }
  const resolved = await resolveStripeCustomer(input.tenant, input.customerId)
  if (!resolved.stripeCustomerId) {
    throw new CardPaymentError(
      "No card on file for this customer — they have no saved payment method. Type the card, send a payment link, or record the payment manually instead.",
      422,
      "no_card_on_file",
    )
  }
  const cards = await listSavedCards(input.tenant, input.customerId)
  if (cards.length === 0) {
    throw new CardPaymentError(
      "No card on file for this customer — they have no saved payment method. Type the card, send a payment link, or record the payment manually instead.",
      422,
      "no_card_on_file",
    )
  }
  const chosen = input.paymentMethodId
    ? cards.find((c) => c.id === input.paymentMethodId)
    : cards[0]
  if (!chosen) throw new CardPaymentError("That saved card no longer exists for this customer.", 422, "no_card_on_file")

  const routing = await requireTenantRouting(input.tenant)
  const pending = await createPendingCharge(input)
  let pi: Stripe.PaymentIntent
  try {
    pi = await stripe.paymentIntents.create({
      amount: cents(input.amount),
      currency: "usd",
      customer: resolved.stripeCustomerId,
      payment_method: chosen.id,
      payment_method_types: ["card"],
      off_session: true,
      confirm: true,
      ...destinationTransferFields(routing),
      metadata: chargeMetadata(pending),
      description: input.kind === "pos_sale" ? "All About Pawz — register sale (card on file)" : "All About Pawz — counter payment (card on file)",
      // UNSAID SDK NOTE (transplant lane 2): stripe@23 types dropped payment_method_types; cast keeps runtime params identical.
    } as any)
  } catch (e: any) {
    // Stripe throws a card_error for off-session declines / auth-required.
    const code = e?.code || e?.decline_code || ""
    const piFromError: string | undefined = e?.payment_intent?.id
    if (piFromError) await bindStripeObject(pending.id, { paymentIntentId: piFromError }).catch(() => {})
    if (code === "authentication_required" || e?.payment_intent?.status === "requires_action") {
      return {
        outcome: "authentication_required",
        pendingId: pending.id,
        message:
          "The customer's bank requires them to approve this charge. Send them a payment link instead — they can approve it on their phone.",
      }
    }
    return {
      outcome: "declined",
      pendingId: pending.id,
      message: `The card on file was declined${e?.message ? `: ${e.message}` : "."}`,
    }
  }

  await bindStripeObject(pending.id, { paymentIntentId: pi.id })
  if (pi.status === "succeeded") {
    const fin = await finalizePendingCharge(pending.id, {
      paymentIntentId: pi.id,
      amountCents: pi.amount_received || pi.amount,
    })
    return {
      outcome: "completed",
      pendingId: pending.id,
      saleId: fin.saleId,
      paymentId: fin.paymentId,
      paymentNumber: fin.paymentNumber,
      saleResult: fin.saleResult || null,
    }
  }
  if (pi.status === "requires_action" || pi.status === "requires_confirmation") {
    return {
      outcome: "authentication_required",
      pendingId: pending.id,
      message:
        "The customer's bank requires them to approve this charge. Send them a payment link instead — they can approve it on their phone.",
    }
  }
  return {
    outcome: "declined",
    pendingId: pending.id,
    message: `The card on file could not be charged (Stripe status: ${pi.status}).`,
  }
}

// ---------------------------------------------------------------------------
// Path 2 — payment link: a Stripe Checkout session tied to the pending
// charge. The sale stays 'awaiting_payment' until the webhook (or a status
// poll that finds the session paid) finalizes it.
// ---------------------------------------------------------------------------

export async function createPaymentLink(input: {
  tenant: string
  kind: PendingKind
  amount: number
  customerId?: string | null
  payload: any
  saveCard?: boolean
  createdBy?: string | null
}): Promise<{ pendingId: string; url: string; customerEmail: string | null }> {
  const stripe = requireStripe()
  const routing = await requireTenantRouting(input.tenant)
  const resolved = await resolveStripeCustomer(input.tenant, input.customerId || null, {
    createStripeCustomer: !!input.saveCard && !!input.customerId,
  })
  const pending = await createPendingCharge(input)
  const metadata = chargeMetadata(pending)
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "usd",
      customer: resolved.stripeCustomerId || undefined,
      customer_email: !resolved.stripeCustomerId && resolved.email ? resolved.email : undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: cents(input.amount),
            product_data: {
              name: input.kind === "pos_sale" ? "All About Pawz — register sale" : "All About Pawz — payment",
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata,
        setup_future_usage: input.saveCard && resolved.stripeCustomerId ? "off_session" : undefined,
        ...destinationTransferFields(routing),
      },
      metadata,
      success_url: `${SITE_URL}/admin/pos?card_link=paid&pending=${pending.id}`,
      cancel_url: `${SITE_URL}/admin/pos?card_link=cancelled&pending=${pending.id}`,
    })
    await bindStripeObject(pending.id, { sessionId: session.id })
    if (!session.url) throw new CardPaymentError("Stripe did not return a payment link URL", 502)
    return { pendingId: pending.id, url: session.url, customerEmail: resolved.email }
  } catch (e) {
    await pg(async (client) => {
      await client.query(
        `UPDATE public.stripe_pending_charges SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
        [pending.id, e instanceof Error ? e.message : String(e)],
      )
    }).catch(() => {})
    throw e
  }
}

/** Email the payment link to the customer's address on file (Resend pipeline). */
export async function emailPaymentLink(
  tenant: string,
  pendingId: string,
): Promise<{ emailed: boolean; to: string | null; error?: string }> {
  const pending = await getPendingCharge(tenant, pendingId)
  if (!pending) throw new CardPaymentError("Pending payment not found", 404)
  if (!pending.stripe_checkout_session_id) {
    throw new CardPaymentError("This pending payment has no payment link to send.", 400)
  }
  const stripe = requireStripe()
  const session = await stripe.checkout.sessions.retrieve(pending.stripe_checkout_session_id)
  const url = session.url
  if (!url) return { emailed: false, to: null, error: "Stripe no longer returns a URL for this link (it may have expired)." }
  const resolved = await resolveStripeCustomer(tenant, pending.customer_id)
  if (!resolved.email) {
    return { emailed: false, to: null, error: "No email address on file for this customer — show them the link or copy it instead." }
  }
  const { sendEmail } = await import("@/lib/email")
  const amountStr = `$${Number(pending.amount).toFixed(2)}`
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <h1 style="font-size:20px;margin:0 0 12px;">Your All About Pawz payment</h1>
    <p style="font-size:14px;line-height:1.6;margin:0 0 20px;">Hi ${resolved.name ? resolved.name.split(" ")[0] : "there"} — here's the secure link to complete your ${amountStr} payment. It only takes a moment.</p>
    <p style="margin:0 0 24px;"><a href="${url}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:999px;">Pay ${amountStr}</a></p>
    <p style="font-size:12px;color:#666;line-height:1.6;margin:0;">If the button doesn't work, paste this into your browser:<br/>${url}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;"/>
    <p style="font-size:11px;color:#888;margin:0;">All About Pawz · 699 Waring Rd, Memphis, TN 38122 · 901-722-1114</p>
  </div></body></html>`
  const result = await sendEmail({
    to: resolved.email,
    customerId: pending.customer_id || undefined,
    tenantId: tenant,
    template: "pos_payment_link",
    subject: `Complete your ${amountStr} payment — All About Pawz`,
    html,
  })
  return result.ok
    ? { emailed: true, to: resolved.email }
    : { emailed: false, to: resolved.email, error: result.error || "Email could not be sent" }
}

// ---------------------------------------------------------------------------
// Finalization — the one place a confirmed Stripe payment becomes books.
// ---------------------------------------------------------------------------

export type FinalizeResult = {
  status: "completed" | "already_completed" | "skipped"
  saleId: string | null
  paymentId: string | null
  paymentNumber: string | null
  /** Full PosSaleResult when THIS call completed a register sale in-process
   *  (carries receiptRaw for the success screen). Null when the sale was
   *  completed by another caller (webhook) — the receipt number/total are
   *  still readable via getPendingChargeWithSale. */
  saleResult?: import("@/lib/enterprise/pos").PosSaleResult | null
  reason?: string
}

async function stripeCardMethodId(tenant: string): Promise<string> {
  const id = await pg(async (client) => {
    const { rows } = await client.query(
      `SELECT id FROM public.commerce_payment_methods
        WHERE tenant_id = $1 AND code = 'stripe_card' AND active = true
        LIMIT 1`,
      [tenant],
    )
    return rows[0]?.id || null
  })
  if (!id) {
    throw new CardPaymentError(
      "No active 'stripe_card' payment method is configured for this tenant — the charge succeeded at Stripe but cannot be recorded. Reconcile from the Payments module.",
      500,
      "no_stripe_card_method",
    )
  }
  return id
}

export async function finalizePendingCharge(
  pendingId: string,
  proof: { paymentIntentId: string; amountCents: number },
): Promise<FinalizeResult> {
  // ---- Claim the row atomically: exactly one caller completes it. ----
  const claimed = await pg(async (client) => {
    const { rows } = await client.query(
      `UPDATE public.stripe_pending_charges
          SET status = 'completing',
              stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $2),
              updated_at = now()
        WHERE id = $1 AND status = 'awaiting_payment'
        RETURNING *`,
      [pendingId, proof.paymentIntentId],
    )
    return rows[0] || null
  })

  if (!claimed) {
    const existing = await pg(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM public.stripe_pending_charges WHERE id = $1 LIMIT 1`,
        [pendingId],
      )
      return rows[0] || null
    })
    if (!existing) throw new CardPaymentError(`Pending charge ${pendingId} not found`, 404)
    if (existing.status === "completed") {
      return {
        status: "already_completed",
        saleId: existing.sale_id,
        paymentId: existing.payment_id,
        paymentNumber: null,
      }
    }
    if (existing.status === "completing") {
      // Another caller is mid-finalize; treat as handled (idempotent).
      return { status: "already_completed", saleId: existing.sale_id, paymentId: existing.payment_id, paymentNumber: null }
    }
    // cancelled / expired / failed — money (if any) is handled by the generic
    // webhook ledger + mirror so it stays visible for refund/reconcile.
    return { status: "skipped", saleId: null, paymentId: null, paymentNumber: null, reason: `pending charge is ${existing.status}` }
  }

  const pending = claimed as PendingCharge

  // ---- Verify the proof matches the charge that was started. ----
  if (cents(pending.amount) !== proof.amountCents) {
    await pg(async (client) => {
      await client.query(
        `UPDATE public.stripe_pending_charges SET status = 'awaiting_payment', error = $2, updated_at = now() WHERE id = $1`,
        [pendingId, `Amount mismatch: charge was $${pending.amount}, Stripe confirmed ${proof.amountCents} cents — not recorded.`],
      )
    })
    throw new CardPaymentError(
      `Amount mismatch for pending charge ${pendingId}: expected $${pending.amount}, Stripe confirmed $${(proof.amountCents / 100).toFixed(2)}. The payment was NOT recorded against a sale.`,
      409,
      "amount_mismatch",
    )
  }

  try {
    if (pending.kind === "pos_sale") {
      // The sale completes on the PENDING CHARGE's tenant's books — the
      // tenant the register session resolved when the charge was started
      // (completePosSale takes the tenant explicitly and cross-checks the
      // register session against it). Before the tenant-parameterized POS
      // stack, this refused every non-home-tenant charge outright, which
      // meant a franchise register could take a card payment it could
      // never record.
      const payload = pending.payload || {}
      const sale = payload.sale || {}
      const priorPayments: any[] = Array.isArray(payload.priorPayments) ? payload.priorPayments : []
      const priorTips = priorPayments.reduce((s, p) => s + (Number(p.tipAmount) || 0), 0)
      const cardTip = Math.max(0, Math.round(((Number(payload.tipAmount) || 0) - priorTips) * 100)) / 100
      const methodId = await stripeCardMethodId(pending.tenant_id)
      const input: PosSaleInput = {
        idempotencyKey: `card-pending-${pending.id}`,
        tenantId: pending.tenant_id,
        registerSessionId: sale.registerSessionId,
        customerId: sale.customerId ?? pending.customer_id ?? null,
        petId: sale.petId ?? null,
        appointmentId: sale.appointmentId ?? null,
        staffId: sale.staffId ?? null,
        lines: sale.lines || [],
        discountTotal: sale.discountTotal || 0,
        couponCode: sale.couponCode || null,
        taxTotal: sale.taxTotal || 0,
        payments: [
          ...priorPayments,
          {
            paymentMethodId: methodId,
            amount: Number(pending.amount),
            tipAmount: cardTip,
            processorTransactionId: proof.paymentIntentId,
          },
        ],
        depositAmount: sale.depositAmount || 0,
        notes: sale.notes || "",
        createdBy: sale.createdBy,
      }
      const result = await completePosSale(input)
      if ("error" in result) {
        throw new CardPaymentError(`Sale completion failed after the card was charged (${proof.paymentIntentId}): ${result.error}`, 500)
      }
      await pg(async (client) => {
        await client.query(
          `UPDATE public.stripe_pending_charges
              SET status = 'completed', sale_id = $2, updated_at = now()
            WHERE id = $1`,
          [pendingId, result.saleId],
        )
      })
      return { status: "completed", saleId: result.saleId, paymentId: null, paymentNumber: null, saleResult: result }
    }

    // manual_payment — the same commerce_payments insert finance
    // take_payment makes (succeeded row), with the Stripe identifiers the
    // manual path never has.
    const methodId = await stripeCardMethodId(pending.tenant_id)
    const payNum = `PAY-${Date.now().toString(36).toUpperCase()}`
    const paymentId = await pg(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO public.commerce_payments
           (id, tenant_id, payment_number, customer_id, payment_method_id, amount, currency, status,
            processor_transaction_id, external_reference, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4::uuid, $5, 'USD', 'succeeded', $6, $7, now())
         RETURNING id`,
        [
          pending.tenant_id,
          payNum,
          pending.customer_id,
          methodId,
          Number(pending.amount),
          proof.paymentIntentId,
          (pending.payload && pending.payload.reference) || null,
        ],
      )
      return rows[0]?.id || null
    })
    await pg(async (client) => {
      await client.query(
        `UPDATE public.stripe_pending_charges
            SET status = 'completed', payment_id = $2, updated_at = now()
          WHERE id = $1`,
        [pendingId, paymentId],
      )
    })
    return { status: "completed", saleId: null, paymentId, paymentNumber: payNum }
  } catch (e) {
    // The card WAS charged. Put the row back to awaiting_payment (with the
    // error recorded) so a webhook retry or a staff retry can complete the
    // recording — never leave confirmed money silently unrecorded.
    await pg(async (client) => {
      await client.query(
        `UPDATE public.stripe_pending_charges SET status = 'awaiting_payment', error = $2, updated_at = now() WHERE id = $1`,
        [pendingId, e instanceof Error ? e.message : String(e)],
      )
    }).catch(() => {})
    throw e
  }
}

/** Status + completed-sale summary for register polling. */
export async function getPendingChargeWithSale(tenant: string, pendingId: string) {
  const pending = await getPendingCharge(tenant, pendingId)
  if (!pending) return null
  let effective = pending
  if (pending.status === "awaiting_payment" && new Date(pending.expires_at).getTime() < Date.now()) {
    await pg(async (client) => {
      await client.query(
        `UPDATE public.stripe_pending_charges SET status = 'expired', updated_at = now() WHERE id = $1 AND status = 'awaiting_payment'`,
        [pendingId],
      )
    })
    effective = { ...pending, status: "expired" }
  }
  let sale: any = null
  if (effective.status === "completed" && effective.sale_id) {
    sale = await pg(async (client) => {
      const { rows } = await client.query(
        `SELECT s.id, s.sale_number, s.total, s.paid_total, s.change_due,
                (SELECT receipt_number FROM public.commerce_receipts r WHERE r.sale_id = s.id LIMIT 1) AS receipt_number
           FROM public.commerce_sales s
          WHERE s.id = $1 AND s.tenant_id = $2
          LIMIT 1`,
        [effective.sale_id, tenant],
      )
      return rows[0] || null
    })
  }
  return { pending: effective, sale }
}

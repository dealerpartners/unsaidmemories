import "server-only"

// ---------------------------------------------------------------------------
// shop/checkout-tax.ts — the Stripe Tax service behind the shop
// checkout quote (the pure decisions live in checkout-tax-core.ts).
//
//   getStripeTaxSettings — the account's Stripe Tax settings
//     (status, default tax_behavior, default tax code, head-office
//     address), read at runtime and cached for five minutes: the
//     owner flips behavior or codes in Stripe, never in code.
//   calculateQuoteTax — POST /v1/tax/calculations for one quote:
//     discounted per-line amounts with per-category Stripe tax
//     codes, the charged shipping as the calculation's shipping
//     cost, the customer's full ship-to address (pickup: the head
//     office). Stripe Tax answers only where the account holds an
//     active registration; a returned 0 is data. NO ANSWER IS AN
//     ERROR — this module throws TaxEngineError and the quote fails
//     (the posture is stated in checkout-tax-core.ts; there is no
//     silent-zero path and no fallback rate).
//   ensureOrderTaxTransaction — at finalization, turn a paid
//     order's persisted calculation into its Stripe Tax TRANSACTION
//     (create_from_calculation) — the record filing reports from.
//     Idempotent: the persisted transaction id/reference is checked
//     first, the create carries a deterministic idempotency key,
//     and Stripe itself enforces a unique transaction reference.
//   getStripeTaxAdminSummary — the admin read model: engine status
//     + registrations from Stripe, per-state collected totals from
//     our own paid orders' tax records.
//
// The Stripe client is the shared getStripe() from lib/stripe —
// the one credential path, as everywhere else in the codebase.
// ---------------------------------------------------------------------------

import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { pgQuery } from "@/lib/pg"
import {
  FALLBACK_DEFAULT_TAX_CODE,
  allocateDiscountCents,
  buildTaxCalculationParams,
  quoteTaxFromAnswer,
  taxAddressFor,
  taxCodeForCategory,
  taxEngineCallFor,
  taxLineReference,
  taxTransactionDecisionFor,
  taxTransactionIdempotencyKey,
  taxTransactionReference,
  zeroQuoteTax,
  type OrderTaxRecordShape,
  type QuoteTaxResult,
  type StripeCalculationShape,
  type TaxBehavior,
  type TaxEngineLine,
  type TaxPostalAddress,
} from "@/lib/shop/checkout-tax-core"

export class TaxEngineError extends Error {
  status = 503
  constructor(message: string) {
    super(message)
    this.name = "TaxEngineError"
  }
}

const TAX_ENGINE_DOWN_COPY =
  "Sales tax couldn't be calculated for this order. You have not been charged — please try again in a moment."

// --- Settings (runtime read, sane cache) -------------------------------------

export type StripeTaxSettings = {
  status: string
  taxBehavior: TaxBehavior
  defaultTaxCode: string
  headOffice: TaxPostalAddress | null
}

const SETTINGS_TTL_MS = 5 * 60 * 1000
let settingsCache: { at: number; value: StripeTaxSettings } | null = null

export async function getStripeTaxSettings(): Promise<StripeTaxSettings> {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) {
    return settingsCache.value
  }
  const stripe = getStripe()
  if (!stripe) throw new TaxEngineError(TAX_ENGINE_DOWN_COPY)
  let s: Stripe.Tax.Settings
  try {
    s = await stripe.tax.settings.retrieve()
  } catch (e: any) {
    console.error("[shop/tax] Stripe Tax settings read failed:", e?.message)
    throw new TaxEngineError(TAX_ENGINE_DOWN_COPY)
  }
  if (s.status !== "active") {
    console.error(`[shop/tax] Stripe Tax is not active (status=${s.status})`)
    throw new TaxEngineError(TAX_ENGINE_DOWN_COPY)
  }
  const ho = s.head_office?.address
  const value: StripeTaxSettings = {
    status: s.status,
    taxBehavior: s.defaults?.tax_behavior === "exclusive" ? "exclusive" : "inclusive",
    defaultTaxCode: s.defaults?.tax_code || FALLBACK_DEFAULT_TAX_CODE,
    headOffice: ho
      ? taxAddressFor({
          line1: ho.line1,
          line2: ho.line2,
          city: ho.city,
          state: ho.state,
          postalCode: ho.postal_code,
          country: ho.country,
        })
      : null,
  }
  settingsCache = { at: Date.now(), value }
  return value
}

// --- Category text for tax-code mapping --------------------------------------

/** Per-catalog-item category text (every linked taxonomy node's
 *  name + slug — the item's full merchandising path) for the
 *  tax-code keyword mapping. A read failure degrades to "unmapped"
 *  (the account default code — Stripe's own fallback), never to a
 *  failed quote: the code refines the rate, the engine decides it. */
async function categoryTextForItems(
  catalogItemIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(catalogItemIds.filter(Boolean))]
  if (ids.length === 0) return out
  const rows = await pgQuery<{ item_id: string; category_text: string | null }>(
    `SELECT t.item_id::text AS item_id,
            COALESCE(string_agg(DISTINCT n.name, ' '), '') || ' ' ||
            COALESCE(string_agg(DISTINCT n.slug, ' '), '') AS category_text
       FROM public.commerce_catalog_item_taxonomy t
       JOIN public.taxonomy_nodes n ON n.id::text = t.node_id
      WHERE t.item_id::text = ANY($1::text[])
      GROUP BY t.item_id`,
    [ids],
  ).catch(() => [])
  for (const r of rows) {
    if (r.category_text) out.set(String(r.item_id), String(r.category_text))
  }
  return out
}

// --- The calculation -----------------------------------------------------------

export type QuoteTaxInputLine = {
  productId: string
  catalogItemId: string | null
  sellerId: string | null
  quantity: number
  lineTotalCents: number
}

export async function calculateQuoteTax(input: {
  lines: QuoteTaxInputLine[]
  discountCents: number
  shippingCents: number
  delivery:
    | {
        kind: "ship"
        address: {
          line1: string
          line2?: string
          city: string
          state: string
          postalCode: string
        }
      }
    | { kind: "pickup" }
}): Promise<QuoteTaxResult> {
  const settings = await getStripeTaxSettings()

  // The tax address: the customer's ship-to, or — for pickup — the
  // head office Stripe holds for the account (the store the goods
  // are collected from; a pickup sale is taxed where it happens).
  let customerAddress: TaxPostalAddress
  let basis: QuoteTaxResult["basis"]
  if (input.delivery.kind === "pickup") {
    if (!settings.headOffice) {
      console.error("[shop/tax] pickup quote but Stripe Tax has no head-office address")
      throw new TaxEngineError(TAX_ENGINE_DOWN_COPY)
    }
    customerAddress = settings.headOffice
    basis = {
      kind: "pickup_head_office",
      state: customerAddress.state || null,
      postalCode: customerAddress.postalCode || null,
    }
  } else {
    customerAddress = taxAddressFor(input.delivery.address)
    basis = {
      kind: "ship_to",
      state: customerAddress.state || null,
      postalCode: customerAddress.postalCode || null,
    }
  }

  // Discounted per-line amounts — the amounts actually sold for.
  const lineTotals = input.lines.map((l) => Math.max(0, Math.trunc(l.lineTotalCents) || 0))
  const allocated = allocateDiscountCents(lineTotals, input.discountCents)
  const merchandiseBase = lineTotals.reduce((s, v) => s + v, 0) - allocated.reduce((s, v) => s + v, 0)

  const categoryText = await categoryTextForItems(
    input.lines.map((l) => l.catalogItemId).filter((x): x is string => !!x),
  )
  const occurrences = new Map<string, number>()
  const engineLines: TaxEngineLine[] = input.lines.map((l, i) => {
    const occurrence = (occurrences.get(l.productId) ?? 0) + 1
    occurrences.set(l.productId, occurrence)
    return {
      reference: taxLineReference(l.productId, occurrence),
      productId: l.productId,
      sellerId: l.sellerId,
      amountCents: Math.max(0, lineTotals[i] - allocated[i]),
      quantity: Math.max(1, Math.trunc(l.quantity) || 1),
      taxCode: taxCodeForCategory(
        l.catalogItemId ? categoryText.get(l.catalogItemId) : null,
        settings.defaultTaxCode,
      ),
    }
  })

  // Zero merchandise base: no tax can be owed (shipping tax follows
  // the merchandise) — an engineered zero, recorded like any other
  // outcome, with no engine call and no calculation id.
  if (taxEngineCallFor(merchandiseBase) === "skip_zero_base") {
    return zeroQuoteTax({ taxBehavior: settings.taxBehavior, lines: engineLines, basis })
  }

  const stripe = getStripe()
  if (!stripe) throw new TaxEngineError(TAX_ENGINE_DOWN_COPY)
  const params = buildTaxCalculationParams({
    currency: "usd",
    taxBehavior: settings.taxBehavior,
    customerAddress,
    lines: engineLines,
    shippingCents: Math.max(0, Math.trunc(input.shippingCents) || 0),
  })

  let calculation: Stripe.Tax.Calculation | null = null
  let engineError = ""
  try {
    calculation = await stripe.tax.calculations.create(
      params as unknown as Stripe.Tax.CalculationCreateParams,
    )
  } catch (e: any) {
    engineError = e?.message || "stripe_tax_unreachable"
    console.error("[shop/tax] Stripe Tax calculation failed:", engineError)
  }

  const outcome = quoteTaxFromAnswer(
    calculation
      ? { answered: true, calculation: calculation as unknown as StripeCalculationShape }
      : { answered: false, error: engineError },
    { taxBehavior: settings.taxBehavior, lines: engineLines, basis },
  )
  if (!outcome.ok) throw new TaxEngineError(outcome.error)
  return outcome.tax
}

// --- Finalization: calculation → tax transaction -----------------------------

type TaxQueryFn = (
  sql: string,
  params: unknown[],
) => Promise<Record<string, unknown>[]>

function parseMetadata(raw: unknown): Record<string, any> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, any>
    } catch {
      return {}
    }
  }
  if (raw && typeof raw === "object") return raw as Record<string, any>
  return {}
}

export type EnsureTaxTransactionResult = {
  recorded: boolean
  transactionId?: string | null
  reason?: string
}

/** Create the order's Stripe Tax transaction from its persisted
 *  calculation — the filing record. Runs on every finalization of
 *  a paid custom-checkout order (webhook step 2f, and the gift-card
 *  / PayPal finalize twins) and converges: an order whose tax
 *  record already carries a transaction id (or the recovered
 *  reference) is left alone, so replays create exactly one
 *  transaction. A duplicate-reference answer from Stripe means a
 *  prior create landed but its persist did not — the transaction
 *  exists, so the order's record is stamped with the reference
 *  (the durable handle Stripe reports file from) instead of
 *  erroring forever. Unexpected Stripe errors throw to the caller's
 *  failure isolation, like the other finalize steps. */
export async function ensureOrderTaxTransaction(
  q: TaxQueryFn,
  args: { tenantId: string; orderId: string },
): Promise<EnsureTaxTransactionResult> {
  const rows = await q(
    `SELECT metadata FROM public.commerce_orders
      WHERE tenant_id = $1 AND id::text = $2 LIMIT 1`,
    [args.tenantId, args.orderId],
  )
  if (!rows[0]) return { recorded: false, reason: "order_missing" }
  const meta = parseMetadata(rows[0].metadata)
  const tax = (meta?.fulfillment_snapshot?.tax ?? null) as OrderTaxRecordShape | null
  const decision = taxTransactionDecisionFor(tax)
  if (decision.action === "skip") return { recorded: false, reason: decision.reason }

  const stripe = getStripe()
  if (!stripe) return { recorded: false, reason: "stripe_unconfigured" }

  const stamp = async (patch: Record<string, unknown>) => {
    await q(
      `UPDATE public.commerce_orders
          SET metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{fulfillment_snapshot,tax}',
                COALESCE(metadata->'fulfillment_snapshot'->'tax', '{}'::jsonb) || $3::jsonb,
                true),
              updated_at = now()
        WHERE tenant_id = $1 AND id::text = $2`,
      [args.tenantId, args.orderId, JSON.stringify(patch)],
    )
  }

  try {
    const txn = await stripe.tax.transactions.createFromCalculation(
      {
        calculation: decision.calculationId,
        reference: taxTransactionReference(args.orderId),
      },
      { idempotencyKey: taxTransactionIdempotencyKey(args.orderId) },
    )
    await stamp({ transaction_id: txn.id })
    return { recorded: true, transactionId: txn.id }
  } catch (e: any) {
    const msg = String(e?.message || "")
    if (/already exists|duplicate|unique/i.test(msg)) {
      await stamp({ transaction_reference: taxTransactionReference(args.orderId) })
      return { recorded: true, transactionId: null, reason: "already_at_stripe" }
    }
    throw e
  }
}

// --- Admin read model ----------------------------------------------------------

export type StripeTaxAdminSummary = {
  configured: boolean
  status: string | null
  provider: string | null
  taxBehavior: TaxBehavior | null
  defaultTaxCode: string | null
  headOffice: TaxPostalAddress | null
  registrations: Array<{
    id: string
    country: string
    state: string | null
    type: string | null
    activeFrom: string | null
    expiresAt: string | null
  }>
  /** Collected tax per state from OUR paid orders' tax records
   *  (the persisted per-line + shipping jurisdiction breakdowns). */
  collectedByState: Array<{ state: string; taxCents: number; orders: number }>
  collectedTotalCents: number
  ordersWithTaxRecord: number
  ordersWithTransaction: number
}

/** The admin taxes surface's Stripe Tax panel data: live engine
 *  state from Stripe + collections from our own orders. Read-only;
 *  an unconfigured Stripe answers configured:false honestly, and
 *  collections with no taxed orders yet answer empty, not zeroed
 *  fiction. */
export async function getStripeTaxAdminSummary(
  tenantId: string,
): Promise<StripeTaxAdminSummary> {
  const empty: StripeTaxAdminSummary = {
    configured: false,
    status: null,
    provider: null,
    taxBehavior: null,
    defaultTaxCode: null,
    headOffice: null,
    registrations: [],
    collectedByState: [],
    collectedTotalCents: 0,
    ordersWithTaxRecord: 0,
    ordersWithTransaction: 0,
  }
  const stripe = getStripe()
  if (!stripe) return empty

  let settings: Stripe.Tax.Settings | null = null
  let registrations: Stripe.Tax.Registration[] = []
  try {
    settings = await stripe.tax.settings.retrieve()
    const list = await stripe.tax.registrations.list({ limit: 100 })
    registrations = list.data
  } catch (e: any) {
    console.error("[shop/tax] admin summary Stripe read failed:", e?.message)
    return empty
  }
  const ho = settings.head_office?.address

  const stateRows = await pgQuery<{ state: string; tax_cents: number; orders: number }>(
    `WITH paid AS (
       SELECT id, metadata->'fulfillment_snapshot'->'tax' AS tax
         FROM public.commerce_orders
        WHERE tenant_id = $1 AND payment_status = 'paid'
          AND metadata->'fulfillment_snapshot'->'tax' IS NOT NULL
     ),
     juris AS (
       SELECT p.id AS order_id, j->>'state' AS state, (j->>'taxCents')::int AS tax_cents
         FROM paid p,
              jsonb_array_elements(COALESCE(p.tax->'lines', '[]'::jsonb)) l,
              jsonb_array_elements(COALESCE(l->'jurisdictions', '[]'::jsonb)) j
       UNION ALL
       SELECT p.id AS order_id, j->>'state' AS state, (j->>'taxCents')::int AS tax_cents
         FROM paid p,
              jsonb_array_elements(COALESCE(p.tax->'shipping_jurisdictions', '[]'::jsonb)) j
     )
     SELECT state, SUM(tax_cents)::int AS tax_cents, COUNT(DISTINCT order_id)::int AS orders
       FROM juris
      WHERE state IS NOT NULL
      GROUP BY state
      ORDER BY tax_cents DESC`,
    [tenantId],
  ).catch(() => [])
  const totalsRows = await pgQuery<{ with_tax: number; with_txn: number; total_cents: number }>(
    `SELECT COUNT(*)::int AS with_tax,
            COUNT(*) FILTER (
              WHERE metadata->'fulfillment_snapshot'->'tax'->>'transaction_id' IS NOT NULL
                 OR metadata->'fulfillment_snapshot'->'tax'->>'transaction_reference' IS NOT NULL
            )::int AS with_txn,
            COALESCE(SUM(COALESCE((metadata->'fulfillment_snapshot'->'tax'->>'tax_cents')::int, 0)), 0)::int AS total_cents
       FROM public.commerce_orders
      WHERE tenant_id = $1 AND payment_status = 'paid'
        AND metadata->'fulfillment_snapshot'->'tax' IS NOT NULL`,
    [tenantId],
  ).catch(() => [])

  return {
    configured: true,
    status: settings.status,
    provider: settings.defaults?.provider ?? null,
    taxBehavior:
      settings.defaults?.tax_behavior === "exclusive"
        ? "exclusive"
        : settings.defaults?.tax_behavior === "inclusive"
          ? "inclusive"
          : null,
    defaultTaxCode: settings.defaults?.tax_code ?? null,
    headOffice: ho
      ? taxAddressFor({
          line1: ho.line1,
          line2: ho.line2,
          city: ho.city,
          state: ho.state,
          postalCode: ho.postal_code,
          country: ho.country,
        })
      : null,
    registrations: registrations.map((r) => {
      const us = (r.country_options as any)?.us as
        | { state?: string; type?: string }
        | undefined
      return {
        id: r.id,
        country: r.country,
        state: us?.state ?? null,
        type: us?.type ?? null,
        activeFrom: r.active_from ? new Date(r.active_from * 1000).toISOString() : null,
        expiresAt: r.expires_at ? new Date(r.expires_at * 1000).toISOString() : null,
      }
    }),
    collectedByState: stateRows.map((r) => ({
      state: String(r.state),
      taxCents: Number(r.tax_cents) || 0,
      orders: Number(r.orders) || 0,
    })),
    collectedTotalCents: Number(totalsRows[0]?.total_cents) || 0,
    ordersWithTaxRecord: Number(totalsRows[0]?.with_tax) || 0,
    ordersWithTransaction: Number(totalsRows[0]?.with_txn) || 0,
  }
}

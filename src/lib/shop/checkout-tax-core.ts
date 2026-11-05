// ---------------------------------------------------------------------------
// shop/checkout-tax-core.ts — the PURE core of the shop checkout's
// sales-tax step (Stripe Tax). Import-free and deterministic so it is
// unit-tested directly (scripts/checkout-tax.test.mjs) and shared by
// the tax service (lib/shop/checkout-tax.ts), the quote service
// (lib/shop/checkout-quote.ts) and the finalization steps that turn a
// paid order's calculation into its filing record.
//
// THE POSTURE (straight-line doctrine — read this before touching the
// failure paths):
//   · Tax is computed by Stripe Tax (POST /v1/tax/calculations)
//     against the customer's full ship-to address — or, for pickup,
//     the store address Stripe holds as the account head office.
//     Stripe Tax applies tax ONLY where the account holds an active
//     registration; everywhere else its calculation returns 0 with a
//     `not_collecting` breakdown. A RETURNED 0 is data. A MISSING
//     answer is an error: when the engine does not answer, the quote
//     FAILS (503) — a checkout that cannot compute tax must never
//     silently charge without it. There is no null-tax chargeable
//     state and no fallback rate anywhere in this pipeline.
//   · tax_behavior is read from the account's Stripe Tax settings at
//     runtime (cached, never hardcoded): INCLUSIVE prices carry
//     their tax inside the total (taxCents is the included portion);
//     EXCLUSIVE prices add taxCents on top of the total. The quote's
//     taxBehavior field always names the behavior the calculation
//     actually used.
//   · The platform is Merchant of Record and collects on the WHOLE
//     basket (marketplace-facilitator posture). Per-line tax from the
//     calculation's breakdown is persisted on the order's tax record
//     so reporting attributes tax per seller — but tax is NEVER part
//     of a seller's settlement share (the settlement engine reads
//     only snapshot lines + charged shipping − discount; see
//     lib/settlement) and, on a destination charge under exclusive
//     behavior, the platform holds the tax back inside the
//     application fee so the seller's transfer never carries it.
// ---------------------------------------------------------------------------

export type TaxBehavior = "inclusive" | "exclusive"

export type TaxPostalAddress = {
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
}

/** One jurisdiction's slice of one line's (or the shipping cost's)
 *  tax, from the calculation's breakdown — the attribution record. */
export type TaxJurisdictionAmount = {
  country: string | null
  state: string | null
  displayName: string | null
  level: string | null
  /** The jurisdiction's rate as Stripe reports it ("9.25"). */
  ratePercent: string | null
  taxCents: number
  taxableCents: number
  /** Stripe's taxability_reason (standard_rated, not_collecting, …). */
  reason: string | null
}

/** A quote line's tax outcome: the discounted amount that was sent
 *  to the engine, the tax it answered with, and where that tax goes. */
export type QuoteTaxLine = {
  productId: string
  /** null = platform / house line. */
  sellerId: string | null
  /** The unique line-item reference used in the calculation. */
  reference: string
  amountCents: number
  taxCents: number
  taxCode: string
  jurisdictions: TaxJurisdictionAmount[]
}

export type QuoteTaxResult = {
  /** The order's total tax: the included portion under inclusive
   *  behavior, the amount added on top under exclusive. */
  taxCents: number
  taxBehavior: TaxBehavior
  source: "stripe_tax"
  /** The Stripe Tax calculation id (taxcalc_…) — finalization turns
   *  it into the tax transaction that filing reports from. Null only
   *  for the engineered zero (a zero merchandise base owes no tax
   *  and makes no engine call). */
  calculationId: string | null
  lines: QuoteTaxLine[]
  shippingTaxCents: number
  shippingJurisdictions: TaxJurisdictionAmount[]
  basis: {
    kind: "ship_to" | "pickup_head_office"
    state: string | null
    postalCode: string | null
  }
}

// ---------------------------------------------------------------------------
// Tax codes — Stripe's product tax categories for the pet catalog
// (docs.stripe.com/tax/tax-codes). The fallback is the account's own
// configured default (Stripe Tax settings defaults.tax_code —
// txcd_20030003 on this account); the constant below is only the
// last-resort value when settings carry none, which Stripe itself
// would otherwise supply.
// ---------------------------------------------------------------------------

export const TAX_CODE_PET_FOOD = "txcd_36010004"
export const TAX_CODE_PET_VITAMINS = "txcd_36010005"
export const TAX_CODE_OTC_ANIMAL_DRUGS = "txcd_36010002"
export const TAX_CODE_OTC_PET_MEDICAL_SUPPLIES = "txcd_36010003"
export const TAX_CODE_RX_ANIMAL_DRUGS = "txcd_36010006"
export const TAX_CODE_RX_PET_FOOD = "txcd_36010007"
export const FALLBACK_DEFAULT_TAX_CODE = "txcd_20030003"

/** Map a catalog category (deepest taxonomy node + ancestors, name
 *  and slug text) to a Stripe product tax code. Keyword rules over
 *  the category text, most specific first; anything unmapped takes
 *  the account default — the same fallback Stripe applies itself. */
export function taxCodeForCategory(
  categoryText: string | null | undefined,
  defaultTaxCode: string,
): string {
  const t = ` ${String(categoryText || "").toLowerCase()} `
  const rx = /\b(rx|prescription|prescribed)\b/.test(t)
  if (rx && /(food|diet|nutrition)/.test(t)) return TAX_CODE_RX_PET_FOOD
  if (rx || /(pharmacy|medication|medications)/.test(t)) return TAX_CODE_RX_ANIMAL_DRUGS
  if (/(vitamin|supplement)/.test(t)) return TAX_CODE_PET_VITAMINS
  if (/(flea|tick|heartworm|deworm|parasite)/.test(t)) return TAX_CODE_OTC_ANIMAL_DRUGS
  if (/(first[-\s]?aid|bandage|gauze|wound care|medical supplies|recovery cone)/.test(t)) {
    return TAX_CODE_OTC_PET_MEDICAL_SUPPLIES
  }
  if (/(food|treat|kibble)/.test(t)) return TAX_CODE_PET_FOOD
  return defaultTaxCode
}

// ---------------------------------------------------------------------------
// Discount allocation — the order-level discount spreads across
// lines pro-rata by line total (largest remainder, sums EXACTLY),
// so the amounts sent to the engine are the amounts actually sold
// for, and per-line tax attribution is exact.
// ---------------------------------------------------------------------------

export function allocateDiscountCents(lineTotalsCents: number[], discountCents: number): number[] {
  const out = lineTotalsCents.map(() => 0)
  const sum = lineTotalsCents.reduce((s, v) => s + Math.max(0, Math.trunc(v)), 0)
  let remaining = Math.min(Math.max(0, Math.trunc(discountCents)), sum)
  if (remaining <= 0 || sum <= 0) return out
  const remainders: { i: number; frac: number }[] = []
  lineTotalsCents.forEach((v, i) => {
    const total = Math.max(0, Math.trunc(v))
    if (total <= 0) return
    const exact = (remaining * total) / sum
    const base = Math.min(Math.floor(exact), total)
    out[i] = base
    remainders.push({ i, frac: exact - Math.floor(exact) })
  })
  let assigned = out.reduce((s, v) => s + v, 0)
  remainders.sort((a, b) => b.frac - a.frac)
  for (const r of remainders) {
    if (assigned >= remaining) break
    if (out[r.i] < Math.max(0, Math.trunc(lineTotalsCents[r.i]))) {
      out[r.i] += 1
      assigned += 1
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Calculation request shaping.
// ---------------------------------------------------------------------------

/** Normalize a raw address into the shape the engine (and the quote
 *  revision) works with. The postal code keeps its ZIP+4 form —
 *  district-level taxes key off it. */
export function taxAddressFor(raw: {
  line1?: string | null
  line2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
}): TaxPostalAddress {
  return {
    line1: String(raw.line1 || "").trim(),
    line2: String(raw.line2 || "").trim(),
    city: String(raw.city || "").trim(),
    state: String(raw.state || "").trim().toUpperCase(),
    postalCode: String(raw.postalCode || "").trim(),
    country: String(raw.country || "US").trim().toUpperCase() || "US",
  }
}

/** The line-item reference for the Nth (1-based) occurrence of a
 *  product in one basket — the bare product id for the first, a
 *  suffixed form after, so references are unique across the
 *  calculation (Stripe requires it) while staying product-readable
 *  in tax reports. */
export function taxLineReference(productId: string, occurrence: number): string {
  return occurrence <= 1 ? productId : `${productId}#${occurrence}`
}

export type TaxEngineLine = {
  reference: string
  productId: string
  sellerId: string | null
  /** Discounted line total sent to the engine (never negative). */
  amountCents: number
  quantity: number
  taxCode: string
}

export type TaxCalculationParams = {
  currency: string
  customer_details: {
    address: {
      line1: string
      line2?: string
      city: string
      state: string
      postal_code: string
      country: string
    }
    address_source: "shipping"
  }
  line_items: Array<{
    amount: number
    quantity: number
    reference: string
    tax_behavior: TaxBehavior
    tax_code: string
  }>
  shipping_cost?: { amount: number; tax_behavior: TaxBehavior }
  expand: string[]
}

/** Build the POST /v1/tax/calculations body. Lines at a zero
 *  discounted amount are EXCLUDED — Stripe requires a positive line
 *  amount, and a zero-amount line owes zero tax by definition (the
 *  mapper re-attaches it at 0). The shipping cost rides as the
 *  calculation's shipping_cost so its taxability follows the
 *  merchandise, exactly as the jurisdictions rule it. */
export function buildTaxCalculationParams(input: {
  currency: string
  taxBehavior: TaxBehavior
  customerAddress: TaxPostalAddress
  lines: TaxEngineLine[]
  shippingCents: number
}): TaxCalculationParams {
  const addr = input.customerAddress
  const params: TaxCalculationParams = {
    currency: input.currency,
    customer_details: {
      address: {
        line1: addr.line1,
        ...(addr.line2 ? { line2: addr.line2 } : {}),
        city: addr.city,
        state: addr.state,
        postal_code: addr.postalCode,
        country: addr.country,
      },
      address_source: "shipping",
    },
    line_items: input.lines
      .filter((l) => l.amountCents > 0)
      .map((l) => ({
        amount: l.amountCents,
        quantity: Math.max(1, Math.trunc(l.quantity) || 1),
        reference: l.reference,
        tax_behavior: input.taxBehavior,
        tax_code: l.taxCode,
      })),
    expand: ["line_items.data.tax_breakdown", "shipping_cost.tax_breakdown"],
  }
  if (input.shippingCents > 0) {
    params.shipping_cost = { amount: input.shippingCents, tax_behavior: input.taxBehavior }
  }
  return params
}

// ---------------------------------------------------------------------------
// Calculation response mapping.
// ---------------------------------------------------------------------------

/** The structural shape of a Stripe Tax calculation this pipeline
 *  reads (a subset of Stripe.Tax.Calculation — the service passes
 *  the real object; tests pass fixtures). */
export type StripeCalculationShape = {
  id: string | null
  tax_amount_exclusive: number
  tax_amount_inclusive: number
  line_items?: {
    data: Array<{
      reference: string
      amount: number
      amount_tax: number
      tax_breakdown?: Array<{
        amount: number
        taxable_amount: number
        taxability_reason: string
        jurisdiction: {
          country: string | null
          state: string | null
          display_name: string | null
          level: string | null
        }
        tax_rate_details: { percentage_decimal: string } | null
      }> | null
    }>
  } | null
  shipping_cost?: {
    amount: number
    amount_tax: number
    tax_breakdown?: Array<{
      amount: number
      taxable_amount: number
      taxability_reason: string
      jurisdiction: {
        country: string | null
        state: string | null
        display_name: string | null
        level: string | null
      }
      tax_rate_details: { percentage_decimal: string } | null
    }> | null
  } | null
}

function mapJurisdictions(
  breakdown:
    | Array<{
        amount: number
        taxable_amount: number
        taxability_reason: string
        jurisdiction: {
          country: string | null
          state: string | null
          display_name: string | null
          level: string | null
        }
        tax_rate_details: { percentage_decimal: string } | null
      }>
    | null
    | undefined,
): TaxJurisdictionAmount[] {
  if (!Array.isArray(breakdown)) return []
  return breakdown.map((b) => ({
    country: b.jurisdiction?.country ?? null,
    state: b.jurisdiction?.state ?? null,
    displayName: b.jurisdiction?.display_name ?? null,
    level: b.jurisdiction?.level ?? null,
    ratePercent: b.tax_rate_details?.percentage_decimal ?? null,
    taxCents: Math.trunc(Number(b.amount) || 0),
    taxableCents: Math.trunc(Number(b.taxable_amount) || 0),
    reason: b.taxability_reason ?? null,
  }))
}

/** Map a Stripe Tax calculation onto the quote's tax record: the
 *  headline figure for the behavior actually used, per-line tax with
 *  its jurisdictions (the seller-attribution record), and the
 *  shipping tax kept apart from merchandise tax. Lines the engine
 *  never saw (zero-amount, excluded at shaping) map at 0. */
export function mapCalculationToQuoteTax(
  calc: StripeCalculationShape,
  ctx: {
    taxBehavior: TaxBehavior
    lines: TaxEngineLine[]
    basis: QuoteTaxResult["basis"]
  },
): QuoteTaxResult {
  const byReference = new Map<string, { amount_tax: number; jurisdictions: TaxJurisdictionAmount[] }>()
  for (const li of calc.line_items?.data ?? []) {
    byReference.set(li.reference, {
      amount_tax: Math.trunc(Number(li.amount_tax) || 0),
      jurisdictions: mapJurisdictions(li.tax_breakdown),
    })
  }
  const lines: QuoteTaxLine[] = ctx.lines.map((l) => {
    const hit = byReference.get(l.reference)
    return {
      productId: l.productId,
      sellerId: l.sellerId,
      reference: l.reference,
      amountCents: l.amountCents,
      taxCents: hit?.amount_tax ?? 0,
      taxCode: l.taxCode,
      jurisdictions: hit?.jurisdictions ?? [],
    }
  })
  return {
    taxCents:
      ctx.taxBehavior === "inclusive"
        ? Math.trunc(Number(calc.tax_amount_inclusive) || 0)
        : Math.trunc(Number(calc.tax_amount_exclusive) || 0),
    taxBehavior: ctx.taxBehavior,
    source: "stripe_tax",
    calculationId: calc.id ? String(calc.id) : null,
    lines,
    shippingTaxCents: Math.trunc(Number(calc.shipping_cost?.amount_tax) || 0),
    shippingJurisdictions: mapJurisdictions(calc.shipping_cost?.tax_breakdown),
    basis: ctx.basis,
  }
}

// ---------------------------------------------------------------------------
// The failure posture, as one pure decision the quote service
// executes verbatim: an answered engine (even a 0 answer) produces
// the quote's tax; an unanswered one produces the quote's FAILURE —
// never a tax figure, never a silent zero.
// ---------------------------------------------------------------------------

export const TAX_ENGINE_FAILURE_STATUS = 503
export const TAX_ENGINE_FAILURE_COPY =
  "Sales tax couldn't be calculated for this order. You have not been charged — please try again in a moment."

export type TaxEngineAnswer =
  | { answered: true; calculation: StripeCalculationShape }
  | { answered: false; error: string }

export function quoteTaxFromAnswer(
  answer: TaxEngineAnswer,
  ctx: {
    taxBehavior: TaxBehavior
    lines: TaxEngineLine[]
    basis: QuoteTaxResult["basis"]
  },
): { ok: true; tax: QuoteTaxResult } | { ok: false; status: number; error: string } {
  if (!answer.answered) {
    return { ok: false, status: TAX_ENGINE_FAILURE_STATUS, error: TAX_ENGINE_FAILURE_COPY }
  }
  return { ok: true, tax: mapCalculationToQuoteTax(answer.calculation, ctx) }
}

/** The engineered zero: a basket whose discounted merchandise base
 *  is zero owes no tax (and shipping tax follows the merchandise),
 *  so no engine call is made. The result still carries the account's
 *  behavior and per-line codes — it is a computed 0, recorded like
 *  any other tax outcome, with calculationId null. */
export function zeroQuoteTax(ctx: {
  taxBehavior: TaxBehavior
  lines: TaxEngineLine[]
  basis: QuoteTaxResult["basis"]
}): QuoteTaxResult {
  return {
    taxCents: 0,
    taxBehavior: ctx.taxBehavior,
    source: "stripe_tax",
    calculationId: null,
    lines: ctx.lines.map((l) => ({
      productId: l.productId,
      sellerId: l.sellerId,
      reference: l.reference,
      amountCents: l.amountCents,
      taxCents: 0,
      taxCode: l.taxCode,
      jurisdictions: [],
    })),
    shippingTaxCents: 0,
    shippingJurisdictions: [],
    basis: ctx.basis,
  }
}

/** Whether the engine must be called at all: only a positive
 *  discounted merchandise base can owe tax. */
export function taxEngineCallFor(merchandiseBaseCents: number): "calculate" | "skip_zero_base" {
  return merchandiseBaseCents > 0 ? "calculate" : "skip_zero_base"
}

// ---------------------------------------------------------------------------
// Finalization — a paid order's calculation becomes its Stripe Tax
// TRANSACTION (the filing record). The decision is pure; the service
// executes it. Idempotency is three-layered: this decision (a
// recorded transaction is never re-created), a deterministic Stripe
// idempotency key, and Stripe's own rule that a transaction
// reference is unique across all transactions.
// ---------------------------------------------------------------------------

export type OrderTaxRecordShape = {
  calculation_id?: string | null
  transaction_id?: string | null
  transaction_reference?: string | null
}

export type TaxTransactionDecision =
  | { action: "create"; calculationId: string }
  | { action: "skip"; reason: "no_calculation" | "already_recorded" }

export function taxTransactionDecisionFor(
  tax: OrderTaxRecordShape | null | undefined,
): TaxTransactionDecision {
  if (!tax || !tax.calculation_id) return { action: "skip", reason: "no_calculation" }
  if (tax.transaction_id || tax.transaction_reference) {
    return { action: "skip", reason: "already_recorded" }
  }
  return { action: "create", calculationId: String(tax.calculation_id) }
}

export function taxTransactionIdempotencyKey(orderId: string): string {
  return `tax-txn:${orderId}`
}

/** The transaction reference Stripe requires to be unique across
 *  all transactions — the order's own id is exactly that. */
export function taxTransactionReference(orderId: string): string {
  return orderId
}

/** On a destination charge the seller's transfer is (charge −
 *  application fee). Under EXCLUSIVE behavior the platform also
 *  holds the order's tax back inside that fee, so the transfer the
 *  seller receives is exactly their settlement net and the tax the
 *  platform must remit never leaves the platform balance. Under
 *  inclusive behavior the prices already carry their tax and the
 *  holdback is 0. */
export function destinationTaxHoldbackCents(
  taxBehavior: TaxBehavior,
  taxCents: number | null | undefined,
): number {
  if (taxBehavior !== "exclusive") return 0
  return Math.max(0, Math.trunc(Number(taxCents) || 0))
}

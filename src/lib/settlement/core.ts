// ---------------------------------------------------------------------------
// settlement/core.ts — the PURE core of marketplace seller settlement
// (Marketplace Closed-Loop Commerce contract, step 11). Import-free and
// deterministic so it is unit-tested directly
// (scripts/settlement.test.mjs) and shared by the SQL store /
// executor / refund leg (lib/settlement/settlement.ts), the webhook
// hooks, and the read surfaces.
//
// THE MODEL (recorded platform money model, Sunny 2026-10-14 — agency
// model, platform is Merchant of Record): the charge stays on the
// platform; the platform strips its configured fees; the NET passes
// to the seller's connected account (Separate Charges and Transfers).
// A single-seller order checkout charged as a destination charge
// settles at charge time instead — its settlement row is the record
// of that settlement, and no transfer is ever created for it.
//
// All money here is CENTS (the Stripe / quote layer's unit).
// ---------------------------------------------------------------------------

export const FEE_TYPES = [
  "referral",
  "fulfillment",
  "storage",
  "advertising",
  "payment_processing",
] as const
export type SettlementFeeType = (typeof FEE_TYPES)[number]
export type SettlementFeeSource =
  | "seller_schedule"
  | "default_schedule"
  | "commission_rate"
  | "none"

/** A fee as the accrual engine's resolver returns it, normalized to
 *  cents: rate is a PERCENT of the basis; flat is a per-order amount
 *  in cents, capped at the basis. */
export interface ResolvedFeeInput {
  source: SettlementFeeSource
  ratePct: number | null
  flatCents: number | null
}

/** One fee's amount on one money basis, in cents — the exact
 *  semantics of the accrual engine's feeOnBasis (lib/sellers/accrual)
 *  and of the cents mirror in lib/sellers/connect: rate % of the
 *  basis when a rate is set, else the flat amount capped at the
 *  basis, else zero. A fee type with no configured schedule charges
 *  nothing — a rate is never invented here. */
export function feeCentsOnBasis(fee: ResolvedFeeInput, basisCents: number): number {
  if (fee.ratePct !== null && Number.isFinite(fee.ratePct)) {
    return Math.round((basisCents * fee.ratePct) / 100)
  }
  if (fee.flatCents !== null && Number.isFinite(fee.flatCents)) {
    return Math.min(Math.round(fee.flatCents), Math.max(0, basisCents))
  }
  return 0
}

/** Largest-remainder proportional allocation of `totalCents` across
 *  weights — deterministic, sums EXACTLY to totalCents (the pattern
 *  the checkout split uses for order-level discounts). */
export function allocateProRata(totalCents: number, weights: number[]): number[] {
  const out = weights.map(() => 0)
  const total = Math.max(0, Math.trunc(totalCents))
  if (total <= 0 || weights.length === 0) return out
  const weightSum = weights.reduce((s, w) => s + Math.max(0, w), 0)
  if (weightSum <= 0) return out
  let assigned = 0
  const remainders: { i: number; frac: number }[] = []
  weights.forEach((w, i) => {
    const exact = (total * Math.max(0, w)) / weightSum
    const base = Math.floor(exact)
    out[i] = base
    assigned += base
    remainders.push({ i, frac: exact - base })
  })
  remainders.sort((a, b) => b.frac - a.frac)
  let left = total - assigned
  for (const r of remainders) {
    if (left <= 0) break
    out[r.i] += 1
    left -= 1
  }
  return out
}

/** Pro-rata allocation with per-recipient CAPS: no recipient takes
 *  more than its cap; overflow redistributes to the uncapped.
 *  Returns the allocations and what could not be placed. */
export function allocateWithCaps(
  totalCents: number,
  weights: number[],
  caps: number[],
): { allocations: number[]; unallocated: number } {
  const allocations = weights.map(() => 0)
  let remaining = Math.max(0, Math.trunc(totalCents))
  let active = weights.map((_, i) => i).filter((i) => caps[i] > 0 && weights[i] > 0)
  let guard = 0
  while (remaining > 0 && active.length > 0 && guard++ < 100) {
    const shares = allocateProRata(
      remaining,
      active.map((i) => weights[i]),
    )
    let placed = 0
    const stillActive: number[] = []
    active.forEach((idx, k) => {
      const room = caps[idx] - allocations[idx]
      const give = Math.min(shares[k], room)
      allocations[idx] += give
      placed += give
      if (allocations[idx] < caps[idx]) stillActive.push(idx)
    })
    remaining -= placed
    if (placed === 0) break
    active = stillActive
  }
  // Any residue (rounding when every share floored to 0 against tiny
  // weights) goes to the first recipient with room, so placed money
  // is never stranded by the allocator itself.
  if (remaining > 0) {
    const idx = weights.findIndex((_, i) => allocations[i] < caps[i])
    if (idx >= 0) {
      const give = Math.min(remaining, caps[idx] - allocations[idx])
      allocations[idx] += give
      remaining -= give
    }
  }
  return { allocations, unallocated: remaining }
}

// ---------------------------------------------------------------------------
// Shares — a seller's portion of one order.
// ---------------------------------------------------------------------------

export interface SellerShare {
  sellerId: string
  sellerOrderId: string | null
  itemsCents: number
  shippingCents: number
}

export interface SnapshotLineInput {
  productId: string
  quantity: number
  unitCents: number
  /** null = platform / house line. */
  sellerId: string | null
}

export interface SnapshotGroupInput {
  /** null = the house group (platform lines). */
  sellerId: string | null
  /** The CHARGED shipping for the group (the accepted quote's
   *  service.charged_cents; 0 for pickup / waived). */
  shippingCents: number
}

/** Per-seller shares from the ACCEPTED QUOTE SNAPSHOT (the order's
 *  metadata.fulfillment_snapshot): line totals per seller, charged
 *  shipping per seller from their own groups — exact, never
 *  re-derived from mutable product records. Platform lines return as
 *  platformItemsCents: they absorb their share of any order-level
 *  discount but earn no settlement. */
export function sharesFromSnapshot(
  lines: SnapshotLineInput[],
  groups: SnapshotGroupInput[],
): { shares: SellerShare[]; platformItemsCents: number } {
  const bySeller = new Map<string, SellerShare>()
  let platformItemsCents = 0
  for (const l of lines) {
    const cents = Math.max(0, Math.trunc(l.unitCents)) * Math.max(0, Math.trunc(l.quantity))
    if (!l.sellerId) {
      platformItemsCents += cents
      continue
    }
    const s = bySeller.get(l.sellerId) ?? {
      sellerId: l.sellerId,
      sellerOrderId: null,
      itemsCents: 0,
      shippingCents: 0,
    }
    s.itemsCents += cents
    bySeller.set(l.sellerId, s)
  }
  for (const g of groups) {
    if (!g.sellerId) continue
    const s = bySeller.get(g.sellerId) ?? {
      sellerId: g.sellerId,
      sellerOrderId: null,
      itemsCents: 0,
      shippingCents: 0,
    }
    s.shippingCents += Math.max(0, Math.trunc(g.shippingCents))
    bySeller.set(g.sellerId, s)
  }
  return { shares: [...bySeller.values()], platformItemsCents }
}

/** Per-seller shares for a LEGACY order (no quote snapshot): the
 *  persisted lines resolved per seller + the order's charged
 *  shipping allocated pro-rata by line totals across sellers AND the
 *  platform remainder (the honest allocation when per-group rates
 *  were never recorded). */
export function sharesFromLegacyLines(
  lines: SnapshotLineInput[],
  orderShippingCents: number,
): { shares: SellerShare[]; platformItemsCents: number } {
  const base = sharesFromSnapshot(lines, [])
  const weights = [
    ...base.shares.map((s) => s.itemsCents),
    base.platformItemsCents,
  ]
  const alloc = allocateProRata(orderShippingCents, weights)
  base.shares.forEach((s, i) => {
    s.shippingCents = alloc[i]
  })
  return base
}

// ---------------------------------------------------------------------------
// Settlement amounts — fees stripped from a seller's gross share.
// ---------------------------------------------------------------------------

export interface SettlementAmounts {
  sellerId: string
  sellerOrderId: string | null
  itemsCents: number
  shippingCents: number
  discountCents: number
  grossCents: number
  /** The platform commission on this share — the referral fee. */
  commissionCents: number
  /** All platform fees stripped (commission + any other configured
   *  fee types). */
  feesCents: number
  feeBreakdown: Record<SettlementFeeType, { amountCents: number; source: SettlementFeeSource }>
  netCents: number
}

/** Compute one order's settlement amounts for every seller: the
 *  order-level discount allocates pro-rata by line totals across
 *  sellers AND the platform remainder (so seller grosses + the
 *  platform remainder sum back to the order total), then each
 *  seller's configured fees strip from their gross share. The fee
 *  basis is the seller's gross share — the per-order analogue of the
 *  accrual engine charging on the order total; the per-period
 *  storage type charges once on this order's share (a run of one). */
export function computeSettlementAmounts(input: {
  shares: SellerShare[]
  platformItemsCents: number
  discountCents: number
  feesBySeller: Map<string, Record<SettlementFeeType, ResolvedFeeInput>>
}): SettlementAmounts[] {
  const keys = [...input.shares.map((s) => s.sellerId), "__platform__"]
  const weights = [...input.shares.map((s) => s.itemsCents), input.platformItemsCents]
  const discountAlloc = allocateProRata(input.discountCents, weights)
  const discountFor = new Map<string, number>()
  keys.forEach((k, i) => discountFor.set(k, discountAlloc[i]))

  return input.shares.map((share) => {
    const discountCents = discountFor.get(share.sellerId) ?? 0
    const grossCents = Math.max(0, share.itemsCents - discountCents + share.shippingCents)
    const fees = input.feesBySeller.get(share.sellerId)
    const feeBreakdown = {} as SettlementAmounts["feeBreakdown"]
    let feesCents = 0
    for (const t of FEE_TYPES) {
      const resolved: ResolvedFeeInput = fees?.[t] ?? { source: "none", ratePct: null, flatCents: null }
      const amountCents = feeCentsOnBasis(resolved, grossCents)
      feeBreakdown[t] = { amountCents, source: resolved.source }
      feesCents += amountCents
    }
    const commissionCents = feeBreakdown.referral.amountCents
    return {
      sellerId: share.sellerId,
      sellerOrderId: share.sellerOrderId,
      itemsCents: share.itemsCents,
      shippingCents: share.shippingCents,
      discountCents,
      grossCents,
      commissionCents,
      feesCents,
      feeBreakdown,
      netCents: Math.max(0, grossCents - feesCents),
    }
  })
}

/** Settlement amounts for a DESTINATION-CHARGE order: the seller's
 *  gross share as computed above, but the commission is the
 *  application fee Stripe ACTUALLY stripped at charge time (the
 *  order's destination_charge stamp) — recorded, never recomputed —
 *  and it is the only fee: the net moved to the seller at charge
 *  time, so no other platform fee type applies to this leg. */
export function destinationSettlementAmounts(input: {
  share: SellerShare
  platformItemsCents: number
  discountCents: number
  allShares: SellerShare[]
  applicationFeeCents: number
}): SettlementAmounts {
  // The seller's gross share under the SAME discount allocation the
  // collect leg uses (no fees applied here — the destination fee
  // replaces the whole schedule below).
  const all = computeSettlementAmounts({
    shares: input.allShares,
    platformItemsCents: input.platformItemsCents,
    discountCents: input.discountCents,
    feesBySeller: new Map(),
  })
  const mine = all.find((c) => c.sellerId === input.share.sellerId)
  if (!mine) {
    throw new Error(`destination seller ${input.share.sellerId} is not among the order's shares`)
  }
  const commissionCents = Math.max(0, Math.trunc(input.applicationFeeCents))
  const feeBreakdown = {} as SettlementAmounts["feeBreakdown"]
  for (const t of FEE_TYPES) {
    feeBreakdown[t] = {
      amountCents: t === "referral" ? commissionCents : 0,
      source: t === "referral" ? "commission_rate" : "none",
    }
  }
  return {
    ...mine,
    commissionCents,
    feesCents: commissionCents,
    feeBreakdown,
    netCents: Math.max(0, mine.grossCents - commissionCents),
  }
}

// ---------------------------------------------------------------------------
// Execution decision — when a pending settlement may move money.
// ---------------------------------------------------------------------------

export type SettlementState = "pending" | "settled" | "partially_reversed" | "reversed"

export type ExecutionDecision =
  | { action: "execute" }
  | { action: "settle_zero" }
  | { action: "wait"; reason: "delay_window" }
  | { action: "skip"; reason: "destination_charge_record" | "not_pending" }

/** The pure execution gate (the store adds the environment mode gate
 *  and the Connect preflight, whose facts live in the database): a
 *  destination-charge record never executes; a non-pending settlement
 *  never re-executes (idempotency by state); a zero-net settlement
 *  settles in place with no transfer; the recorded payout-delay
 *  policy (execute_after) must have lapsed. */
export function executionDecisionFor(input: {
  state: SettlementState
  via: "collect" | "destination_charge"
  netCents: number
  executeAfter: string | null
  now: Date
}): ExecutionDecision {
  if (input.via === "destination_charge") return { action: "skip", reason: "destination_charge_record" }
  if (input.state !== "pending") return { action: "skip", reason: "not_pending" }
  if (input.executeAfter && new Date(input.executeAfter).getTime() > input.now.getTime()) {
    return { action: "wait", reason: "delay_window" }
  }
  if (!(input.netCents > 0)) return { action: "settle_zero" }
  return { action: "execute" }
}

/** Provider idempotency keys — one per (order, seller) transfer and
 *  one per (refund, settlement) reversal, so a re-drive, a retry, or
 *  a concurrent executor resolves to the SAME Stripe object and money
 *  never moves twice for one settlement. */
export function settlementTransferKey(orderId: string, sellerId: string): string {
  return `settlement-transfer:${orderId}:${sellerId}`
}
export function settlementReversalKey(refundId: string, settlementId: string): string {
  return `settlement-reversal:${refundId}:${settlementId}`
}

export type SettlementPendingReason = "no_connect_account" | "payouts_not_enabled"

/** The Connect preflight for a collect-leg transfer — ONE definition
 *  of why a settlement stays pending for a seller-specific reason:
 *  no connected account on file, or an account Stripe has not
 *  cleared for payouts. A blocked settlement stays 'pending' with
 *  the reason recorded and is re-checked on every execution pass;
 *  it never blocks another seller's settlement and is never silently
 *  skipped. Null = clear to transfer. */
export function connectBlockFor(acct: {
  stripeAccountId: string | null
  payoutsEnabled: boolean
} | null): SettlementPendingReason | null {
  if (!acct || !acct.stripeAccountId) return "no_connect_account"
  if (!acct.payoutsEnabled) return "payouts_not_enabled"
  return null
}

// ---------------------------------------------------------------------------
// Refund apportionment — a refund returns across the order's
// settlements; the platform commission on the refunded portion
// reverses at the same effective rate it was charged.
// ---------------------------------------------------------------------------

export interface SettlementForRefund {
  settlementId: string
  sellerId: string
  state: SettlementState
  via: "collect" | "destination_charge"
  grossCents: number
  commissionCents: number
  netCents: number
  /** Net actually transferred to the seller (0 while pending). */
  transferredCents: number
  /** Cumulative refunded gross already apportioned to this settlement. */
  reversedGrossCents: number
  /** Cumulative commission already reversed. */
  reversedCommissionCents: number
  /** Cumulative net already reversed (transfer reversals + in-place
   *  reductions of a pending settlement). */
  reversedNetCents: number
}

export interface RefundAllocation {
  settlementId: string
  sellerId: string
  grossShareCents: number
  commissionReversedCents: number
  netReversedCents: number
  /** transfer = money moves back over the executed transfer;
   *  reduce_pending = the settlement is still pending, its amounts
   *  shrink in place; destination = the charge's own transfer is the
   *  reversal target; none = nothing reversible remains. */
  mode: "transfer" | "reduce_pending" | "destination" | "none"
  newState: SettlementState
}

/** Apportion ONE refund across an order's settlements. With line
 *  detail, each seller's share is the refunded lines that are theirs
 *  (capped at what of their gross remains unrefunded); without it,
 *  the refund spreads by remaining gross share. Partial refunds
 *  accumulate: every cap is computed against what is LEFT, so two
 *  partial refunds can never reverse more than the settlement
 *  transferred (or still owes). The platform's share of a refund
 *  (platform lines) apportions to no seller — it returns as
 *  unapportionedCents for the caller's record. */
export function planRefundApportionment(input: {
  refundCents: number
  lineShares?: { sellerId: string; cents: number }[] | null
  settlements: SettlementForRefund[]
}): { allocations: RefundAllocation[]; unapportionedCents: number } {
  const refundCents = Math.max(0, Math.trunc(input.refundCents))
  const remainingGross = input.settlements.map((s) =>
    Math.max(0, s.grossCents - s.reversedGrossCents),
  )

  let grossShares: number[]
  if (input.lineShares && input.lineShares.length > 0) {
    const bySeller = new Map<string, number>()
    for (const ls of input.lineShares) {
      bySeller.set(ls.sellerId, (bySeller.get(ls.sellerId) ?? 0) + Math.max(0, Math.trunc(ls.cents)))
    }
    grossShares = input.settlements.map((s, i) =>
      Math.min(bySeller.get(s.sellerId) ?? 0, remainingGross[i]),
    )
  } else {
    const { allocations } = allocateWithCaps(
      refundCents,
      remainingGross,
      remainingGross,
    )
    grossShares = allocations
  }

  let apportioned = 0
  const allocations: RefundAllocation[] = input.settlements.map((s, i) => {
    const grossShare = Math.max(0, grossShares[i] ?? 0)
    apportioned += grossShare
    // Commission reverses on the refunded portion at the same
    // effective rate it was charged: the settlement's own
    // commission-to-gross ratio, capped at what has not already
    // reversed.
    const commissionReversed =
      grossShare > 0 && s.grossCents > 0
        ? Math.min(
            Math.round((s.commissionCents * grossShare) / s.grossCents),
            Math.max(0, s.commissionCents - s.reversedCommissionCents),
          )
        : 0
    const netPortion = Math.max(0, grossShare - commissionReversed)
    let netReversed = 0
    let mode: RefundAllocation["mode"] = "none"
    if (grossShare > 0) {
      if (s.via === "destination_charge") {
        mode = "destination"
        netReversed = netPortion
      } else if (s.transferredCents > 0) {
        mode = "transfer"
        netReversed = Math.min(netPortion, Math.max(0, s.transferredCents - s.reversedNetCents))
      } else if (s.state === "pending") {
        mode = "reduce_pending"
        netReversed = Math.min(netPortion, Math.max(0, s.netCents - s.reversedNetCents))
      }
    }
    const reversedGrossAfter = s.reversedGrossCents + grossShare
    let newState: SettlementState = s.state
    if (grossShare > 0 || s.reversedGrossCents > 0) {
      if (s.grossCents > 0 && reversedGrossAfter >= s.grossCents) {
        newState = "reversed"
      } else if (s.state === "settled" || s.state === "partially_reversed") {
        newState = "partially_reversed"
      }
      // A pending settlement stays pending through a partial reversal
      // (its reduced net is still owed); a full reversal closes it.
    }
    return {
      settlementId: s.settlementId,
      sellerId: s.sellerId,
      grossShareCents: grossShare,
      commissionReversedCents: commissionReversed,
      netReversedCents: netReversed,
      mode: grossShare > 0 ? mode : "none",
      newState,
    }
  })

  return { allocations, unapportionedCents: Math.max(0, refundCents - apportioned) }
}

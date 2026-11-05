// ---------------------------------------------------------------------------
// fulfillment/label-core.ts — the PURE core of package label purchase
// (Marketplace Closed-Loop Commerce contract, step 9).
//
// Everything here is deterministic and import-free so it can be
// unit-tested directly (scripts/fulfillment-label.test.mjs) against
// in-memory fakes of the store and provider interfaces below. The
// DB/provider implementation lives in lib/fulfillment/label.ts.
//
// THE RULES THIS MODULE ENCODES (contract §5, addendum §8):
//   • Purchase and print are SEPARATE actions. Reprint serves the
//     stored label and never touches the provider.
//   • A package buys AT MOST ONE label. A purchase attempt records
//     its intent (attempt row, keyed deterministically per package)
//     BEFORE any provider call; a retry after a confirmed purchase
//     returns the existing label with zero provider calls.
//   • UNKNOWN OUTCOMES RECONCILE, NEVER RE-BUY. When a provider call
//     fails in a way that may have landed server-side (timeout, 5xx,
//     dropped response), the attempt is left in label_requested /
//     unknown and the next attempt asks the provider what exists —
//     by attempt key for shipments, by the recorded shipment's rates
//     for transactions — and ADOPTS what it finds. A new purchase is
//     made only for a stage the provider proves never completed.
//   • The label is bought for the package's PERSISTED snapshots —
//     origin, parcel, and the chosen service from the accepted quote
//     — never re-derived from mutable product records.
//   • PRE_TRANSIT is a carrier-observed state (step 10). Nothing
//     here writes a tracking status; purchase advances the package
//     ready_for_label → label_requested → label_available only.
// ---------------------------------------------------------------------------

/** Package facts the purchase decision reads — the persisted plan
 *  row (step 8) plus the ship-to resolved from the ORDER's stored
 *  address (also a persisted snapshot, parsed by the caller). */
export interface LabelPackage {
  id: string
  tenantId: string
  orderId: string
  sellerId: string | null
  state: string
  fulfillmentMethod: string
  origin: Record<string, unknown> | null
  parcel: Record<string, unknown> | null
  serviceLevel: string | null
  /** The accepted quote's chosen service snapshot:
   *  { rate_key?, provider?, service?, tier?, rated_cents? } */
  service: Record<string, unknown> | null
  trackingNumber: string | null
  carrier: string | null
  labelId: string | null
  labelUrl: string | null
  shipTo: {
    name: string
    street1: string
    street2?: string
    city: string
    state: string
    zip: string
    country?: string
    phone?: string
    email?: string
  } | null
}

export interface LabelAttempt {
  attemptKey: string
  status: "started" | "shipment_recorded" | "unknown" | "confirmed" | "failed"
  shipmentId: string | null
  rateId: string | null
  transactionId: string | null
  error: string | null
}

export interface PurchasedLabel {
  transactionId: string | null
  labelUrl: string
  trackingNumber: string
  trackingUrl: string | null
  carrier: string
  service: string
  rateCents: number | null
  testMode: boolean
}

export interface ProviderRate {
  rateId: string
  provider: string
  service: string
  amountCents: number
}

export interface ProviderShipment {
  shipmentId: string
  rates: ProviderRate[]
}

/** The Shippo-shaped provider surface the purchase runs against.
 *  Implementations MUST classify failures: an error carrying
 *  `unknownOutcome: true` means the request may have landed (timeout,
 *  5xx, dropped response); anything else is a definite failure the
 *  provider refused. */
export interface LabelProvider {
  createShipment(input: ShipmentRequest): Promise<ProviderShipment>
  getShipment(shipmentId: string): Promise<ProviderShipment | null>
  findShipmentByAttemptKey(attemptKey: string): Promise<ProviderShipment | null>
  findTransactionForRates(rateIds: string[]): Promise<PurchasedLabel | null>
  buyLabel(rateId: string, attemptKey: string): Promise<PurchasedLabel>
}

export interface ShipmentRequest {
  attemptKey: string
  from: { name: string; street1: string; city: string; state: string; zip: string; country: string; phone?: string; email?: string }
  to: NonNullable<LabelPackage["shipTo"]>
  parcel: { weightLb: number; lengthIn: number; widthIn: number; heightIn: number }
  service: Record<string, unknown> | null
}

/** The persistence the purchase needs. The SQL implementation
 *  (label.ts) makes claim() atomic: the ready_for_label →
 *  label_requested transition IS the claim, so two concurrent
 *  purchases of one package cannot both reach the provider. */
export interface LabelStore {
  loadAttempt(packageId: string): Promise<LabelAttempt | null>
  /** Claim the purchase for this package. From ready_for_label:
   *  transitions the package to label_requested and returns a fresh
   *  attempt (a previously FAILED attempt is reset in place — one
   *  attempt row per package, ever). From label_requested: returns
   *  the in-flight attempt with claimed=false (reconcile path). */
  claim(packageId: string, attemptKey: string): Promise<{ claimed: boolean; attempt: LabelAttempt }>
  recordShipment(packageId: string, attemptKey: string, shipmentId: string, rateId: string | null): Promise<void>
  recordAttempt(packageId: string, attemptKey: string, patch: Partial<LabelAttempt>): Promise<void>
  /** Persist a confirmed/adopted label on the package and advance it
   *  to label_available; marks the attempt confirmed. The SQL store
   *  also writes the commerce_orders scalar tracking mirror when the
   *  order has exactly one package (legacy display compat, step 8). */
  saveLabel(packageId: string, attemptKey: string, label: PurchasedLabel): Promise<void>
  /** A definite provider refusal: attempt failed, package returns to
   *  ready_for_label so a later purchase can try again. */
  revertToReady(packageId: string, attemptKey: string, error: string): Promise<void>
}

export type LabelActor = { kind: "seller"; sellerId: string } | { kind: "admin" }

export type PurchaseOutcome =
  | { ok: true; outcome: "purchased" | "existing" | "adopted"; label: PurchasedLabel; state: string }
  | {
      ok: false
      reason:
        | "not_owner"
        | "wrong_state"
        | "pickup_package"
        | "no_ship_to"
        | "no_origin"
        | "no_rates"
        | "attempt_missing"
        | "unknown_outcome"
        | "provider_failed"
      message: string
      retryable?: boolean
    }

/** One attempt per package, deterministically keyed — the key rides
 *  the provider shipment/transaction metadata, which is what makes
 *  unknown-outcome reconciliation by attempt key possible. */
export function attemptKeyFor(packageId: string): string {
  return `label-purchase:${packageId}`
}

export function isUnknownOutcome(e: unknown): boolean {
  const anyE = e as { unknownOutcome?: unknown; name?: string } | null
  return anyE?.unknownOutcome === true || anyE?.name === "ProviderUnknownOutcomeError"
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function rateKeyOf(provider: string, service: string): string {
  return `${provider}|${service}`.toLowerCase().replace(/[^a-z0-9|]+/g, "-").replace(/^-+|-+$/g, "")
}

/**
 * Choose the rate the label buys: the accepted quote's chosen service
 * (rate_key, then provider+service), else the cheapest rate — the
 * platform's standing default (lib/shippo's cheapest-match rule).
 * The snapshot is honored from ITS fields only; rates are the
 * provider's live answer for the persisted parcel.
 */
export function selectRateForSnapshot(
  rates: ProviderRate[],
  service: Record<string, unknown> | null,
): ProviderRate | null {
  const usable = rates.filter((r) => Number.isFinite(r.amountCents) && r.amountCents > 0)
  if (usable.length === 0) return null
  if (service) {
    const wantKey = typeof service.rate_key === "string" ? service.rate_key : null
    if (wantKey) {
      const hit = usable.find((r) => rateKeyOf(r.provider, r.service) === wantKey)
      if (hit) return hit
    }
    const wantProvider = typeof service.provider === "string" ? service.provider.toLowerCase() : null
    const wantService = typeof service.service === "string" ? service.service.toLowerCase() : null
    if (wantProvider && wantService) {
      const hit = usable.find(
        (r) => r.provider.toLowerCase() === wantProvider && r.service.toLowerCase() === wantService,
      )
      if (hit) return hit
    }
    if (wantProvider) {
      const ofProvider = usable.filter((r) => r.provider.toLowerCase() === wantProvider)
      if (ofProvider.length > 0) return [...ofProvider].sort((a, b) => a.amountCents - b.amountCents)[0]
    }
  }
  return [...usable].sort((a, b) => a.amountCents - b.amountCents)[0]
}

/** The shipment request for a package, built ONLY from its persisted
 *  snapshots (origin + parcel + chosen service) and the order's
 *  stored ship-to. Defaults mirror lib/shippo (2 lb, 12×9×4) for
 *  legacy packages whose parcel snapshot is absent. */
export function buildShipmentRequest(pkg: LabelPackage): ShipmentRequest | null {
  if (!pkg.shipTo || !pkg.shipTo.zip) return null
  const o = pkg.origin || {}
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v))
  const name = str(o.name)
  const street1 = str(o.street1 || o.street || o.address1 || o.address)
  const city = str(o.city)
  const state = str(o.state)
  const zip = str(o.zip || o.postal_code || o.postalCode)
  if (!street1 || !zip) return null
  const p = pkg.parcel || {}
  const num = (v: unknown, dflt: number) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : dflt
  }
  return {
    attemptKey: attemptKeyFor(pkg.id),
    from: {
      name: name || "Shipper",
      street1,
      city,
      state,
      zip,
      country: "US",
      phone: str(o.phone) || undefined,
      email: str(o.email) || undefined,
    },
    to: pkg.shipTo,
    parcel: {
      weightLb: num(p.weightLb ?? p.weight_lb ?? p.weight, 2),
      lengthIn: num(p.lengthIn ?? p.length_in ?? p.length, 12),
      widthIn: num(p.widthIn ?? p.width_in ?? p.width, 9),
      heightIn: num(p.heightIn ?? p.height_in ?? p.height, 4),
    },
    service: pkg.service,
  }
}

function labelFromPackage(pkg: LabelPackage): PurchasedLabel | null {
  if (!pkg.labelUrl && !pkg.labelId) return null
  return {
    transactionId: pkg.labelId,
    labelUrl: pkg.labelUrl || "",
    trackingNumber: pkg.trackingNumber || "",
    trackingUrl: null,
    carrier: pkg.carrier || "",
    service: pkg.serviceLevel || "",
    rateCents: null,
    testMode: false,
  }
}

function ownsPackage(pkg: LabelPackage, actor: LabelActor): boolean {
  return actor.kind === "admin" || (pkg.sellerId != null && pkg.sellerId === actor.sellerId)
}

/**
 * PRINT / REPRINT (pure): resolve the stored label file for a
 * package. Takes NO provider — a reprint cannot purchase, by
 * construction. Mirrors the admin SA-44 semantics: the carrier's own
 * stored file, or an honest "no label file" answer.
 */
export function resolveLabelPrint(
  pkg: LabelPackage,
  actor: LabelActor,
):
  | { ok: true; labelUrl: string; trackingNumber: string | null; carrier: string | null }
  | { ok: false; reason: "not_owner" | "no_label"; message: string } {
  if (!ownsPackage(pkg, actor)) {
    return { ok: false, reason: "not_owner", message: "This package belongs to another seller." }
  }
  if (!pkg.labelUrl) {
    return {
      ok: false,
      reason: "no_label",
      message: "No carrier-issued label file is stored for this package yet — buy the label first; there is nothing real to print.",
    }
  }
  return { ok: true, labelUrl: pkg.labelUrl, trackingNumber: pkg.trackingNumber, carrier: pkg.carrier }
}

/**
 * PURCHASE a package's label — the step-9 state walk:
 *   ready_for_label → (claim) label_requested → label_available.
 * A package already carrying a label returns it untouched. A package
 * found in label_requested (an earlier attempt whose outcome is
 * unresolved) reconciles against the provider before any new spend.
 */
export async function purchasePackageLabel(
  deps: { store: LabelStore; provider: LabelProvider },
  pkg: LabelPackage,
  actor: LabelActor,
): Promise<PurchaseOutcome> {
  const { store, provider } = deps

  if (!ownsPackage(pkg, actor)) {
    return { ok: false, reason: "not_owner", message: "This package belongs to another seller." }
  }
  if (pkg.fulfillmentMethod === "pickup") {
    return { ok: false, reason: "pickup_package", message: "Pickup packages never take a shipping label." }
  }

  // Retry after a confirmed purchase: the label is already on the
  // package. Return it — zero provider calls, zero new attempts.
  const existing = labelFromPackage(pkg)
  if (existing && pkg.state !== "ready_for_label" && pkg.state !== "label_requested") {
    return { ok: true, outcome: "existing", label: existing, state: pkg.state }
  }

  if (pkg.state === "label_requested") {
    return reconcileAndFinish(deps, pkg)
  }
  if (pkg.state !== "ready_for_label") {
    return {
      ok: false,
      reason: "wrong_state",
      message: `Package is ${pkg.state} — a label can only be purchased from ready_for_label.`,
    }
  }
  if (!pkg.shipTo || !pkg.shipTo.zip) {
    return { ok: false, reason: "no_ship_to", message: "The order has no usable shipping address (a ZIP is required) — cannot purchase a label." }
  }
  const request = buildShipmentRequest(pkg)
  if (!request) {
    return { ok: false, reason: "no_origin", message: "The package's origin snapshot is missing or incomplete — cannot purchase a label." }
  }

  // Record intent BEFORE the provider call: the claim transitions
  // the package and persists the attempt row in one atomic step.
  const { attempt } = await store.claim(pkg.id, request.attemptKey)

  let shipment: ProviderShipment
  try {
    shipment = await provider.createShipment(request)
  } catch (e) {
    if (isUnknownOutcome(e)) {
      await store.recordAttempt(pkg.id, attempt.attemptKey, { status: "unknown", error: errMsg(e) })
      return { ok: false, reason: "unknown_outcome", message: `Shipment creation outcome is unknown (${errMsg(e)}). Retry — the next attempt reconciles with the carrier before buying anything.`, retryable: true }
    }
    await store.revertToReady(pkg.id, attempt.attemptKey, errMsg(e))
    return { ok: false, reason: "provider_failed", message: errMsg(e) }
  }

  const rate = selectRateForSnapshot(shipment.rates, pkg.service)
  if (!rate) {
    await store.revertToReady(pkg.id, attempt.attemptKey, "shippo_no_rates")
    return { ok: false, reason: "no_rates", message: "The carrier returned no usable rates for this package's parcel and destination." }
  }
  // The shipment + chosen rate are recorded BEFORE the buy, so an
  // unknown buy outcome reconciles against exactly this shipment.
  await store.recordShipment(pkg.id, attempt.attemptKey, shipment.shipmentId, rate.rateId)

  return buyRecordedShipment(deps, pkg, attempt.attemptKey, rate.rateId)
}

/** Buy the transaction for an already-recorded shipment/rate, with
 *  unknown-outcome handling. Shared by the fresh path and the
 *  reconcile path (which reaches here only after proving no
 *  successful transaction exists for the shipment). */
async function buyRecordedShipment(
  deps: { store: LabelStore; provider: LabelProvider },
  pkg: LabelPackage,
  attemptKey: string,
  rateId: string,
): Promise<PurchaseOutcome> {
  const { store, provider } = deps
  try {
    const label = await provider.buyLabel(rateId, attemptKey)
    await store.saveLabel(pkg.id, attemptKey, label)
    return { ok: true, outcome: "purchased", label, state: "label_available" }
  } catch (e) {
    if (isUnknownOutcome(e)) {
      await store.recordAttempt(pkg.id, attemptKey, { status: "unknown", error: errMsg(e) })
      return { ok: false, reason: "unknown_outcome", message: `Label purchase outcome is unknown (${errMsg(e)}). Retry — the next attempt reconciles with the carrier before buying anything.`, retryable: true }
    }
    await store.revertToReady(pkg.id, attemptKey, errMsg(e))
    return { ok: false, reason: "provider_failed", message: errMsg(e) }
  }
}

/**
 * RECONCILE a package stuck in label_requested: ask the provider
 * what actually exists for this attempt, adopt what is found, and
 * only spend on a stage the provider proves never completed.
 *   1. Shipment recorded → look for a successful transaction on its
 *      rates; found → adopt. None → buy on the recorded rate (the
 *      transaction stage provably never succeeded).
 *   2. No shipment recorded → look the shipment up by attempt key;
 *      found → record it, check its transactions, then buy.
 *      Not found → the shipment provably never landed; the package
 *      returns to ready_for_label for a clean fresh attempt.
 */
async function reconcileAndFinish(
  deps: { store: LabelStore; provider: LabelProvider },
  pkg: LabelPackage,
): Promise<PurchaseOutcome> {
  const { store, provider } = deps
  const attemptKey = attemptKeyFor(pkg.id)
  const attempt = await store.loadAttempt(pkg.id)
  if (!attempt) {
    return {
      ok: false,
      reason: "attempt_missing",
      message: "This package is awaiting a label outcome but has no recorded purchase attempt — refusing to buy blind. Resolve it from the recorded order history.",
    }
  }

  let shipment: ProviderShipment | null = null
  if (attempt.shipmentId) {
    try {
      shipment = await provider.getShipment(attempt.shipmentId)
    } catch (e) {
      // A recorded shipment we cannot read back proves nothing either
      // way — stay in label_requested and let a later retry reconcile.
      return { ok: false, reason: "unknown_outcome", message: `Could not read back the recorded shipment (${errMsg(e)}). Retry to reconcile.`, retryable: true }
    }
  }
  if (!shipment) {
    try {
      shipment = await provider.findShipmentByAttemptKey(attemptKey)
    } catch (e) {
      return { ok: false, reason: "unknown_outcome", message: `Could not search the carrier for this attempt's shipment (${errMsg(e)}). Retry to reconcile.`, retryable: true }
    }
    if (shipment) {
      const rate = selectRateForSnapshot(shipment.rates, pkg.service)
      await store.recordShipment(pkg.id, attemptKey, shipment.shipmentId, rate?.rateId ?? attempt.rateId)
      attempt.shipmentId = shipment.shipmentId
      attempt.rateId = rate?.rateId ?? attempt.rateId
    }
  }

  if (!shipment) {
    // The provider holds nothing for this attempt — the original
    // request never landed. Safe to start over cleanly.
    await store.revertToReady(pkg.id, attemptKey, attempt.error || "reconciled: no provider shipment exists for this attempt")
    const fresh: LabelPackage = { ...pkg, state: "ready_for_label" }
    // Ownership was already enforced by the entry call above; the
    // fresh attempt re-enters as admin purely to skip re-checking it.
    return purchasePackageLabel(deps, fresh, { kind: "admin" })
  }

  let foundTx: PurchasedLabel | null
  try {
    foundTx = await provider.findTransactionForRates(shipment.rates.map((r) => r.rateId))
  } catch (e) {
    // If the transaction search itself fails, absence is NOT proven —
    // buying here could double-buy. Stay reconcilable.
    return { ok: false, reason: "unknown_outcome", message: `Could not search the carrier for this shipment's transactions (${errMsg(e)}). Retry to reconcile.`, retryable: true }
  }
  if (foundTx) {
    // The adopted transaction may not name its carrier/service (the
    // provider's list shape doesn't carry them) — the package's own
    // accepted service snapshot is the record of what was chosen.
    const adopted: PurchasedLabel = {
      ...foundTx,
      carrier: foundTx.carrier || (typeof pkg.service?.provider === "string" ? pkg.service.provider : ""),
      service: foundTx.service || (typeof pkg.service?.service === "string" ? pkg.service.service : ""),
    }
    await store.saveLabel(pkg.id, attemptKey, adopted)
    return { ok: true, outcome: "adopted", label: adopted, state: "label_available" }
  }

  const rateId = attempt.rateId || selectRateForSnapshot(shipment.rates, pkg.service)?.rateId || null
  if (!rateId) {
    return { ok: false, reason: "no_rates", message: "The reconciled shipment carries no usable rate to buy." }
  }
  return buyRecordedShipment(deps, pkg, attemptKey, rateId)
}

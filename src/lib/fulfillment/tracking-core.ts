// ---------------------------------------------------------------------------
// fulfillment/tracking-core.ts — the PURE core of carrier tracking
// ingest (Marketplace Closed-Loop Commerce contract, step 10).
//
// Everything here is deterministic and import-free so it can be
// unit-tested directly (scripts/fulfillment-tracking.test.mjs) and
// shared by the ingest writer, the refresh/reconciliation path, and
// BOTH read surfaces (customer Order History + seller order views).
//
// THE RULES THIS MODULE ENCODES:
//   • Carrier states are OBSERVED, never assumed. A label purchase
//     (step 9) writes no tracking status; the first carrier signal —
//     PRE_TRANSIT included — is recorded here, on the PACKAGE
//     (tracking_status), and the package state advances along the
//     step-8 CHECK sequence: label_available → in_transit →
//     out_for_delivery → delivered / exception.
//   • Ingest is IDEMPOTENT and MONOTONIC. Events are keyed by
//     (package, carrier status, event time); a replay changes
//     nothing and notifies nobody twice; an out-of-order event
//     (delivered lands before a stale in_transit) can never regress
//     a package. decideTrackingTransition is the single decider —
//     the webhook path and the refresh path both run through it.
//   • ONE PACKAGE DELIVERED IS NOT THE ORDER DELIVERED.
//     deriveOrderFulfillment is the one derivation both surfaces
//     render from: partial states are first-class.
//   • One carrier-link definition (carrierTrackingUrl) — the pages
//     that grew their own copies converge on this one.
// ---------------------------------------------------------------------------

/** The carrier status vocabulary every source maps onto. Shippo's
 *  tracking_status.status enum is the spine (it is the label
 *  provider); the direct-carrier adapters (lib/tracking) return
 *  free-text summaries that mapTrackingText folds into the same set. */
export type CarrierStatus =
  | "PRE_TRANSIT"
  | "TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "RETURNED"
  | "FAILURE"
  | "UNKNOWN"

export type PackageTrackingState =
  | "awaiting_eligibility"
  | "ready_for_label"
  | "label_requested"
  | "label_available"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception"
  | "cancelled"

/** Map a Shippo tracking_status.status value onto the vocabulary.
 *  Shippo's enum: UNKNOWN, PRE_TRANSIT, TRANSIT, DELIVERED,
 *  RETURNED, FAILURE (out-for-delivery arrives as a TRANSIT
 *  substatus / status_detail — mapShippoSubstatus refines it). */
export function mapShippoStatus(raw: unknown): CarrierStatus {
  const s = String(raw || "").trim().toUpperCase()
  switch (s) {
    case "PRE_TRANSIT":
      return "PRE_TRANSIT"
    case "TRANSIT":
      return "TRANSIT"
    case "DELIVERED":
      return "DELIVERED"
    case "RETURNED":
      return "RETURNED"
    case "FAILURE":
      return "FAILURE"
    default:
      return "UNKNOWN"
  }
}

/** Shippo carries out-for-delivery in the tracking substatus code
 *  (e.g. "OutForDelivery") rather than the top-level status. */
export function refineShippoStatus(status: CarrierStatus, substatusCode: unknown): CarrierStatus {
  if (status !== "TRANSIT") return status
  const code = String(substatusCode || "").toLowerCase().replace(/[^a-z]/g, "")
  if (code.includes("outfordelivery")) return "OUT_FOR_DELIVERY"
  return status
}

/**
 * Fold a free-text carrier status (USPS TrackSummary prose, UPS /
 * FedEx status descriptions from lib/tracking) into the vocabulary.
 * Order matters: the most specific phrases are tested first so
 * "Out for delivery" never degrades to TRANSIT and "Delivered"
 * never matches inside "Delivery exception".
 */
export function mapTrackingText(raw: unknown): CarrierStatus {
  const t = String(raw || "").toLowerCase()
  if (!t.trim()) return "UNKNOWN"
  if (/out for delivery|outfordelivery|on (the )?(vehicle|truck) for delivery/.test(t)) return "OUT_FOR_DELIVERY"
  if (/delivered|delivery complete|left at|met customer/.test(t) && !/exception|failed|attempt/.test(t)) return "DELIVERED"
  if (/exception|failed|failure|undeliverable|held at|action required|delay/.test(t)) return "FAILURE"
  if (/return(ed)? to sender|returning|returned/.test(t)) return "RETURNED"
  if (/pre[- ]?shipment|label (created|printed)|shipping label|electronic notification|information received|order processed|manifest/.test(t)) return "PRE_TRANSIT"
  if (/in transit|transit|arrived|departed|processed|picked up|acceptance|out for distribution|on its way|en route/.test(t)) return "TRANSIT"
  return "UNKNOWN"
}

/** The package state a carrier status drives toward — or null when
 *  the status is recorded (tracking_status) without moving the
 *  package state: PRE_TRANSIT is observed once a label exists (the
 *  package is already label_available — recording it is exactly the
 *  contract's "carrier tracking observed" moment) and UNKNOWN says
 *  nothing worth moving on. RETURNED and FAILURE are exceptions: the
 *  parcel is not progressing to the customer. */
export function packageStateForCarrierStatus(status: CarrierStatus): PackageTrackingState | null {
  switch (status) {
    case "TRANSIT":
      return "in_transit"
    case "OUT_FOR_DELIVERY":
      return "out_for_delivery"
    case "DELIVERED":
      return "delivered"
    case "RETURNED":
    case "FAILURE":
      return "exception"
    default:
      return null
  }
}

/** Forward-progress rank of a package state. exception is a LATERAL
 *  state (reachable from in_transit / out_for_delivery, recoverable
 *  back into transit) — it carries the in_transit rank and the
 *  decider treats moves into it specially. Terminal states are
 *  delivered and cancelled. */
export function packageStateRank(state: string): number {
  switch (state) {
    case "awaiting_eligibility":
      return 0
    case "ready_for_label":
      return 1
    case "label_requested":
      return 2
    case "label_available":
      return 3
    case "in_transit":
    case "exception":
      return 4
    case "out_for_delivery":
      return 5
    case "delivered":
      return 6
    case "cancelled":
      return 7
    default:
      return -1
  }
}

export interface TrackingObservation {
  carrier: string | null
  trackingNumber: string
  /** The carrier's raw status value (Shippo enum or adapter text). */
  rawStatus: string | null
  /** The mapped canonical status. */
  status: CarrierStatus
  /** When the carrier observed the event (ISO). Null when the
   *  source gave no usable time — the decider then falls back to
   *  rank monotonicity alone. */
  at: string | null
  /** Human detail (status_details / latest scan prose). */
  detail: string | null
  location: string | null
  source: "shippo_webhook" | "shippo_refresh" | "carrier_refresh" | "cron_refresh"
}

export interface PackageTrackingFacts {
  state: string
  trackingStatus: string | null
  /** ISO time of the last observation APPLIED to this package. */
  lastEventAt: string | null
}

export type TrackingDecision =
  | {
      action: "transition"
      toState: PackageTrackingState
      /** The tracking_status to persist (the canonical status). */
      trackingStatus: CarrierStatus
      /** The customer-facing notification kind this transition
       *  fires, or null for a silent advance (e.g. into
       *  label-observed states that don't move the package). */
      notify: TrackingNotifyKind | null
    }
  | {
      /** Same state, newer (or first) status detail: persist the
       *  observed status + event stamp, move nothing, notify
       *  nobody. This is what a replay of the latest event is. */
      action: "refresh"
      trackingStatus: CarrierStatus
    }
  | {
      /** Stale, regressive, or post-terminal: change nothing.
       *  `reason` is for logs/tests, never a customer surface. */
      action: "ignore"
      reason: "terminal" | "stale" | "regression" | "pre_label" | "no_signal"
    }

export type TrackingNotifyKind = "shipped" | "out_for_delivery" | "delivered" | "exception"

function notifyKindFor(toState: PackageTrackingState, fromState: string): TrackingNotifyKind | null {
  switch (toState) {
    case "in_transit":
      return "shipped"
    case "out_for_delivery":
      return "out_for_delivery"
    case "delivered":
      return "delivered"
    case "exception":
      return fromState === "exception" ? null : "exception"
    default:
      return null
  }
}

/**
 * THE decider — one definition for webhook ingest, manual refresh,
 * and the cron sweep. Given the package's current facts and one
 * observation, decide what (if anything) changes:
 *
 *   • delivered / cancelled are terminal — nothing moves them.
 *   • a package with no label yet (pre label_available) has no
 *     carrier signal to record — step 9 owns its states.
 *   • an observation OLDER than the last applied event (by carrier
 *     event time) that does not advance the state is stale — this
 *     is the out-of-order guard: delivered lands first (its event
 *     time is the later one), the in_transit that trails it is
 *     recognized as older and dropped.
 *   • a lower-rank target never regresses a higher-rank state, with
 *     one lateral exception: exception ↔ in_transit /
 *     out_for_delivery moves are allowed when the observation is
 *     at least as new as the last applied event (a parcel can fall
 *     into exception and recover).
 *   • landing on the current state is a refresh: the observed
 *     status/detail is persisted (the surfaces show the carrier's
 *     latest words) but no notification fires — replays are
 *     refreshes, never duplicate sends.
 */
export function decideTrackingTransition(
  current: PackageTrackingFacts,
  obs: TrackingObservation,
): TrackingDecision {
  if (current.state === "delivered" || current.state === "cancelled") {
    return { action: "ignore", reason: "terminal" }
  }
  if (packageStateRank(current.state) < packageStateRank("label_available")) {
    return { action: "ignore", reason: "pre_label" }
  }
  const target = packageStateForCarrierStatus(obs.status)
  const obsMs = obs.at ? Date.parse(obs.at) : NaN
  const lastMs = current.lastEventAt ? Date.parse(current.lastEventAt) : NaN
  const hasTimes = Number.isFinite(obsMs) && Number.isFinite(lastMs)
  const strictlyOlder = hasTimes && obsMs < lastMs

  if (target == null) {
    // PRE_TRANSIT / UNKNOWN: recorded as the observed status, the
    // package state does not move. A strictly older observation
    // doesn't even refresh the recorded status.
    if (strictlyOlder) return { action: "ignore", reason: "stale" }
    if (obs.status === "UNKNOWN" && current.trackingStatus) {
      return { action: "ignore", reason: "no_signal" }
    }
    return { action: "refresh", trackingStatus: obs.status }
  }

  if (target === current.state) {
    if (strictlyOlder) return { action: "ignore", reason: "stale" }
    return { action: "refresh", trackingStatus: obs.status }
  }

  const curRank = packageStateRank(current.state)
  const tgtRank = packageStateRank(target)
  const lateralException =
    (target === "exception" && (current.state === "in_transit" || current.state === "out_for_delivery")) ||
    (current.state === "exception" && (target === "in_transit" || target === "out_for_delivery"))

  if (tgtRank < curRank && !lateralException) {
    return { action: "ignore", reason: strictlyOlder ? "stale" : "regression" }
  }
  if (lateralException && strictlyOlder) {
    return { action: "ignore", reason: "stale" }
  }
  if (tgtRank === curRank && !lateralException) {
    // Same rank, different state (in_transit ↔ exception is the
    // lateral pair handled above; nothing else shares a rank).
    return { action: "ignore", reason: "regression" }
  }
  return {
    action: "transition",
    toState: target,
    trackingStatus: obs.status,
    notify: notifyKindFor(target, current.state),
  }
}

/** The dedupe identity of a transition's customer notification:
 *  one shipped / out-for-delivery / delivered / exception email per
 *  package per kind, however many times the carrier repeats itself. */
export function trackingEffectDedupeKey(packageId: string, kind: TrackingNotifyKind): string {
  return `tracking:${packageId}:${kind}`
}

export const TRACKING_EFFECT_EVENT_TYPE = "tracking.package.transition"

// ---------------------------------------------------------------------------
// Order-level derivation — ONE definition, both surfaces
// ---------------------------------------------------------------------------

export type OrderFulfillmentState =
  | "preparing"
  | "partially_shipped"
  | "shipped"
  | "partially_delivered"
  | "delivered"

export interface OrderFulfillmentDerivation {
  state: OrderFulfillmentState
  label: string
  counts: {
    total: number
    labeled: number
    inTransit: number
    outForDelivery: number
    delivered: number
    exception: number
  }
}

const LABELED_OR_BEYOND = new Set([
  "label_available",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
])
const IN_MOTION_OR_BEYOND = new Set(["in_transit", "out_for_delivery", "delivered", "exception"])

/**
 * Derive the order's fulfillment display state from its packages:
 *   none labeled → preparing · some labeled/in motion →
 *   partially shipped · all in motion → shipped · some delivered →
 *   partially delivered · all delivered → delivered.
 * Cancelled packages are excluded from the count (they will never
 * ship); an order whose packages are ALL cancelled derives
 * "preparing" (nothing is coming — the order's own status carries
 * the cancellation). Returns null for an order with no packages, so
 * surfaces fall back to their legacy reads instead of inventing a
 * state.
 */
export function deriveOrderFulfillment(
  packages: { state: string }[],
): OrderFulfillmentDerivation | null {
  const live = packages.filter((p) => p.state !== "cancelled")
  if (live.length === 0) return null
  const total = live.length
  const delivered = live.filter((p) => p.state === "delivered").length
  const labeled = live.filter((p) => LABELED_OR_BEYOND.has(p.state)).length
  const inMotion = live.filter((p) => IN_MOTION_OR_BEYOND.has(p.state)).length
  const inTransit = live.filter((p) => p.state === "in_transit" || p.state === "exception").length
  const outForDelivery = live.filter((p) => p.state === "out_for_delivery").length
  const exception = live.filter((p) => p.state === "exception").length
  const counts = { total, labeled, inTransit, outForDelivery, delivered, exception }

  if (delivered === total) {
    return { state: "delivered", label: total > 1 ? `All ${total} packages delivered` : "Delivered", counts }
  }
  if (delivered > 0) {
    return {
      state: "partially_delivered",
      label: total > 1 ? `${delivered} of ${total} packages delivered` : "Delivered",
      counts,
    }
  }
  if (inMotion === total) {
    return { state: "shipped", label: total > 1 ? `All ${total} packages shipped` : "Shipped", counts }
  }
  if (labeled > 0 || inMotion > 0) {
    return {
      state: "partially_shipped",
      label: total > 1 ? `${Math.max(labeled, inMotion)} of ${total} packages shipped` : "Shipped",
      counts,
    }
  }
  return { state: "preparing", label: "Preparing", counts }
}

// ---------------------------------------------------------------------------
// The writer — orchestration over a store interface (the SQL
// implementation lives in tracking.ts; unit tests drive this same
// code against an in-memory fake, exactly as step 9's label core)
// ---------------------------------------------------------------------------

/** The package facts the writer reads. The SQL store's row type
 *  extends this with provider fields the refresh door needs. */
export interface TrackedPackageFacts {
  id: string
  tenantId: string
  orderId: string
  sellerId: string | null
  state: string
  carrier: string | null
  trackingNumber: string | null
  trackingStatus: string | null
  metadata: Record<string, any>
}

export interface TrackingUpdate {
  /** New package state, only on a transition. */
  state: string | null
  trackingStatus: CarrierStatus
  /** The metadata.tracking object to persist (history included). */
  tracking: Record<string, unknown>
}

export interface TrackingStore {
  loadById(tenantId: string, packageId: string, sellerId?: string | null): Promise<TrackedPackageFacts | null>
  loadByTrackingNumber(trackingNumber: string, carrier?: string | null): Promise<TrackedPackageFacts | null>
  applyUpdate(pkg: TrackedPackageFacts, update: TrackingUpdate): Promise<void>
  /** Emit the customer-notification effect for a transition,
   *  deduped on (package, kind) — a replayed transition emits
   *  nothing. Returns whether a new effect was emitted. */
  emitTransition(
    pkg: TrackedPackageFacts,
    kind: TrackingNotifyKind,
    obs: TrackingObservation,
  ): Promise<{ emitted: boolean }>
}

export function lastEventAtOf(pkg: TrackedPackageFacts): string | null {
  const t = (pkg.metadata || {}).tracking
  if (!t || typeof t !== "object") return null
  return typeof t.last_event_at === "string" ? t.last_event_at : null
}

export interface ApplyObservationResult {
  decision: TrackingDecision
  notified: TrackingNotifyKind | null
  effectEmitted: boolean
}

function nextTrackingMeta(
  pkg: TrackedPackageFacts,
  obs: TrackingObservation,
  decision: TrackingDecision,
): Record<string, unknown> {
  const prevRaw = (pkg.metadata || {}).tracking
  const prev: Record<string, any> =
    prevRaw && typeof prevRaw === "object" ? (prevRaw as Record<string, any>) : {}
  const history: unknown[] = Array.isArray(prev.history) ? [...(prev.history as unknown[])] : []
  history.push({
    status: obs.status,
    raw: obs.rawStatus,
    at: obs.at,
    detail: obs.detail,
    location: obs.location,
    source: obs.source,
    received_at: new Date().toISOString(),
    decision: decision.action,
  })
  return {
    status: obs.status,
    raw_status: obs.rawStatus,
    detail: obs.detail,
    location: obs.location,
    source: obs.source,
    last_event_at:
      decision.action === "ignore" ? (prev.last_event_at ?? null) : obs.at ?? (prev.last_event_at ?? null),
    last_checked_at: new Date().toISOString(),
    history: history.slice(-10),
  }
}

/**
 * Apply one carrier observation to one package through the
 * decider — the ONE writer every door (webhook, manual refresh,
 * cron sweep) feeds. A transition writes state + status and emits
 * its (deduped) notification effect; a refresh writes the observed
 * status only; an ignore writes nothing at all — replays and stale
 * events leave no trace beyond the carrier's next honest answer.
 */
export async function applyTrackingObservation(
  store: TrackingStore,
  pkg: TrackedPackageFacts,
  obs: TrackingObservation,
): Promise<ApplyObservationResult> {
  const decision = decideTrackingTransition(
    { state: pkg.state, trackingStatus: pkg.trackingStatus, lastEventAt: lastEventAtOf(pkg) },
    obs,
  )
  if (decision.action === "ignore") {
    return { decision, notified: null, effectEmitted: false }
  }
  const tracking = nextTrackingMeta(pkg, obs, decision)
  if (decision.action === "refresh") {
    await store.applyUpdate(pkg, { state: null, trackingStatus: decision.trackingStatus, tracking })
    return { decision, notified: null, effectEmitted: false }
  }
  await store.applyUpdate(pkg, {
    state: decision.toState,
    trackingStatus: decision.trackingStatus,
    tracking,
  })
  let effectEmitted = false
  if (decision.notify) {
    const out = await store.emitTransition(pkg, decision.notify, obs)
    effectEmitted = out.emitted
  }
  return { decision, notified: decision.notify, effectEmitted }
}

// ---------------------------------------------------------------------------
// Presentation helpers — one definition for every surface
// ---------------------------------------------------------------------------

/** The carrier's own tracking page for a number — the link both the
 *  customer history and the seller views render. Null for carriers
 *  without a stable public track URL (the number still renders as
 *  text; nothing fabricates a link). */
export function carrierTrackingUrl(carrier: string | null | undefined, trackingNumber: string | null | undefined): string | null {
  const num = String(trackingNumber || "").trim()
  if (!num) return null
  const c = String(carrier || "").toLowerCase()
  if (c.includes("usps") || c.includes("postal")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(num)}`
  }
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${encodeURIComponent(num)}`
  if (c.includes("fedex") || c.includes("fdx") || c.includes("fed ex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(num)}`
  }
  if (c.includes("dhl")) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(num)}`
  return null
}

/** Customer-facing label for one package: its state first, refined
 *  by the observed carrier status (a label_available package the
 *  carrier has only pre-transit reads "Label created", not
 *  "Shipped"). */
export function packageStatusLabel(state: string, trackingStatus: string | null | undefined): string {
  switch (state) {
    case "awaiting_eligibility":
    case "ready_for_label":
      return "Preparing"
    case "label_requested":
      return "Label requested"
    case "label_available":
      return trackingStatus === "PRE_TRANSIT" ? "Label created — awaiting carrier pickup" : "Label created"
    case "in_transit":
      return "In transit"
    case "out_for_delivery":
      return "Out for delivery"
    case "delivered":
      return "Delivered"
    case "exception":
      return "Delivery exception"
    case "cancelled":
      return "Cancelled"
    default:
      return "Preparing"
  }
}

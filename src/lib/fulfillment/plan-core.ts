// ---------------------------------------------------------------------------
// fulfillment/plan-core.ts — the PURE core of the persisted fulfillment
// plan (Marketplace Closed-Loop Commerce contract, step 8).
//
// Everything here is deterministic and import-free so it can be
// unit-tested directly (scripts/fulfillment-plan.test.mjs) and shared
// by the plan writer / read model (lib/fulfillment/plan.ts).
//
// THE PLAN IS BUILT FROM SNAPSHOTS, NEVER FROM MUTABLE RECORDS
// (contract §5): for a custom-checkout order the source is the
// accepted quote snapshot persisted on the order at creation
// (metadata.fulfillment_snapshot — per-group seller + origin + parcel
// + chosen service, per-line seller + group); for a legacy-session
// order it is the order's own persisted lines plus the seller
// attribution resolved from them. Nothing here re-reads a product,
// a catalog item, or an address book.
//
// GROUPING = seller + origin + compatible shipping constraints +
// packaging plan (one parcel plan per group in the quote build),
// which is exactly the quote's grouping; the legacy derivation groups
// by attributed seller under the house origin default.
//
// PACKAGE QUANTITIES ARE RELATIONAL: a draft carries one line per
// (package, order item) with an exact quantity. Allocation consumes
// order items in order and NEVER allocates more than the ordered
// quantity — an over-demanding snapshot yields an INCOMPLETE draft
// (flagged, state stays awaiting_eligibility), never an over-filled
// package. The database guard trigger (migration 20261195) enforces
// the same ceiling structurally.
// ---------------------------------------------------------------------------

/** The two pre-label states a package is born into / advances to in
 *  this step. Later states (label_requested onward) belong to steps
 *  9–10 and never appear here. */
export type PackageState = "awaiting_eligibility" | "ready_for_label"

export interface PlanItemInput {
  orderItemId: string
  productId: string
  quantity: number
}

export interface SnapshotGroupLineInput {
  productId: string
  quantity: number
}

export interface SnapshotGroupInput {
  groupKey: string
  sellerId: string | null
  origin: unknown
  parcel: unknown
  packagingPlan: string | null
  serviceLevel: string | null
  service: unknown
  lines: SnapshotGroupLineInput[]
}

export interface PackageDraftLine {
  orderItemId: string
  productId: string
  quantity: number
}

export interface PackageDraft {
  groupKey: string
  sellerId: string | null
  source: "quote" | "legacy"
  origin: unknown
  parcel: unknown
  packagingPlan: string | null
  serviceLevel: string | null
  service: unknown
  lines: PackageDraftLine[]
  /** True when every requested line quantity was fully allocated
   *  from the order's items. An incomplete draft persists (the order
   *  still needs its plan) but never advances to ready_for_label. */
  complete: boolean
  /** True when this draft exists only because some ordered items
   *  were covered by no snapshot group (defensive catch-all). */
  allocationGap: boolean
  /** Writer annotations (e.g. the legacy house draft's ambiguous
   *  products) — persisted onto the package's metadata. */
  metadata: Record<string, unknown>
}

/** Consume order items (in the given order) against one group's
 *  requested lines. Returns the allocation keyed by order item id,
 *  the unmet remainder per requested line, and mutates nothing — the
 *  caller tracks the remaining pool across groups. */
function allocateFromPool(
  pool: Map<string, { item: PlanItemInput; remaining: number }>,
  requested: SnapshotGroupLineInput[],
): { lines: PackageDraftLine[]; unmet: number } {
  const byItem = new Map<string, PackageDraftLine>()
  let unmet = 0
  for (const req of requested) {
    let need = Math.max(0, Math.trunc(req.quantity) || 0)
    if (need === 0) continue
    for (const entry of pool.values()) {
      if (need <= 0) break
      if (entry.item.productId !== req.productId || entry.remaining <= 0) continue
      const take = Math.min(need, entry.remaining)
      entry.remaining -= take
      need -= take
      const existing = byItem.get(entry.item.orderItemId)
      if (existing) existing.quantity += take
      else
        byItem.set(entry.item.orderItemId, {
          orderItemId: entry.item.orderItemId,
          productId: entry.item.productId,
          quantity: take,
        })
    }
    unmet += need
  }
  return { lines: [...byItem.values()], unmet }
}

/**
 * Build package drafts from the accepted quote snapshot's groups.
 * Allocation order is the snapshot's group order, and inside a group
 * the order's item order — deterministic, so a re-drive derives the
 * identical plan. Items no group covers land in ONE catch-all draft
 * (groupKey "snapshot-gap", house scope, allocationGap) instead of
 * being silently dropped: every paid order's plan covers every line.
 */
export function buildQuotePlanDrafts(
  items: PlanItemInput[],
  groups: SnapshotGroupInput[],
): PackageDraft[] {
  const pool = new Map<string, { item: PlanItemInput; remaining: number }>()
  for (const item of items) {
    pool.set(item.orderItemId, { item, remaining: Math.max(0, Math.trunc(item.quantity) || 0) })
  }
  const drafts: PackageDraft[] = []
  for (const g of groups) {
    const { lines, unmet } = allocateFromPool(pool, g.lines)
    drafts.push({
      groupKey: g.groupKey,
      sellerId: g.sellerId,
      source: "quote",
      origin: g.origin ?? null,
      parcel: g.parcel ?? null,
      packagingPlan: g.packagingPlan,
      serviceLevel: g.serviceLevel,
      service: g.service ?? null,
      lines,
      complete: unmet === 0,
      allocationGap: false,
      metadata: {},
    })
  }
  const leftover: PackageDraftLine[] = []
  for (const entry of pool.values()) {
    if (entry.remaining > 0) {
      leftover.push({
        orderItemId: entry.item.orderItemId,
        productId: entry.item.productId,
        quantity: entry.remaining,
      })
    }
  }
  if (leftover.length > 0) {
    drafts.push({
      groupKey: "snapshot-gap",
      sellerId: null,
      source: "quote",
      origin: null,
      parcel: null,
      packagingPlan: null,
      serviceLevel: null,
      service: null,
      lines: leftover,
      complete: true,
      allocationGap: true,
      metadata: {},
    })
  }
  return drafts
}

/** Legacy plan group identity: one package per attributed seller,
 *  house lines under their own key — stable across re-drives. */
export function legacyGroupKeyFor(sellerId: string | null): string {
  return `legacy:${sellerId ?? "house"}`
}

/**
 * Build package drafts for a legacy-session order (no quote
 * snapshot): its persisted lines grouped by attributed seller, every
 * group under the house origin default the caller resolved. A line
 * whose product resolves to no seller — or to more than one (the
 * caller passes null for ambiguous lines: they cannot be allocated
 * honestly) — groups under house.
 */
export function buildLegacyPlanDrafts(
  items: PlanItemInput[],
  sellerByItemId: Map<string, string | null>,
  origin: unknown,
): PackageDraft[] {
  const groups = new Map<string, PackageDraft>()
  for (const item of items) {
    const sellerId = sellerByItemId.get(item.orderItemId) ?? null
    const key = legacyGroupKeyFor(sellerId)
    let draft = groups.get(key)
    if (!draft) {
      draft = {
        groupKey: key,
        sellerId,
        source: "legacy",
        origin: origin ?? null,
        parcel: null,
        packagingPlan: "unspecified",
        serviceLevel: null,
        service: null,
        lines: [],
        complete: true,
        allocationGap: false,
        metadata: {},
      }
      groups.set(key, draft)
    }
    draft.lines.push({
      orderItemId: item.orderItemId,
      productId: item.productId,
      quantity: Math.max(0, Math.trunc(item.quantity) || 0),
    })
  }
  return [...groups.values()]
}

/**
 * The state a package should carry, from facts only:
 *   - pickup packages never become label-eligible in this step;
 *   - a seller package is eligible only when its seller order (the
 *     seller's fulfillment record) exists;
 *   - an incomplete package (allocation could not cover its lines)
 *     is never eligible.
 * House packages fulfill against the order itself, which exists by
 * construction — the caller passes sellerOrderExists=true for them.
 */
export function packageStateFor(input: {
  fulfillmentMethod: string | null | undefined
  sellerOrderExists: boolean
  complete: boolean
}): PackageState {
  if (String(input.fulfillmentMethod || "ship") === "pickup") return "awaiting_eligibility"
  if (!input.complete) return "awaiting_eligibility"
  if (!input.sellerOrderExists) return "awaiting_eligibility"
  return "ready_for_label"
}

/**
 * Invariant check over a finished draft set: the packaged total of
 * any order item must never exceed its ordered quantity, and no line
 * may carry a non-positive quantity. Returns human-readable
 * violations; an empty list means the plan is structurally sound.
 * The writer refuses to persist a violating plan (the DB trigger is
 * the second, structural control).
 */
export function validateDraftQuantities(
  drafts: PackageDraft[],
  items: PlanItemInput[],
): string[] {
  const ordered = new Map<string, number>()
  for (const it of items) ordered.set(it.orderItemId, Math.max(0, Math.trunc(it.quantity) || 0))
  const packaged = new Map<string, number>()
  const violations: string[] = []
  for (const d of drafts) {
    for (const line of d.lines) {
      if (!(line.quantity > 0)) {
        violations.push(`package ${d.groupKey}: non-positive quantity for item ${line.orderItemId}`)
        continue
      }
      packaged.set(line.orderItemId, (packaged.get(line.orderItemId) || 0) + line.quantity)
    }
  }
  for (const [itemId, total] of packaged) {
    const max = ordered.get(itemId)
    if (max == null) violations.push(`packaged item ${itemId} is not an item of the order`)
    else if (total > max) violations.push(`item ${itemId}: packaged ${total} exceeds ordered ${max}`)
  }
  return violations
}

export interface ExistingPackageSnapshot {
  groupKey: string
  state: string
  sellerOrderId: string | null
}

export interface DesiredPackageState {
  groupKey: string
  state: PackageState
  sellerOrderId: string | null
}

export interface PlanDiff {
  /** Drafts whose group is not yet persisted — insert them. */
  insertGroupKeys: string[]
  /** Already-persisted packages whose state or seller order changed
   *  (the re-drive convergence: a seller order that appeared after
   *  the first finalization advances its package). Packages already
   *  past the pre-label states are never regressed. */
  updates: DesiredPackageState[]
}

/**
 * Diff the desired plan against what is already persisted, keyed on
 * the (order, group) identity — the re-drive contract: the same
 * finalization run twice inserts nothing twice, and a package only
 * ever moves FORWARD out of awaiting_eligibility.
 */
export function diffPlan(
  existing: ExistingPackageSnapshot[],
  desired: DesiredPackageState[],
): PlanDiff {
  const byKey = new Map(existing.map((p) => [p.groupKey, p]))
  const insertGroupKeys: string[] = []
  const updates: DesiredPackageState[] = []
  for (const d of desired) {
    const cur = byKey.get(d.groupKey)
    if (!cur) {
      insertGroupKeys.push(d.groupKey)
      continue
    }
    if (cur.state !== "awaiting_eligibility") continue
    if (cur.state !== d.state || (cur.sellerOrderId || null) !== (d.sellerOrderId || null)) {
      updates.push(d)
    }
  }
  return { insertGroupKeys, updates }
}

// ---------------------------------------------------------------------------
// fulfillment/plan.ts — the PERSISTED fulfillment plan of a paid shop
// order (Marketplace Closed-Loop Commerce contract, step 8): seller /
// origin / package records created at finalization, plus the read
// model the seller and customer surfaces consume.
//
// Writer: ensureFulfillmentPlan runs as an idempotent step of the
// Stripe webhook's shop finalization (handlers.ts step 2d), AFTER the
// attribution/split backfill, so the seller orders it names already
// exist. It derives the plan from the order's OWN records only
// (contract §5 — never mutable product records):
//
//   • quote-snapshot orders (custom checkout): metadata
//     .fulfillment_snapshot carries the accepted quote's groups
//     (seller + origin + parcel + chosen service) and per-line seller
//     + group — one package per group, its lines allocated from the
//     order's persisted items by product + quantity.
//   • legacy-session orders (no snapshot): the plan derives from the
//     persisted order lines + seller attribution (the attribution
//     writer's own per-line resolution) — one package per attributed
//     seller under the house origin default, house lines under a
//     house package. Every paid order gets a plan, not only
//     new-checkout orders.
//
// Idempotency: packages are keyed (tenant_id, order_id, group_key)
// and lines (package_id, order_item_id); creation is insert-if-absent
// and a re-drive only ADVANCES packages whose facts improved (a
// seller order that appeared later) — plan-core's diffPlan decides.
// Pre-cutover honesty: until migration 20261195 is applied live, the
// probe reports the store absent and every entry point here no-ops /
// reads empty instead of erroring (the step-7 store pattern).
//
// Packages hang off the CUSTOMER order (order_id = the parent when a
// checkout split made per-seller children) and name their seller's
// fulfillment record in seller_order_id — the child when split, the
// order itself when single-seller, NULL for house packages — so one
// plan per order serves both the customer's read (ALL packages of the
// order; multiple tracking numbers are representable) and the
// seller's (only their own packages).
// ---------------------------------------------------------------------------

import { randomUUID } from "crypto"
import type { SellerQueryFn } from "@/lib/sellers/attribution"
import { resolveLineSellers } from "@/lib/sellers/order-split"
import {
  buildLegacyPlanDrafts,
  buildQuotePlanDrafts,
  diffPlan,
  legacyGroupKeyFor,
  packageStateFor,
  validateDraftQuantities,
  type PackageDraft,
  type PlanItemInput,
  type SnapshotGroupInput,
} from "./plan-core"
import { carrierTrackingUrl } from "./tracking-core"

// ---------------------------------------------------------------------------
// Store probe (pre-cutover degradation)
// ---------------------------------------------------------------------------

export async function probeFulfillmentStore(q: SellerQueryFn): Promise<boolean> {
  try {
    const rows = await q(
      `SELECT to_regclass('public.fulfillment_packages') AS pkg,
              to_regclass('public.fulfillment_package_lines') AS lines`,
      [],
    )
    return !!rows?.[0]?.pkg && !!rows?.[0]?.lines
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

interface OrderForPlan {
  id: string
  tenantId: string
  fulfillmentMethod: string | null
  metadata: Record<string, any>
}

async function loadOrderForPlan(
  q: SellerQueryFn,
  tenantIdHint: string,
  orderId: string,
): Promise<OrderForPlan | null> {
  const rows = await q(
    `SELECT id::text AS id, tenant_id::text AS tenant_id, fulfillment_method, metadata
       FROM public.commerce_orders
      WHERE id::text = $1
      LIMIT 1`,
    [orderId],
  )
  const row = rows[0]
  if (!row) return null
  return {
    id: String(row.id),
    tenantId: row.tenant_id ? String(row.tenant_id) : tenantIdHint,
    fulfillmentMethod: row.fulfillment_method ? String(row.fulfillment_method) : null,
    metadata: parseMetadata(row.metadata),
  }
}

async function loadOrderItems(q: SellerQueryFn, orderId: string): Promise<PlanItemInput[]> {
  const rows = await q(
    `SELECT id::text AS id, product_id, quantity
       FROM public.commerce_order_items
      WHERE order_id::text = $1
      ORDER BY created_at ASC`,
    [orderId],
  )
  return rows.map((r) => ({
    orderItemId: String(r.id),
    productId: String(r.product_id || ""),
    quantity: Number(r.quantity) || 0,
  }))
}

/** seller_id → the seller's fulfillment record (commerce order id):
 *  the order itself when it carries the single-seller stamp, the
 *  checkout-split child when split. Absent seller = no seller order
 *  exists (yet) — its package stays awaiting_eligibility. */
async function resolveSellerOrderIds(
  q: SellerQueryFn,
  order: OrderForPlan,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const stamped = order.metadata?.seller_id ? String(order.metadata.seller_id) : ""
  if (stamped) out.set(stamped, order.id)
  const children = await q(
    `SELECT id::text AS id, metadata->>'seller_id' AS seller_id
       FROM public.commerce_orders
      WHERE metadata->>'split_from' = $1
        AND metadata->>'split_by' = 'checkout'`,
    [order.id],
  )
  for (const child of children) {
    const sid = child.seller_id ? String(child.seller_id) : ""
    if (sid && !out.has(sid)) out.set(sid, String(child.id))
  }
  return out
}

/** The house origin default — the tenant scope of ship_from_addresses
 *  (seller_id NULL), resolved with the ship-from module's own
 *  ordering (default first, most recent fallback). Null when the
 *  tenant has saved none: the snapshot then honestly carries no
 *  origin rather than a fabricated one. */
async function houseOriginSnapshot(
  q: SellerQueryFn,
  tenantId: string,
): Promise<Record<string, unknown> | null> {
  const rows = await q(
    `SELECT name, street, city, state, zip, phone
       FROM public.ship_from_addresses
      WHERE tenant_id = $1 AND seller_id IS NULL
      ORDER BY is_default DESC, updated_at DESC
      LIMIT 1`,
    [tenantId],
  )
  const row = rows[0]
  if (!row) return null
  return {
    name: row.name ?? null,
    street: row.street ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    zip: row.zip ?? null,
    phone: row.phone ?? null,
  }
}

// ---------------------------------------------------------------------------
// Draft derivation
// ---------------------------------------------------------------------------

function snapshotDrafts(order: OrderForPlan, items: PlanItemInput[]): PackageDraft[] | null {
  const snap = order.metadata?.fulfillment_snapshot
  if (!snap || !Array.isArray(snap.groups) || snap.groups.length === 0) return null
  const snapLines: any[] = Array.isArray(snap.lines) ? snap.lines : []
  const groups: SnapshotGroupInput[] = (snap.groups as any[]).map((g) => ({
    groupKey: String(g?.group_key || ""),
    sellerId: g?.seller_id ? String(g.seller_id) : null,
    origin: g?.origin ?? null,
    parcel: g?.parcel ?? null,
    packagingPlan: g?.packaging_plan ? String(g.packaging_plan) : null,
    serviceLevel: g?.service?.tier ? String(g.service.tier) : null,
    service: g?.service ?? null,
    lines: snapLines
      .filter((l) => String(l?.group_key || "") === String(g?.group_key || ""))
      .map((l) => ({
        productId: String(l?.product_id || ""),
        quantity: Number(l?.quantity) || 0,
      })),
  }))
  return buildQuotePlanDrafts(items, groups)
}

async function legacyDrafts(
  q: SellerQueryFn,
  order: OrderForPlan,
  items: PlanItemInput[],
): Promise<PackageDraft[]> {
  const lineSellers = await resolveLineSellers(
    q,
    order.tenantId,
    items.map((i) => i.productId),
  )
  const sellerByItemId = new Map<string, string | null>()
  const ambiguousProducts = new Set<string>()
  for (const item of items) {
    const ls = lineSellers.get(item.productId)
    if (ls?.kind === "seller") sellerByItemId.set(item.orderItemId, ls.sellerId)
    else {
      sellerByItemId.set(item.orderItemId, null)
      if (ls?.kind === "ambiguous") ambiguousProducts.add(item.productId)
    }
  }
  const origin = await houseOriginSnapshot(q, order.tenantId)
  const drafts = buildLegacyPlanDrafts(items, sellerByItemId, origin)
  if (ambiguousProducts.size > 0) {
    const house = drafts.find((d) => d.groupKey === legacyGroupKeyFor(null))
    if (house) {
      house.metadata = {
        ...house.metadata,
        ambiguous_products: [...ambiguousProducts],
        ambiguous_note:
          "These products resolve to more than one seller and cannot be allocated honestly; their lines ride the house package until attribution resolves them.",
      }
    }
  }
  return drafts
}

// ---------------------------------------------------------------------------
// Writer — the finalization step
// ---------------------------------------------------------------------------

export interface EnsurePlanResult {
  available: boolean
  reason?: "order-missing" | "no-lines"
  source?: "quote" | "legacy"
  packages?: number
  inserted?: number
  advanced?: number
}

export async function ensureFulfillmentPlan(
  q: SellerQueryFn,
  args: { tenantId: string; orderId: string },
): Promise<EnsurePlanResult> {
  if (!(await probeFulfillmentStore(q))) return { available: false }

  const order = await loadOrderForPlan(q, args.tenantId, args.orderId)
  if (!order) return { available: true, reason: "order-missing" }
  const items = await loadOrderItems(q, order.id)
  if (items.length === 0) return { available: true, reason: "no-lines" }

  const fromSnapshot = snapshotDrafts(order, items)
  const source: "quote" | "legacy" = fromSnapshot ? "quote" : "legacy"
  const drafts = fromSnapshot ?? (await legacyDrafts(q, order, items))

  // The quantity ceiling is a hard invariant: a plan that over-fills
  // a line is corrupt input, and persisting it would poison every
  // later step. Refuse loudly (the DB trigger is the second control).
  const violations = validateDraftQuantities(drafts, items)
  if (violations.length > 0) {
    throw new Error(
      `fulfillment plan for order ${order.id} violates quantity invariants: ${violations.join("; ")}`,
    )
  }

  const sellerOrders = await resolveSellerOrderIds(q, order)
  const desired = drafts.map((d) => {
    const sellerOrderId = d.sellerId ? sellerOrders.get(d.sellerId) ?? null : null
    return {
      draft: d,
      groupKey: d.groupKey,
      sellerOrderId,
      state: packageStateFor({
        fulfillmentMethod: order.fulfillmentMethod,
        // House packages fulfill against the order itself.
        sellerOrderExists: d.sellerId ? sellerOrderId != null : true,
        complete: d.complete,
      }),
    }
  })

  const existingRows = await q(
    `SELECT id::text AS id, group_key, state, seller_order_id::text AS seller_order_id
       FROM public.fulfillment_packages
      WHERE tenant_id = $1 AND order_id = $2`,
    [order.tenantId, order.id],
  )
  const diff = diffPlan(
    existingRows.map((r) => ({
      groupKey: String(r.group_key),
      state: String(r.state),
      sellerOrderId: r.seller_order_id ? String(r.seller_order_id) : null,
    })),
    desired.map((d) => ({ groupKey: d.groupKey, state: d.state, sellerOrderId: d.sellerOrderId })),
  )

  let inserted = 0
  for (const d of desired) {
    if (!diff.insertGroupKeys.includes(d.groupKey)) continue
    const packageId = randomUUID()
    await q(
      `INSERT INTO public.fulfillment_packages
         (id, tenant_id, order_id, seller_order_id, seller_id, group_key,
          source, fulfillment_method, origin_snapshot, parcel_snapshot,
          packaging_plan, service_level, service_snapshot, state, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13::jsonb, $14, $15::jsonb)
       ON CONFLICT (tenant_id, order_id, group_key) DO NOTHING`,
      [
        packageId,
        order.tenantId,
        order.id,
        d.sellerOrderId,
        d.draft.sellerId,
        d.groupKey,
        source,
        order.fulfillmentMethod || "ship",
        JSON.stringify(d.draft.origin ?? {}),
        d.draft.parcel != null ? JSON.stringify(d.draft.parcel) : null,
        d.draft.packagingPlan,
        d.draft.serviceLevel,
        d.draft.service != null ? JSON.stringify(d.draft.service) : null,
        d.state,
        JSON.stringify(d.draft.metadata || {}),
      ],
    )
    // Resolve the persisted row's id (ours, or a concurrent
    // finalization's — the conflict arbiter decided).
    const persisted = await q(
      `SELECT id::text AS id FROM public.fulfillment_packages
        WHERE tenant_id = $1 AND order_id = $2 AND group_key = $3
        LIMIT 1`,
      [order.tenantId, order.id, d.groupKey],
    )
    const pid = persisted[0]?.id ? String(persisted[0].id) : null
    if (!pid) continue
    inserted += 1
    for (const line of d.draft.lines) {
      await q(
        `INSERT INTO public.fulfillment_package_lines
           (id, tenant_id, package_id, order_item_id, quantity)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (package_id, order_item_id) DO NOTHING`,
        [randomUUID(), order.tenantId, pid, line.orderItemId, line.quantity],
      )
    }
  }

  let advanced = 0
  for (const upd of diff.updates) {
    const rows = await q(
      `UPDATE public.fulfillment_packages
          SET state = $3, seller_order_id = $4, updated_at = now()
        WHERE tenant_id = $1 AND order_id = $2 AND group_key = $5
          AND state = 'awaiting_eligibility'
        RETURNING id::text AS id`,
      [order.tenantId, order.id, upd.state, upd.sellerOrderId, upd.groupKey],
    )
    advanced += rows.length
  }

  return { available: true, source, packages: desired.length, inserted, advanced }
}

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

export interface FulfillmentPackageLineRead {
  orderItemId: string
  productId: string | null
  name: string | null
  quantity: number
}

export interface FulfillmentPackageRead {
  id: string
  orderId: string
  sellerOrderId: string | null
  sellerId: string | null
  groupKey: string
  source: string
  fulfillmentMethod: string
  origin: unknown
  parcel: unknown
  packagingPlan: string | null
  serviceLevel: string | null
  service: unknown
  state: string
  trackingNumber: string | null
  carrier: string | null
  trackingStatus: string | null
  /** The carrier's own tracking page for this package's number
   *  (step 10 — the one carrierTrackingUrl definition), null when
   *  the carrier has no stable public track URL. */
  trackingUrl: string | null
  label: {
    id: string | null
    url: string | null
    provider: string | null
    costCents: number | null
    testMode: boolean | null
    purchasedAt: string | null
  } | null
  lines: FulfillmentPackageLineRead[]
  createdAt: string | null
  updatedAt: string | null
}

function parseJson(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return raw ?? null
}

function shapePackage(row: Record<string, unknown>, lines: FulfillmentPackageLineRead[]): FulfillmentPackageRead {
  const hasLabel = row.label_id != null || row.label_url != null
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    sellerOrderId: row.seller_order_id ? String(row.seller_order_id) : null,
    sellerId: row.seller_id ? String(row.seller_id) : null,
    groupKey: String(row.group_key),
    source: String(row.source || "quote"),
    fulfillmentMethod: String(row.fulfillment_method || "ship"),
    origin: parseJson(row.origin_snapshot),
    parcel: parseJson(row.parcel_snapshot),
    packagingPlan: row.packaging_plan ? String(row.packaging_plan) : null,
    serviceLevel: row.service_level ? String(row.service_level) : null,
    service: parseJson(row.service_snapshot),
    state: String(row.state),
    trackingNumber: row.tracking_number ? String(row.tracking_number) : null,
    carrier: row.carrier ? String(row.carrier) : null,
    trackingStatus: row.tracking_status ? String(row.tracking_status) : null,
    trackingUrl: carrierTrackingUrl(
      row.carrier ? String(row.carrier) : null,
      row.tracking_number ? String(row.tracking_number) : null,
    ),
    label: hasLabel
      ? {
          id: row.label_id ? String(row.label_id) : null,
          url: row.label_url ? String(row.label_url) : null,
          provider: row.label_provider ? String(row.label_provider) : null,
          costCents: row.label_cost_cents != null ? Number(row.label_cost_cents) : null,
          testMode: typeof row.label_test_mode === "boolean" ? row.label_test_mode : null,
          purchasedAt: row.label_purchased_at ? String(row.label_purchased_at) : null,
        }
      : null,
    lines,
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  }
}

/**
 * All packages for a set of (customer) orders, optionally scoped to
 * one seller. Returns null when the plan store is not installed yet
 * (pre-cutover), so surfaces can omit the field entirely instead of
 * rendering a wrong empty state.
 */
export async function readPackagesForOrders(
  q: SellerQueryFn,
  tenantId: string,
  orderIds: string[],
  opts: { sellerId?: string | null } = {},
): Promise<Map<string, FulfillmentPackageRead[]> | null> {
  if (orderIds.length === 0) return new Map()
  if (!(await probeFulfillmentStore(q))) return null
  const rows = await q(
    `SELECT id::text AS id, order_id::text AS order_id,
            seller_order_id::text AS seller_order_id, seller_id::text AS seller_id,
            group_key, source, fulfillment_method,
            origin_snapshot, parcel_snapshot, packaging_plan,
            service_level, service_snapshot, state,
            tracking_number, carrier, tracking_status,
            label_id, label_url, label_provider, label_cost_cents,
            label_test_mode, label_purchased_at,
            created_at, updated_at
       FROM public.fulfillment_packages
      WHERE tenant_id = $1
        AND order_id::text = ANY($2::text[])
        AND ($3::text IS NULL OR seller_id::text = $3::text)
      ORDER BY created_at ASC`,
    [tenantId, orderIds, opts.sellerId ?? null],
  )
  const out = new Map<string, FulfillmentPackageRead[]>()
  if (rows.length === 0) return out
  const packageIds = rows.map((r) => String(r.id))
  const lineRows = await q(
    `SELECT pl.package_id::text AS package_id, pl.order_item_id::text AS order_item_id,
            pl.quantity, oi.product_id, oi.name
       FROM public.fulfillment_package_lines pl
       JOIN public.commerce_order_items oi ON oi.id = pl.order_item_id
      WHERE pl.package_id::text = ANY($1::text[])
      ORDER BY pl.created_at ASC`,
    [packageIds],
  )
  const linesByPackage = new Map<string, FulfillmentPackageLineRead[]>()
  for (const lr of lineRows) {
    const key = String(lr.package_id)
    const arr = linesByPackage.get(key) || []
    arr.push({
      orderItemId: String(lr.order_item_id),
      productId: lr.product_id ? String(lr.product_id) : null,
      name: lr.name ? String(lr.name) : null,
      quantity: Number(lr.quantity) || 0,
    })
    linesByPackage.set(key, arr)
  }
  for (const row of rows) {
    const shaped = shapePackage(row, linesByPackage.get(String(row.id)) || [])
    const key = String(row.order_id)
    out.set(key, [...(out.get(key) || []), shaped])
  }
  return out
}

/** The packages of ONE order — the customer order-history read model
 *  (every package, every tracking number, representable at once). */
export async function readPackagesForOrder(
  q: SellerQueryFn,
  tenantId: string,
  orderId: string,
): Promise<FulfillmentPackageRead[] | null> {
  const map = await readPackagesForOrders(q, tenantId, [orderId])
  if (!map) return null
  return map.get(orderId) || []
}

/**
 * The packages a seller sees for ONE of their orders. The seller's
 * order may be the customer order itself (single-seller) or a
 * checkout-split child; the packages live on the parent, scoped by
 * seller_id, so resolve the parent first. Returns null pre-cutover
 * and [] when the order is not this seller's.
 */
export async function readPackagesForSellerOrder(
  q: SellerQueryFn,
  tenantId: string,
  sellerId: string,
  sellerOrderId: string,
): Promise<FulfillmentPackageRead[] | null> {
  const rows = await q(
    `SELECT metadata FROM public.commerce_orders WHERE id::text = $1 LIMIT 1`,
    [sellerOrderId],
  )
  const row = rows[0]
  if (!row) return []
  const meta = parseMetadata(row.metadata)
  const parentId =
    meta.split_from && meta.split_by === "checkout" ? String(meta.split_from) : sellerOrderId
  if (String(meta.seller_id || "") !== sellerId && parentId !== sellerOrderId) return []
  const map = await readPackagesForOrders(q, tenantId, [parentId], { sellerId })
  if (!map) return null
  return map.get(parentId) || []
}

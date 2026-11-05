// ---------------------------------------------------------------------------
// sellers/order-split.ts — the CHECKOUT-TIME seller split (tree §5).
//
// The gap this closes: the readers' contract carries ONE seller per
// order (metadata.seller_id + the seller_orders bridge), so a cart
// spanning two or more sellers could not be attributed at all —
// attributeCommerceOrder reported "mixed" and stopped. The order was
// charged and receipted normally, but NO seller ever saw it (every
// seller surface gates on the stamp), NO seller was notified, and NO
// earnings could accrue. The seller-side manual split could not rescue
// it either: an unattributed order is invisible to every seller.
//
// The split, in the house order model (the same shape the manual
// E.5 split established — commerce_orders children linked in metadata,
// payment identifiers stay on the paying order):
//
//   - The order the checkout created stays THE customer/payment record:
//     every line, the full charged totals, the Stripe ids, the one
//     receipt. It is never seller-stamped (it has no single seller).
//   - One child order per seller, born at checkout completion next to
//     the parent's attribution moment, holding COPIES of only that
//     seller's lines (the parent keeps the complete record; the child
//     is the seller's fulfillment record — the same double
//     representation the seller_orders bridge has always been), its own
//     line-sum subtotal, its share of any order-level discount, and
//     metadata { seller_id, split_from: parent, split_by: "checkout",
//     order_group_id: parent } — no Stripe ids: the payment stays on
//     the parent, exactly as the manual split rules it.
//   - Each child is then run through attributeCommerceOrder, which
//     creates its seller_orders bridge row (per-seller totals) and
//     fires the exactly-once new-order notification through
//     notifySeller. A seller whose lines sit next to another seller's
//     is told exactly what a single-seller seller is told.
//   - Platform/Dropshift lines (no seller) stay on the parent only —
//     the platform's own order remainder, fulfilled by the platform's
//     existing paths (supplier-orders queue reads the parent's cart).
//   - When the parent is paid, the webhook flips the children with it
//     (markSplitChildrenPaid) — children inherit the parent's payment
//     state; their fulfillment_status stays seller-managed.
//
// Idempotent + resumable: children are looked up by
// (split_from = parent, split_by = 'checkout', seller_id) before any
// insert, so a checkout retry or the webhook's paid-time convergence
// call creates only the children that are missing, and attribution's
// bridge insert-if-absent keeps notifications exactly-once.
//
// A line whose product resolves to MORE THAN ONE seller (two approved
// listings on one shared catalog item) cannot be allocated honestly —
// the split refuses the whole order (reason "ambiguous") and the
// caller keeps today's behavior (unattributed + logged) rather than
// guessing which seller made the sale.
//
// Callers (shop checkout, the Stripe webhook's paid backfill)
// failure-isolate this writer exactly like the attribution writer:
// a split failure must never break a checkout or a webhook.
// ---------------------------------------------------------------------------

import { randomUUID } from "crypto"
import {
  attributeCommerceOrder,
  moneyToCents,
  orderNumberFor,
  resolveOrderSellerIds,
  type SellerQueryFn,
} from "./attribution"

export type LineSeller =
  | { kind: "seller"; sellerId: string }
  | { kind: "platform" }
  | { kind: "ambiguous"; sellerIds: string[] }

/**
 * Resolve the seller of EACH cart product id, using the attribution
 * writer's own two-legged resolution (catalog stamp OR governed
 * listing) one product at a time, so a mixed cart can be grouped.
 */
export async function resolveLineSellers(
  q: SellerQueryFn,
  tenantId: string,
  productIds: string[],
): Promise<Map<string, LineSeller>> {
  const out = new Map<string, LineSeller>()
  const distinct = [...new Set(productIds.map((p) => String(p || "")).filter(Boolean))]
  for (const pid of distinct) {
    const sellerIds = await resolveOrderSellerIds(q, tenantId, [pid])
    if (sellerIds.length === 0) out.set(pid, { kind: "platform" })
    else if (sellerIds.length === 1) out.set(pid, { kind: "seller", sellerId: sellerIds[0] })
    else out.set(pid, { kind: "ambiguous", sellerIds })
  }
  return out
}

export type SplitResult =
  | {
      split: true
      parentOrderId: string
      groupId: string
      children: {
        sellerId: string
        orderId: string
        subtotalCents: number
        discountCents: number
        totalCents: number
        created: boolean
      }[]
    }
  | {
      split: false
      reason: "order-missing" | "no-lines" | "single-seller" | "no-seller" | "ambiguous"
      sellerIds: string[]
    }

interface OrderRow extends Record<string, unknown> {
  id: string
  tenant_id: string | null
  email: string | null
  customer_email: string | null
  customer_id: string | null
  status: string | null
  payment_status: string | null
  fulfillment_method: string | null
  shipping_address: string | null
  notes: string | null
  subtotal: string | null
  total_amount: string | null
  metadata: unknown
}

interface ItemRow extends Record<string, unknown> {
  id: string
  product_id: string | null
  name: string | null
  quantity: number | null
  unit_price: string | null
  supplier: string | null
  supplier_product_id: string | null
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>
  return {}
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`

/** Largest-remainder proportional allocation of `total` across
 *  weights — deterministic, sums exactly to `total`. */
function allocate(total: number, weights: number[]): number[] {
  const out = weights.map(() => 0)
  if (total <= 0 || weights.length === 0) return out
  const weightSum = weights.reduce((s, w) => s + w, 0)
  if (weightSum <= 0) return out
  let assigned = 0
  const remainders: { i: number; frac: number }[] = []
  weights.forEach((w, i) => {
    const exact = (total * w) / weightSum
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

/**
 * Split one commerce order into per-seller child orders when (and only
 * when) its lines resolve to two or more distinct sellers. Single-seller
 * and platform-only orders are NOT split — the caller runs the plain
 * attribution writer for those, exactly as before.
 */
export async function splitCommerceOrderBySeller(
  q: SellerQueryFn,
  args: { tenantId: string; orderId: string; customerName?: string | null },
): Promise<SplitResult> {
  const orderRows = await q(
    `SELECT id::text AS id, tenant_id::text AS tenant_id, email, customer_email,
            customer_id, status, payment_status, fulfillment_method,
            shipping_address, notes, subtotal, total_amount, metadata
       FROM public.commerce_orders
      WHERE id::text = $1
      LIMIT 1`,
    [args.orderId],
  )
  const order = orderRows[0] as OrderRow | undefined
  if (!order) return { split: false, reason: "order-missing", sellerIds: [] }

  const itemRows = (await q(
    `SELECT id::text AS id, product_id, name, quantity, unit_price,
            supplier, supplier_product_id
       FROM public.commerce_order_items
      WHERE order_id::text = $1
      ORDER BY created_at ASC`,
    [args.orderId],
  )) as ItemRow[]
  if (itemRows.length === 0) return { split: false, reason: "no-lines", sellerIds: [] }

  const lineSellers = await resolveLineSellers(
    q,
    args.tenantId,
    itemRows.map((it) => String(it.product_id || "")),
  )

  const sellerIds: string[] = []
  for (const ls of lineSellers.values()) {
    if (ls.kind === "ambiguous") {
      return { split: false, reason: "ambiguous", sellerIds: ls.sellerIds }
    }
    if (ls.kind === "seller" && !sellerIds.includes(ls.sellerId)) {
      sellerIds.push(ls.sellerId)
    }
  }
  if (sellerIds.length === 0) return { split: false, reason: "no-seller", sellerIds }
  if (sellerIds.length === 1) return { split: false, reason: "single-seller", sellerIds }

  // ---- Group the lines: one group per seller; platform lines stay
  //      on the parent (they are the platform's own order remainder).
  const groups = new Map<string, ItemRow[]>()
  for (const sid of sellerIds) groups.set(sid, [])
  let platformSubtotalCents = 0
  const groupSubtotal = new Map<string, number>()
  for (const sid of sellerIds) groupSubtotal.set(sid, 0)
  for (const it of itemRows) {
    const ls = lineSellers.get(String(it.product_id || ""))
    const cents = moneyToCents(it.unit_price) * (Number(it.quantity) || 0)
    if (ls?.kind === "seller") {
      groups.get(ls.sellerId)!.push(it)
      groupSubtotal.set(ls.sellerId, (groupSubtotal.get(ls.sellerId) || 0) + cents)
    } else {
      platformSubtotalCents += cents
    }
  }

  // ---- Allocate any order-level discount across ALL groups (each
  //      seller + the platform remainder) by line subtotal, so the
  //      children's totals and the platform remainder sum back to the
  //      amount the customer actually paid.
  const parentMeta = parseMetadata(order.metadata)
  const discountCents = Math.max(0, Math.trunc(Number(parentMeta.discount_cents || 0)))
  const allocKeys = [...sellerIds, "__platform__"]
  const allocWeights = allocKeys.map((k) =>
    k === "__platform__" ? platformSubtotalCents : groupSubtotal.get(k) || 0,
  )
  const allocations = allocate(discountCents, allocWeights)
  const discountFor = new Map<string, number>()
  allocKeys.forEach((k, i) => discountFor.set(k, allocations[i]))

  // ---- Existing children (resume): never duplicate a seller's child.
  const existingRows = await q(
    `SELECT id::text AS id, metadata->>'seller_id' AS seller_id
       FROM public.commerce_orders
      WHERE metadata->>'split_from' = $1
        AND metadata->>'split_by' = 'checkout'`,
    [args.orderId],
  )
  const existingBySeller = new Map<string, string>()
  for (const r of existingRows) {
    const sid = String(r.seller_id || "")
    if (sid) existingBySeller.set(sid, String(r.id))
  }

  const tenantId = order.tenant_id || args.tenantId
  const children: {
    sellerId: string
    orderId: string
    subtotalCents: number
    discountCents: number
    totalCents: number
    created: boolean
  }[] = []

  for (const sellerId of sellerIds) {
    const lines = groups.get(sellerId) || []
    const subtotalCents = groupSubtotal.get(sellerId) || 0
    const shareCents = discountFor.get(sellerId) || 0
    const totalCents = Math.max(0, subtotalCents - shareCents)
    let childId = existingBySeller.get(sellerId)
    let created = false

    if (!childId) {
      childId = randomUUID()
      const childMeta = {
        flow_type: "shop",
        source: "shop_checkout_split",
        split_from: args.orderId,
        split_by: "checkout",
        split_at: new Date().toISOString(),
        order_group_id: args.orderId,
        seller_id: sellerId,
        parent_order_number: orderNumberFor(args.orderId),
        discount_cents: shareCents,
        cart_items: lines.map((it) => ({
          productId: String(it.product_id || ""),
          name: String(it.name || ""),
          quantity: Number(it.quantity) || 0,
          unitPrice: String(it.unit_price || "$0.00"),
        })),
      }
      await q(
        `INSERT INTO public.commerce_orders
           (id, tenant_id, email, customer_email, customer_id, status,
            payment_status, fulfillment_status, fulfillment_method,
            subtotal, total_amount, shipping_address, notes, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11, $12, $13::jsonb)`,
        [
          childId,
          tenantId,
          order.email,
          order.customer_email,
          order.customer_id,
          order.status || "pending",
          order.payment_status || "unpaid",
          order.fulfillment_method,
          fmt(subtotalCents),
          fmt(totalCents),
          order.shipping_address,
          order.notes,
          JSON.stringify(childMeta),
        ],
      )
      for (const it of lines) {
        await q(
          `INSERT INTO public.commerce_order_items
             (id, tenant_id, order_id, product_id, name, quantity, unit_price,
              supplier, supplier_product_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            randomUUID(),
            tenantId,
            childId,
            it.product_id,
            it.name,
            Number(it.quantity) || 0,
            it.unit_price,
            it.supplier,
            it.supplier_product_id,
          ],
        )
      }
      created = true
    }

    // Attribution for the child: keeps its seller stamp, creates the
    // seller_orders bridge row with the CHILD's totals, and fires the
    // exactly-once new-order notification for this seller.
    await attributeCommerceOrder(q, {
      tenantId: args.tenantId,
      orderId: childId,
      productIds: lines.map((it) => String(it.product_id || "")),
      customerName: args.customerName || null,
    })

    children.push({
      sellerId,
      orderId: childId,
      subtotalCents,
      discountCents: shareCents,
      totalCents,
      created,
    })
  }

  // ---- Link the parent to its children (the group record). The
  //      parent's own totals and lines are NOT touched: it remains
  //      the complete customer/payment record of the checkout.
  const splitInto = [...new Set(children.map((c) => c.orderId))]
  await q(
    `UPDATE public.commerce_orders
        SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = now()
      WHERE id::text = $1`,
    [
      args.orderId,
      JSON.stringify({
        split_into: splitInto,
        order_group_id: args.orderId,
        seller_ids: sellerIds,
        platform_subtotal_cents: platformSubtotalCents,
      }),
    ],
  )

  return { split: true, parentOrderId: args.orderId, groupId: args.orderId, children }
}

/**
 * Adapt a pg-style client (the withPg / bulk-ship shape) to the
 * SellerQueryFn every writer in this module takes.
 */
type PgQueryClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>
}

export function sellerQueryFnForPgClient(client: PgQueryClient): SellerQueryFn {
  return async (sql, params) =>
    (await client.query(sql, params)).rows as Record<string, unknown>[]
}

// ---------------------------------------------------------------------------
// Parent fulfillment roll-up for checkout-split orders.
//
// The split made the PARENT the customer's order, but nothing ever
// moved the parent's fulfillment_status again: each seller ships
// their own child, so the parent sat at 'pending' forever and the
// customer saw no progress at all. This roll-up re-derives the
// parent's fulfillment_status from its checkout-split children
// whenever a child's fulfillment moves:
//
//   - every non-cancelled child delivered  → 'delivered'
//     ('delivered' is the house terminal fulfillment state — the
//     accrual writer earns on it, the tracking flow lands on it)
//   - some child shipped or delivered      → 'partially_shipped'
//     (no partial state existed in the commerce fulfillment
//     vocabulary; the value follows the house partial pattern —
//     partially_paid / partially_received / partially_redeemed)
//   - otherwise (nothing has shipped yet)   → 'pending'
//
// Cancelled children drop out of the derivation: a cancelled part
// will never ship, so the remaining parts define the order's
// progress. If EVERY child is cancelled there is nothing to roll up
// (order-level cancellation owns the parent). A cancelled parent is
// never touched. The per-child snapshot is stamped into the parent's
// metadata (split_fulfillment_rollup) so the aggregate is auditable.
//
// Every write path that moves an order's fulfillment_status calls
// the Safe wrapper below for the order it just moved: it no-ops for
// any order that is not a checkout-split child (single-seller orders,
// seller-initiated split children, platform orders), and it never
// throws — a roll-up failure must not block a seller's shipment.
// ---------------------------------------------------------------------------

const ROLLUP_DONE = new Set(["delivered"])
const ROLLUP_SHIPPED = new Set(["shipped", "fulfilled", "complete", "completed"])

function normalizeFulfillment(raw: unknown): string {
  const v = String(raw ?? "").trim().toLowerCase()
  if (v === "" || v === "unfulfilled") return "pending"
  return v
}

export interface SplitFulfillmentChild {
  orderId: string
  sellerId: string | null
  fulfillmentStatus: string
}

export type SplitFulfillmentRollupResult =
  | {
      rolled: false
      reason:
        | "order-missing"
        | "not-a-split-child"
        | "parent-missing"
        | "parent-cancelled"
        | "no-active-children"
        | "unchanged"
      parentOrderId?: string
      derived?: string
      children?: SplitFulfillmentChild[]
    }
  | {
      rolled: true
      parentOrderId: string
      derived: string
      previous: string
      children: SplitFulfillmentChild[]
    }

/**
 * The derivation itself, pure: the parent's fulfillment_status from
 * its children's. Returns null when no child is active (all
 * cancelled) — no honest aggregate exists then.
 */
export function deriveSplitParentFulfillment(
  children: { fulfillmentStatus: string }[],
): string | null {
  const active = children
    .map((c) => normalizeFulfillment(c.fulfillmentStatus))
    .filter((s) => s !== "cancelled")
  if (active.length === 0) return null
  if (active.every((s) => ROLLUP_DONE.has(s))) return "delivered"
  if (active.some((s) => ROLLUP_DONE.has(s) || ROLLUP_SHIPPED.has(s))) {
    return "partially_shipped"
  }
  return "pending"
}

/**
 * Recompute the fulfillment roll-up of the checkout-split parent of
 * `orderId` (a child order). No-ops unless the order is a
 * checkout-split child. May throw on database errors — callers use
 * rollupSplitParentFulfillmentSafe.
 */
export async function rollupSplitParentFulfillment(
  q: SellerQueryFn,
  orderId: string,
): Promise<SplitFulfillmentRollupResult> {
  const orderRows = await q(
    `SELECT id::text AS id, metadata
       FROM public.commerce_orders
      WHERE id::text = $1
      LIMIT 1`,
    [orderId],
  )
  const order = orderRows[0]
  if (!order) return { rolled: false, reason: "order-missing" }
  const meta = parseMetadata(order.metadata)
  const parentId = typeof meta.split_from === "string" ? meta.split_from : ""
  if (!parentId || meta.split_by !== "checkout") {
    return { rolled: false, reason: "not-a-split-child" }
  }

  const parentRows = await q(
    `SELECT id::text AS id, fulfillment_status
       FROM public.commerce_orders
      WHERE id::text = $1
      LIMIT 1`,
    [parentId],
  )
  const parent = parentRows[0]
  if (!parent) return { rolled: false, reason: "parent-missing", parentOrderId: parentId }
  const previous = normalizeFulfillment(parent.fulfillment_status)
  if (previous === "cancelled") {
    return { rolled: false, reason: "parent-cancelled", parentOrderId: parentId }
  }

  const childRows = await q(
    `SELECT id::text AS id, fulfillment_status, metadata->>'seller_id' AS seller_id
       FROM public.commerce_orders
      WHERE metadata->>'split_from' = $1
        AND metadata->>'split_by' = 'checkout'
      ORDER BY created_at ASC`,
    [parentId],
  )
  const children: SplitFulfillmentChild[] = childRows.map((r) => ({
    orderId: String(r.id),
    sellerId: r.seller_id ? String(r.seller_id) : null,
    fulfillmentStatus: String(r.fulfillment_status ?? ""),
  }))

  const derived = deriveSplitParentFulfillment(children)
  if (!derived) {
    return { rolled: false, reason: "no-active-children", parentOrderId: parentId, children }
  }
  if (derived === previous) {
    return { rolled: false, reason: "unchanged", parentOrderId: parentId, derived, children }
  }

  await q(
    `UPDATE public.commerce_orders
        SET fulfillment_status = $2,
            metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
            updated_at = now()
      WHERE id::text = $1`,
    [
      parentId,
      derived,
      JSON.stringify({
        split_fulfillment_rollup: {
          at: new Date().toISOString(),
          derived,
          children: children.map((c) => ({
            order_id: c.orderId,
            seller_id: c.sellerId,
            fulfillment_status: normalizeFulfillment(c.fulfillmentStatus),
          })),
        },
      }),
    ],
  )
  return { rolled: true, parentOrderId: parentId, derived, previous, children }
}

/**
 * The failure-isolated form every fulfillment write path calls after
 * moving an order: a roll-up error is logged, never thrown, so it
 * can never block the shipment/acknowledgement/cancellation that
 * triggered it.
 */
export async function rollupSplitParentFulfillmentSafe(
  q: SellerQueryFn,
  orderId: string,
): Promise<void> {
  try {
    await rollupSplitParentFulfillment(q, orderId)
  } catch (e) {
    console.error(
      "[order-split] parent fulfillment roll-up failed (non-fatal):",
      e instanceof Error ? e.message : e,
    )
  }
}

/**
 * Flip a split parent's children to the parent's paid state when the
 * payment lands. The children's fulfillment_status is NOT touched —
 * each seller fulfills their own child. Returns how many children
 * were flipped.
 */
export async function markSplitChildrenPaid(
  q: SellerQueryFn,
  parentOrderId: string,
): Promise<number> {
  const rows = await q(
    `UPDATE public.commerce_orders
        SET status = 'confirmed', payment_status = 'paid', updated_at = now()
      WHERE metadata->>'split_from' = $1
        AND metadata->>'split_by' = 'checkout'
        AND payment_status <> 'paid'
      RETURNING id::text AS id`,
    [parentOrderId],
  )
  return rows.length
}

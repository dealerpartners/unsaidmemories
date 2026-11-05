// ---------------------------------------------------------------------------
// sellers/attribution.ts — THE seller-order attribution writer (tree §5).
//
// The break this closes: every seller order surface reads attribution from
// commerce_orders.metadata->>'seller_id' (orders list, order detail, the
// four order actions, the earnings accrual engine) and the platform's
// designed attribution bridge is the seller_orders row (analytics
// denominators, ship-from scope, the Late page's is_late merge) — and no
// code anywhere WROTE either one, so 0 of the platform's orders carried
// attribution and every seller order surface was permanently empty.
//
// The contract, followed exactly as the readers resolve it:
//   - A product's seller is resolved the way the platform's own item
//     attribution resolves it (the PDP "Sold by" door in
//     lib/sellers/storefront.ts, the admin orders seller search):
//       (a) commerce_catalog_items.metadata->>'seller_id' — the stamp
//           the seller listing writers put on their own items; OR
//       (b) an APPROVED, non-suppressed seller_listings offer on the
//           catalog item — the governed listing the imports
//           canonical-match path creates when a seller attaches to an
//           existing platform product. That path deliberately does NOT
//           stamp the shared catalog item (it is not the seller's own
//           item), so a writer that reads only the stamp can never
//           attribute a matched-attach sale — the resolution gap this
//           leg closes.
//     Either leg attributes only to a seller who exists in
//     public.sellers for the item's tenant with status 'approved'
//     (the PDP door's public-attribution rule, and the join the
//     accrual engine itself requires before it will accrue an order).
//   - A buyer's cart line names products by the ids the storefront sells:
//     the feed product id (erp_products.id, bridged to the catalog item
//     through erp_product_skus) or the catalog item id itself. Resolution
//     follows both bridges.
//   - The readers' contract carries ONE seller per order (a single
//     metadata value; the detail surface returns the order's lines whole).
//     An order whose lines resolve to exactly one seller is stamped. An
//     order with no seller-attributed lines is a platform order and stays
//     unstamped. A MIXED-seller order cannot be represented by the
//     contract and is left unattributed (reported by the caller), rather
//     than mis-stamped to one of its sellers.
//   - seller_orders gets one row per attributed order (insert-if-absent on
//     order_id), with is_late=false — lateness is computed by its own
//     leg; this writer records attribution, not lateness.
//   - The insert is also the NEW-ORDER NOTIFICATION trigger (seller
//     comms layer): the bridge row's creation is the one moment every
//     attributed order passes through exactly once — shop checkout,
//     express checkout, the Stripe webhook's paid backfill, split-order
//     children (each child is its own order with its own bridge row),
//     and admin manual orders all land here, and webhook/checkout
//     retries re-enter with the bridge row already present and insert
//     nothing. When (and only when) this call creates the bridge row,
//     the seller is notified through sellers/notify (event "orders",
//     honoring their preferences) — failure-isolated there, and in a
//     try/catch here, so a notification can never break attribution.
//
// Callers (shop checkout, express checkout, the Stripe webhook's paid
// backfill) failure-isolate this writer: attribution must never break a
// checkout or a webhook.
// ---------------------------------------------------------------------------

/** Minimal query surface every data layer in this app can adapt to. */
export type SellerQueryFn = (
  sql: string,
  params: unknown[],
) => Promise<Record<string, unknown>[]>

export type AttributionResult =
  | { attributed: true; sellerId: string }
  | {
      attributed: false
      reason: "order-missing" | "no-seller" | "mixed"
      sellerIds: string[]
    }

/** The order number every surface derives for a commerce order. */
export function orderNumberFor(orderId: string): string {
  return `ORD-${orderId.replace(/-/g, "").slice(0, 8).toUpperCase()}`
}

/** "$25.00" | 25 → cents. First number only, matching parseMoney's rule. */
export function moneyToCents(v: unknown): number {
  const m = String(v ?? "").match(/\d+(\.\d+)?/)
  if (!m) return 0
  return Math.round(parseFloat(m[0]) * 100)
}

/**
 * The distinct sellers a set of cart product ids belongs to, resolved
 * through both id bridges the storefront sells by.
 */
export async function resolveOrderSellerIds(
  q: SellerQueryFn,
  tenantId: string,
  productIds: string[],
): Promise<string[]> {
  const ids = [...new Set(productIds.map((p) => String(p || "")).filter(Boolean))]
  if (ids.length === 0) return []
  const rows = await q(
    `SELECT DISTINCT seller_id FROM (
       -- (a) The catalog item's own seller stamp (seller-created items).
       SELECT ci.metadata->>'seller_id' AS seller_id
         FROM public.commerce_catalog_items ci
         JOIN public.sellers s
           ON s.id::text = ci.metadata->>'seller_id'
          AND s.tenant_id = ci.tenant_id
          AND s.status = 'approved'
        WHERE ci.tenant_id = $1
          AND COALESCE(ci.metadata->>'seller_id', '') <> ''
          AND ( ci.id::text = ANY($2::text[])
             OR ci.sku_id IN (SELECT es.id FROM public.erp_product_skus es
                               WHERE es.product_id::text = ANY($2::text[])) )
       UNION
       -- (b) The governed listing: an approved, non-suppressed
       -- seller_listings offer on the resolved catalog item (the
       -- imports canonical-match attach — the shared platform item
       -- itself carries no seller stamp by design).
       SELECT sl.seller_id::text AS seller_id
         FROM public.seller_listings sl
         JOIN public.sellers s
           ON s.id = sl.seller_id
          AND s.tenant_id = sl.tenant_id
          AND s.status = 'approved'
         JOIN public.commerce_catalog_items ci ON ci.id = sl.product_id
        WHERE sl.tenant_id = $1
          AND ci.tenant_id = $1
          AND sl.status = 'approved'
          AND COALESCE(sl.suppression_reason, '') = ''
          AND ( ci.id::text = ANY($2::text[])
             OR ci.sku_id IN (SELECT es.id FROM public.erp_product_skus es
                               WHERE es.product_id::text = ANY($2::text[])) )
     ) attributed
     WHERE COALESCE(seller_id, '') <> ''`,
    [tenantId, ids],
  )
  return rows.map((r) => String(r.seller_id || "")).filter(Boolean)
}

/**
 * Stamp one commerce order with its seller attribution — the metadata
 * value the §5 readers and the accrual engine gate on, plus the
 * seller_orders bridge row — when (and only when) the order's lines
 * resolve to exactly one seller. Idempotent: an already-stamped order
 * keeps its stamp and gains its bridge row if it somehow lacks one.
 */
export async function attributeCommerceOrder(
  q: SellerQueryFn,
  args: {
    tenantId: string
    orderId: string
    productIds: string[]
    customerName?: string | null
  },
): Promise<AttributionResult> {
  const orderRows = await q(
    `SELECT metadata, customer_id, customer_email, email, subtotal, total_amount
       FROM public.commerce_orders
      WHERE id::text = $1
      LIMIT 1`,
    [args.orderId],
  )
  const order = orderRows[0]
  if (!order) return { attributed: false, reason: "order-missing", sellerIds: [] }

  let metadata: Record<string, unknown> = {}
  if (typeof order.metadata === "string") {
    try {
      metadata = JSON.parse(order.metadata) as Record<string, unknown>
    } catch {
      metadata = {}
    }
  } else if (order.metadata && typeof order.metadata === "object") {
    metadata = order.metadata as Record<string, unknown>
  }

  let sellerId = String(metadata.seller_id || "")
  if (!sellerId) {
    const sellerIds = await resolveOrderSellerIds(q, args.tenantId, args.productIds)
    if (sellerIds.length === 0) {
      return { attributed: false, reason: "no-seller", sellerIds }
    }
    if (sellerIds.length > 1) {
      return { attributed: false, reason: "mixed", sellerIds }
    }
    sellerId = sellerIds[0]
    await q(
      `UPDATE public.commerce_orders
          SET metadata = COALESCE(metadata, '{}'::jsonb)
                         || jsonb_build_object('seller_id', $2::text),
              updated_at = now()
        WHERE id::text = $1`,
      [args.orderId, sellerId],
    )
  }

  // The designed attribution bridge: one seller_orders row per order.
  // The CTE form reports whether THIS call created the row — the
  // exactly-once signal for the new-order notification below.
  const subtotalCents = moneyToCents(order.subtotal)
  const totalCents = moneyToCents(order.total_amount ?? order.subtotal)
  const bridge = await q(
    `WITH ins AS (
       INSERT INTO public.seller_orders
         (tenant_id, seller_id, order_id, order_number, customer_id,
          customer_name, customer_email, status, subtotal, shipping_cost,
          tax, total, is_late)
       SELECT $1, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7,
              'unshipped', $8, 0, 0, $9, false
        WHERE NOT EXISTS (
          SELECT 1 FROM public.seller_orders WHERE order_id = $3::uuid
        )
       RETURNING order_id
     )
     SELECT count(*)::int AS inserted FROM ins`,
    [
      args.tenantId,
      sellerId,
      args.orderId,
      orderNumberFor(args.orderId),
      order.customer_id ? String(order.customer_id) : null,
      args.customerName || null,
      (order.customer_email as string) || (order.email as string) || null,
      subtotalCents / 100,
      totalCents / 100,
    ],
  )
  const bridgeCreated = Number(bridge[0]?.inserted ?? 0) > 0

  // New-order notification — fires only when this call created the
  // bridge row, so every attributed order notifies its seller exactly
  // once across every entry path and every retry. notifySeller never
  // throws; the try/catch is belt-and-braces so nothing about the
  // comms layer can ever break attribution.
  if (bridgeCreated) {
    try {
      const { notifySeller } = await import("./notify")
      const orderNumber = orderNumberFor(args.orderId)
      await notifySeller({
        tenantId: args.tenantId,
        sellerId,
        event: "orders",
        type: "new_order",
        title: `New order ${orderNumber}`,
        body:
          `A new order was placed for your products` +
          (args.customerName ? ` by ${args.customerName}` : "") +
          ` — total $${(totalCents / 100).toFixed(2)}. It's waiting in your orders inbox.`,
        link: `/seller/orders/${args.orderId}`,
      })
    } catch (e) {
      console.error(
        "[attribution] new-order notification failed:",
        e instanceof Error ? e.message : e,
      )
    }
  }
  return { attributed: true, sellerId }
}

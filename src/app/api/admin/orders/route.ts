import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"

// ============================================================================
// GET /api/admin/orders — admin-gated list of REAL shop orders.
//
// Reads BOTH ledgers with the storefront `orders` row as the purchase
// record: paid storefront orders gain an ERP twin from the Stripe
// webhook (the fulfillment working copy, never the ledger of truth),
// PLUS the commerce_orders manual retail rows, PLUS storefront `orders`
// rows with no ERP twin yet (orphans, flagged, never double-counted
// with their twin). PHANTOM FIX (2026-10-31): erp_orders rows provably
// not real orders — CRM seed rows and TEST-numbered rows — are excluded
// from this view (they stay in the database). Previously this route
// read ONLY commerce_orders, so the tab rendered empty while real
// orders existed. See the merge block in GET below for the mapping
// and the dedupe rule.
// W3e/W6: ERP + storefront items also select design_snapshot — the
// frozen studio canvas JSON (checkout freezes it on order_items, the
// twin copies it to erp_order_lines). It renders READ-ONLY on the tab
// for observability / reprint recovery; suppliers consume the print
// FILES, never this JSON, so it is not part of fulfillment correctness.
// Commerce items carry no design column (designSnapshot: null).
//
// Query params:
//   ?status=pending|processing|shipped|delivered|cancelled  (fulfillment_status)
//   ?payment=paid|unpaid                                    (payment_status)
//   ?q=...          buyer + SKU search: buyer email/name, item name,
//                   item product id, or ERP SKU (Admin Tree C1)
//   ?seller=...     seller search: seller id or display/legal name, matched
//                   through the order items' attribution (seller_listings or
//                   the catalog item's metadata seller_id). Orders carry no
//                   seller column — until items are attributed to a seller
//                   this correctly returns nothing.
//   ?facet=...      C1 oversight facets (see FACETS below): sla_breach|late|stuck
//
// Returns: { orders: [{ id, email, status, paymentStatus, fulfillmentStatus,
//                       subtotal, totalAmount, deliveryMethod, shippingAddress,
//                       trackingNumber, carrier, trackingStatus, notes,
//                       displayStatus, slaDueAt, slaState,
//                       createdAt, items: [{... warehouses}] }],
//            facets: { all, sla_breach, late, stuck },   (tenant-wide counts)
//            counts: { all, unfulfilled, ready, pickup, shipped, delivered } }
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// C1 oversight facets, derived ONLY from the spine's own fields
// (fulfillment_status / status / tracking_status / created_at / updated_at /
// metadata.shipped_at). The 48h clock is the queue's standing convention —
// "unfulfilled orders are due 48h after creation" (original tree §2.1 Order
// Details → SLA, as the orders page header records). Terminal orders
// (delivered / cancelled / refunded) are never in a facet.
//   sla_breach — unfulfilled past the 48h fulfillment due time
//   late       — shipped, carrier has not delivered, 48h past the ship stamp
//   stuck      — non-terminal with no movement (updated_at) for 48h
const TERMINAL = `(upper(o.fulfillment_status) IN ('DELIVERED','CANCELLED') OR upper(o.status) IN ('CANCELLED','REFUNDED'))`
const FACETS: Record<string, string> = {
  sla_breach: `NOT ${TERMINAL} AND upper(o.fulfillment_status) IN ('PENDING','UNFULFILLED','PROCESSING') AND o.created_at < now() - interval '48 hours'`,
  late: `upper(o.fulfillment_status) = 'SHIPPED' AND upper(COALESCE(o.tracking_status,'')) <> 'DELIVERED' AND COALESCE(CASE WHEN o.metadata->>'shipped_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN (o.metadata->>'shipped_at')::timestamptz END, o.updated_at) < now() - interval '48 hours'`,
  stuck: `NOT ${TERMINAL} AND o.updated_at < now() - interval '48 hours'`,
}

// §2.1.2b — the fulfillment SLA, defined once and computed per order in
// the list response: an order is DUE 48h after creation while unfulfilled
// (pending/unfulfilled/processing), and due for delivery 48h after its
// ship stamp once shipped. States: breach (unfulfilled past due), late
// (shipped past due, carrier not delivered), due_soon (due within 12h),
// on_track. Terminal orders carry no SLA. The facet predicates above are
// the same definitions aggregated; sla_state is the per-order form.
const SHIPPED_TS = `COALESCE(CASE WHEN o.metadata->>'shipped_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN (o.metadata->>'shipped_at')::timestamptz END, o.updated_at)`
const UNFULFILLED_CLASS = `upper(o.fulfillment_status) IN ('PENDING','UNFULFILLED','PROCESSING')`
const SLA_DUE_AT = `CASE
  WHEN ${TERMINAL} THEN NULL
  WHEN ${UNFULFILLED_CLASS} THEN o.created_at + interval '48 hours'
  WHEN upper(o.fulfillment_status) = 'SHIPPED' THEN ${SHIPPED_TS} + interval '48 hours'
  ELSE NULL END`
const SLA_STATE = `CASE
  WHEN ${TERMINAL} THEN NULL
  WHEN ${UNFULFILLED_CLASS} AND o.created_at < now() - interval '48 hours' THEN 'breach'
  WHEN upper(o.fulfillment_status) = 'SHIPPED' AND upper(COALESCE(o.tracking_status,'')) <> 'DELIVERED' AND ${SHIPPED_TS} < now() - interval '48 hours' THEN 'late'
  WHEN ${UNFULFILLED_CLASS} AND o.created_at + interval '48 hours' < now() + interval '12 hours' THEN 'due_soon'
  WHEN upper(o.fulfillment_status) = 'SHIPPED' AND ${SHIPPED_TS} + interval '48 hours' < now() + interval '12 hours' THEN 'due_soon'
  WHEN ${UNFULFILLED_CLASS} OR upper(o.fulfillment_status) = 'SHIPPED' THEN 'on_track'
  ELSE NULL END`
// The display bucket the Orders queue groups by — computed server-side
// so the tab/KPI counts (below) and the rows the tabs filter can never
// disagree (audit §2.1.1: the counts were hardcoded numbers in the view
// while the rows came from this API).
const DISPLAY_STATUS = `CASE
  WHEN upper(o.fulfillment_status) = 'DELIVERED' THEN 'DELIVERED'
  WHEN upper(o.fulfillment_status) LIKE '%SHIP%' THEN 'SHIPPED'
  WHEN COALESCE(o.fulfillment_method, '') ILIKE '%pickup%' AND upper(o.status) = 'PAID' THEN 'READY'
  WHEN COALESCE(o.fulfillment_method, '') ILIKE '%pickup%' THEN 'LOCAL_PICKUP'
  ELSE 'UNFULFILLED' END`

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("payments", "read")
  if (gate) return gate

  const tenant = resolveTenantId(req)
  const status = req.nextUrl.searchParams.get("status") || ""
  const payment = req.nextUrl.searchParams.get("payment") || ""
  const q = (req.nextUrl.searchParams.get("q") || "").trim()
  const seller = (req.nextUrl.searchParams.get("seller") || "").trim()
  const facet = (req.nextUrl.searchParams.get("facet") || "").trim()

  const rows = await withPg(async (client) => {
    const params: any[] = [tenant]
    let where = `WHERE o.tenant_id = $1`
    if (status) { params.push(status); where += ` AND o.fulfillment_status = $${params.length}` }
    if (payment) { params.push(payment); where += ` AND o.payment_status = $${params.length}` }
    if (q) {
      params.push(`%${q.replace(/[%_]/g, "")}%`)
      const n = params.length
      where += ` AND (o.email ILIKE $${n} OR o.customer_email ILIKE $${n} OR c.first_name ILIKE $${n} OR c.last_name ILIKE $${n}
        OR EXISTS (SELECT 1 FROM public.commerce_order_items oi
                     LEFT JOIN public.erp_product_skus sk ON sk.product_id::text = oi.product_id::text
                    WHERE oi.order_id::text = o.id::text
                      AND (oi.name ILIKE $${n} OR oi.product_id::text ILIKE $${n} OR sk.sku ILIKE $${n})))`
    }
    if (seller) {
      const clean = seller.replace(/[%_]/g, "")
      params.push(`%${clean}%`)
      const likeN = params.length
      params.push(clean)
      const rawN = params.length
      where += ` AND EXISTS (SELECT 1 FROM public.commerce_order_items oi
                    WHERE oi.order_id::text = o.id::text
                      AND (EXISTS (SELECT 1 FROM public.seller_listings sl
                                    WHERE sl.product_id::text = oi.product_id::text
                                      AND sl.seller_id IN (SELECT s.id FROM public.sellers s
                                                            WHERE s.tenant_id = $1
                                                              AND (s.display_name ILIKE $${likeN} OR s.legal_name ILIKE $${likeN} OR s.id::text = $${rawN})))
                        OR EXISTS (SELECT 1 FROM public.commerce_catalog_items ci
                                    WHERE ci.id::text = oi.product_id::text
                                      AND ci.metadata->>'seller_id' IN (SELECT s.id::text FROM public.sellers s
                                                                          WHERE s.tenant_id = $1
                                                                            AND (s.display_name ILIKE $${likeN} OR s.legal_name ILIKE $${likeN} OR s.id::text = $${rawN})))))`
    }
    if (facet && FACETS[facet]) {
      where += ` AND (${FACETS[facet]})`
    }
    const listRes = await client.query(
      `SELECT
         o.id::text AS id,
         o.email,
         o.customer_email,
         o.customer_id::text AS customer_id,
         o.status,
         o.payment_status,
         o.fulfillment_status,
         o.fulfillment_method,
         o.subtotal,
         o.total_amount,
         o.shipping_address,
         o.notes,
         o.tracking_number,
         o.carrier,
         o.tracking_status,
         o.metadata->>'packed_at' AS packed_at,
         o.metadata->>'seller_id' AS seller_id,
         o.coupon_id::text AS coupon_id,
         o.stripe_checkout_id,
         o.stripe_payment_intent_id,
         o.created_at::text AS created_at,
         o.updated_at::text AS updated_at,
         (${DISPLAY_STATUS}) AS display_status,
         (${SLA_DUE_AT})::text AS sla_due_at,
         (${SLA_STATE}) AS sla_state,
         c.first_name AS customer_first_name,
         c.last_name AS customer_last_name,
         (SELECT count(*)::int FROM public.commerce_order_items WHERE order_id::text = o.id::text) AS item_count
       FROM public.commerce_orders o
       LEFT JOIN public.crm_customers c ON o.customer_id::text = c.id::text
       ${where}
       ORDER BY o.created_at DESC NULLS LAST
       LIMIT 200;`,
      params,
    )

    const ids = listRes.rows.map((r: any) => r.id)
    const itemsByOrder = new Map<string, any[]>()
    if (ids.length > 0) {
      const itemsRes = await client.query(
        `SELECT
           oi.id::text AS id,
           oi.order_id::text AS order_id,
           oi.product_id::text AS product_id,
           oi.name,
           oi.quantity,
           oi.unit_price,
           string_agg(DISTINCT w.name, ', ') AS warehouses
         FROM public.commerce_order_items oi
         LEFT JOIN public.erp_product_skus s ON s.product_id::text = oi.product_id::text
         LEFT JOIN public.erp_inventory_balances b ON b.sku_id = s.id
         LEFT JOIN public.erp_warehouses w ON w.id = b.warehouse_id
         WHERE oi.order_id::text = ANY($1::text[])
         GROUP BY oi.id, oi.order_id, oi.product_id, oi.name, oi.quantity, oi.unit_price`,
        [ids],
      )
      for (const it of itemsRes.rows) {
        const arr = itemsByOrder.get(it.order_id) || []
        arr.push({
          id: it.id,
          productId: it.product_id,
          name: it.name,
          quantity: Number(it.quantity) || 1,
          unitPrice: it.unit_price,
          warehouses: it.warehouses || null,
          // Commerce items carry no design column (the frozen canvas
          // lives on storefront order_items / erp_order_lines) — null
          // keeps the item shape uniform across the merged ledgers.
          designSnapshot: null,
        })
        itemsByOrder.set(it.order_id, arr)
      }
    }


    return listRes.rows.map((r: any) => ({
      id: r.id,
      email: r.email || r.customer_email,
      customerId: r.customer_id,
      customerName: [r.customer_first_name, r.customer_last_name].filter(Boolean).join(" ") || null,
      status: r.status,
      paymentStatus: r.payment_status,
      fulfillmentStatus: r.fulfillment_status,
      fulfillmentMethod: r.fulfillment_method,
      subtotal: r.subtotal,
      totalAmount: r.total_amount,
      shippingAddress: r.shipping_address,
      notes: r.notes,
      trackingNumber: r.tracking_number,
      carrier: r.carrier,
      trackingStatus: r.tracking_status,
      packedAt: r.packed_at || null,
      sellerId: r.seller_id || null,
      couponId: r.coupon_id,
      stripeCheckoutSessionId: r.stripe_checkout_id,
      stripePaymentIntentId: r.stripe_payment_intent_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      displayStatus: r.display_status,
      slaDueAt: r.sla_due_at,
      slaState: r.sla_state,
      itemCount: r.item_count || 0,
      items: itemsByOrder.get(r.id) || [],
    }))
  })

  // ── W6: ERP working copy (additive merge — nothing above removed) ──
  // The tab previously read ONLY commerce_orders (manual retail rows), so
  // it rendered "No orders in this view." while real orders existed.
  // CORRECTION (2026-10-31): the storefront `orders` row is the purchase
  // record; erp_orders is its fulfillment working copy (paid storefront
  // orders gain an ERP twin from the Stripe webhook, lib/orders/twin.ts
  // ensureErpTwin). ERP-only rows with no storefront purchase are NOT
  // ledger rows: seed/test rows are excluded by the WHERE clause below,
  // and the full authority flip (orders spine as the ledger) is still
  // owed as a refactor. This block APPENDS:
  //   (a) every tenant erp_orders row, mapped onto the same shape the tab
  //       already renders, with source='erp' and the ERP detail href
  //       (/admin/orders/[id] — transition/note/push live there, never on
  //       the commerce sub-routes, which must never receive an ERP id);
  //   (b) storefront `orders` rows with NO ERP twin yet (orphans), so a
  //       checkout whose webhook twin has not landed is visible instead
  //       of silently missing — flagged source='storefront'.
  // Twin dedupe: an erp row with source_order_id IS its storefront
  // order's twin, so orphans are defined as storefront rows with NO
  // matching twin — a paid order is never counted twice. The checkout
  // split is therefore reconciled by the sync that already exists
  // (webhook → twin) plus this read-of-both with erp_orders
  // authoritative; no checkout write path is changed here.
  // Other readers of this API (fulfillment queue, seller feed,
  // OrdersView) keep working: the merge only ADDS rows and fields, and
  // ERP rows carry the same 48h slaDueAt/slaState convention so their
  // SLA tiles render too.
  const moneyFmt = (n: unknown) => `$${(Number(n) || 0).toFixed(2)}`
  const ERP_TERMINAL = `upper(e.status) IN ('DELIVERED','CANCELLED','REFUNDED')`
  const ERP_FACETS: Record<string, string> = {
    sla_breach: `NOT ${ERP_TERMINAL} AND upper(e.status) IN ('PENDING','UNFULFILLED','PROCESSING','CONFIRMED','IN_PRODUCTION') AND e.order_date < now() - interval '48 hours'`,
    late: `upper(e.status) = 'SHIPPED' AND e.updated_at < now() - interval '48 hours'`,
    stuck: `NOT ${ERP_TERMINAL} AND e.updated_at < now() - interval '48 hours'`,
  }
  const erpRows = await withPg(async (client) => {
    const params: any[] = [tenant]
    // PHANTOM FIX (2026-10-31): erp_orders is NOT the ledger of truth.
    // The storefront `orders` row is the purchase; erp_orders is the
    // fulfillment working copy (twin). Rows provably not real orders —
    // CRM seed rows (metadata.source = 'crm-seed') and test rows
    // (order_number LIKE 'TEST%') — are excluded from the ledger view.
    // They stay in the database (no-delete rule); they just stop
    // rendering as orders. Unsourced ERP-only rows stay visible pending
    // the authority flip (orders spine as the ledger), which is a
    // refactor, not a WHERE clause.
    let where = `WHERE e.tenant_id = $1 AND COALESCE(e.metadata->>'source', '') <> 'crm-seed' AND e.order_number NOT LIKE 'TEST%'`
    if (status) { params.push(String(status).toUpperCase()); where += ` AND upper(e.status) = $${params.length}` }
    if (q) {
      params.push(`%${q.replace(/[%_]/g, "")}%`)
      const n = params.length
      where += ` AND (e.order_number ILIKE $${n} OR e.customer_email ILIKE $${n})`
    }
    if (facet && ERP_FACETS[facet]) where += ` AND (${ERP_FACETS[facet]})`
    const listRes = await client.query(
      `SELECT e.id::text AS id, e.order_number, e.status, e.fulfillment_method,
              e.total, e.amount_paid, e.customer_email,
              e.crm_customer_id::text AS customer_id, e.notes,
              e.order_date::text AS created_at, e.updated_at::text AS updated_at,
              e.sla_due_at::text AS sla_due_at,
              c.first_name AS customer_first_name, c.last_name AS customer_last_name,
              (SELECT count(*)::int FROM public.erp_order_lines l WHERE l.order_id = e.id) AS item_count
         FROM public.erp_orders e
         LEFT JOIN public.crm_customers c ON e.crm_customer_id = c.id
         ${where}
         ORDER BY e.order_date DESC NULLS LAST
         LIMIT 200;`,
      params,
    )
    const ids = listRes.rows.map((r: any) => r.id)
    const linesByOrder = new Map<string, any[]>()
    const shipByOrder = new Map<string, any>()
    if (ids.length > 0) {
      const linesRes = await client.query(
        `SELECT l.order_id::text AS order_id, l.description, l.quantity, l.unit_price, l.design_snapshot
           FROM public.erp_order_lines l WHERE l.order_id = ANY($1::uuid[]) ORDER BY l.created_at`,
        [ids],
      ).catch(() => ({ rows: [] as any[] }))
      for (const l of linesRes.rows) {
        const arr = linesByOrder.get(l.order_id) || []
        arr.push({ id: null, productId: null, name: l.description || "Item", quantity: Number(l.quantity) || 1, unitPrice: moneyFmt(l.unit_price), warehouses: null, designSnapshot: l.design_snapshot ?? null })
        linesByOrder.set(l.order_id, arr)
      }
      const shipRes = await client.query(
        `SELECT f.order_id::text AS order_id, s.tracking_number, s.carrier
           FROM public.erp_shipments s JOIN public.erp_fulfillment_orders f ON f.id = s.fulfillment_id
          WHERE f.order_id = ANY($1::uuid[]) ORDER BY s.created_at DESC`,
        [ids],
      ).catch(() => ({ rows: [] as any[] }))
      for (const s of shipRes.rows) {
        if (!shipByOrder.has(s.order_id)) shipByOrder.set(s.order_id, s)
      }
    }
    return listRes.rows.map((r: any) => {
      const st = String(r.status || "").toUpperCase()
      const paid = Number(r.amount_paid || 0) >= Number(r.total || 0) && Number(r.total || 0) > 0
      const createdMs = r.created_at ? new Date(r.created_at).getTime() : NaN
      const updatedMs = r.updated_at ? new Date(r.updated_at).getTime() : NaN
      const terminal = ["DELIVERED", "CANCELLED", "REFUNDED"].includes(st)
      let slaDueAt: string | null = r.sla_due_at || null
      let slaState: string | null = null
      if (!terminal && Number.isFinite(createdMs)) {
        const base = st === "SHIPPED" ? (Number.isFinite(updatedMs) ? updatedMs : createdMs) : createdMs
        const due = base + 48 * 3600 * 1000
        if (!slaDueAt) slaDueAt = new Date(due).toISOString()
        if (Date.now() > due) slaState = st === "SHIPPED" ? "late" : "breach"
        else if (due - Date.now() < 12 * 3600 * 1000) slaState = "due_soon"
        else slaState = "on_track"
      }
      const ship = shipByOrder.get(r.id)
      const displayStatus = st === "DELIVERED" ? "DELIVERED"
        : st.includes("SHIP") ? "SHIPPED"
        : st === "READY_TO_SHIP" ? "READY"
        : (String(r.fulfillment_method || "").toLowerCase().includes("pickup") ? "LOCAL_PICKUP" : "UNFULFILLED")
      return {
        id: r.id,
        source: "erp",
        orderNumber: r.order_number,
        detailHref: `/admin/orders/${r.id}`,
        email: r.customer_email,
        customerId: r.customer_id,
        customerName: [r.customer_first_name, r.customer_last_name].filter(Boolean).join(" ") || null,
        status: r.status,
        paymentStatus: paid ? "paid" : "unpaid",
        fulfillmentStatus: r.status,
        fulfillmentMethod: r.fulfillment_method,
        subtotal: moneyFmt(r.total),
        totalAmount: moneyFmt(r.total),
        shippingAddress: null,
        notes: r.notes,
        trackingNumber: ship?.tracking_number || null,
        carrier: ship?.carrier || null,
        trackingStatus: null,
        packedAt: null,
        sellerId: null,
        couponId: null,
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        displayStatus,
        slaDueAt,
        slaState,
        itemCount: r.item_count || 0,
        items: linesByOrder.get(r.id) || [],
      }
    })
  }).catch(() => [] as any[]) ?? []

  // Storefront orphans: `orders` rows with no ERP twin. Skipped under a
  // facet filter (orphans carry no ERP facet state) and under a commerce
  // status filter (their status vocabulary — paid/pending_payment/
  // refunded — is not the commerce fulfillment vocabulary).
  const orphanRows = await withPg(async (client) => {
    if (facet || status) return [] as any[]
    const params: any[] = [tenant]
    let where = `WHERE o.tenant_id = $1 AND NOT EXISTS (SELECT 1 FROM public.erp_orders e WHERE e.source_order_id = o.id::text)`
    if (q) {
      params.push(`%${q.replace(/[%_]/g, "")}%`)
      const n = params.length
      where += ` AND (o.shipping_address::text ILIKE $${n} OR EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id AND oi.name ILIKE $${n}))`
    }
    const listRes = await client.query(
      `SELECT o.id::text AS id, o.status, o.total, o.shipping_method, o.shipping_address,
              o.created_at::text AS created_at,
              (SELECT count(*)::int FROM public.order_items oi WHERE oi.order_id = o.id) AS item_count
         FROM public.orders o ${where} ORDER BY o.created_at DESC NULLS LAST LIMIT 200;`,
      params,
    ).catch(() => ({ rows: [] as any[] }))
    const ids = listRes.rows.map((r: any) => r.id)
    const itemsByOrder = new Map<string, any[]>()
    if (ids.length > 0) {
      const itemsRes = await client.query(
        `SELECT oi.order_id::text AS order_id, oi.name, oi.quantity, oi.unit_price, oi.design_snapshot
           FROM public.order_items oi WHERE oi.order_id = ANY($1::uuid[]) ORDER BY oi.created_at`,
        [ids],
      ).catch(() => ({ rows: [] as any[] }))
      for (const it of itemsRes.rows) {
        const arr = itemsByOrder.get(it.order_id) || []
        arr.push({ id: null, productId: null, name: it.name || "Item", quantity: Number(it.quantity) || 1, unitPrice: moneyFmt(it.unit_price), warehouses: null, designSnapshot: it.design_snapshot ?? null })
        itemsByOrder.set(it.order_id, arr)
      }
    }
    return listRes.rows.map((r: any) => {
      let email: string | null = null
      const raw = r.shipping_address
      try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw
        if (obj && typeof obj.email === "string") email = obj.email
      } catch { /* shipping_address is not JSON — no email to show */ }
      const st = String(r.status || "")
      return {
        id: r.id,
        source: "storefront",
        orderNumber: null,
        detailHref: "/admin/ecommerce/orders",
        email,
        customerId: null,
        customerName: null,
        status: st,
        paymentStatus: st,
        fulfillmentStatus: st === "paid" || st === "pending_payment" ? "pending" : st,
        fulfillmentMethod: r.shipping_method,
        subtotal: moneyFmt(r.total),
        totalAmount: moneyFmt(r.total),
        shippingAddress: typeof raw === "string" ? raw : null,
        notes: null,
        trackingNumber: null,
        carrier: null,
        trackingStatus: null,
        packedAt: null,
        sellerId: null,
        couponId: null,
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
        createdAt: r.created_at,
        updatedAt: r.created_at,
        displayStatus: "UNFULFILLED",
        slaDueAt: null,
        slaState: null,
        itemCount: r.item_count || 0,
        items: itemsByOrder.get(r.id) || [],
      }
    })
  }).catch(() => [] as any[]) ?? []

  const commerceRows = (rows || []).map((r: any) => ({ ...r, source: "commerce", orderNumber: null, detailHref: `/admin/order-details?id=${r.id}` }))
  const allRows = [...erpRows, ...commerceRows, ...orphanRows]
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
  const sources = { erp: erpRows.length, commerce: commerceRows.length, storefront: orphanRows.length }

  // C1 facet counts over the tenant's WHOLE order population (independent
  // of the filters above) so the queue tabs carry real numbers.
  const facets = await withPg(async (client) => {
    const r = await client.query(
      `SELECT count(*)::int AS all_count,
              count(*) FILTER (WHERE ${FACETS.sla_breach})::int AS sla_breach,
              count(*) FILTER (WHERE ${FACETS.late})::int AS late,
              count(*) FILTER (WHERE ${FACETS.stuck})::int AS stuck
         FROM public.commerce_orders o
        WHERE o.tenant_id = $1`,
      [tenant],
    ).catch(() => ({ rows: [] as any[] }))
    const row = r.rows[0] || {}
    return {
      all: row.all_count ?? 0,
      sla_breach: row.sla_breach ?? 0,
      late: row.late ?? 0,
      stuck: row.stuck ?? 0,
    }
  }) ?? { all: 0, sla_breach: 0, late: 0, stuck: 0 }
  // W6: facet counts are merged across BOTH ledgers so the oversight
  // pills match the merged rows above (commerce facets + ERP facets;
  // storefront orphans carry no facet state and are excluded here, as
  // they are from the facet-filtered row query).
  const erpFacets = await withPg(async (client) => {
    const r = await client.query(
      `SELECT count(*)::int AS all_count,
              count(*) FILTER (WHERE ${ERP_FACETS.sla_breach})::int AS sla_breach,
              count(*) FILTER (WHERE ${ERP_FACETS.late})::int AS late,
              count(*) FILTER (WHERE ${ERP_FACETS.stuck})::int AS stuck
         FROM public.erp_orders e
        WHERE e.tenant_id = $1 AND COALESCE(e.metadata->>'source', '') <> 'crm-seed' AND e.order_number NOT LIKE 'TEST%'`,
      [tenant],
    ).catch(() => ({ rows: [] as any[] }))
    const row = r.rows[0] || {}
    return {
      all: row.all_count ?? 0,
      sla_breach: row.sla_breach ?? 0,
      late: row.late ?? 0,
      stuck: row.stuck ?? 0,
    }
  }).catch(() => ({ all: 0, sla_breach: 0, late: 0, stuck: 0 })) ?? { all: 0, sla_breach: 0, late: 0, stuck: 0 }
  const mergedFacets = {
    all: facets.all + erpFacets.all,
    sla_breach: facets.sla_breach + erpFacets.sla_breach,
    late: facets.late + erpFacets.late,
    stuck: facets.stuck + erpFacets.stuck,
  }

  // W6: queue bucket counts over the MERGED population the tab renders
  // (ERP display statuses + commerce display statuses + orphans as
  // unfulfilled), so the KPI tiles can never disagree with the rows.
  const counts = {
    all: allRows.length,
    unfulfilled: allRows.filter((o: any) => o.displayStatus === "UNFULFILLED").length,
    ready: allRows.filter((o: any) => o.displayStatus === "READY" || o.displayStatus === "LOCAL_PICKUP").length,
    pickup: allRows.filter((o: any) => String(o.fulfillmentMethod || "").toLowerCase().includes("pickup")).length,
    shipped: allRows.filter((o: any) => o.displayStatus === "SHIPPED").length,
    delivered: allRows.filter((o: any) => o.displayStatus === "DELIVERED").length,
  }

  return NextResponse.json({ orders: allRows, facets: mergedFacets, counts, sources })
}

// ============================================================================
// POST /api/admin/orders — Create a manual retail order.
// Body: { customer_email, notes?, line_items: [{ name, quantity, unit_price,
//          product_id? | catalog_item_id? }] }
// A line that names a catalog product is stored with that product id and
// takes part in seller attribution (below); a free-text line stays a
// platform line with product_id NULL, as before.
// ============================================================================

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("orders", "write");
  if (gate) return gate;

  const tenant = resolveTenantId(req);
  const body = await req.json();
  const email = String(body.customer_email || "").trim();
  const notes = String(body.notes || "");
  const lineItems: Array<{ name: string; quantity: number; unit_price: number; product_id?: string; catalog_item_id?: string }> = body.line_items || [];

  if (!email || lineItems.length === 0) {
    return NextResponse.json({ error: "customer_email and line_items are required" }, { status: 400 });
  }

  const subtotal = lineItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const productIds: string[] = [];

  const orderId = await withPg(async (client) => {
    // Find or create customer by email
    let customerId: string | null = null;
    const { rows: cust } = await client.query(
      `SELECT id::text AS id FROM public.crm_customers WHERE lower(email) = lower($1) AND tenant_id = $2 LIMIT 1`,
      [email, tenant]
    );
    if (cust.length) {
      customerId = cust[0].id;
    } else {
      // W7-proven: customer_type, country, lifecycle_stage are all NOT
      // NULL with no defaults, so a bare (tenant_id, email, first_name)
      // insert dies 23502. 'Retail' / 'US' / 'new_customer' match the
      // conventions already on live rows. W6 correction to W7's count:
      // a FOURTH column, lifecycle_status, is also NOT NULL with no
      // default — the triple alone still 23502s on it (proven live
      // 2026-10-31). 'active' is the dominant live value (17 rows).
      const { rows: nc } = await client.query(
        `INSERT INTO public.crm_customers (tenant_id, email, first_name, customer_type, country, lifecycle_stage, lifecycle_status, created_at)
         VALUES ($1, $2, $3, 'Retail', 'US', 'new_customer', 'active', now()) RETURNING id::text AS id`,
        [tenant, email, email.split("@")[0]]
      );
      customerId = nc[0]?.id || null;
    }
    // W7-proven silent failure: withPg returns null (not a throw) on ANY
    // query failure, and the old code returned { ok: true, orderId: null }
    // for it — no customer, no order, reported as success. Fail loudly
    // inside the callback instead so the caller gets a 500 (below).
    if (!customerId) throw new Error("customer lookup/creation returned no id");

    // Create order. commerce_orders.id is TEXT, NOT NULL, with NO default —
    // the old insert omitted it and died 23502 on every call. Money is
    // TEXT in the "$25.27" format the rest of the orders system reads.
    const oid = crypto.randomUUID();
    const money = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
    await client.query(
      `INSERT INTO public.commerce_orders
         (id, tenant_id, customer_id, customer_email, email, subtotal, total_amount,
          status, payment_status, fulfillment_status, fulfillment_method, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4, $5, $5, 'pending', 'unpaid', 'pending', 'in_store', $6, now(), now())`,
      [oid, tenant, customerId, email, money(subtotal), notes]
    );

    // Create line items with the table's real columns (id, tenant_id,
    // order_id TEXT, product_id, name, quantity, unit_price TEXT). The old
    // insert named total_price / metadata columns that do not exist.
    for (const li of lineItems) {
      const qty = Number(li.quantity) || 0;
      const up = Number(li.unit_price) || 0;
      if (qty <= 0) continue;
      const productId = li.catalog_item_id || li.product_id || null;
      if (productId) productIds.push(String(productId));
      await client.query(
        `INSERT INTO public.commerce_order_items
           (id, tenant_id, order_id, product_id, name, quantity, unit_price, created_at)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, now())`,
        [tenant, oid, productId ? String(productId) : null, String(li.name || "Item"), qty, money(up)]
      );
    }

    return oid;
  });

  // W7: withPg returns null on failure — never report that as success.
  if (!orderId) {
    return NextResponse.json({ error: "Order could not be created — the database write failed. No customer or order was created." }, { status: 500 });
  }

  // Seller attribution (tree §5) — same writer and contract as shop
  // checkout: when the order's product lines resolve to exactly one
  // approved seller, stamp the order (metadata.seller_id + the
  // seller_orders bridge row) so a manually entered sale still surfaces
  // on that seller's portal. Free-text-only orders carry no product ids
  // and stay platform orders. Runs after the create transaction commits
  // and is failure-isolated: attribution never fails order creation. The
  // strict adapter is deliberate (see shop/checkout): the lenient query
  // helper swallows errors into [], which inside the writer reads as
  // "no seller" and would hide a real failure.
  let attribution: { attributed: boolean; sellerId: string | null } = { attributed: false, sellerId: null };
  if (productIds.length > 0) {
    try {
      const { attributeCommerceOrder } = await import("@/lib/sellers/attribution");
      const { pgQueryStrict } = await import("@/lib/pg");
      const attr = await attributeCommerceOrder(
        (sql, params) => pgQueryStrict<Record<string, unknown>>(sql, params),
        { tenantId: tenant, orderId: String(orderId), productIds, customerName: null },
      );
      if (attr.attributed) {
        attribution = { attributed: true, sellerId: attr.sellerId };
      } else if (attr.reason === "mixed") {
        console.error("[admin/orders] manual order spans multiple sellers — the readers' contract carries one seller per order; left unattributed:", orderId);
      }
    } catch (e: any) {
      console.error("[admin/orders] seller attribution failed:", e?.message);
    }
  }

  return NextResponse.json({ ok: true, orderId, subtotal, attribution });
}

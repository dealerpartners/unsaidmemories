import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { withPg, TENANT_ID } from "@/lib/crm/enterprise"
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/portal-auth"
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit"
import { sellerSectionGuard } from "@/lib/sellers/api-context";

export const dynamic = "force-dynamic"

export async function authedSeller(c: any, tenant: string, email: string) {
  const r = await c.query(
    `SELECT id FROM public.sellers WHERE tenant_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1`,
    [tenant, email]
  )
  return r.rows[0]?.id ? String(r.rows[0].id) : null
}

export async function authedEmail(): Promise<string | null> {
  const store = await cookies()
  const payload = verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value)
  return payload ? ((payload as any).email || "") : null
}

// Probe whether a table exists, and if so pull the seller's rows using
// whatever scoping column the table actually has (seller_id or metadata).
// Tables that don't exist — or can't be scoped to this seller — come back
// as empty arrays so pages render honest empty states, never fake data.
export async function sellerScopedRows(
  c: any,
  table: string,
  sellerId: string,
  orderBy = "created_at DESC"
): Promise<{ exists: boolean; rows: any[] }> {
  const t = await c.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
    [table]
  )
  if (!t.rows.length) return { exists: false, rows: [] }
  const cols = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    [table]
  )
  const names = new Set(cols.rows.map((r: any) => r.column_name))
  const hasCreatedAt = names.has("created_at")
  let where = ""
  const params: any[] = []
  if (names.has("seller_id")) {
    where = "WHERE seller_id::text = $1"
    params.push(sellerId)
  } else if (names.has("metadata")) {
    where = "WHERE metadata->>'seller_id' = $1"
    params.push(sellerId)
  } else {
    // No seller scoping available — refuse to leak other sellers' rows.
    return { exists: true, rows: [] }
  }
  const order = hasCreatedAt ? `ORDER BY ${orderBy}` : ""
  const { rows } = await c.query(`SELECT * FROM public.${table} ${where} ${order} LIMIT 100`, params)
  return { exists: true, rows }
}

// commerce_refunds has NO seller_id and NO metadata column (verified
// live, 2026-10-23 census), so the generic probe above can never scope
// it and silently returned [] — platform-issued refunds never reached
// the seller's Refunds surface. A commerce refund belongs to a seller
// through its keys: its sale (commerce_sales.metadata.seller_id) or
// its RMA's order (erp_return_authorizations.order_id →
// commerce_orders.metadata.seller_id). Scope on exactly those.
export async function sellerCommerceRefunds(
  c: any,
  tenant: string,
  sellerId: string
): Promise<{ exists: boolean; rows: any[] }> {
  const { rows } = await c.query(
    `SELECT f.* FROM public.commerce_refunds f
      WHERE f.tenant_id = $2
        AND (
          EXISTS (SELECT 1 FROM public.commerce_sales s
                   WHERE s.id = f.sale_id AND s.metadata->>'seller_id' = $1)
          OR EXISTS (SELECT 1 FROM public.erp_return_authorizations a
                       JOIN public.commerce_orders o ON o.id::text = a.order_id::text
                      WHERE a.id = f.rma_id AND o.metadata->>'seller_id' = $1)
        )
      ORDER BY f.created_at DESC LIMIT 100`,
    [sellerId, tenant]
  )
  return { exists: true, rows }
}

// GET /api/seller/returns — return requests, rules, refunds, disputes.
// The designed stores are the seller_* tables (seller_return_requests,
// seller_return_rules, seller_refunds, seller_disputes); the generic
// names the original feature tree's diagram used (return_requests,
// return_rules, refunds, disputes) do not exist in the live schema —
// this route read them and so read nothing. Commerce refunds the
// platform issued against the seller's orders merge in alongside the
// seller's own refund record.
//
// Requests come from TWO legs (see /api/admin/returns census): the
// seller leg (seller_return_requests) and the CUSTOMER-filed leg
// (customer_return_requests — the store customers actually file into,
// carrying seller_id, the 12-state lifecycle CHECK, seller_response /
// seller_read_at columns designed for the seller's answer). Reading
// only the seller leg meant the Requests surface was permanently empty
// no matter what customers filed, so both legs are served here, each
// row tagged with its `source` so actions write back to the right
// store.
export async function GET(req: NextRequest) {
  const denied = await sellerSectionGuard("returns");
  if (denied) return denied;
  try {
    const email = await authedEmail()
    if (!email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    const tenant = TENANT_ID()

    const out = await withPg(async (c) => {
      const sellerId = await authedSeller(c, tenant, email)
      if (!sellerId) return { error: "Seller not found", status: 404 }

      const [sellerRequests, customerRequests, rules, refunds, commerceRefunds, disputes] = await Promise.all([
        sellerScopedRows(c, "seller_return_requests", sellerId),
        sellerScopedRows(c, "customer_return_requests", sellerId),
        sellerScopedRows(c, "seller_return_rules", sellerId),
        sellerScopedRows(c, "seller_refunds", sellerId),
        sellerCommerceRefunds(c, tenant, sellerId),
        sellerScopedRows(c, "seller_disputes", sellerId),
      ])
      const requests = [
        ...sellerRequests.rows.map((r: any) => ({ ...r, source: "seller" as const })),
        ...customerRequests.rows.map((r: any) => ({
          ...r,
          source: "customer" as const,
          // The customer leg names its reason `reason_code` and carries
          // the item the seller needs to see — surface both in the
          // shared row shape the requests table renders.
          reason: r.reason ?? r.reason_code ?? null,
        })),
      ].sort((a: any, b: any) =>
        String(b.created_at || "").localeCompare(String(a.created_at || "")),
      )
      const allRefunds = [...refunds.rows, ...commerceRefunds.rows]
      // A rule's name lives in its conditions (seller_return_rules has
      // no name column) — surface it at the top level so the rules
      // surface renders the name the seller gave the rule.
      const shapedRules = rules.rows.map((r: any) => {
        const cond =
          r && typeof r.conditions === "object" && r.conditions !== null ? r.conditions : {}
        return { ...r, name: r.name ?? (cond as any).name ?? null }
      })
      // F.9: the seller's return-policy exemption requests (filed into
      // seller_appeals with appeal_type 'return_policy_exemption' —
      // the same store governance appeals use, decided by the platform).
      let exemptionRequests: any[] = []
      try {
        const er = await c.query(
          `SELECT id, status, appeal_text, decision, created_at
             FROM public.seller_appeals
            WHERE seller_id = $1::uuid AND tenant_id = $2
              AND appeal_type = 'return_policy_exemption'
            ORDER BY created_at DESC LIMIT 50`,
          [sellerId, tenant],
        )
        exemptionRequests = er.rows
      } catch {
        exemptionRequests = []
      }
      return {
        requests,
        rules: shapedRules,
        refunds: allRefunds,
        disputes: disputes.rows,
        exemption_requests: exemptionRequests,
        tables: {
          seller_return_requests: sellerRequests.exists,
          customer_return_requests: customerRequests.exists,
          seller_return_rules: rules.exists,
          refunds: refunds.exists || commerceRefunds.exists,
          seller_disputes: disputes.exists,
        },
      }
    })

    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    if ((out as any).error)
      return NextResponse.json({ error: (out as any).error }, { status: (out as any).status || 500 })
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load returns" },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// POST kind:"refund" — issue a refund for one of the seller's returns.
// Follows the house payments pattern (/api/admin/refunds): a refund to
// the original payment method is EXECUTED through Stripe
// (stripe.refunds.create against the order's payment intent) and only
// then recorded; where the order carries no Stripe payment intent the
// seller may instead record a manual / store-credit refund they have
// made outside Stripe — recorded as exactly that in seller_refunds'
// refund_type + notes, never dressed up as a Stripe refund. When Stripe
// is not configured on the platform at all, an original-payment refund
// cannot be executed from here and the route says so (owner-gated: the
// platform's Stripe key is an admin setting) instead of faking success.
// The money record also lands in commerce_refunds — the ledger the
// admin refunds face reads — with the Stripe refund id as its
// processor reference when Stripe executed it.
// ---------------------------------------------------------------------------
async function issueRefund(req: NextRequest, body: any, tenant: string, email: string) {
  const fail = (error: string, status: number, extra?: Record<string, unknown>) =>
    NextResponse.json({ error, ...extra }, { status })

  // Phase 1 — resolve the request + order under the seller's scope.
  const resolved = await withPg(async (c) => {
    const sellerId = await authedSeller(c, tenant, email)
    if (!sellerId) return { error: "Seller not found", status: 404 as const }

    const source = body.source === "customer" ? "customer" : body.source === "seller" ? "seller" : null
    const requestId = typeof body.request_id === "string" && body.request_id ? body.request_id : null
    let request: any = null
    let bridgeId: string | null = null // seller_orders.id (FK target for seller_refunds.order_id)
    let commerceOrderId: string | null =
      typeof body.order_id === "string" && body.order_id ? body.order_id : null

    if (requestId && source === "customer") {
      const r = await c.query(
        `SELECT * FROM public.customer_return_requests
          WHERE id = $1::uuid AND seller_id = $2::uuid LIMIT 1`,
        [requestId, sellerId],
      )
      request = r.rows[0] || null
      if (!request) return { error: "Return request not found", status: 404 as const }
      if (["refunded", "rejected", "completed", "cancelled"].includes(String(request.status))) {
        return { error: `This request is already ${String(request.status).replace(/_/g, " ")} — it can't be refunded again.`, status: 409 as const }
      }
      commerceOrderId = request.order_id ? String(request.order_id) : commerceOrderId
    } else if (requestId && source === "seller") {
      const r = await c.query(
        `SELECT * FROM public.seller_return_requests
          WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $3 LIMIT 1`,
        [requestId, sellerId, tenant],
      )
      request = r.rows[0] || null
      if (!request) return { error: "Return request not found", status: 404 as const }
      if (["refunded", "rejected", "completed", "cancelled"].includes(String(request.status))) {
        return { error: `This request is already ${String(request.status).replace(/_/g, " ")} — it can't be refunded again.`, status: 409 as const }
      }
      // seller_return_requests.order_id is the seller_orders bridge id;
      // the bridge row names the commerce order.
      if (request.order_id) {
        const b = await c.query(
          `SELECT id, order_id::text AS commerce_id FROM public.seller_orders
            WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $3 LIMIT 1`,
          [String(request.order_id), sellerId, tenant],
        )
        bridgeId = b.rows[0]?.id ? String(b.rows[0].id) : null
        commerceOrderId = b.rows[0]?.commerce_id || commerceOrderId
      }
    }

    let order: any = null
    if (commerceOrderId) {
      const o = await c.query(
        `SELECT id, stripe_payment_intent_id, payment_status, total_amount, subtotal
           FROM public.commerce_orders WHERE id::text = $1 LIMIT 1`,
        [commerceOrderId],
      )
      order = o.rows[0] || null
      // Scope: the order must be this seller's — via its attribution
      // stamp, via the bridge, or via the seller-scoped request itself.
      if (order && !request) {
        const s = await c.query(
          `SELECT 1 FROM public.commerce_orders WHERE id::text = $1 AND metadata->>'seller_id' = $2 LIMIT 1`,
          [commerceOrderId, sellerId],
        )
        if (!s.rows.length) return { error: "Order not found", status: 404 as const }
      }
      if (!bridgeId) {
        const b = await c.query(
          `SELECT id FROM public.seller_orders
            WHERE order_id::text = $1 AND seller_id = $2::uuid AND tenant_id = $3 LIMIT 1`,
          [commerceOrderId, sellerId, tenant],
        )
        bridgeId = b.rows[0]?.id ? String(b.rows[0].id) : null
      }
    }
    return { sellerId, request, source, requestId, order, bridgeId, commerceOrderId }
  })
  if (!resolved) return fail("Database unavailable", 503)
  if ((resolved as any).error) return fail((resolved as any).error, (resolved as any).status)
  const { sellerId, request, source, requestId, order, bridgeId, commerceOrderId } = resolved as any

  const moneyOf = (v: unknown) => {
    const m = String(v ?? "").match(/[0-9]+(?:\.[0-9]+)?/)
    return m ? Number(m[0]) : 0
  }
  const orderTotal = order ? moneyOf(order.total_amount) || moneyOf(order.subtotal) : 0
  const amount = Number(body.amount)
  const refundAmount = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : orderTotal
  if (!(refundAmount > 0)) {
    return fail("A refund amount is required — enter the amount you're refunding.", 400)
  }
  if (orderTotal > 0 && refundAmount > orderTotal + 0.001) {
    return fail(`The refund can't exceed the order total ($${orderTotal.toFixed(2)}).`, 400)
  }
  const method =
    body.refund_type === "manual" || body.refund_type === "store_credit"
      ? String(body.refund_type)
      : "original_payment"
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : ""

  // Phase 2 — execute the money movement when it's a Stripe refund.
  let stripeRefundId: string | null = null
  if (method === "original_payment") {
    if (!order?.stripe_payment_intent_id) {
      return fail(
        "This order has no Stripe payment to refund to — it wasn't paid through Stripe. If you've already returned the money another way, record it as a manual refund instead.",
        409,
      )
    }
    const { getStripe } = await import("@/lib/stripe")
    const stripe = getStripe()
    if (!stripe) {
      return fail(
        "Stripe is not configured on the platform, so a refund to the original payment method can't be executed from here. This is an owner-side setting (Admin → Settings → Payments). Record a manual refund instead if you've already sent the money back.",
        503,
        { owner_gated: true },
      )
    }
    try {
      const refund = await stripe.refunds.create({
        payment_intent: String(order.stripe_payment_intent_id),
        amount: Math.round(refundAmount * 100),
        reason: "requested_by_customer",
      })
      stripeRefundId = refund.id
    } catch (e) {
      return fail(
        `Stripe could not execute this refund: ${e instanceof Error ? e.message : "unknown error"}. Nothing was recorded.`,
        502,
      )
    }
  }

  // Phase 3 — record the refund + advance the request. seller_refunds is
  // the seller leg's money record; commerce_refunds is the platform
  // ledger the admin refunds face reads. The request moves to
  // 'refunded' (a state both legs' lifecycles carry).
  const recorded = await withPg(async (c) => {
    const notes =
      method === "original_payment"
        ? `Stripe refund ${stripeRefundId} executed from the seller portal.${reason ? ` ${reason}` : ""}`
        : method === "store_credit"
          ? `Store credit issued by the seller from the returns desk.${reason ? ` ${reason}` : ""}`
          : `Manual refund recorded by the seller (money returned outside Stripe).${reason ? ` ${reason}` : ""}`
    const ins = await c.query(
      `INSERT INTO public.seller_refunds
         (tenant_id, seller_id, return_id, order_id, amount, refund_type, status, notes)
       VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6, 'completed', $7)
       RETURNING id, amount, refund_type, status, created_at`,
      [
        tenant,
        sellerId,
        source === "seller" && requestId ? requestId : null,
        bridgeId,
        refundAmount,
        method,
        notes,
      ],
    )
    const refundRow = ins.rows[0]
    await c.query(
      `INSERT INTO public.commerce_refunds
         (tenant_id, refund_number, amount, reason, status, processor_reference, refund_method, processed_at)
       VALUES ($1, $2, $3, $4, 'completed', $5, $6, now())`,
      [
        tenant,
        `RFN-${Date.now().toString(36).toUpperCase()}`,
        refundAmount,
        reason || "requested_by_customer",
        stripeRefundId,
        method === "original_payment" ? "original_payment" : method,
      ],
    ).catch((e: Error) => console.error("[seller/returns refund] commerce_refunds ledger insert failed (non-fatal):", e.message))

    if (requestId && source === "customer") {
      await c.query(
        `UPDATE public.customer_return_requests
            SET status = 'refunded', seller_response = COALESCE(NULLIF($3, ''), seller_response),
                handled_by = 'seller', updated_at = now()
          WHERE id = $1::uuid AND seller_id = $2::uuid`,
        [requestId, sellerId, reason],
      )
    } else if (requestId && source === "seller") {
      await c.query(
        `UPDATE public.seller_return_requests
            SET status = 'refunded', updated_at = now()
          WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $3`,
        [requestId, sellerId, tenant],
      )
    }

    await writeSellerAudit(c, {
      tenantId: tenant,
      sellerId,
      actorType: "seller",
      action: "return_refund.issued",
      entityType: "seller_refund",
      entityId: String(refundRow.id),
      afterState: { amount: refundAmount, method, stripe_refund: stripeRefundId, request_id: requestId, order_id: commerceOrderId },
      ipAddress: requestIp(req),
    })
    return { ok: true, refund: refundRow, stripe_refund_id: stripeRefundId, method }
  })
  if (!recorded) return fail("Database unavailable", 503)
  return NextResponse.json(recorded)
}

// ---------------------------------------------------------------------------
// POST kind:"adjustment" — F.5: issue a price adjustment on a return (or
// directly on one of the seller's orders): a partial money correction
// that is NOT a return refund — e.g. the customer keeps a damaged item
// for a partial credit, or a shipping overcharge is corrected. The money
// movement follows the refund path exactly (a real Stripe refund of the
// adjustment amount against the order's payment intent for
// original_payment, with the same owner gate; an honestly-labelled
// manual / store-credit record otherwise), but it is RECORDED as an
// adjustment (seller_refunds.refund_type = 'adjustment', the method in
// its notes) and it never advances the return request's lifecycle —
// the request stays exactly where it was.
// ---------------------------------------------------------------------------
async function issueAdjustment(req: NextRequest, body: any, tenant: string, email: string) {
  const fail = (error: string, status: number, extra?: Record<string, unknown>) =>
    NextResponse.json({ error, ...extra }, { status })

  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return fail("An adjustment amount is required — enter how much you're adjusting by.", 400)
  }
  const adjustmentAmount = Math.round(amount * 100) / 100
  const method =
    body.refund_type === "manual" || body.refund_type === "store_credit"
      ? String(body.refund_type)
      : "original_payment"
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : ""

  const resolved = await withPg(async (c) => {
    const sellerId = await authedSeller(c, tenant, email)
    if (!sellerId) return { error: "Seller not found", status: 404 as const }
    const source = body.source === "customer" ? "customer" : body.source === "seller" ? "seller" : null
    const requestId = typeof body.request_id === "string" && body.request_id ? body.request_id : null
    let request: any = null
    let bridgeId: string | null = null
    let commerceOrderId: string | null =
      typeof body.order_id === "string" && body.order_id ? body.order_id : null

    if (requestId && source === "customer") {
      const r = await c.query(
        `SELECT * FROM public.customer_return_requests WHERE id = $1::uuid AND seller_id = $2::uuid LIMIT 1`,
        [requestId, sellerId],
      )
      request = r.rows[0] || null
      if (!request) return { error: "Return request not found", status: 404 as const }
      commerceOrderId = request.order_id ? String(request.order_id) : commerceOrderId
    } else if (requestId && source === "seller") {
      const r = await c.query(
        `SELECT * FROM public.seller_return_requests WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $3 LIMIT 1`,
        [requestId, sellerId, tenant],
      )
      request = r.rows[0] || null
      if (!request) return { error: "Return request not found", status: 404 as const }
      if (request.order_id) {
        const b = await c.query(
          `SELECT id, order_id::text AS commerce_id FROM public.seller_orders
            WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $3 LIMIT 1`,
          [String(request.order_id), sellerId, tenant],
        )
        bridgeId = b.rows[0]?.id ? String(b.rows[0].id) : null
        commerceOrderId = b.rows[0]?.commerce_id || commerceOrderId
      }
    }
    if (!request && !commerceOrderId) {
      return { error: "Pick the return (or order) this adjustment belongs to.", status: 400 as const }
    }
    let order: any = null
    if (commerceOrderId) {
      const o = await c.query(
        `SELECT id, stripe_payment_intent_id, total_amount, subtotal FROM public.commerce_orders WHERE id::text = $1 LIMIT 1`,
        [commerceOrderId],
      )
      order = o.rows[0] || null
      if (order && !request) {
        const s = await c.query(
          `SELECT 1 FROM public.commerce_orders WHERE id::text = $1 AND metadata->>'seller_id' = $2 LIMIT 1`,
          [commerceOrderId, sellerId],
        )
        if (!s.rows.length) return { error: "Order not found", status: 404 as const }
      }
      if (!bridgeId) {
        const b = await c.query(
          `SELECT id FROM public.seller_orders WHERE order_id::text = $1 AND seller_id = $2::uuid AND tenant_id = $3 LIMIT 1`,
          [commerceOrderId, sellerId, tenant],
        )
        bridgeId = b.rows[0]?.id ? String(b.rows[0].id) : null
      }
    }
    return { sellerId, request, source, requestId, order, bridgeId, commerceOrderId }
  })
  if (!resolved) return fail("Database unavailable", 503)
  if ((resolved as any).error) return fail((resolved as any).error, (resolved as any).status)
  const { sellerId, source, requestId, order, bridgeId, commerceOrderId } = resolved as any

  const moneyOf = (v: unknown) => {
    const m = String(v ?? "").match(/[0-9]+(?:\.[0-9]+)?/)
    return m ? Number(m[0]) : 0
  }
  const orderTotal = order ? moneyOf(order.total_amount) || moneyOf(order.subtotal) : 0
  if (orderTotal > 0 && adjustmentAmount > orderTotal + 0.001) {
    return fail(`The adjustment can't exceed the order total ($${orderTotal.toFixed(2)}).`, 400)
  }

  let stripeRefundId: string | null = null
  if (method === "original_payment") {
    if (!order?.stripe_payment_intent_id) {
      return fail(
        "This order has no Stripe payment to adjust against — it wasn't paid through Stripe. If you've already corrected the money another way, record it as a manual adjustment instead.",
        409,
      )
    }
    const { getStripe } = await import("@/lib/stripe")
    const stripe = getStripe()
    if (!stripe) {
      return fail(
        "Stripe is not configured on the platform, so an adjustment to the original payment method can't be executed from here. This is an owner-side setting (Admin → Settings → Payments). Record a manual adjustment instead if you've already sent the money back.",
        503,
        { owner_gated: true },
      )
    }
    try {
      const refund = await stripe.refunds.create({
        payment_intent: String(order.stripe_payment_intent_id),
        amount: Math.round(adjustmentAmount * 100),
        reason: "requested_by_customer",
      })
      stripeRefundId = refund.id
    } catch (e) {
      return fail(
        `Stripe could not execute this adjustment: ${e instanceof Error ? e.message : "unknown error"}. Nothing was recorded.`,
        502,
      )
    }
  }

  const recorded = await withPg(async (c) => {
    const methodLabel =
      method === "original_payment"
        ? `original payment method${stripeRefundId ? ` (Stripe refund ${stripeRefundId})` : ""}`
        : method === "store_credit"
          ? "store credit"
          : "manual (money returned outside Stripe)"
    const notes = `Price adjustment via ${methodLabel}, issued from the seller portal.${reason ? ` ${reason}` : ""}`
    const ins = await c.query(
      `INSERT INTO public.seller_refunds
         (tenant_id, seller_id, return_id, order_id, amount, refund_type, status, notes)
       VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, 'adjustment', 'completed', $6)
       RETURNING id, amount, refund_type, status, created_at`,
      [
        tenant,
        sellerId,
        source === "seller" && requestId ? requestId : null,
        bridgeId,
        adjustmentAmount,
        notes,
      ],
    )
    const row = ins.rows[0]
    await c.query(
      `INSERT INTO public.commerce_refunds
         (tenant_id, refund_number, amount, reason, status, processor_reference, refund_method, processed_at)
       VALUES ($1, $2, $3, $4, 'completed', $5, 'adjustment', now())`,
      [
        tenant,
        `ADJ-${Date.now().toString(36).toUpperCase()}`,
        adjustmentAmount,
        reason || "price_adjustment",
        stripeRefundId,
      ],
    ).catch((e: Error) => console.error("[seller/returns adjustment] commerce_refunds ledger insert failed (non-fatal):", e.message))
    await writeSellerAudit(c, {
      tenantId: tenant,
      sellerId,
      actorType: "seller",
      action: "return_adjustment.issued",
      entityType: "seller_refund",
      entityId: String(row.id),
      afterState: { amount: adjustmentAmount, method, stripe_refund: stripeRefundId, request_id: requestId, order_id: commerceOrderId },
      ipAddress: requestIp(req),
    })
    return { ok: true, adjustment: row, stripe_refund_id: stripeRefundId, method }
  })
  if (!recorded) return fail("Database unavailable", 503)
  return NextResponse.json(recorded)
}

// ---------------------------------------------------------------------------
// POST kind:"dispute_open" — F.10: the seller disputes a return outcome
// (e.g. an item that came back damaged, switched, or never arrived, or a
// refund the platform issued they contest). Opens a real case in
// seller_disputes (dispute_type 'return_dispute', status 'open') linked
// to the return; the case then lives on the Disputes surface, where the
// seller adds evidence with the existing respond flow. One open dispute
// per return — a second live case for the same return 409s.
// ---------------------------------------------------------------------------
async function openReturnDispute(req: NextRequest, body: any, tenant: string, email: string) {
  const fail = (error: string, status: number) =>
    NextResponse.json({ error }, { status })
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : ""
  if (!notes) return fail("Say what you're disputing — the grounds become the case's opening note.", 400)
  const requestId = typeof body.request_id === "string" && body.request_id ? body.request_id : null
  if (!requestId) return fail("Pick the return you're disputing.", 400)
  const source = body.source === "customer" ? "customer" : "seller"

  const out = await withPg(async (c) => {
    const sellerId = await authedSeller(c, tenant, email)
    if (!sellerId) return { error: "Seller not found", status: 404 }

    let request: any = null
    let commerceOrderId: string | null = null
    if (source === "customer") {
      const r = await c.query(
        `SELECT * FROM public.customer_return_requests WHERE id = $1::uuid AND seller_id = $2::uuid LIMIT 1`,
        [requestId, sellerId],
      )
      request = r.rows[0] || null
      commerceOrderId = request?.order_id ? String(request.order_id) : null
    } else {
      const r = await c.query(
        `SELECT * FROM public.seller_return_requests WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $3 LIMIT 1`,
        [requestId, sellerId, tenant],
      )
      request = r.rows[0] || null
      if (request?.order_id) {
        const b = await c.query(
          `SELECT order_id::text AS commerce_id FROM public.seller_orders
            WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $3 LIMIT 1`,
          [String(request.order_id), sellerId, tenant],
        )
        commerceOrderId = b.rows[0]?.commerce_id || null
      }
    }
    if (!request) return { error: "Return request not found", status: 404 }

    const dup = await c.query(
      `SELECT id FROM public.seller_disputes
        WHERE seller_id = $1::uuid AND tenant_id = $2 AND return_id = $3::uuid
          AND LOWER(COALESCE(status, 'open')) NOT IN ('released', 'refunded', 'reversed', 'closed', 'won', 'lost')
        LIMIT 1`,
      [sellerId, tenant, requestId],
    )
    if (dup.rows.length) {
      return { error: "This return already has an open dispute — add your evidence to that case on the Disputes page.", status: 409 }
    }

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const ins = await c.query(
      `INSERT INTO public.seller_disputes
         (tenant_id, seller_id, order_id, return_id, status, dispute_type, evidence_urls, notes)
       VALUES ($1, $2::uuid, $3::uuid, $4::uuid, 'open', 'return_dispute', '[]'::jsonb, $5)
       RETURNING id, status, dispute_type, created_at`,
      [
        tenant,
        sellerId,
        commerceOrderId && uuidRe.test(commerceOrderId) ? commerceOrderId : null,
        requestId,
        notes,
      ],
    )
    const dispute = ins.rows[0]
    await writeSellerAudit(c, {
      tenantId: tenant,
      sellerId,
      actorType: "seller",
      action: "return_dispute.opened",
      entityType: "seller_dispute",
      entityId: String(dispute.id),
      afterState: { return_id: requestId, source, order_id: commerceOrderId },
      ipAddress: requestIp(req),
    })
    return { ok: true, dispute }
  })
  if (!out) return fail("Database unavailable", 503)
  if ((out as any).error) return fail((out as any).error, (out as any).status)
  return NextResponse.json(out)
}

// ---------------------------------------------------------------------------
// POST kind:"exemption_request" — F.9: request an exemption from the
// platform return policy (e.g. a category the policy's window shouldn't
// cover for this shop). The request is a platform decision, so it files
// into seller_appeals — the store governance appeals are decided from —
// with appeal_type 'return_policy_exemption' and status 'pending'; the
// seller watches the decision on the Return rules page.
// ---------------------------------------------------------------------------
async function requestPolicyExemption(req: NextRequest, body: any, tenant: string, email: string) {
  const fail = (error: string, status: number) =>
    NextResponse.json({ error }, { status })
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : ""
  if (!reason) return fail("Say what exemption you're asking for and why — that text is the request the platform decides on.", 400)
  const listingId = typeof body.listing_id === "string" && body.listing_id ? body.listing_id : null

  const out = await withPg(async (c) => {
    const sellerId = await authedSeller(c, tenant, email)
    if (!sellerId) return { error: "Seller not found", status: 404 }
    let appealText = reason
    if (listingId) {
      const l = await c.query(
        `SELECT id, title FROM public.seller_listings WHERE id = $1::uuid AND seller_id = $2::uuid LIMIT 1`,
        [listingId, sellerId],
      )
      if (!l.rows.length) return { error: "That listing isn't one of yours.", status: 400 }
      appealText = `Listing: ${l.rows[0].title || listingId} (${listingId})\n\n${reason}`
    }
    const ins = await c.query(
      `INSERT INTO public.seller_appeals
         (tenant_id, violation_id, seller_id, status, appeal_type, appeal_text, evidence_urls)
       VALUES ($1, NULL, $2::uuid, 'pending', 'return_policy_exemption', $3, '[]'::jsonb)
       RETURNING id, status, appeal_type, created_at`,
      [tenant, sellerId, appealText],
    )
    const appeal = ins.rows[0]
    await writeSellerAudit(c, {
      tenantId: tenant,
      sellerId,
      actorType: "seller",
      action: "return_policy_exemption.requested",
      entityType: "seller_appeal",
      entityId: String(appeal.id),
      afterState: { listing_id: listingId },
      ipAddress: requestIp(req),
    })
    return { ok: true, request: appeal }
  })
  if (!out) return fail("Database unavailable", 503)
  if ((out as any).error) return fail((out as any).error, (out as any).status)
  return NextResponse.json(out, { status: 201 })
}

// POST /api/seller/returns (also served at /api/seller/returns/rules) —
// create a return rule in seller_return_rules. The rule's name rides in
// conditions (the table carries rule_type, an optional listing link,
// conditions, is_active — no name/config/metadata columns).
// Body kind:"refund" issues a refund instead (see issueRefund above).
export async function POST(req: NextRequest) {
  const denied = await sellerSectionGuard("returns");
  if (denied) return denied;
  try {
    const email = await authedEmail()
    if (!email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    const body = await req.json().catch(() => ({}))
    const tenant = TENANT_ID()
    if ((body as any)?.kind === "refund") {
      return issueRefund(req, body, tenant, email)
    }
    if ((body as any)?.kind === "adjustment") {
      return issueAdjustment(req, body, tenant, email)
    }
    if ((body as any)?.kind === "dispute_open") {
      return openReturnDispute(req, body, tenant, email)
    }
    if ((body as any)?.kind === "exemption_request") {
      return requestPolicyExemption(req, body, tenant, email)
    }

    const out = await withPg(async (c) => {
      const sellerId = await authedSeller(c, tenant, email)
      if (!sellerId) return { error: "Seller not found", status: 404 }

      const ruleType = String(body.rule_type || body.type || "general").trim() || "general"
      const name = String(body.name || "Untitled rule").trim() || "Untitled rule"
      const conditions: Record<string, unknown> = {
        ...(body.config && typeof body.config === "object" ? body.config : {}),
        ...(body.conditions && typeof body.conditions === "object" ? body.conditions : {}),
        name,
      }
      const listingId =
        typeof body.listing_id === "string" && body.listing_id ? body.listing_id : null
      // F.8: an item-level rule attaches to one of the seller's OWN
      // listings — verify it before the rule can point at it.
      if (listingId) {
        const l = await c.query(
          `SELECT id FROM public.seller_listings WHERE id = $1::uuid AND seller_id = $2::uuid LIMIT 1`,
          [listingId, sellerId],
        )
        if (!l.rows.length) return { error: "That listing isn't one of yours.", status: 400 }
      }

      const ins = await c.query(
        `INSERT INTO public.seller_return_rules
           (tenant_id, seller_id, rule_type, listing_id, conditions, is_active)
         VALUES ($1, $2::uuid, $3, $4::uuid, $5::jsonb, true)
         RETURNING id, rule_type, is_active, created_at`,
        [tenant, sellerId, ruleType, listingId, JSON.stringify(conditions)],
      )
      const rule = ins.rows[0]

      await writeSellerAudit(c, {
        tenantId: tenant,
        sellerId,
        actorType: "seller",
        action: "return_rule.created",
        entityType: "seller_return_rule",
        entityId: String(rule.id),
        afterState: { rule_type: ruleType, name },
        ipAddress: requestIp(req),
      })

      return { ok: true, rule: { ...rule, name } }
    })

    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    if ((out as any).error)
      return NextResponse.json({ error: (out as any).error }, { status: (out as any).status || 500 })
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save rule" },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/seller/returns — the returns desk's mutations:
//   kind:"request" — advance a return request through its lifecycle.
//     Both legs share the 12-state vocabulary the customer store's CHECK
//     carries (requested → approved → awaiting_package → in_transit →
//     received → completed, or rejected). Actions: approve, reject,
//     mark_shipped (awaiting_package), receive, complete. The customer
//     leg also stamps seller_response / seller_read_at / handled_by —
//     the columns designed for the seller's answer. Terminal states
//     (rejected, refunded, exchanged, completed, cancelled) 409 instead
//     of being rewritten.
//   kind:"rule" — update a return rule: rename (conditions.name),
//     replace conditions, toggle is_active, or delete the rule.
//   kind:"dispute" — respond to a dispute: append an evidence URL to
//     evidence_urls (the jsonb array the case stores use) and/or set the
//     seller's notes; a dispute waiting on the seller moves to
//     'evidence_submitted'.
// Every write is scoped to the signed-in seller's own rows.
// ---------------------------------------------------------------------------
const REQUEST_TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  approve: { from: ["requested"], to: "approved" },
  reject: { from: ["requested", "approved", "awaiting_package", "in_transit", "received", "inspection", "approved_for_refund"], to: "rejected" },
  mark_shipped: { from: ["approved"], to: "awaiting_package" },
  receive: { from: ["approved", "awaiting_package", "in_transit", "inspection"], to: "received" },
  complete: { from: ["received", "inspection", "approved_for_refund"], to: "completed" },
}

// B6.5 — the forwarding leg (census K.7): a seller's dispute response
// reaches the Stripe dispute itself, not only the platform's case file.
// Resolution: the case's order → its Stripe payment intent → the
// charge → the charge's dispute. The seller's note becomes the
// evidence explanation; an evidence link is fetched and uploaded as a
// dispute-evidence file, then the evidence is SUBMITTED. Cases with no
// Stripe dispute behind them (platform-side return disputes, orders
// paid without Stripe) resolve to an honest 'no_stripe_dispute' — the
// response stays on the case and the seller is told which happened.
interface DisputeForwardResult {
  status: "submitted" | "no_stripe_dispute" | "failed";
  stripe_dispute_id?: string;
  detail: string;
}

async function forwardDisputeEvidenceToStripe(job: {
  orderId: string | null;
  notes: string;
  evidenceUrl: string;
}): Promise<DisputeForwardResult> {
  if (!job.orderId) {
    return {
      status: "no_stripe_dispute",
      detail:
        "This case isn't tied to an order charge, so there is no Stripe dispute to receive evidence — your response is on file with the platform.",
    };
  }
  try {
    const { getStripe } = await import("@/lib/stripe");
    const stripe = getStripe();
    if (!stripe) {
      return {
        status: "failed",
        detail:
          "Stripe isn't configured on the platform right now, so your response could not be forwarded — it is recorded on the case for the platform team.",
      };
    }
    const pi = await withPg(async (c) => {
      const r = await c.query(
        `SELECT stripe_payment_intent_id FROM public.commerce_orders WHERE id = $1::uuid LIMIT 1`,
        [job.orderId],
      );
      const v = r.rows[0]?.stripe_payment_intent_id;
      return typeof v === "string" && v ? v : null;
    });
    if (!pi) {
      return {
        status: "no_stripe_dispute",
        detail:
          "This order wasn't charged through Stripe, so there is no Stripe dispute to receive evidence — your response is on file with the platform.",
      };
    }
    // The current Stripe API no longer embeds the dispute on the
    // Charge object — disputes are listed by payment intent instead.
    const disputes = await stripe.disputes.list({ payment_intent: pi, limit: 1 });
    const disputeId = disputes.data[0]?.id;
    if (!disputeId) {
      return {
        status: "no_stripe_dispute",
        detail:
          "No Stripe chargeback is open on this order's charge — your response is on file with the platform, and there is nothing at Stripe to submit it to.",
      };
    }
    const evidence: Record<string, string> = {};
    if (job.notes) evidence.uncategorized_text = job.notes;
    let fileNote = "";
    if (job.evidenceUrl) {
      try {
        const f = await fetch(job.evidenceUrl);
        if (!f.ok) throw new Error(`fetch ${f.status}`);
        const buf = Buffer.from(await f.arrayBuffer());
        const name =
          job.evidenceUrl.split("/").pop()?.split("?")[0] || "evidence";
        const up = await stripe.files.create({
          purpose: "dispute_evidence",
          file: {
            data: buf,
            name,
            type: f.headers.get("content-type") || "application/octet-stream",
          },
        });
        evidence.uncategorized_file = up.id;
      } catch {
        fileNote =
          " Your evidence link itself could not be fetched for upload to Stripe — the link is recorded on the case.";
      }
    }
    if (!evidence.uncategorized_text && !evidence.uncategorized_file) {
      return {
        status: "failed",
        stripe_dispute_id: disputeId,
        detail: `Nothing could be submitted to Stripe for this chargeback.${fileNote}`,
      };
    }
    await stripe.disputes.update(disputeId, { evidence, submit: true });
    return {
      status: "submitted",
      stripe_dispute_id: disputeId,
      detail: `Your evidence was submitted to Stripe for this chargeback.${fileNote}`,
    };
  } catch (e) {
    return {
      status: "failed",
      detail: `Forwarding to Stripe failed (${e instanceof Error ? e.message : "unknown error"}) — your response is recorded on the case for the platform team.`,
    };
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await sellerSectionGuard("returns");
  if (denied) return denied;
  try {
    const email = await authedEmail()
    if (!email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    const body = await req.json().catch(() => ({}))
    const kind = String((body as any)?.kind || "")
    if (!["request", "rule", "dispute"].includes(kind)) {
      return NextResponse.json({ error: "Unknown kind" }, { status: 400 })
    }
    const id = typeof (body as any)?.id === "string" ? (body as any).id : ""
    if (!id) return NextResponse.json({ error: "An id is required." }, { status: 400 })
    const tenant = TENANT_ID()

    // Set by the kind:"dispute" branch when a response is recorded;
    // the Stripe forwarding leg runs after the transaction commits.
    let disputeForwardJob: {
      disputeId: string;
      orderId: string | null;
      notes: string;
      evidenceUrl: string;
    } | null = null;

    const out = await withPg(async (c) => {
      const sellerId = await authedSeller(c, tenant, email)
      if (!sellerId) return { error: "Seller not found", status: 404 }

      if (kind === "request") {
        const source = (body as any).source === "customer" ? "customer" : "seller"
        const action = String((body as any).action || "")
        const t = REQUEST_TRANSITIONS[action]
        if (!t) return { error: "Unknown action", status: 400 }
        const response =
          typeof (body as any).response === "string" ? (body as any).response.trim().slice(0, 1000) : ""
        const table = source === "customer" ? "customer_return_requests" : "seller_return_requests"
        const cur = await c.query(
          `SELECT id, status FROM public.${table}
            WHERE id = $1::uuid AND seller_id = $2::uuid ${source === "seller" ? "AND tenant_id = $3" : ""}
            LIMIT 1`,
          source === "seller" ? [id, sellerId, tenant] : [id, sellerId],
        )
        const row = cur.rows[0]
        if (!row) return { error: "Return request not found", status: 404 }
        const status = String(row.status || "requested")
        if (!t.from.includes(status)) {
          return {
            error: `This request is ${status.replace(/_/g, " ")} — it can't be ${action.replace(/_/g, " ")} now.`,
            status: 409,
          }
        }
        if (source === "customer") {
          await c.query(
            `UPDATE public.customer_return_requests
                SET status = $3,
                    seller_response = CASE WHEN $4 <> '' THEN $4 ELSE seller_response END,
                    seller_read_at = COALESCE(seller_read_at, now()),
                    handled_by = 'seller',
                    updated_at = now()
              WHERE id = $1::uuid AND seller_id = $2::uuid`,
            [id, sellerId, t.to, response],
          )
        } else {
          await c.query(
            `UPDATE public.seller_return_requests
                SET status = $3, updated_at = now()
              WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $4`,
            [id, sellerId, t.to, tenant],
          )
        }
        await writeSellerAudit(c, {
          tenantId: tenant,
          sellerId,
          actorType: "seller",
          action: `return_request.${action}`,
          entityType: source === "customer" ? "customer_return_request" : "seller_return_request",
          entityId: id,
          beforeState: { status },
          afterState: { status: t.to },
          ipAddress: requestIp(req),
        })
        return { ok: true, id, status: t.to }
      }

      if (kind === "rule") {
        const action = String((body as any).action || "update")
        const cur = await c.query(
          `SELECT id, rule_type, conditions, is_active FROM public.seller_return_rules
            WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $3 LIMIT 1`,
          [id, sellerId, tenant],
        )
        const row = cur.rows[0]
        if (!row) return { error: "Rule not found", status: 404 }

        if (action === "delete") {
          await c.query(
            `DELETE FROM public.seller_return_rules
              WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $3`,
            [id, sellerId, tenant],
          )
          await writeSellerAudit(c, {
            tenantId: tenant,
            sellerId,
            actorType: "seller",
            action: "return_rule.deleted",
            entityType: "seller_return_rule",
            entityId: id,
            beforeState: { rule_type: row.rule_type },
            ipAddress: requestIp(req),
          })
          return { ok: true, id, deleted: true }
        }

        const cond =
          row.conditions && typeof row.conditions === "object" ? { ...(row.conditions as any) } : {}
        if (typeof (body as any).name === "string" && (body as any).name.trim()) {
          cond.name = (body as any).name.trim().slice(0, 200)
        }
        if ((body as any).conditions && typeof (body as any).conditions === "object") {
          Object.assign(cond, (body as any).conditions)
        }
        const isActive =
          action === "toggle"
            ? row.is_active === false
            : typeof (body as any).is_active === "boolean"
              ? (body as any).is_active
              : row.is_active
        const upd = await c.query(
          `UPDATE public.seller_return_rules
              SET conditions = $4::jsonb, is_active = $5, updated_at = now()
            WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $3
            RETURNING id, rule_type, is_active, conditions`,
          [id, sellerId, tenant, JSON.stringify(cond), isActive],
        )
        const rule = upd.rows[0]
        await writeSellerAudit(c, {
          tenantId: tenant,
          sellerId,
          actorType: "seller",
          action: action === "toggle" ? "return_rule.toggled" : "return_rule.updated",
          entityType: "seller_return_rule",
          entityId: id,
          afterState: { is_active: isActive, name: (cond as any).name ?? null },
          ipAddress: requestIp(req),
        })
        return { ok: true, rule: { ...rule, name: (rule.conditions as any)?.name ?? null } }
      }

      // kind === "dispute" — the seller's response: evidence + notes.
      const evidenceUrl =
        typeof (body as any).evidence_url === "string" ? (body as any).evidence_url.trim().slice(0, 2048) : ""
      const notes = typeof (body as any).notes === "string" ? (body as any).notes.trim().slice(0, 2000) : ""
      if (!evidenceUrl && !notes) {
        return { error: "Add an evidence link or a note so the response says something.", status: 400 }
      }
      if (evidenceUrl && !/^https?:\/\//i.test(evidenceUrl)) {
        return { error: "Evidence must be a link (https://…).", status: 400 }
      }
      const cur = await c.query(
        `SELECT id, status, evidence_urls, notes, order_id FROM public.seller_disputes
          WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $3 LIMIT 1`,
        [id, sellerId, tenant],
      )
      const row = cur.rows[0]
      if (!row) return { error: "Dispute not found", status: 404 }
      const evidence: unknown[] = Array.isArray(row.evidence_urls)
        ? [...row.evidence_urls]
        : row.evidence_urls && typeof row.evidence_urls === "object"
          ? [row.evidence_urls]
          : []
      if (evidenceUrl) {
        evidence.push({ url: evidenceUrl, added_by: "seller", added_at: new Date().toISOString() })
      }
      const waiting = ["open", "opened", "needs_response", "under_review"].includes(
        String(row.status || "").toLowerCase(),
      )
      const nextStatus = waiting ? "evidence_submitted" : String(row.status || "")
      const upd = await c.query(
        `UPDATE public.seller_disputes
            SET evidence_urls = $4::jsonb,
                notes = CASE WHEN $5 <> '' THEN $5 ELSE notes END,
                status = $6,
                updated_at = now()
          WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $3
          RETURNING id, status, evidence_urls, notes`,
        [id, sellerId, tenant, JSON.stringify(evidence), notes, nextStatus],
      )
      await writeSellerAudit(c, {
        tenantId: tenant,
        sellerId,
        actorType: "seller",
        action: "dispute.responded",
        entityType: "seller_dispute",
        entityId: id,
        afterState: { status: nextStatus, evidence_count: evidence.length },
        ipAddress: requestIp(req),
      })
      // Hand the response to the Stripe-forwarding leg below (B6.5):
      // it runs after this transaction commits — Stripe calls don't
      // belong inside a DB block — and records its own outcome on the
      // case.
      disputeForwardJob = {
        disputeId: id,
        orderId: row.order_id ? String(row.order_id) : null,
        notes,
        evidenceUrl,
      }
      return { ok: true, dispute: upd.rows[0] }
    })

    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    if ((out as any).error)
      return NextResponse.json({ error: (out as any).error }, { status: (out as any).status || 500 })

    // Dispute responses only: forward the evidence to the Stripe
    // dispute (B6.5) and record the outcome ON the case, so the seller
    // and the desk can both see whether Stripe has the evidence.
    // disputeForwardJob is assigned inside the withPg callback above;
    // TS cannot narrow a closure-assigned variable, so read it through
    // an explicitly typed local (the assignment has happened — withPg
    // resolved before this point).
    const job = disputeForwardJob as {
      disputeId: string;
      orderId: string | null;
      notes: string;
      evidenceUrl: string;
    } | null;
    if (job) {
      const forward = await forwardDisputeEvidenceToStripe(job);
      await withPg(async (c) => {
        const sellerId = await authedSeller(c, tenant, email);
        if (!sellerId) return;
        const cur = await c.query(
          `SELECT evidence_urls FROM public.seller_disputes
            WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $3 LIMIT 1`,
          [job.disputeId, sellerId, tenant],
        );
        if (!cur.rows[0]) return;
        const evidence: unknown[] = Array.isArray(cur.rows[0].evidence_urls)
          ? [...cur.rows[0].evidence_urls]
          : [];
        evidence.push({
          type: "stripe_submission",
          status: forward.status,
          stripe_dispute_id: forward.stripe_dispute_id ?? null,
          detail: forward.detail,
          at: new Date().toISOString(),
        });
        await c.query(
          `UPDATE public.seller_disputes
              SET evidence_urls = $4::jsonb, updated_at = now()
            WHERE id = $1::uuid AND seller_id = $2::uuid AND tenant_id = $3`,
          [job.disputeId, sellerId, tenant, JSON.stringify(evidence)],
        );
        await writeSellerAudit(c, {
          tenantId: tenant,
          sellerId,
          actorType: "seller",
          action: "dispute.evidence_forwarded",
          entityType: "seller_dispute",
          entityId: job.disputeId,
          afterState: {
            forward_status: forward.status,
            stripe_dispute_id: forward.stripe_dispute_id ?? null,
          },
          ipAddress: requestIp(req),
        });
      });
      (out as any).stripe_forward = forward;
    }

    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "That update didn't go through — please try again." },
      { status: 500 }
    )
  }
}

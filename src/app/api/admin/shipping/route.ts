import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { revalidatePath } from "next/cache"
import { requireModuleApi } from "@/lib/admin/gate";
import { repo } from "@/lib/repo"
import {
  trackPackage,
  getShippingRates,
  createShippingLabel,
  validateAddress,
} from "@/lib/shipping/usps-client"
import { withPg } from "@/lib/crm/enterprise"
import { existingOrderLabel } from "@/lib/orders/lifecycle"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"


function nowIso() {
  return new Date().toISOString()
}

// ============================================================================
// GET /api/admin/shipping — list shippable orders (commerce_orders where
//   fulfillment_status IN ('pending','processing','shipped') AND
//   payment_status = 'paid'). Each order includes its line items.
// ============================================================================

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("inventory", "read")
  if (gate) return gate

  const tenant = resolveTenantId(req);
  try {
    const orders = await withPg(async (client) => {
      const listRes = await client.query(
        `SELECT
           o.id::text AS id, o.email, o.customer_email, o.customer_id::text AS customer_id,
           o.status, o.payment_status, o.fulfillment_status, o.fulfillment_method,
           o.subtotal, o.total_amount, o.shipping_address, o.notes,
           o.tracking_number, o.carrier, o.tracking_status,
           o.created_at::text AS created_at
         FROM public.commerce_orders o
         WHERE o.tenant_id = $1
         ORDER BY o.created_at DESC NULLS LAST LIMIT 200;`,
        [tenant],
      )
      const ids = listRes.rows.map((r: any) => r.id)
      const itemsRes = await client.query(
        `SELECT id::text AS id, order_id::text AS order_id, product_id::text AS product_id,
                name, quantity, unit_price
         FROM public.commerce_order_items
         WHERE order_id::text = ANY($1::text[])`,
        [ids],
      )
      const itemsByOrder = new Map<string, any[]>()
      for (const it of itemsRes.rows) {
        const arr = itemsByOrder.get(it.order_id) || []
        arr.push({
          id: it.id, productId: it.product_id, name: it.name,
          quantity: Number(it.quantity) || 1, unitPrice: it.unit_price,
        })
        itemsByOrder.set(it.order_id, arr)
      }
      return listRes.rows.map((r: any) => ({
        id: r.id, email: r.email || r.customer_email, customerId: r.customer_id,
        status: r.status, paymentStatus: r.payment_status,
        fulfillmentStatus: r.fulfillment_status, fulfillmentMethod: r.fulfillment_method,
        subtotal: r.subtotal, totalAmount: r.total_amount,
        shippingAddress: r.shipping_address, notes: r.notes,
        trackingNumber: r.tracking_number, carrier: r.carrier, trackingStatus: r.tracking_status,
        createdAt: r.created_at, items: itemsByOrder.get(r.id) || [],
      }))
    })

    return NextResponse.json({ orders: orders || [] })
  } catch (e: any) {
    console.error("[GET /api/admin/shipping]", e)
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}

// ============================================================================
// POST /api/admin/shipping — fulfillment actions + USPS integration.
//   Body: { orderId, action, ... }
//   Actions:
//     mark_processing           — fulfillment_status='processing'
//     mark_shipped              — fulfillment_status='shipped' + tracking
//     mark_delivered            — fulfillment_status='delivered'
//     track_usps                — real USPS tracking lookup
//     get_rates                 — real USPS rate quote (needs weight + ZIPs)
//     buy_label                 — real USPS label purchase (needs weight + address)
//     validate_address          — real USPS address validation
// ============================================================================

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("inventory", "write")
  if (gate) return gate

  const tenant = resolveTenantId(req);
  try {
    const body = await req.json().catch(() => ({}))
    const orderId = String(body?.orderId || "").trim()
    const action = String(body?.action || "").trim()

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 })
    }

    // ---- Rate-only actions (no orderId needed) --------------------------
    if (action === "get_rates") {
      const { originZIP, destinationZIP, weight, length, width, height, mailClasses } = body
      if (!originZIP || !destinationZIP || !weight) {
        return NextResponse.json({ error: "originZIP, destinationZIP, weight are required" }, { status: 400 })
      }
      const result = await getShippingRates({
        originZIP, destinationZIP,
        weight: Number(weight),
        length: length ? Number(length) : undefined,
        width: width ? Number(width) : undefined,
        height: height ? Number(height) : undefined,
        mailClasses,
      })
      return NextResponse.json({ rates: result.rates, simulated: result.simulated, unavailable: result.unavailable || false })
    }

    if (action === "validate_address") {
      const { address1, address2, city, state, ZIPCode } = body
      if (!address1 || !city || !state) {
        return NextResponse.json({ error: "address1, city, state are required" }, { status: 400 })
      }
      const result = await validateAddress({ address1, address2, city, state, ZIPCode })
      return NextResponse.json(result)
    }

    // ---- Order-bound actions --------------------------------------------
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required for this action" }, { status: 400 })
    }

    const existing = await repo.get("commerce_orders", orderId)
    if (!existing) {
      return NextResponse.json({ error: `Order ${orderId} not found.` }, { status: 404 })
    }
    const oldStatus = (existing as any)?.fulfillment_status || "pending"

    if (action === "mark_processing") {
      const updated = await repo.update("commerce_orders", orderId, {
        fulfillment_status: "processing", updated_at: nowIso(),
      } as any)
      await logFulfillmentEvent(orderId, "processing", oldStatus, "processing", { action }, tenant)
      revalidatePath("/admin/orders"); revalidatePath("/customer/orders")
      return NextResponse.json({ ok: true, order: updated })
    }

    if (action === "mark_shipped") {
      const trackingNumber = String(body?.trackingNumber || "").trim()
      const carrier = String(body?.carrier || "USPS").trim()
      if (!trackingNumber) {
        return NextResponse.json({ error: "trackingNumber is required for mark_shipped" }, { status: 400 })
      }
      const updated = await repo.update("commerce_orders", orderId, {
        tracking_number: trackingNumber, carrier,
        tracking_status: "IN_TRANSIT",
        status: "shipped", fulfillment_status: "shipped",
        updated_at: nowIso(),
      } as any)
      await logFulfillmentEvent(orderId, "shipped", oldStatus, "shipped", { carrier, trackingNumber }, tenant)
      await upsertShippingLabel(carrier, trackingNumber, undefined, undefined, tenant)
      revalidatePath("/admin/orders"); revalidatePath("/customer/orders")
      return NextResponse.json({ ok: true, order: updated })
    }

    if (action === "mark_delivered") {
      const updated = await repo.update("commerce_orders", orderId, {
        tracking_status: "DELIVERED",
        status: "delivered", fulfillment_status: "delivered",
        updated_at: nowIso(),
      } as any)
      await logFulfillmentEvent(orderId, "delivered", oldStatus, "delivered", { action }, tenant)
      revalidatePath("/admin/orders"); revalidatePath("/customer/orders")
      return NextResponse.json({ ok: true, order: updated })
    }

    if (action === "track_usps") {
      // Real USPS tracking lookup. If the order has a tracking number, use it;
      // otherwise use body.trackingNumber.
      const trackingNumber = String(body?.trackingNumber || (existing as any)?.tracking_number || "").trim()
      if (!trackingNumber) {
        return NextResponse.json({ error: "No tracking number on this order." }, { status: 400 })
      }
      const result = await trackPackage(trackingNumber)
      if (result.unavailable) {
        // No real carrier answer — never persist an invented status onto the
        // order. The order keeps its last recorded state.
        return NextResponse.json({
          ok: false,
          unavailable: true,
          message: result.summary,
          tracking: result,
        })
      }
      // Persist the result back to the order.
      const updated = await repo.update("commerce_orders", orderId, {
        tracking_number: trackingNumber, carrier: "USPS",
        tracking_status: result.status,
        status: result.isDelivered ? "delivered" : "shipped",
        fulfillment_status: result.isDelivered ? "delivered" : "shipped",
        updated_at: nowIso(),
      } as any)
      await logFulfillmentEvent(
        orderId,
        result.isDelivered ? "delivered" : "tracking_updated",
        oldStatus,
        result.isDelivered ? "delivered" : "shipped",
        { carrier: "USPS", trackingNumber, trackingStatus: result.status, summary: result.summary, simulated: result.simulated },
        tenant,
      )
      await upsertShippingLabel("USPS", trackingNumber, undefined, undefined, tenant)
      revalidatePath("/admin/orders"); revalidatePath("/customer/orders")
      return NextResponse.json({ ok: true, order: updated, tracking: result })
    }

    if (action === "buy_label") {
      // Buy a real USPS shipping label. Requires the destination address +
      // package weight. Returns the label + tracking number.
      // Double-buy guard — the same rule the order-screen label endpoint
      // enforces: an order that already carries a tracking number is
      // refused BEFORE purchasing, because a second buy would silently
      // overwrite the label already paid for. The one deliberate exception
      // is body.replace === true; the replacement is then noted in the
      // fulfillment event below.
      const existingLabel = existingOrderLabel(existing)
      if (existingLabel && body.replace !== true) {
        return NextResponse.json({
          error: "order_already_labeled",
          message: `This order already has a ${existingLabel.carrier || "carrier"} label (tracking ${existingLabel.trackingNumber}). Buying another label would replace it — pass replace: true to buy a replacement label deliberately.`,
          carrier: existingLabel.carrier,
          trackingNumber: existingLabel.trackingNumber,
        }, { status: 409 })
      }
      const { toName, toAddress1, toCity, toState, toZIP, toPhone, weight, mailClass } = body
      if (!toName || !toAddress1 || !toCity || !toState || !toZIP || !weight) {
        return NextResponse.json({ error: "toName, toAddress1, toCity, toState, toZIP, weight are required" }, { status: 400 })
      }
      let label
      try {
        label = await createShippingLabel({
          toName, toAddress1, toCity, toState, toZIP, toPhone,
          weight: Number(weight), mailClass,
          orderId, // return address resolves to the order's seller / house tenant
        })
      } catch (e: any) {
        // ReturnAddressError — the order's seller/tenant has no usable return
        // address. Surface the fix-it message instead of a generic failure.
        if (e?.name === "ReturnAddressError") {
          return NextResponse.json({ error: e.message }, { status: 422 })
        }
        throw e
      }
      if (!label) {
        return NextResponse.json({ error: "Label creation failed." }, { status: 502 })
      }
      if (label.simulated) {
        // Defensive: a simulated label carries an invented tracking number.
        // It is a failed purchase, never something to save on a real order.
        return NextResponse.json({
          error: "USPS label purchase unavailable — no real label was created, so nothing was saved to this order.",
        }, { status: 422 })
      }
      // Persist the tracking number from the label onto the order.
      const updated = await repo.update("commerce_orders", orderId, {
        tracking_number: label.trackingNumber, carrier: "USPS",
        tracking_status: "PRE_TRANSIT",
        status: "shipped", fulfillment_status: "shipped",
        updated_at: nowIso(),
      } as any)
      await logFulfillmentEvent(orderId, "label_purchased", oldStatus, "shipped", {
        carrier: "USPS", trackingNumber: label.trackingNumber, postage: label.postage,
        mailClass: label.mailClass, simulated: label.simulated,
        // A deliberate replacement (replace: true) names the label it
        // replaced, so the order's history shows both tracking numbers.
        ...(existingLabel
          ? { replaced: true, replacedCarrier: existingLabel.carrier, replacedTrackingNumber: existingLabel.trackingNumber }
          : {}),
      }, tenant)
      await upsertShippingLabel("USPS", label.trackingNumber, label.labelUrl, label.postage, tenant)
      revalidatePath("/admin/orders"); revalidatePath("/customer/orders")
      return NextResponse.json({ ok: true, order: updated, label })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e: any) {
    console.error("[POST /api/admin/shipping]", e)
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}

// ---- helpers ----
async function logFulfillmentEvent(
  orderId: string, eventType: string, oldStatus: string | null, newStatus: string, payload: any, tenant: string,
) {
  await withPg(async (client) => {
    await client.query(
      `INSERT INTO public.commerce_fulfillment_events
         (tenant_id, order_id, event_type, old_status, new_status, payload)
       VALUES ($1, NULL, $2, $3, $4, $5)`,
      [tenant, eventType, oldStatus, newStatus, JSON.stringify({ commerce_order_id: orderId, ...payload })],
    )
  }).catch((e) => console.error("[shipping] fulfillment event log failed (non-fatal):", e?.message || e))
}

async function upsertShippingLabel(carrier: string, trackingNumber: string, labelUri?: string, postage?: number, tenant?: string) {
  await withPg(async (client) => {
    await client.query(
      `INSERT INTO public.commerce_shipping_labels
         (tenant_id, carrier, tracking_number, label_type, label_uri, postage_amount, created_at)
       VALUES ($1, $2, $3, 'shipping', $4, $5, now())
       ON CONFLICT DO NOTHING`,
      [tenant, carrier, trackingNumber, labelUri || null, postage ?? null],
    )
  }).catch((e) => console.error("[shipping] label upsert failed (non-fatal):", e?.message || e))
}

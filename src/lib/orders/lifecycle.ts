// ---------------------------------------------------------------------------
// orders/lifecycle.ts — shared helpers for the admin order lifecycle chain:
// see it → pack it → label it → ship it → track it → case on it.
//
// Real data shapes (verified against the live schema, do not "fix" them):
//   • commerce_orders.id is TEXT (mixed uuid + slug ids) — never cast ::uuid.
//   • Money columns (subtotal, total_amount) and commerce_order_items
//     .unit_price are TEXT like "$25.27" — parse, don't Number().
//   • shipping_address is usually a PLAIN STRING ("1486 Charles St ·
//     Memphis, TN 38141") from shop checkout, sometimes a JSON object.
//   • commerce_orders.customer_id is the SHOP customer id (customers.id,
//     camelCase name columns); the CRM twin is crm_customers
//     (source_customer_id = shop id).
//   • commerce_fulfillment_events.order_id FKs to erp_orders — commerce
//     order events store order_id NULL and the id in payload (the pattern
//     the shipping routes already use).
// ---------------------------------------------------------------------------

export function parseMoney(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

export type ShipTo = {
  name: string
  street1: string
  city: string
  state: string
  zip: string
}

/** Parse an order's ship-to into carrier fields. Returns null when no ZIP
 *  can be recovered — a label must never be bought on a guessed address. */
export function parseShipTo(raw: unknown, fallbackName: string): ShipTo | null {
  let obj: any = null
  if (raw && typeof raw === "object") obj = raw
  else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object") obj = parsed
    } catch {
      /* plain-string address — parsed below */
    }
    if (!obj) {
      const s = raw.trim()
      // "1486 Charles St · Memphis, TN 38141" (shop checkout format)
      const parts = s.split("·").map((p) => p.trim()).filter(Boolean)
      const last = parts[parts.length - 1] || ""
      const m = last.match(/^(.+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/)
      if (m && parts.length >= 2) {
        return {
          name: fallbackName,
          street1: parts.slice(0, -1).join(" · "),
          city: m[1],
          state: m[2].toUpperCase(),
          zip: m[3],
        }
      }
      // "1486 Charles St, Memphis, TN 38141"
      const g = s.match(/^(.*),\s*(.+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/)
      if (g) {
        return { name: fallbackName, street1: g[1].trim(), city: g[2].trim(), state: g[3].toUpperCase(), zip: g[4] }
      }
      return null
    }
  }
  if (!obj) return null
  const zip = String(obj.zip || obj.postal_code || obj.postalCode || "").trim()
  if (!zip) return null
  return {
    name: String(obj.name || fallbackName || "Customer"),
    street1: String(obj.street1 || obj.address1 || obj.street || obj.address || ""),
    city: String(obj.city || ""),
    state: String(obj.state || "").toUpperCase(),
    zip,
  }
}

export function trackingUrlFor(carrier: string | null | undefined, trackingNumber: string): string | undefined {
  const c = String(carrier || "").toLowerCase()
  if (!trackingNumber) return undefined
  if (c.includes("usps")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`
  return undefined
}

type PgClient = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }

/** The order row with its customer resolved from BOTH customer stores. */
export async function loadOrder(client: PgClient, tenant: string, id: string): Promise<any | null> {
  const { rows } = await client.query(
    `SELECT o.id::text AS id, o.email, o.customer_email, o.customer_id::text AS customer_id,
            o.status, o.payment_status, o.fulfillment_status, o.fulfillment_method,
            o.subtotal, o.total_amount, o.shipping_address, o.notes, o.metadata,
            o.tracking_number, o.carrier, o.tracking_status,
            o.stripe_checkout_id, o.stripe_payment_intent_id,
            o.created_at::text AS created_at, o.updated_at::text AS updated_at,
            sc."firstName" AS shop_first, sc."lastName" AS shop_last,
            sc.email AS shop_email, sc.phone AS shop_phone,
            c.first_name AS crm_first, c.last_name AS crm_last,
            c.email AS crm_email, c.phone AS crm_phone, c.id::text AS crm_customer_id
       FROM public.commerce_orders o
       LEFT JOIN public.customers sc ON sc.id = o.customer_id
       LEFT JOIN public.crm_customers c
         ON c.id::text = o.customer_id OR c.source_customer_id::text = o.customer_id
      WHERE o.id::text = $1 AND o.tenant_id = $2`,
    [id, tenant],
  )
  if (!rows.length) return null
  const o = rows[0]
  // Name resolution: the shop customer record, then the CRM customer,
  // then the name the buyer themselves gave at checkout — the shipping
  // address's recipient. An order whose customer_id matches neither
  // customer table (guest checkout, an unmerged record) still names
  // its customer from its own record instead of rendering blank.
  let shipName: string | null = null
  try {
    const addr =
      typeof o.shipping_address === "string"
        ? JSON.parse(o.shipping_address)
        : o.shipping_address
    if (addr && typeof addr === "object" && typeof addr.name === "string" && addr.name.trim()) {
      shipName = addr.name.trim()
    }
  } catch {
    /* an unparseable address simply contributes no name */
  }
  const customerName =
    [o.shop_first, o.shop_last].filter(Boolean).join(" ") ||
    [o.crm_first, o.crm_last].filter(Boolean).join(" ") ||
    shipName
  return {
    ...o,
    customer_name: customerName,
    customer_phone: o.shop_phone || o.crm_phone || null,
    customer_email_resolved: o.customer_email || o.email || o.shop_email || o.crm_email || null,
  }
}

/** The label an order already carries, if any. Label purchases persist the
 * tracking number + carrier on commerce_orders (the order-screen label
 * endpoint and the commerce purchase flow both write exactly these fields),
 * so a non-empty tracking_number IS the "already labeled" state. Every buy
 * path checks this BEFORE purchasing: a second buy would silently overwrite
 * the tracking of a label the business already paid for. A deliberate
 * replacement requires the caller's explicit replace flag. */
export function existingOrderLabel(
  order: any | null | undefined,
): { carrier: string | null; trackingNumber: string } | null {
  const trackingNumber = order?.tracking_number ? String(order.tracking_number).trim() : "";
  if (!trackingNumber) return null;
  return { carrier: order.carrier ? String(order.carrier) : null, trackingNumber };
}

export async function loadOrderItems(client: PgClient, orderId: string): Promise<any[]> {
  const { rows } = await client.query(
    `SELECT oi.id::text AS id, oi.name AS product_name, ci.sku AS sku,
            oi.product_id::text AS product_id,
            oi.quantity,
            COALESCE(NULLIF(regexp_replace(oi.unit_price, '[^0-9.]', '', 'g'), ''), '0')::numeric AS unit_price
       FROM public.commerce_order_items oi
       LEFT JOIN public.commerce_catalog_items ci ON ci.id::text = oi.product_id::text
      WHERE oi.order_id::text = $1
      ORDER BY oi.created_at ASC NULLS LAST`,
    [orderId],
  )
  return rows.map((r: any) => {
    const qty = Number(r.quantity) || 0
    const unit = Number(r.unit_price) || 0
    return {
      id: r.id,
      product_name: r.product_name,
      name: r.product_name,
      sku: r.sku,
      // The catalog product behind the line — the order surface's
      // restock control (§2.1.3f) and Create PO (§2.1.3b) key off it.
      product_id: r.product_id,
      quantity: qty,
      unit_price: unit,
      total: Math.round(qty * unit * 100) / 100,
    }
  })
}

/** Append a lifecycle event (order_id NULL + payload id — see header note). */
export async function logOrderEvent(
  client: PgClient,
  tenant: string,
  orderId: string,
  eventType: string,
  oldStatus: string | null,
  newStatus: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await client
    .query(
      `INSERT INTO public.commerce_fulfillment_events
         (tenant_id, order_id, event_type, old_status, new_status, payload)
       VALUES ($1, NULL, $2, $3, $4, $5)`,
      [tenant, eventType, oldStatus, newStatus, JSON.stringify({ commerce_order_id: orderId, ...payload })],
    )
    .catch((e: any) => console.error("[orders] event log failed (non-fatal):", e?.message || e))
}

// ---------------------------------------------------------------------------
// shipping/ship-from.ts — label return (ship-from) addresses.
//
// Marketplace rule: a shipping label's return address belongs to whoever
// ships the order — the seller for a seller's order, the tenant for a house
// order. Addresses live in public.ship_from_addresses (tenant_id + nullable
// seller_id; seller_id NULL = the tenant's own house address) and are set by
// each tenant / seller in their own settings:
//   Admin  → Settings → Shipping → "Label return address"
//   Seller → Shipping → Return Address
//
// There is deliberately NO platform fallback address. If the address for an
// order's scope is unset or incomplete (ZIP is required by every carrier),
// resolution throws ReturnAddressError with a message that says where to
// fix it — a label is never printed with a placeholder return address.
// ---------------------------------------------------------------------------

import { pgQuery } from "@/lib/pg"
import { TENANT_ID } from "@/lib/crm/enterprise"

export type ShipFromAddress = {
  name: string
  street: string
  city: string
  state: string
  zip: string
  phone: string
  /** The shipper's email, resolved at label time from the scope's own
   *  record (the seller's email, or the tenant's support email for a
   *  house shipment). Carriers require it on the from address; the
   *  address record itself deliberately carries no email column. */
  email?: string
}

export type ShipFromScope = { tenantId: string; sellerId: string | null }

export class ReturnAddressError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ReturnAddressError"
  }
}

type Row = ShipFromAddress & { id: string }

const COLS = "id, name, street, city, state, zip, phone"

/** The default return address for one scope (seller scope when sellerId is
 *  set, house scope when it is null). Falls back to the most recent row in
 *  the scope if the default flag was lost. Null when nothing is saved. */
export async function getDefaultShipFrom(
  tenantId: string,
  sellerId: string | null,
): Promise<(ShipFromAddress & { id: string }) | null> {
  const rows = await pgQuery<Row>(
    `SELECT ${COLS} FROM public.ship_from_addresses
      WHERE tenant_id = $1 AND seller_id IS NOT DISTINCT FROM $2
      ORDER BY is_default DESC, updated_at DESC
      LIMIT 1`,
    [tenantId, sellerId],
  )
  return rows[0] ?? null
}

/** Save the scope's default return address (insert or update in place).
 *  Partial saves are allowed — completeness is enforced at label time. */
export async function upsertDefaultShipFrom(
  tenantId: string,
  sellerId: string | null,
  addr: ShipFromAddress,
): Promise<ShipFromAddress & { id: string }> {
  const clean = {
    name: (addr.name || "").trim(),
    street: (addr.street || "").trim(),
    city: (addr.city || "").trim(),
    state: (addr.state || "").trim().toUpperCase(),
    zip: (addr.zip || "").trim(),
    phone: (addr.phone || "").trim(),
  }
  const existing = await getDefaultShipFrom(tenantId, sellerId)
  if (existing) {
    const rows = await pgQuery<Row>(
      `UPDATE public.ship_from_addresses
          SET name = $3, street = $4, city = $5, state = $6, zip = $7, phone = $8,
              is_default = true, updated_at = now()
        WHERE id = $1 AND tenant_id = $2
        RETURNING ${COLS}`,
      [existing.id, tenantId, clean.name, clean.street, clean.city, clean.state, clean.zip, clean.phone],
    )
    return rows[0]
  }
  const rows = await pgQuery<Row>(
    `INSERT INTO public.ship_from_addresses
       (tenant_id, seller_id, name, street, city, state, zip, phone, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
     RETURNING ${COLS}`,
    [tenantId, sellerId, clean.name, clean.street, clean.city, clean.state, clean.zip, clean.phone],
  )
  return rows[0]
}

/** Which scope ships this order? A seller order (seller_orders row) ships
 *  from the seller; anything else is a house order for its tenant. */
export async function scopeForOrder(orderId: string): Promise<ShipFromScope> {
  const sellerRows = await pgQuery<{ seller_id: string; tenant_id: string }>(
    `SELECT seller_id, tenant_id FROM public.seller_orders WHERE order_id = $1 LIMIT 1`,
    [orderId],
  )
  if (sellerRows[0]) {
    return { tenantId: sellerRows[0].tenant_id, sellerId: sellerRows[0].seller_id }
  }
  const orderRows = await pgQuery<{ tenant_id: string }>(
    `SELECT tenant_id FROM public.commerce_orders WHERE id = $1 LIMIT 1`,
    [orderId],
  )
  if (orderRows[0]) return { tenantId: orderRows[0].tenant_id, sellerId: null }
  return { tenantId: TENANT_ID(), sellerId: null }
}

function missingFields(a: ShipFromAddress): string[] {
  const missing: string[] = []
  if (!a.name) missing.push("name")
  if (!a.street) missing.push("street")
  if (!a.city) missing.push("city")
  if (!a.state) missing.push("state")
  if (!a.zip) missing.push("ZIP")
  return missing
}

/**
 * Resolve AND validate the return address for a label.
 * Scope precedence: explicit sellerId → order's seller → house (tenant).
 * Throws ReturnAddressError when the scoped address is unset or incomplete.
 */
export async function resolveShipFromForLabel(opts: {
  orderId?: string | null
  tenantId?: string | null
  sellerId?: string | null
}): Promise<ShipFromAddress> {
  let scope: ShipFromScope
  if (opts.sellerId) {
    scope = { tenantId: opts.tenantId || TENANT_ID(), sellerId: opts.sellerId }
  } else if (opts.orderId) {
    // The order decides its own scope — a seller order ships from the seller
    // even when an admin of the tenant buys the label.
    scope = await scopeForOrder(opts.orderId)
  } else {
    scope = { tenantId: opts.tenantId || TENANT_ID(), sellerId: null }
  }

  const row = await getDefaultShipFrom(scope.tenantId, scope.sellerId)
  const where =
    scope.sellerId != null
      ? "Seller Portal → Shipping → Return Address"
      : "Admin → Settings → Shipping → Label return address"

  if (!row) {
    throw new ReturnAddressError(
      scope.sellerId != null
        ? `Return address not set — this order's seller has not set a label return address (${where}). A label can't be bought until they do.`
        : `Return address not set — set your label return address in ${where} before buying labels.`,
    )
  }
  const missing = missingFields(row)
  if (missing.length) {
    throw new ReturnAddressError(
      `Return address incomplete — missing ${missing.join(", ")}. Complete it in ${where} before buying labels.`,
    )
  }
  // The shipper's email rides the resolved address (carriers reject a
  // label whose from address has none — the purchase failed on exactly
  // that). Seller scope: the seller's own email. House scope: the
  // tenant's support email. A missing email stays unset and the
  // carrier's own error names it.
  let email: string | undefined
  try {
    if (scope.sellerId != null) {
      const r = await pgQuery<{ email: string | null }>(
        `SELECT email FROM public.sellers WHERE id = $1 LIMIT 1`,
        [scope.sellerId],
      )
      email = r[0]?.email || undefined
    } else {
      const r = await pgQuery<{ support_email: string | null }>(
        `SELECT support_email FROM public.tenants WHERE id = $1 LIMIT 1`,
        [scope.tenantId],
      )
      email = r[0]?.support_email || undefined
    }
  } catch {
    email = undefined
  }
  return {
    name: row.name,
    street: row.street,
    city: row.city,
    state: row.state,
    zip: row.zip,
    phone: row.phone,
    email,
  }
}

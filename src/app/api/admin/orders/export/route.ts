import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// GET /api/admin/orders/export — CSV export of all orders + line items.
// Returns a text/csv file download.
// ============================================================================

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("payments", "read")
  if (gate) return gate

  const status = req.nextUrl.searchParams.get("status") || ""

  // The orders page passes its VIEW id here (unfulfilled / ready / pickup /
  // shipped / delivered), not a stored fulfillment_status — and stored
  // values are mixed-case ('pending', 'UNFULFILLED', …). Translate the view
  // id into the SAME predicate the page's matchesFilter applies client-side;
  // a literal `fulfillment_status = $status` matched zero rows for every
  // view except a coincidentally-cased one, so filtered exports came back
  // empty while the view showed orders. Unknown values fall back to a
  // case-insensitive literal match.
  const VIEW_PREDICATES: Record<string, string> = {
    unfulfilled: `UPPER(o.fulfillment_status) IN ('PENDING','UNFULFILLED','PROCESSING')`,
    ready: `(UPPER(o.fulfillment_status) = 'PROCESSING' OR (UPPER(o.fulfillment_status) = 'PENDING' AND COALESCE(o.fulfillment_method, '') NOT ILIKE '%pickup%'))`,
    pickup: `(COALESCE(o.fulfillment_method, '') ILIKE '%pickup%' AND UPPER(o.fulfillment_status) NOT IN ('DELIVERED','DISPATCHED'))`,
    shipped: `UPPER(o.fulfillment_status) = 'SHIPPED'`,
    delivered: `UPPER(o.fulfillment_status) IN ('DELIVERED','DISPATCHED')`,
  }
  const viewPredicate = status ? VIEW_PREDICATES[status.toLowerCase()] : undefined
  const useLiteral = Boolean(status) && !viewPredicate

  const rows = await withPg(async (client) => {
    const listRes = await client.query(`
      SELECT
        o.id::text AS id, o.email, o.customer_email, o.customer_id::text AS customer_id,
        o.status, o.payment_status, o.fulfillment_status, o.fulfillment_method,
        o.subtotal, o.total_amount, o.shipping_address, o.notes,
        o.tracking_number, o.carrier, o.tracking_status,
        o.created_at::text AS created_at
      FROM public.commerce_orders o
      WHERE o.tenant_id = $1
        ${viewPredicate ? `AND ${viewPredicate}` : ""}
        ${useLiteral ? `AND UPPER(o.fulfillment_status) = UPPER($2)` : ""}
      ORDER BY o.created_at DESC
    `, useLiteral ? [resolveTenantId(req), status] : [resolveTenantId(req)])

    const ids = listRes.rows.map((r: any) => r.id)
    let itemsByOrder = new Map<string, any[]>()
    if (ids.length > 0) {
      const itemsRes = await client.query(
        `SELECT order_id::text AS order_id, name, quantity, unit_price
         FROM public.commerce_order_items
         WHERE order_id::text = ANY($1::text[])`,
        [ids],
      )
      for (const it of itemsRes.rows) {
        const arr = itemsByOrder.get(it.order_id) || []
        arr.push(it)
        itemsByOrder.set(it.order_id, arr)
      }
    }

    return listRes.rows.map((r: any) => ({
      ...r,
      items: itemsByOrder.get(r.id) || [],
    }))
  })

  // Build CSV
  const headers = [
    "Order ID", "Date", "Email", "Customer", "Status", "Payment Status",
    "Fulfillment Status", "Method", "Subtotal", "Total", "Tracking #",
    "Carrier", "Shipping Address", "Items",
  ]
  const csvLines = [headers.join(",")]
  for (const o of (rows || [])) {
    const items = (o.items || []).map((it: any) => `${it.quantity}x ${it.name}`).join("; ")
    const row = [
      o.id,
      o.created_at || "",
      o.email || o.customer_email || "",
      o.customer_id || "",
      o.status || "",
      o.payment_status || "",
      o.fulfillment_status || "",
      o.fulfillment_method || "",
      o.subtotal || "",
      o.total_amount || "",
      o.tracking_number || "",
      o.carrier || "",
      `"${(o.shipping_address || "").replace(/"/g, '""')}"`,
      `"${items.replace(/"/g, '""')}"`,
    ]
    csvLines.push(row.join(","))
  }

  const csv = csvLines.join("\n")
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="orders-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

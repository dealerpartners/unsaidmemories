import { toResendVariables } from "@/lib/email/resend-templates";
import { NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { sendEmail } from "@/lib/email"
import { deferWork } from "@/lib/defer"
import { orderShippedHtml } from "@/lib/email/templates/commerce"
import { getCurrentUser } from "@/lib/auth/server"

// Supplier-orders desk. Needs the "purchasing" module (admins always pass;
// the owner can give this function to an employee under Staff permissions).
const STATUSES = ["to_order", "ordered", "shipped", "cancelled"]

export async function GET(req: Request) {
  const denied = await requireModuleApi("purchasing", "read")
  if (denied) return denied
  const status = new URL(req.url).searchParams.get("status") || "to_order"
  if (!STATUSES.includes(status)) return NextResponse.json({ error: "Bad status" }, { status: 400 })

  const data = await withPg(async (c) => {
    const counts = await c.query(
      `SELECT status, count(*)::int n FROM public.commerce_supplier_orders WHERE tenant_id=$1 GROUP BY status`,
      [resolveTenantId(req)],
    )
    const rows = await c.query(
      `SELECT o.*, s.name AS supplier_name, s.order_url, s.site_url, s.method
         FROM public.commerce_supplier_orders o
         LEFT JOIN public.commerce_suppliers s ON s.id = o.supplier_id
        WHERE o.tenant_id=$1 AND o.status=$2
        ORDER BY o.created_at ASC LIMIT 200`,
      [resolveTenantId(req), status],
    )
    return {
      counts: Object.fromEntries(counts.rows.map((r: any) => [r.status, r.n])),
      rows: rows.rows,
    }
  })
  return NextResponse.json(data ?? { counts: {}, rows: [] })
}

export async function POST(req: Request) {
  const denied = await requireModuleApi("purchasing", "write")
  if (denied) return denied
  const body = await req.json().catch(() => ({}))
  const id = String(body.id || "")
  const action = String(body.action || "")
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Valid id required" }, { status: 400 })
  const who = (await getCurrentUser())?.email || "staff"

  const result = await withPg(async (c) => {
    const cur = await c.query(`SELECT * FROM public.commerce_supplier_orders WHERE id=$1 AND tenant_id=$2`, [id, resolveTenantId(req)])
    const row = cur.rows[0]
    if (!row) return { error: "Not found", status: 404 }

    if (action === "mark_ordered") {
      const ref = String(body.supplier_order_ref || "").trim()
      if (!ref) return { error: "Enter the supplier's order number.", status: 400 }
      await c.query(
        `UPDATE public.commerce_supplier_orders
            SET status='ordered', supplier_order_ref=$2, placed_by=$3, placed_at=now(), updated_at=now() WHERE id=$1`,
        [id, ref.slice(0, 120), who],
      )
      return { ok: true }
    }

    if (action === "mark_shipped") {
      const tracking = String(body.tracking_number || "").trim()
      const carrier = String(body.carrier || "").trim()
      if (!tracking) return { error: "Enter the tracking number.", status: 400 }
      await c.query(
        `UPDATE public.commerce_supplier_orders
            SET status='shipped', tracking_number=$2, carrier=$3, shipped_at=now(), updated_at=now() WHERE id=$1`,
        [id, tracking.slice(0, 120), carrier.slice(0, 60) || null],
      )
      // Reflect on the customer's order once every supplier order is shipped.
      const open = await c.query(
        `SELECT count(*)::int n FROM public.commerce_supplier_orders
          WHERE order_id=$1 AND status NOT IN ('shipped','cancelled')`,
        [row.order_id],
      )
      if (open.rows[0].n === 0) {
        await c.query(
          `UPDATE public.commerce_orders SET fulfillment_status='shipped', tracking_number=$2, carrier=$3, updated_at=now() WHERE id=$1`,
          [row.order_id, tracking.slice(0, 120), carrier.slice(0, 60) || null],
        )
      }
      if (row.customer_email) {
        const items: any[] = Array.isArray(row.items) ? row.items : []
        await deferWork(() => sendEmail({
          to: row.customer_email,
          template: "order_shipped",
          relatedOrderId: row.order_id,
          subject: "Your UnSaid Memories order is on its way",
          html: orderShippedHtml({
            firstName: String(row.customer_email).split("@")[0],
            orderNumber: row.order_id,
            carrier: carrier || undefined,
            trackingNumber: tracking,
            itemNames: items.map((i) => String(i.name)),
          }),
          variables: toResendVariables({
            firstName: String(row.customer_email).split("@")[0],
            orderNumber: row.order_id,
            carrier: carrier || "",
            trackingNumber: tracking || "",
            trackingUrl: "",
            itemList: items.map((i) => String(i.name)).join(", "),
            estimatedDelivery: "",
          }),
        }).catch((e: any) => console.error("[supplier-orders] shipped email failed:", e?.message)))
      }
      return { ok: true }
    }

    if (action === "cancel") {
      await c.query(`UPDATE public.commerce_supplier_orders SET status='cancelled', updated_at=now() WHERE id=$1`, [id])
      return { ok: true }
    }
    return { error: "Unknown action", status: 400 }
  })

  if (!result) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}

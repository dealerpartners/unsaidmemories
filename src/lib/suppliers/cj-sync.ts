// ---------------------------------------------------------------------------
// cj-sync.ts — the transmit + tracking steps for CJ supplier-order rows.
//
// The established pipeline (Stripe webhook → createSupplierOrders) creates
// commerce_supplier_orders rows with supplier_id 'cj-dropshipping'; staff
// work them at the Supplier Orders desk. pushCjSupplierOrder transmits one
// row to CJ (Create Order V3, payType=2 — CJ charges the account balance
// inside the call), mirroring pushKoleSupplierOrder's discipline exactly:
//   • wrong-supplier and already-pushed rows are refused;
//   • an unparseable ship-to (no ZIP) is refused — never a guessed address;
//   • a line whose catalog item carries no cj_vid is refused by name —
//     a partial CJ order would strand the rest of the customer's items;
//   • the row is marked 'ordered' ONLY with a real CJ order id back;
//   • config errors throw CjNotConfiguredError before any network call.
// It is deliberately NOT auto-fired from the webhook: a human confirms
// before money moves, same as every other supplier on the desk (Kole's
// rule). Exposed via POST /api/admin/suppliers/cj/push-order.
//
// syncCjSupplierOrderTracking pulls CJ's order state for an 'ordered' row;
// when CJ reports a tracking number on a shipped order it applies the
// desk's mark_shipped effects verbatim (row → shipped, the parent order
// flips once every supplier order is shipped, the customer is emailed).
// Exposed via POST /api/admin/suppliers/cj/sync-tracking.
//
// Idempotency note: our orderNumber (AAP-<platform order id>) is CJ's
// partner-unique order identifier. If a create ever succeeded at CJ but
// its response was lost, a re-push surfaces CJ's response on the row's
// notes via the error path for staff to reconcile — it never silently
// marks anything ordered.
// ---------------------------------------------------------------------------

import { withPg } from "@/lib/crm/enterprise"
import { parseShipTo } from "@/lib/orders/lifecycle"
import { sendEmail } from "@/lib/email"
import { orderShippedHtml } from "@/lib/email/templates/commerce"
import {
  CJ_SUPPLIER_ID,
  cjConfig,
  cjMissingConfig,
  cjVariantTotalStock,
  createCjOrder,
  listCjOrders,
  queryCjVariantStock,
  CjApiError,
  CjNotConfiguredError,
  type CjCreateOrderInput,
} from "./cj"

export type CjPushResult = {
  supplierOrderId: string
  cjOrderRef: string
  items: { vid: string; quantity: number; name: string }[]
  amounts: { orderAmount?: unknown; actualPayment?: unknown; postageAmount?: unknown }
}

export async function pushCjSupplierOrder(
  supplierOrderId: string,
  tenantId: string,
  placedBy: string,
): Promise<CjPushResult> {
  const loaded = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT * FROM public.commerce_supplier_orders WHERE id = $1 AND tenant_id = $2`,
      [supplierOrderId, tenantId],
    )
    const row = rows[0]
    if (!row) return { error: "Supplier order not found", status: 404 } as const
    if (String(row.supplier_id) !== CJ_SUPPLIER_ID) {
      return { error: `Supplier order belongs to '${row.supplier_id}', not CJ Dropshipping`, status: 400 } as const
    }
    if (String(row.status) !== "to_order") {
      return { error: `Supplier order is already '${row.status}' — refusing to push twice`, status: 409 } as const
    }
    const { rows: orderRows } = await c.query(
      `SELECT id, shipping_address, customer_email, customer_id FROM public.commerce_orders
        WHERE id::text = $1 AND tenant_id = $2`,
      [String(row.order_id), tenantId],
    )
    const order = orderRows[0] || {}
    let customerName = ""
    let phone: string | undefined
    if (order.customer_id) {
      const { rows: custRows } = await c
        .query(`SELECT * FROM public.customers WHERE id::text = $1`, [String(order.customer_id)])
        .catch(() => ({ rows: [] as any[] }))
      const cust = custRows[0]
      if (cust) {
        customerName = [cust.firstName, cust.lastName].filter(Boolean).join(" ").trim() || String(cust.name || "")
        phone = cust.phone || cust.phoneNumber || cust.mobile || undefined
      }
    }
    // Resolve every line's CJ variant id from the catalog item metadata.
    const rawItems: any[] = Array.isArray(row.items) ? row.items : []
    const ids = rawItems.map((li) => String(li?.productId || "")).filter(Boolean)
    const vidByProduct = new Map<string, string>()
    if (ids.length) {
      const { rows: itemRows } = await c.query(
        `SELECT id::text AS id, metadata->>'cj_vid' AS cj_vid
           FROM public.commerce_catalog_items
          WHERE tenant_id = $1 AND id::text = ANY($2::text[])`,
        [tenantId, ids],
      )
      for (const r of itemRows) {
        if (r.cj_vid) vidByProduct.set(String(r.id), String(r.cj_vid))
      }
    }
    return { row, order, customerName, phone, vidByProduct } as const
  })
  if (!loaded) throw new Error("Database unavailable")
  if ("error" in loaded) {
    const err = new Error(loaded.error) as Error & { status?: number }
    err.status = loaded.status
    throw err
  }
  const { row, order, customerName, phone, vidByProduct } = loaded

  const shipTo =
    parseShipTo(order.shipping_address, customerName || "Customer") ??
    parseShipTo(row.ship_to, customerName || "Customer")
  if (!shipTo) {
    throw new Error("No parseable ship-to address with a ZIP on this order — refusing to push a guessed address to CJ")
  }

  const rawItems: any[] = Array.isArray(row.items) ? row.items : []
  const products: CjCreateOrderInput["products"] = []
  const lines: CjPushResult["items"] = []
  const missingVid: string[] = []
  for (const li of rawItems) {
    const productId = String(li?.productId || "")
    const quantity = Math.max(0, Math.trunc(Number(li?.quantity) || 0))
    if (!productId || quantity === 0) continue
    const vid = vidByProduct.get(productId)
    if (!vid) {
      missingVid.push(String(li?.name || productId))
      continue
    }
    products.push({ vid, quantity, storeLineItemId: productId })
    lines.push({ vid, quantity, name: String(li?.name || "") })
  }
  if (missingVid.length) {
    throw new Error(
      `These lines carry no CJ variant id and cannot be ordered from CJ: ${missingVid.join("; ")} — refusing a partial push`,
    )
  }
  if (!products.length) throw new Error("Supplier order has no items to push")

  const cfg = cjConfig()
  if (!cfg.logisticName) {
    // cjConfigured() at the route normally catches this first; keep the
    // guard here too so a direct caller can never half-push.
    throw new CjNotConfiguredError(cjMissingConfig())
  }

  const input: CjCreateOrderInput = {
    orderNumber: `AAP-${String(row.order_id)}`.slice(0, 50),
    shippingCustomerName: shipTo.name.slice(0, 50),
    shippingAddress: shipTo.street1,
    shippingCity: shipTo.city,
    shippingProvince: shipTo.state,
    shippingZip: shipTo.zip,
    shippingCountryCode: "US",
    shippingCountry: "United States",
    ...(phone ? { shippingPhone: String(phone).slice(0, 20) } : {}),
    ...((row.customer_email || order.customer_email)
      ? { email: String(row.customer_email || order.customer_email).slice(0, 50) }
      : {}),
    remark: `UnSaid Memories order ${String(row.order_id)}`,
    logisticName: cfg.logisticName,
    fromCountryCode: cfg.fromCountryCode,
    products,
  }
  // Throws CjNotConfiguredError before any network call when env is unset,
  // and CjApiError on a CJ rejection — no fake "ordered" state is written.
  const created = await createCjOrder(input)
  const ref = created?.orderId != null ? String(created.orderId) : ""
  if (!ref) {
    await withPg(async (c) => {
      await c.query(
        `UPDATE public.commerce_supplier_orders
            SET notes = $2, updated_at = now() WHERE id = $1 AND tenant_id = $3`,
        [
          supplierOrderId,
          `CJ accepted a push at ${new Date().toISOString()} but returned no order id. Raw: ${JSON.stringify(created).slice(0, 400)}`,
          tenantId,
        ],
      )
    }).catch(() => {})
    throw new CjApiError(
      502,
      "CJ accepted the order push but returned no order id — the row was NOT marked ordered; verify in the CJ portal before pushing again",
    )
  }

  const amounts = {
    orderAmount: created.orderAmount,
    actualPayment: created.actualPayment,
    postageAmount: created.postageAmount,
  }
  await withPg(async (c) => {
    await c.query(
      `UPDATE public.commerce_supplier_orders
          SET status = 'ordered', supplier_order_ref = $2, placed_by = $3,
              placed_at = now(),
              notes = COALESCE(notes, '') || $4,
              updated_at = now()
        WHERE id = $1 AND tenant_id = $5`,
      [
        supplierOrderId,
        ref.slice(0, 120),
        placedBy,
        ` [CJ push ${new Date().toISOString()}: orderAmount=${amounts.orderAmount ?? "?"} actualPayment=${amounts.actualPayment ?? "?"} postage=${amounts.postageAmount ?? "?"}]`,
        tenantId,
      ],
    )
  })
  return { supplierOrderId, cjOrderRef: ref, items: lines, amounts }
}

export type CjTrackingResult = {
  supplierOrderId: string
  synced: boolean
  cjStatus?: string
  trackingNumber?: string
  carrier?: string
  reason?: string
}

export async function syncCjSupplierOrderTracking(
  supplierOrderId: string,
  tenantId: string,
): Promise<CjTrackingResult> {
  const loaded = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT * FROM public.commerce_supplier_orders WHERE id = $1 AND tenant_id = $2`,
      [supplierOrderId, tenantId],
    )
    const row = rows[0]
    if (!row) return { error: "Supplier order not found", status: 404 } as const
    if (String(row.supplier_id) !== CJ_SUPPLIER_ID) {
      return { error: `Supplier order belongs to '${row.supplier_id}', not CJ Dropshipping`, status: 400 } as const
    }
    if (String(row.status) !== "ordered" || !row.supplier_order_ref) {
      return {
        error: `Supplier order is '${row.status}' — tracking sync needs an ordered CJ row with a CJ order ref`,
        status: 409,
      } as const
    }
    return { row } as const
  })
  if (!loaded) throw new Error("Database unavailable")
  if ("error" in loaded) {
    const err = new Error(loaded.error) as Error & { status?: number }
    err.status = loaded.status
    throw err
  }
  const { row } = loaded
  const ref = String(row.supplier_order_ref)

  const entries = await listCjOrders([ref])
  const entry =
    entries.find((e) => String(e.orderId || "") === ref || String(e.cjOrderId || "") === ref) ?? entries[0]
  if (!entry) {
    return { supplierOrderId, synced: false, reason: "CJ has no record of this order yet" }
  }
  const cjStatus = String(entry.status || entry.orderStatus || "") || undefined
  const tracking = entry.trackNumber ? String(entry.trackNumber) : ""
  const shippedStates = ["SHIPPED", "DELIVERED"]
  if (!tracking || (cjStatus && !shippedStates.includes(cjStatus.toUpperCase()))) {
    return { supplierOrderId, synced: false, cjStatus, reason: "No tracking number from CJ yet" }
  }
  const carrier = entry.trackingProvider ? String(entry.trackingProvider) : "CJ Logistics"

  // The desk's mark_shipped effects, applied from CJ's own report.
  await withPg(async (c) => {
    await c.query(
      `UPDATE public.commerce_supplier_orders
          SET status = 'shipped', tracking_number = $2, carrier = $3, shipped_at = now(), updated_at = now()
        WHERE id = $1 AND tenant_id = $4`,
      [supplierOrderId, tracking.slice(0, 120), carrier.slice(0, 60), tenantId],
    )
    const open = await c.query(
      `SELECT count(*)::int n FROM public.commerce_supplier_orders
        WHERE order_id = $1 AND status NOT IN ('shipped','cancelled')`,
      [row.order_id],
    )
    if (open.rows[0].n === 0) {
      await c.query(
        `UPDATE public.commerce_orders SET fulfillment_status = 'shipped', tracking_number = $2, carrier = $3, updated_at = now() WHERE id = $1`,
        [row.order_id, tracking.slice(0, 120), carrier.slice(0, 60)],
      )
    }
  })
  if (row.customer_email) {
    const items: any[] = Array.isArray(row.items) ? row.items : []
    await sendEmail({
      to: row.customer_email,
      template: "order_shipped",
      relatedOrderId: row.order_id,
      subject: "Your UnSaid Memories order is on its way",
      html: orderShippedHtml({
        firstName: String(row.customer_email).split("@")[0],
        orderNumber: row.order_id,
        carrier,
        trackingNumber: tracking,
        itemNames: items.map((i) => String(i.name)),
      }),
    }).catch((e: any) => console.error("[cj-sync] shipped email failed:", e?.message))
  }
  return { supplierOrderId, synced: true, cjStatus, trackingNumber: tracking, carrier }
}

// ---------------------------------------------------------------------------
// Inventory sync — pull CJ's live count for every catalog variant that
// carries a cj_vid and write it where the catalog reads counts:
// erp_product_variants.attributes.stock_quantity (+ in_stock derived
// from it). Added 2026-10-28: before this, NOTHING imported or refreshed
// CJ counts — 6,075 of 8,075 CJ variants had no count at all, and no
// Google path could publish one.
//
// Discipline:
//   • Gated on CJ_API_KEY alone (inventory needs no logistics channel);
//     unconfigured throws CjNotConfiguredError before any network call.
//   • CJ rate limit is 1 call/second: variants are processed serially
//     with a 1.1s spacing. A run is bounded by `limit`; the cron calls
//     it every 2 hours and rotation is by updated_at (this writer stamps
//     updated_at on every write), so the whole catalog cycles.
//   • Variants with NO count yet sort first (stock_quantity NULLS FIRST)
//     — a backfill drains the missing before it refreshes the stale.
//   • A variant whose CJ call fails is counted and named in the result;
//     the run never aborts on one variant, and a failed variant's stored
//     count is left untouched (never zeroed on an error).
// ---------------------------------------------------------------------------

export type CjInventorySyncResult = {
  scanned: number
  updated: number
  zeroStock: number
  failed: number
  failures: { vid: string; error: string }[]
}

const CJ_STOCK_SPACING_MS = 1100

export async function syncCjInventoryStock(
  tenantId: string,
  opts?: { limit?: number },
): Promise<CjInventorySyncResult> {
  if (!cjConfig().apiKey) throw new CjNotConfiguredError(cjMissingConfig())
  const limit = Math.max(1, Math.min(1000, Math.trunc(opts?.limit ?? 250)))

  const variants = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT id, attributes->>'cj_vid' AS cj_vid
         FROM public.erp_product_variants
        WHERE tenant_id = $1 AND attributes->>'cj_vid' IS NOT NULL
        ORDER BY (attributes->>'stock_quantity') IS NOT NULL, updated_at ASC
        LIMIT $2`,
      [tenantId, limit],
    )
    return rows as { id: string; cj_vid: string }[]
  })

  const result: CjInventorySyncResult = { scanned: 0, updated: 0, zeroStock: 0, failed: 0, failures: [] }
  if (!variants) {
    // The variant read itself failed (withPg null) — report it as a
    // failed run, never as a clean zero-scan.
    result.failed++
    result.failures.push({ vid: "*", error: "variant read failed (database unavailable)" })
    return result
  }
  for (const v of variants) {
    result.scanned++
    try {
      const count = cjVariantTotalStock(await queryCjVariantStock(String(v.cj_vid)))
      await withPg(async (c) => {
        await c.query(
          `UPDATE public.erp_product_variants
              SET attributes = COALESCE(attributes, '{}'::jsonb)
                               || jsonb_build_object('stock_quantity', $2::int, 'in_stock', $2::int > 0),
                  updated_at = now()
            WHERE id = $1`,
          [v.id, count],
        )
      })
      result.updated++
      if (count === 0) result.zeroStock++
    } catch (e) {
      result.failed++
      result.failures.push({
        vid: String(v.cj_vid),
        error: e instanceof CjApiError ? e.message : e instanceof Error ? e.message : String(e),
      })
    }
    await new Promise((r) => setTimeout(r, CJ_STOCK_SPACING_MS))
  }
  return result
}

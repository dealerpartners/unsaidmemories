// ---------------------------------------------------------------------------
// shipping/usps.ts — USPS tracking applied to commerce_orders.
//
// Tracking itself lives in lib/shipping/usps-client.ts (trackPackage —
// OAuth2 credentials from Admin → Settings → Shipping / env, POST
// /tracking/v3r2/tracking). This module adapts that result to the
// commerce_orders state machine.
//
// HONESTY RULE: when the carrier API is unreachable, trackPackage returns
// status UNKNOWN with `unavailable: true`. That is NOT a delivery status —
// applyUspsTrackingToOrder performs NO writes in that case. (This module
// previously invented DELIVERED vs IN_TRANSIT from the tracking number's
// last digit and persisted it; that simulation is deleted.)
//
// On a REAL tracking lookup, this helper:
//   • UPDATEs commerce_orders (tracking_number, carrier, tracking_status,
//     status, fulfillment_status)
//   • INSERTs a commerce_fulfillment_events row (the chronological status
//     history; order_id=NULL because the FK references erp_orders, not
//     commerce_orders — the commerce_order_id lives in the payload)
//   • UPSERTs a commerce_shipping_labels row
//   • revalidates /admin/orders + /customer/orders
// ---------------------------------------------------------------------------

import { revalidatePath } from "next/cache"
import { repo } from "@/lib/repo"
import { withPg, TENANT_ID } from "@/lib/crm/enterprise"
import { trackPackage } from "./usps-client"

export type UspsTrackStatus = "DELIVERED" | "IN_TRANSIT" | "PRE_TRANSIT" | "UNKNOWN"

export type UspsTrackResult = {
  status: UspsTrackStatus
  summary: string
  isDelivered: boolean
  simulated: boolean
  /** True when the carrier API could not be reached — NOT a carrier answer. */
  unavailable?: boolean
}

export async function trackUsps(trackingNumber: string): Promise<UspsTrackResult> {
  const r = await trackPackage(trackingNumber)
  return {
    status: r.status,
    summary: r.summary,
    isDelivered: r.isDelivered,
    simulated: false,
    unavailable: r.unavailable,
  }
}

// Apply a USPS tracking lookup to a single commerce_orders row and persist
// the result. Writes commerce_orders UPDATE + commerce_fulfillment_events
// INSERT + commerce_shipping_labels UPSERT — but ONLY for a real carrier
// answer. An unavailable/UNKNOWN result changes nothing. Never throws.
export async function applyUspsTrackingToOrder(
  orderId: string,
  trackingNumber: string,
): Promise<{ ok: boolean; order: any; result: UspsTrackResult; error?: string }> {
  try {
    const result = await trackUsps(trackingNumber)

    if (result.unavailable || result.status === "UNKNOWN") {
      const existing = await repo.get("commerce_orders", orderId)
      return { ok: true, order: existing, result }
    }

    const tenant = TENANT_ID()

    const existing = await repo.get("commerce_orders", orderId)
    const oldStatus = (existing as any)?.fulfillment_status || "pending"
    const newStatus = result.isDelivered ? "delivered" : "shipped"

    const updated = (await repo.update("commerce_orders", orderId, {
      tracking_number: trackingNumber,
      carrier: "USPS",
      tracking_status: result.status,
      status: result.isDelivered ? "delivered" : "shipped",
      fulfillment_status: newStatus,
      updated_at: new Date().toISOString(),
    } as any)) as any

    // INSERT a fulfillment event (chronological status history).
    // order_id FK references erp_orders, not commerce_orders — set NULL +
    // put commerce_order_id in the payload. Non-fatal.
    await withPg(async (client) => {
      await client.query(
        `INSERT INTO public.commerce_fulfillment_events
           (tenant_id, order_id, event_type, old_status, new_status, payload)
         VALUES ($1, NULL, $2, $3, $4, $5)`,
        [
          tenant,
          result.isDelivered ? "delivered" : "tracking_updated",
          oldStatus,
          newStatus,
          JSON.stringify({
            commerce_order_id: orderId,
            carrier: "USPS",
            tracking_number: trackingNumber,
            tracking_status: result.status,
            summary: result.summary,
            simulated: false,
          }),
        ],
      )
    }).catch((e) => {
      console.error("[usps] fulfillment event insert failed (non-fatal):", e?.message || e)
    })

    // UPSERT a shipping label row. Non-fatal.
    await withPg(async (client) => {
      await client.query(
        `INSERT INTO public.commerce_shipping_labels
           (tenant_id, carrier, tracking_number, label_type, created_at)
         VALUES ($1, 'USPS', $2, 'shipping', now())
         ON CONFLICT DO NOTHING`,
        [tenant, trackingNumber],
      )
    }).catch((e) => {
      console.error("[usps] shipping label upsert failed (non-fatal):", e?.message || e)
    })

    try {
      revalidatePath("/customer/orders")
    } catch {
      /* revalidate is best-effort */
    }
    return { ok: true, order: updated, result }
  } catch (e: any) {
    return { ok: false, order: null, result: { status: "UNKNOWN", summary: "", isDelivered: false, simulated: false }, error: e?.message || "Unknown error" }
  }
}

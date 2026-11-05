import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { repo } from "@/lib/repo"
import { applyUspsTrackingToOrder } from "@/lib/shipping/usps"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// POST /api/admin/shipping/usps — single-order USPS tracking lookup.
//   Body: { orderId, trackingNumber }
//   Gated by requireModuleApi("inventory").
//
// Looks up the USPS tracking status for the given tracking number (live API
// if USPS_USER_ID is set, otherwise a deterministic simulation for dev),
// then UPDATEs the commerce_orders row:
//   • tracking_number, carrier='USPS', tracking_status
//   • status: delivered → 'delivered' / in_transit → 'shipped'
//   • fulfillment_status: delivered → 'delivered' / in_transit → 'shipped'
//   • updated_at = now()
//
// After update, revalidates /admin/orders + /customer/orders so the new
// status shows up immediately.
// Returns { success: true, status, order } or { success: false, error } w/ 500.
// ============================================================================

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("inventory", "write")
  if (gate) return gate

  try {
    const body = await req.json().catch(() => ({}))
    const orderId = String(body?.orderId || "").trim()
    const trackingNumber = String(body?.trackingNumber || "").trim()

    if (!orderId || !trackingNumber) {
      return NextResponse.json(
        { success: false, error: "orderId and trackingNumber are required." },
        { status: 400 },
      )
    }

    const existing = await repo.get("commerce_orders", orderId)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Order ${orderId} not found.` },
        { status: 404 },
      )
    }

    const { ok, order, result, error } = await applyUspsTrackingToOrder(orderId, trackingNumber)
    if (!ok) {
      return NextResponse.json({ success: false, error: error || "USPS tracking failed." }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      isDelivered: result.isDelivered,
      simulated: result.simulated,
      summary: result.summary,
      order,
    })
  } catch (e: any) {
    console.error("[POST /api/admin/shipping/usps]", e)
    return NextResponse.json(
      { success: false, error: e?.message || "USPS tracking failed." },
      { status: 500 },
    )
  }
}

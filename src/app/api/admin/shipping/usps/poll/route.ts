import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { repo } from "@/lib/repo"
import { applyUspsTrackingToOrder } from "@/lib/shipping/usps"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// POST /api/admin/shipping/usps/poll — cron-like background USPS refresh.
//   Gated by requireModuleApi("inventory"). Body: {} (no params).
//
// Loops over every commerce_orders row where:
//   fulfillment_status = 'shipped'
//   AND tracking_status != 'DELIVERED'
//   AND tracking_number IS NOT NULL
//
// For each, re-runs the USPS lookup (live XML API when USPS_USER_ID is set,
// otherwise deterministic simulation) and updates the row's tracking_status,
// fulfillment_status, and status.
//
// Returns { polled: N, delivered: M, results: [{ orderId, status, ... }] }.
//
// This powers the admin "Refresh all tracking" button — a manual trigger
// rather than a true cron, so it doesn't depend on external infra.
// ============================================================================

export async function POST(_req: NextRequest) {
  const gate = await requireModuleApi("inventory", "write")
  if (gate) return gate

  try {
    const orders = (await repo.list("commerce_orders")) as any[]
    const toPoll = orders.filter((o: any) =>
      String(o.fulfillment_status || "") === "shipped" &&
      String(o.tracking_status || "") !== "DELIVERED" &&
      !!o.tracking_number,
    )

    let delivered = 0
    const results: any[] = []
    for (const o of toPoll) {
      const r = await applyUspsTrackingToOrder(String(o.id), String(o.tracking_number))
      if (r.ok && r.result.isDelivered) delivered++
      results.push({
        orderId: o.id,
        trackingNumber: o.tracking_number,
        status: r.result.status,
        isDelivered: r.result.isDelivered,
        ...(r.error ? { error: r.error } : {}),
      })
    }

    return NextResponse.json({
      polled: toPoll.length,
      delivered,
      results,
    })
  } catch (e: any) {
    console.error("[POST /api/admin/shipping/usps/poll]", e)
    return NextResponse.json(
      { ok: false, error: e?.message || "USPS polling failed" },
      { status: 500 },
    )
  }
}

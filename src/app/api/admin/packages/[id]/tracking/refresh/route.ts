import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg"
import type { SellerQueryFn } from "@/lib/sellers/attribution"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// POST /api/admin/packages/[id]/tracking/refresh — admin parity for
// the seller tracking refresh (contract step 10): re-read the
// carrier state for any package and apply it through the one
// tracking writer (missed-event recovery). Credentials follow the
// PACKAGE's seller through the step-9 gate — an admin refreshing a
// gray-label seller's package reads on the seller's own Shippo
// account, exactly as their label purchase did.
// ============================================================================

const q: SellerQueryFn = async (sql, params) =>
  (await pgQuery(sql, params as any[])) as Record<string, unknown>[]

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("orders", "write")
  if (gate) return gate
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "Missing package id" }, { status: 400 })
    const tenant = resolveTenantId(req)

    const { refreshPackageTracking } = await import("@/lib/fulfillment/tracking")
    const result = await refreshPackageTracking(q, {
      tenantId: tenant,
      packageId: id,
      actor: { kind: "admin" },
    })
    if (!result.available) {
      return NextResponse.json(
        {
          error: "tracking_store_not_installed",
          message: "Package tracking is not enabled yet (the fulfillment store is still being installed).",
        },
        { status: 503 },
      )
    }
    if (!result.found) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 })
    }
    return NextResponse.json({
      ok: true,
      packageId: id,
      refreshed: result.ok,
      ...(result.reason ? { reason: result.reason } : {}),
      ...(result.source ? { source: result.source } : {}),
      ...(result.result
        ? { action: result.result.decision.action, notified: result.result.notified }
        : {}),
    })
  } catch (e: any) {
    console.error("[admin/packages/tracking/refresh]", e?.message || e)
    return NextResponse.json({ error: "Tracking refresh failed" }, { status: 500 })
  }
}

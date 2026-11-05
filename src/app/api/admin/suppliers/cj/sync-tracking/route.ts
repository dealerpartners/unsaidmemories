import { NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { CjApiError, CjNotConfiguredError } from "@/lib/suppliers/cj"
import { syncCjSupplierOrderTracking } from "@/lib/suppliers/cj-sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/admin/suppliers/cj/sync-tracking  { supplierOrderId }
// Pulls the CJ order's current state; when CJ reports a tracking number
// on a shipped order, the supplier-order row is marked shipped with the
// same effects as the desk's manual mark_shipped (parent order flip +
// customer email). A not-yet-shipped order is an honest 200 with
// synced:false and CJ's status — never an error, never a fake ship.
export async function POST(req: Request) {
  const denied = await requireModuleApi("purchasing", "write")
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const supplierOrderId = String(body.supplierOrderId || "")
  if (!/^[0-9a-f-]{36}$/i.test(supplierOrderId)) {
    return NextResponse.json({ error: "Valid supplierOrderId required" }, { status: 400 })
  }

  try {
    const result = await syncCjSupplierOrderTracking(supplierOrderId, resolveTenantId(req))
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    if (e instanceof CjNotConfiguredError) {
      return NextResponse.json({ ok: false, configured: false, error: e.message, missing: e.missing }, { status: 503 })
    }
    if (e instanceof CjApiError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 502 })
    }
    const status = (e as { status?: number })?.status
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, error: message },
      { status: typeof status === "number" ? status : message === "Database unavailable" ? 503 : 500 },
    )
  }
}

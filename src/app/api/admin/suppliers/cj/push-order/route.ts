import { NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { getCurrentUser } from "@/lib/auth/server"
import {
  cjConfigured,
  cjMissingConfig,
  CjApiError,
  CjNotConfiguredError,
} from "@/lib/suppliers/cj"
import { pushCjSupplierOrder } from "@/lib/suppliers/cj-sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/admin/suppliers/cj/push-order  { supplierOrderId }
// Transmits one CJ supplier-order row (created by the checkout pipeline
// in commerce_supplier_orders) to the CJ API — Create Order V3 with
// balance payment — and records the returned CJ order id on the row.
// Needs the "purchasing" module. Until CJ_API_KEY / CJ_LOGISTIC_NAME are
// set in Vercel env, this returns an honest 503 — the row is never
// marked ordered without a real push.
export async function POST(req: Request) {
  const denied = await requireModuleApi("purchasing", "write")
  if (denied) return denied

  if (!cjConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "CJ Dropshipping is not configured — set the CJ API credentials in Vercel env and order pushes will run.",
        missing: cjMissingConfig(),
      },
      { status: 503 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const supplierOrderId = String(body.supplierOrderId || "")
  if (!/^[0-9a-f-]{36}$/i.test(supplierOrderId)) {
    return NextResponse.json({ error: "Valid supplierOrderId required" }, { status: 400 })
  }
  const who = (await getCurrentUser())?.email || "staff"

  try {
    const result = await pushCjSupplierOrder(supplierOrderId, resolveTenantId(req), who)
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

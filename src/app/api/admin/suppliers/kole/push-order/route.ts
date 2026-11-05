import { NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { getCurrentUser } from "@/lib/auth/server"
import {
  koleConfigured,
  koleMissingConfig,
  KoleApiError,
  KoleNotConfiguredError,
} from "@/lib/suppliers/kole"
import { pushKoleSupplierOrder } from "@/lib/suppliers/kole-sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/admin/suppliers/kole/push-order  { supplierOrderId }
// Transmits one Kole supplier-order row (created by the checkout pipeline
// in commerce_supplier_orders) to the Kole Orders API and records the
// returned order reference on the row. Needs the "purchasing" module.
// Until KOLE_ACCOUNT_ID / KOLE_API_KEY are set in Vercel env, this returns
// an honest 503 — the row is never marked ordered without a real push.
export async function POST(req: Request) {
  const denied = await requireModuleApi("purchasing", "write")
  if (denied) return denied

  if (!koleConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "Kole Imports is not configured — set the Kole API credentials in Vercel env and order pushes will run.",
        missing: koleMissingConfig(),
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
    const result = await pushKoleSupplierOrder(supplierOrderId, resolveTenantId(req), who)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    if (e instanceof KoleNotConfiguredError) {
      return NextResponse.json({ ok: false, configured: false, error: e.message, missing: e.missing }, { status: 503 })
    }
    if (e instanceof KoleApiError) {
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

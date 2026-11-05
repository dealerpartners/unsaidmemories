import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import {
  createWebhook, listDeliveries, listWebhooks, WebhookError,
} from "@/lib/support/webhooks"
import { resolveActingStaff } from "@/lib/support/actor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/webhooks — §16 OUTBOUND WEBHOOK registrations.
//   GET  → this tenant's registrations (secret never read back —
//          only hasSecret) + the most recent deliveries.
//   POST → register { name, url, eventTypes, secret?, isActive? }.
//          The secret is write-only: stored for signing, never
//          returned by any read shape.
// ============================================================================

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const webhooks = await listWebhooks(c, tenant)
    const deliveries = await listDeliveries(c, tenant, { limit: 25 })
    return NextResponse.json({ webhooks, deliveries })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const payload = await req.json().catch(() => null)
  if (!payload) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  const staff = await resolveActingStaff()
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    try {
      const webhook = await createWebhook(c, tenant, staff?.staffId ?? null, {
        name: String(payload.name || ""),
        url: String(payload.url || ""),
        eventTypes: payload.eventTypes ?? [],
        secret: payload.secret ? String(payload.secret) : null,
        isActive: payload.isActive !== false,
      })
      return NextResponse.json({ ok: true, webhook })
    } catch (e: any) {
      if (e instanceof WebhookError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
      }
      throw e
    }
  })
  return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
}

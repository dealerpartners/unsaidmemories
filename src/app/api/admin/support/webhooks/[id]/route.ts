import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import {
  deleteWebhook, getWebhook, listDeliveries, updateWebhook, WebhookError,
} from "@/lib/support/webhooks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/webhooks/[id]
//   GET    → one registration + its recent deliveries.
//   PATCH  → name / url / eventTypes / isActive, rotate the secret
//            (secret), or remove it (clearSecret). Absent secret
//            fields keep the stored secret — it is never read back.
//   DELETE → remove the registration (its deliveries cascade).
// ============================================================================

async function ctxId(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return id
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const id = await ctxId(ctx)
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const webhook = await getWebhook(c, tenant, id)
    if (!webhook) return NextResponse.json({ error: "Webhook not found" }, { status: 404 })
    const deliveries = await listDeliveries(c, tenant, { webhookId: id, limit: 25 })
    return NextResponse.json({ webhook, deliveries })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const id = await ctxId(ctx)
  const payload = await req.json().catch(() => null)
  if (!payload) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    try {
      const webhook = await updateWebhook(c, tenant, id, {
        name: payload.name,
        url: payload.url,
        eventTypes: payload.eventTypes,
        secret: payload.secret ? String(payload.secret) : undefined,
        clearSecret: payload.clearSecret === true,
        isActive: payload.isActive,
      })
      if (!webhook) return NextResponse.json({ ok: false, error: "Webhook not found" }, { status: 404 })
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

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const id = await ctxId(ctx)
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const removed = await deleteWebhook(c, tenant, id)
    if (!removed) return NextResponse.json({ ok: false, error: "Webhook not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  })
  return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
}

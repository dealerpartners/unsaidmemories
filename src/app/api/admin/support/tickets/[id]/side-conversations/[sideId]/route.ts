import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketForDesk } from "@/lib/support/grants"
import { resolveActingStaff } from "@/lib/support/actor"
import {
  addSideParticipant, closeSideConversation, getSideConversation,
  replySideConversation, SideConversationError,
} from "@/lib/support/side-conversations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/side-conversations/[sideId]
//   GET  → one side conversation (must belong to this ticket).
//   POST → { action: 'reply', body }
//        | { action: 'add_participant', staffId? | email? }
//        | { action: 'close' }
// ============================================================================

async function ctxIds(ctx: { params: Promise<{ id: string; sideId: string }> }) {
  return ctx.params
}

async function resolveSide(
  c: any, req: NextRequest, id: string, sideId: string,
) {
  const resolvedTenant = resolveTenantId(req)
  const found = await getTicketForDesk(c, resolvedTenant, id)
  if (!found) return { error: NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 }) }
  const side = await getSideConversation(c, found.ticket.tenantId, sideId)
  if (!side || side.ticketId !== found.ticket.id) {
    return { error: NextResponse.json({ ok: false, error: "Side conversation not found" }, { status: 404 }) }
  }
  return { found, side }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; sideId: string }> }) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const { id, sideId } = await ctxIds(ctx)
  const out = await withPg(async (c) => {
    const r = await resolveSide(c, req, id, sideId)
    if (r.error) return r.error
    return NextResponse.json({ sideConversation: r.side })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; sideId: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id, sideId } = await ctxIds(ctx)
  const payload = await req.json().catch(() => null)
  if (!payload) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  const staff = await resolveActingStaff()
  if (!staff) {
    return NextResponse.json(
      { ok: false, error: "A side conversation needs a signed-in staff identity" },
      { status: 400 },
    )
  }
  const out = await withPg(async (c) => {
    const r = await resolveSide(c, req, id, sideId)
    if (r.error) return r.error
    if (r.found.grantLevel === "view") {
      return NextResponse.json(
        { ok: false, error: "This ticket is shared with your tenant at view level — side conversations are disabled" },
        { status: 403 },
      )
    }
    const tenant = r.found.ticket.tenantId
    const actor = { staffId: staff.staffId, label: staff.name || staff.email }
    try {
      if (payload.action === "reply") {
        const side = await replySideConversation(c, tenant, sideId, actor, String(payload.body || ""))
        return NextResponse.json({ ok: true, sideConversation: side })
      }
      if (payload.action === "add_participant") {
        const side = await addSideParticipant(c, tenant, sideId, actor, {
          staffId: payload.staffId ? String(payload.staffId) : undefined,
          email: payload.email ? String(payload.email) : undefined,
        })
        return NextResponse.json({ ok: true, sideConversation: side })
      }
      if (payload.action === "close") {
        const side = await closeSideConversation(c, tenant, sideId, actor)
        return NextResponse.json({ ok: true, sideConversation: side })
      }
      return NextResponse.json({ ok: false, error: `Unknown action "${String(payload.action)}"` }, { status: 400 })
    } catch (e: any) {
      if (e instanceof SideConversationError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
      }
      throw e
    }
  })
  return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
}

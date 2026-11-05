import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketForDesk } from "@/lib/support/grants"
import { resolveActingStaff } from "@/lib/support/actor"
import {
  listSideConversations, openSideConversation, SideConversationError,
} from "@/lib/support/side-conversations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/side-conversations — §14 SIDE
// CONVERSATIONS: linked secondary threads on a ticket with their own
// participants, invisible to the requester (requester reads never
// touch these tables — see side-conversations.ts).
//   GET  → the ticket's side conversations (participants + messages).
//   POST → open one { subject, body, staffIds?, emails? }. The
//          creator is always a participant; the opening message
//          opens the thread. A 'view' grant is read-only here too.
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
    const resolvedTenant = resolveTenantId(req)
    const found = await getTicketForDesk(c, resolvedTenant, id)
    if (!found) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    const sides = await listSideConversations(c, found.ticket.tenantId, found.ticket.id)
    return NextResponse.json({ sideConversations: sides })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const id = await ctxId(ctx)
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
    const resolvedTenant = resolveTenantId(req)
    const found = await getTicketForDesk(c, resolvedTenant, id)
    if (!found) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 })
    if (found.grantLevel === "view") {
      return NextResponse.json(
        { ok: false, error: "This ticket is shared with your tenant at view level — side conversations are disabled" },
        { status: 403 },
      )
    }
    try {
      const side = await openSideConversation(
        c, found.ticket.tenantId, found.ticket.id,
        { staffId: staff.staffId, label: staff.name || staff.email },
        {
          subject: String(payload.subject || ""),
          body: String(payload.body || ""),
          staffIds: Array.isArray(payload.staffIds) ? payload.staffIds.map(String) : [],
          emails: Array.isArray(payload.emails) ? payload.emails.map(String) : [],
        },
      )
      return NextResponse.json({ ok: true, sideConversation: side })
    } catch (e: any) {
      if (e instanceof SideConversationError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
      }
      throw e
    }
  })
  return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
}

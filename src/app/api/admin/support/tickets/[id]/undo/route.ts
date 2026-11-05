import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketForDesk } from "@/lib/support/grants"
import { resolveActingStaff } from "@/lib/support/actor"
import { undoHeldReply } from "@/lib/support/presend"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// POST /api/admin/support/tickets/[id]/undo { messageId } — §16
// pre-send undo window: cancel a reply that is still HELD (written
// under an undo window, legs not yet run). Exactly one of undo /
// release wins — after release this answers 409, honestly.
// ============================================================================

async function ctxId(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return id
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const id = await ctxId(ctx)
  const payload = await req.json().catch(() => null)
  const messageId = String(payload?.messageId || "")
  if (!messageId) return NextResponse.json({ ok: false, error: "messageId is required" }, { status: 400 })
  const staff = await resolveActingStaff()
  const out = await withPg(async (c) => {
    const resolvedTenant = resolveTenantId(req)
    const found = await getTicketForDesk(c, resolvedTenant, id)
    if (!found) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 })
    if (found.grantLevel === "view") {
      return NextResponse.json(
        { ok: false, error: "This ticket is shared with your tenant at view level — changes are disabled" },
        { status: 403 },
      )
    }
    const undone = await undoHeldReply(c, found.ticket.tenantId, found.ticket, messageId, {
      staffId: staff?.staffId ?? null, label: staff?.name ?? null,
    })
    if (!undone) {
      return NextResponse.json(
        { ok: false, error: "That reply is no longer in its undo window (already sent or already undone)" },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: true, undone: true, messageId })
  })
  return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
}

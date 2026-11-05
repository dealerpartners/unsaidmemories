import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import { RelationsError, deleteLink } from "@/lib/support/relations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/links/[linkId]
//   DELETE → remove the link from the ticket. The removal lands on the
//            ticket's append-only event trail (system / link_removed).
// ============================================================================

function fail(e: unknown) {
  if (e instanceof RelationsError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
  }
  const msg = e instanceof Error ? e.message : String(e)
  console.error("[support-links desk] failed:", msg)
  return NextResponse.json({ ok: false, error: "Link request failed" }, { status: 500 })
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; linkId: string }> },
) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id, linkId } = await ctx.params
  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const ticket = await getTicketById(c, tenant, id)
      if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
      const staff = await resolveActingStaff()
      const actor = { staffId: staff?.staffId ?? null, name: staff?.name ?? null }
      const removed = await deleteLink(c, tenant, ticket.id, linkId, actor)
      return NextResponse.json({ ok: true, removed })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

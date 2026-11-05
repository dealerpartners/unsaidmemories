import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import { RelationsError, deleteRelation } from "@/lib/support/relations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/relations/[relationId]
//   DELETE → sever a relation shown on this ticket (either direction).
//            The removal lands on this ticket's append-only event
//            trail (system / relation_removed).
// ============================================================================

function fail(e: unknown) {
  if (e instanceof RelationsError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
  }
  const msg = e instanceof Error ? e.message : String(e)
  console.error("[support-relations desk] failed:", msg)
  return NextResponse.json({ ok: false, error: "Relation request failed" }, { status: 500 })
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; relationId: string }> },
) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id, relationId } = await ctx.params
  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const ticket = await getTicketById(c, tenant, id)
      if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
      const staff = await resolveActingStaff()
      const actor = { staffId: staff?.staffId ?? null, name: staff?.name ?? null }
      const removed = await deleteRelation(c, tenant, ticket.id, relationId, actor)
      return NextResponse.json({ ok: true, removed })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

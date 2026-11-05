import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import {
  RelationsError, createRelation, listRelations,
} from "@/lib/support/relations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/relations — §8 ticket relations.
//   GET  → every relation touching the ticket, both directions, with
//          the other ticket's ref / subject / status.
//   POST → { relatedTicketId | relatedTicketRef, relationType } —
//          relation types are the tree's vocabulary, which is the
//          live CHECK's (duplicate_of | related | child |
//          problem_incident). A relation may point at another
//          tenant's ticket (the related end is a plain FK by
//          design); a ref resolves within this tenant, cross-tenant
//          targets go by id. A repeat create returns the existing
//          relation (created: false).
// ============================================================================

function fail(e: unknown) {
  if (e instanceof RelationsError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
  }
  const msg = e instanceof Error ? e.message : String(e)
  console.error("[support-relations desk] failed:", msg)
  return NextResponse.json({ ok: false, error: "Relation request failed" }, { status: 500 })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const { id } = await ctx.params
  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const ticket = await getTicketById(c, tenant, id)
      if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
      const relations = await listRelations(c, tenant, ticket.id)
      return NextResponse.json({ relations })
    })
    return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  }
  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const ticket = await getTicketById(c, tenant, id)
      if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
      const staff = await resolveActingStaff()
      const actor = { staffId: staff?.staffId ?? null, name: staff?.name ?? null }
      const { relation, created } = await createRelation(c, tenant, ticket.id, {
        relatedTicketId: (body as any).relatedTicketId,
        relatedTicketRef: (body as any).relatedTicketRef,
        relationType: (body as any).relationType,
      }, actor)
      return NextResponse.json({ ok: true, relation, created })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

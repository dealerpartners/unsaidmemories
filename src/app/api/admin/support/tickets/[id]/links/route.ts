import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import {
  RelationsError, createLink, listLinks,
} from "@/lib/support/relations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/links — §8 typed links, desk side.
//   GET  → every link on the ticket (order | payment | listing |
//          seller | appointment | prescription), its target's label
//          resolved live from the target row itself.
//   POST → { linkType, targetId } links the ticket to a platform
//          object. The target must exist in the ticket's own tenant;
//          a repeat create returns the existing link (created: false)
//          — a link lands exactly once. staff-side only (§16): no
//          requester surface reads links.
// ============================================================================

function fail(e: unknown) {
  if (e instanceof RelationsError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
  }
  const msg = e instanceof Error ? e.message : String(e)
  console.error("[support-links desk] failed:", msg)
  return NextResponse.json({ ok: false, error: "Link request failed" }, { status: 500 })
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
      const links = await listLinks(c, tenant, ticket.id)
      return NextResponse.json({ links })
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
      const { link, created } = await createLink(c, tenant, ticket.id, {
        linkType: (body as any).linkType,
        targetId: (body as any).targetId,
      }, actor)
      return NextResponse.json({ ok: true, link, created })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

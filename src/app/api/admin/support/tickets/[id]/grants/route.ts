import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import type { RegulatedActor } from "@/lib/support/regulated"
import {
  GrantError, hasSupportAdminGrant, listGrantableTenants, listTicketGrants,
  grantTicketAccess, revokeTicketAccess, type AccessGrantLevel,
} from "@/lib/support/grants"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/grants — §5 ACCESS GRANT management
// on one ticket (tree §5; §0's "own tenant OR active access grant OR
// master role").
//   GET    → the ticket's grants (active + revoked history) and the
//            tenants a grant can be made to.
//   POST   → { granteeTenantId, level: 'view' | 'collaborate' } —
//            grant access, or change the level of the active grant.
//   DELETE → { grantId } — revoke (a revoked_at stamp, never a delete).
// Management belongs to the OWNING tenant — the grants table's own
// RLS reserves UPDATE/DELETE to it — so a ticket outside the resolved
// tenant 404s here even for a grantee (grantees work the ticket
// through the desk detail, at their grant's level; they do not manage
// its grants). Mutations additionally require the 'support.admin'
// grant (§5 registry; the §17/§18 per-code idiom: owner or write/full
// on the support module; platform admins pass). Every mutation lands
// the spine event + a crm_audit_log row (lib/support/grants.ts).
// ============================================================================

async function actorFor(req: NextRequest): Promise<RegulatedActor & { label: string | null }> {
  const staff = await resolveActingStaff()
  return {
    userId: await getActorIdFromRequest(req),
    staffId: staff?.staffId ?? null,
    ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
    userAgent: req.headers.get("user-agent"),
    label: staff?.name ?? null,
  }
}

function fail(e: unknown) {
  if (e instanceof GrantError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
  }
  const msg = e instanceof Error ? e.message : String(e)
  if (/violates|duplicate key|invalid input/i.test(msg)) {
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
  console.error("[support-grants] action failed:", msg)
  return NextResponse.json({ ok: false, error: "Grant action failed" }, { status: 500 })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const { id } = await ctx.params
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const ticket = await getTicketById(c, tenant, id)
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    const [grants, tenants] = await Promise.all([
      listTicketGrants(c, ticket.id),
      listGrantableTenants(c, tenant),
    ])
    return NextResponse.json({ grants, tenants })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id } = await ctx.params
  const payload = await req.json().catch(() => null)
  if (!payload?.granteeTenantId || !payload?.level) {
    return NextResponse.json({ ok: false, error: "granteeTenantId and level are required" }, { status: 400 })
  }
  const actor = await actorFor(req)
  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const ticket = await getTicketById(c, tenant, id)
      if (!ticket) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 })
      const granted = await hasSupportAdminGrant(c, tenant, actor.staffId)
      if (!granted) {
        return NextResponse.json(
          { ok: false, error: "Grant management requires the support.admin grant (write/full on the support module)" },
          { status: 403 },
        )
      }
      const r = await grantTicketAccess(
        c, ticket,
        { granteeTenantId: String(payload.granteeTenantId), level: payload.level as AccessGrantLevel },
        actor, actor.label,
      )
      return NextResponse.json({ ok: true, grant: r.grant, changed: r.changed })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id } = await ctx.params
  const payload = await req.json().catch(() => null)
  if (!payload?.grantId) {
    return NextResponse.json({ ok: false, error: "grantId is required" }, { status: 400 })
  }
  const actor = await actorFor(req)
  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const ticket = await getTicketById(c, tenant, id)
      if (!ticket) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 })
      const granted = await hasSupportAdminGrant(c, tenant, actor.staffId)
      if (!granted) {
        return NextResponse.json(
          { ok: false, error: "Grant management requires the support.admin grant (write/full on the support module)" },
          { status: 403 },
        )
      }
      const r = await revokeTicketAccess(c, ticket, String(payload.grantId), actor, actor.label)
      return NextResponse.json({ ok: true, grant: r.grant })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

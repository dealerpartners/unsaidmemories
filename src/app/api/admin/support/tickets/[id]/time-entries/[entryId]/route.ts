import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById } from "@/lib/support/tickets"
import { getTicketForDesk } from "@/lib/support/grants"
import { resolveActingStaff } from "@/lib/support/actor"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import type { RegulatedActor } from "@/lib/support/regulated"
import {
  TimeEntryError, hasSupportReplyPermission,
  updateSupportTimeEntry, deleteSupportTimeEntry,
} from "@/lib/support/time-entries"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/time-entries/[entryId] — §14 entry
// maintenance. PATCH edits (seconds / billable / note), DELETE removes.
// Same gates as the collection POST (module write + 'support.reply'),
// same owner-tenant resolution, and the lib restricts both verbs to
// the ENTRY'S OWN staff with the 'support.admin' override. Each verb
// reconciles the ticket's time_spent_seconds rollup in its own
// transaction and lands its crm_audit_log row (counts/seconds only).
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
  if (e instanceof TimeEntryError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
  }
  const msg = e instanceof Error ? e.message : String(e)
  if (/violates|duplicate key|invalid input/i.test(msg)) {
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
  console.error("[support-time-entries] action failed:", msg)
  return NextResponse.json({ ok: false, error: "Time entry action failed" }, { status: 500 })
}

async function resolveForMutation(req: NextRequest, c: any, id: string) {
  const tenant = resolveTenantId(req)
  const ticket = await getTicketById(c, tenant, id)
  if (ticket) return { ticket }
  const shared = await getTicketForDesk(c, tenant, id)
  if (shared) {
    return {
      response: NextResponse.json(
        { ok: false, error: "Time entries are maintained by the owning tenant's staff — this ticket is shared with your tenant." },
        { status: 403 },
      ),
    }
  }
  return { response: NextResponse.json({ error: "Ticket not found" }, { status: 404 }) }
}

async function gateActor(req: NextRequest, c: any, tenantId: string) {
  const actor = await actorFor(req)
  const allowed = await hasSupportReplyPermission(c, tenantId, actor.staffId)
  if (!allowed) {
    return {
      response: NextResponse.json(
        { ok: false, error: "Changing time entries requires the 'support.reply' permission" },
        { status: 403 },
      ),
    }
  }
  return { actor }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; entryId: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id, entryId } = await ctx.params
  const payload = await req.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  }
  const out = await withPg(async (c) => {
    try {
      const r = await resolveForMutation(req, c as any, id)
      if (!r.ticket) return r.response
      const g = await gateActor(req, c as any, r.ticket.tenantId)
      if (!g.actor) return g.response
      const p = payload as Record<string, unknown>
      const { entry, totalSeconds } = await updateSupportTimeEntry(c as any, r.ticket, entryId, {
        seconds: p.seconds,
        billable: p.billable,
        note: p.note,
        hasNote: "note" in p,
      }, g.actor)
      return NextResponse.json({ ok: true, entry, totalSeconds })
    } catch (e) {
      return fail(e)
    }
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; entryId: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id, entryId } = await ctx.params
  const out = await withPg(async (c) => {
    try {
      const r = await resolveForMutation(req, c as any, id)
      if (!r.ticket) return r.response
      const g = await gateActor(req, c as any, r.ticket.tenantId)
      if (!g.actor) return g.response
      const { totalSeconds } = await deleteSupportTimeEntry(c as any, r.ticket, entryId, g.actor)
      return NextResponse.json({ ok: true, totalSeconds })
    } catch (e) {
      return fail(e)
    }
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

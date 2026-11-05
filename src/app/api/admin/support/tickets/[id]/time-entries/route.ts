import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById } from "@/lib/support/tickets"
import { getTicketForDesk, hasSupportAdminGrant } from "@/lib/support/grants"
import { resolveActingStaff } from "@/lib/support/actor"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import type { RegulatedActor } from "@/lib/support/regulated"
import {
  TimeEntryError, hasSupportReplyPermission, listSupportTimeEntries,
  getTicketTimeSpent, logSupportTime,
} from "@/lib/support/time-entries"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/time-entries — §14 TIME ENTRIES on
// one ticket (store: support_time_entries, migration 20261058).
//   GET  → the ticket's entries + the rollup the ticket row carries.
//          Resolution honors §5 grants like the desk detail (a
//          grantee reads at its grant level); the response carries the
//          acting staff context the desk needs for its own-entry
//          controls.
//   POST → { seconds, billable?, note? } — log the ACTING staffer's
//          time. Gate: module write + the 'support.reply' per-code
//          check (Sunny's mapping — time-entry work rides the ticket-
//          work code; no new code seeded). Mutations resolve the
//          ticket in its OWNING tenant: an entry's staff must belong
//          to the ticket's tenant (the store's composite FK), so a
//          ticket that resolves only through a §5 grant refuses here
//          with that reason — logging is owner-tenant desk work.
// Every mutation reconciles support_tickets.time_spent_seconds in the
// same transaction and lands a crm_audit_log row (lib/support/
// time-entries.ts) — §17's fold reads the reconciled column unchanged.
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

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const { id } = await ctx.params
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const resolved = await getTicketForDesk(c as any, tenant, id)
    if (!resolved) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    const { ticket, grantLevel } = resolved
    const actor = await actorFor(req)
    const [entries, totalSeconds, canAdmin] = await Promise.all([
      listSupportTimeEntries(c as any, ticket.tenantId, ticket.id),
      getTicketTimeSpent(c as any, ticket.tenantId, ticket.id),
      grantLevel === null
        ? hasSupportAdminGrant(c as any, tenant, actor.staffId)
        : Promise.resolve(false),
    ])
    return NextResponse.json({
      entries, totalSeconds, grantLevel,
      actorStaffId: actor.staffId, canAdmin,
    })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id } = await ctx.params
  const payload = await req.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  }
  const out = await withPg(async (c) => {
    try {
      const tenant = resolveTenantId(req)
      const ticket = await getTicketById(c as any, tenant, id)
      if (!ticket) {
        const shared = await getTicketForDesk(c as any, tenant, id)
        if (shared) {
          return NextResponse.json(
            { ok: false, error: "Time entries are logged by the owning tenant's staff — this ticket is shared with your tenant, and its entries belong to the owner's team." },
            { status: 403 },
          )
        }
        return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
      }
      const actor = await actorFor(req)
      const allowed = await hasSupportReplyPermission(c as any, tenant, actor.staffId)
      if (!allowed) {
        return NextResponse.json(
          { ok: false, error: "Logging time requires the 'support.reply' permission" },
          { status: 403 },
        )
      }
      const { entry, totalSeconds } = await logSupportTime(c as any, ticket, payload as any, actor)
      return NextResponse.json({ ok: true, entry, totalSeconds })
    } catch (e) {
      return fail(e)
    }
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

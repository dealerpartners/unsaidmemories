import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById, logTicketEvent } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import { runTicketAutomations } from "@/lib/support/intake"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/admin/support/tickets/bulk — the queue's row-selection action
// bar: assign and/or set status across the selected tickets. Each ticket
// gets its own audit event; the response reports what actually changed.
export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const payload = await req.json().catch(() => null)
  const ids: string[] = Array.isArray(payload?.ids) ? payload.ids.map(String).slice(0, 100) : []
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "No tickets selected" }, { status: 400 })
  const hasAssign = payload?.assignedStaffId !== undefined
  const hasStatus = typeof payload?.status === "string" && ["open", "pending", "resolved", "closed"].includes(payload.status)
  if (!hasAssign && !hasStatus) {
    return NextResponse.json({ ok: false, error: "Nothing to apply — pass assignedStaffId and/or status" }, { status: 400 })
  }
  const staff = await resolveActingStaff()

  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    if (hasAssign && payload.assignedStaffId !== null) {
      const chk = await c.query(
        `SELECT id FROM public.crm_staff WHERE id = $1::uuid AND tenant_id = $2 AND is_active`,
        [payload.assignedStaffId, tenant],
      )
      if (chk.rows.length === 0) {
        return NextResponse.json({ ok: false, error: "Assignee is not an active staff member of this tenant" }, { status: 400 })
      }
    }

    let updated = 0
    for (const id of ids) {
      const ticket = await getTicketById(c, tenant, id)
      if (!ticket) continue
      const sets: string[] = ["updated_at = now()"]
      const args: any[] = [ticket.id]
      const events: { type: string; detail: Record<string, unknown> }[] = []
      if (hasAssign && payload.assignedStaffId !== ticket.assignedStaffId) {
        if (payload.assignedStaffId === null) sets.push("assigned_staff_id = NULL")
        else { args.push(payload.assignedStaffId); sets.push(`assigned_staff_id = $${args.length}::uuid`) }
        events.push({ type: "assigned", detail: { from: ticket.assignedStaffId, to: payload.assignedStaffId, bulk: true } })
      }
      if (hasStatus && payload.status !== ticket.status) {
        args.push(payload.status); sets.push(`status = $${args.length}`)
        if (payload.status === "resolved") sets.push("resolved_at = now()", "closed_at = NULL")
        else if (payload.status === "closed") sets.push("closed_at = now()", "resolved_at = COALESCE(resolved_at, now())")
        else sets.push("resolved_at = NULL", "closed_at = NULL")
        events.push({ type: "status_changed", detail: { from: ticket.status, to: payload.status, bulk: true } })
      }
      if (events.length === 0) continue
      await c.query(`UPDATE public.support_tickets SET ${sets.join(", ")} WHERE id = $1::uuid`, args)
      for (const e of events) {
        await logTicketEvent(c, tenant, ticket.id, {
          type: e.type, actorStaffId: staff?.staffId ?? null, actorLabel: staff?.name ?? null, detail: e.detail,
        }).catch(() => {})
      }
      await runTicketAutomations(c, tenant, ticket.id, "ticket_updated").catch(() => {})
      updated++
    }
    return NextResponse.json({ ok: true, updated })
  })
  return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
}

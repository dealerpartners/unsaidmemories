import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { appendTicketMessage, getTicketById, logTicketEvent } from "@/lib/support/tickets"
import { notifyTicketReminder } from "@/lib/support/notify"
import { resolveActingStaff } from "@/lib/support/actor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/admin/support/tickets/[id]/remind — the ticket is waiting on
// the requester; send the reminder email (support_reminder template).
// The reminder is documented on the ticket like every other event: an
// outbound thread row + a reminder_sent audit event, both dated.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id } = await ctx.params
  const staff = await resolveActingStaff()

  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const ticket = await getTicketById(c, tenant, id)
    if (!ticket) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 })
    if (ticket.status === "resolved" || ticket.status === "closed") {
      return NextResponse.json({ ok: false, error: "Ticket is already resolved/closed" }, { status: 409 })
    }

    const msg = await appendTicketMessage(c, tenant, ticket, {
      customerId: ticket.requesterCustomerId,
      channel: "email",
      direction: "outbound",
      status: "sent",
      fromAddress: staff?.email ?? null,
      toAddress: ticket.requesterEmail,
      body: `Reminder sent — we're waiting on your reply to keep ticket ${ticket.ticketRef} moving.`,
      createdBy: staff?.staffId ?? null,
      metadata: { source: "support_desk", reminder: true },
    })
    await logTicketEvent(c, tenant, ticket.id, {
      type: "reminder_sent", actorStaffId: staff?.staffId ?? null, actorLabel: staff?.name ?? null,
      detail: { messageId: msg.id },
    }).catch(() => {})

    const emailed = await notifyTicketReminder(ticket)
    return NextResponse.json({ ok: true, emailed })
  })
  return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
}

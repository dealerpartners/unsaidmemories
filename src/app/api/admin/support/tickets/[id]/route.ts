import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, TENANT_ID } from "@/lib/crm/enterprise"
import {
  appendTicketMessage, getTicketById, listTicketEvents, listTicketMessages, logTicketEvent,
  SUPPORT_CATEGORIES, type SupportCategory, type SupportPriority, type SupportTicketStatus,
} from "@/lib/support/tickets"
import { notifyTicketResolved } from "@/lib/support/notify"
import { notifyAssignment } from "@/lib/support/notifications"
import { notifyMentions } from "@/lib/support/mentions"
import {
  checkCcRecipients, dispatchReplyNotifications, loadPresendConfig,
  normalizeCcList, PresendError, releaseDueHeldReplies,
} from "@/lib/support/presend"
import { resolveActingStaff } from "@/lib/support/actor"
import { getRawTicketRow, runTicketAutomations } from "@/lib/support/intake"
import { loadSlaEvaluation } from "@/lib/support/sla"
import { iso } from "@/lib/support/engine-shared"
import { noteConfidentialAccess } from "@/lib/support/compliance"
import { getTicketForDesk } from "@/lib/support/grants"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]
//   GET   → ticket + full conversation (internal notes included — staff)
//           + the append-only event history (every event, dated).
//   POST  → { body, kind: 'reply' | 'note', cc? }
//           reply: through the §16 pre-send controls (CC allow-list
//           gate; the undo window when configured — a held reply is
//           requester-invisible and its legs run at release), then the
//           outbound conversation row, first-reply stamp, open →
//           pending, requester notified (bell for shop-linked customers +
//           the support_agent_reply email; SMS leg for SMS-origin
//           tickets when Twilio is configured).
//           note: INTERNAL note — staff-only forever: customer_id NULL +
//           metadata.internal_note = true, so no requester read path can
//           surface it. @mentions in the body notify matched staff.
//   PATCH → { status?, priority?, category?, assignedStaffId?,
//             mergedIntoId? } — every change lands a ticket_events row;
//           resolved/closed transitions fire the thank-you email.
// ============================================================================

async function ctxId(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return id
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const id = await ctxId(ctx)

  const out = await withPg(async (c) => {
    const resolvedTenant = resolveTenantId(req)
    // §5 honoring: the ticket resolves for its owning tenant (the
    // long-standing path) or through an ACTIVE access grant naming
    // the resolved tenant; accessGrantLevel reports which.
    const found = await getTicketForDesk(c, resolvedTenant, id)
    if (!found) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    const { ticket, grantLevel } = found
    // Every read below is of the ticket's own rows — they live in the
    // OWNING tenant (identical to the resolved tenant for owners).
    const tenant = ticket.tenantId
    // §16 pre-send: a held reply whose undo window has elapsed is
    // released (legs run) before the thread renders, so the desk
    // never shows a stale "sending" state. Fail-soft leg.
    await releaseDueHeldReplies(c, tenant).catch(() => {})
    const messages = await listTicketMessages(c, ticket, { includeInternal: true })
    const events = await listTicketEvents(c, ticket.id)
    let dmca: any = null
    if (ticket.category === "dmca") {
      const d = await c.query(
        `SELECT * FROM public.dmca_details WHERE ticket_id = $1::uuid`,
        [ticket.id],
      )
      dmca = d.rows[0] ?? null
    }

    // Engine state (rewire): the ticket's stamped SLA clocks evaluated
    // live (pause-aware), its escalation trail, and any engine drafts
    // waiting for a human to send — all from the real rows.
    const raw = await getRawTicketRow(c, tenant, ticket.id)
    // §18: reading a CONFIDENTIAL ticket on the desk is itself a
    // compliance event — the access lands in the ticket's own trail.
    if ((raw as any)?.visibility_level === "confidential") {
      const staff = await resolveActingStaff()
      await noteConfidentialAccess(c, tenant, ticket.id, staff?.staffId ?? null, staff?.name ?? null).catch(() => {})
    }
    const slaLoaded = raw ? await loadSlaEvaluation(c, tenant, raw) : null
    let teamName: string | null = null
    if (raw?.assigned_team_id) {
      const t = await c.query(
        `SELECT name FROM public.support_teams WHERE id = $1::uuid LIMIT 1`,
        [raw.assigned_team_id],
      )
      teamName = t.rows[0]?.name ?? null
    }
    const draftsRes = await c.query(
      `SELECT id::text AS id, body, metadata, created_at::text AS created_at
         FROM public.support_drafts
        WHERE tenant_id = $1 AND ticket_id = $2::uuid
        ORDER BY created_at ASC`,
      [tenant, ticket.id],
    )
    const escalationEvents = events.filter((e) =>
      ["sla_warning", "sla_breached", "escalated", "escalated_to_master"].includes(e.type))
    const engineTicket = {
      ...ticket,
      visibilityLevel: (raw as any)?.visibility_level ?? "standard",
      assignedTeamId: raw?.assigned_team_id ?? null,
      teamName,
      slaPolicyId: raw?.sla_policy_id ?? null,
      firstResponseDueAt: iso(raw?.first_response_due_at),
      nextReplyDueAt: iso(raw?.next_reply_due_at),
      resolutionDueAt: iso(raw?.resolution_due_at),
      firstResponseBreachedAt: iso(raw?.first_response_breached_at),
      resolutionBreachedAt: iso(raw?.resolution_breached_at),
      // §14: the ticket's time-spent rollup, off the raw row the route
      // already loads. The §17 reporting fold reads this same column.
      // The §14 writer that maintains it (per-entry log/edit/delete +
      // recompute) awaits the support_time_entries store, which was
      // never created — a schema decision, specified in B13's report —
      // so today this carries the column's honest value (0 until the
      // store exists and entries land), never a fabricated figure.
      timeSpentSeconds: raw ? Number(raw.time_spent_seconds ?? 0) : 0,
    }
    return NextResponse.json({
      ticket: engineTicket,
      accessGrantLevel: grantLevel,
      messages,
      events,
      dmca,
      sla: slaLoaded
        ? { policyId: slaLoaded.policy.id, ...slaLoaded.evaluation }
        : null,
      escalation: {
        firstResponseBreachedAt: engineTicket.firstResponseBreachedAt,
        resolutionBreachedAt: engineTicket.resolutionBreachedAt,
        warnings: escalationEvents.filter((e) => e.type === "sla_warning").length,
        breaches: escalationEvents.filter((e) => e.type === "sla_breached").length,
        escalations: escalationEvents.filter((e) => e.type === "escalated" || e.type === "escalated_to_master").length,
        lastEvent: escalationEvents.length > 0 ? escalationEvents[escalationEvents.length - 1] : null,
      },
      drafts: draftsRes.rows.map((d: any) => ({
        id: d.id, body: d.body, metadata: d.metadata ?? {}, createdAt: d.created_at,
      })),
    })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const id = await ctxId(ctx)
  const payload = await req.json().catch(() => null)
  const text = String(payload?.body || "").trim()
  const kind = payload?.kind === "note" ? "note" : "reply"
  if (!text) return NextResponse.json({ ok: false, error: "Message body is required" }, { status: 400 })

  const staff = await resolveActingStaff()

  const out = await withPg(async (c) => {
    const resolvedTenant = resolveTenantId(req)
    const found = await getTicketForDesk(c, resolvedTenant, id)
    if (!found) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 })
    const { ticket, grantLevel } = found
    // §5: a 'view' grant is read-only (the RLS parity: SELECT admits
    // 'view', UPDATE demands 'collaborate').
    if (grantLevel === "view") {
      return NextResponse.json(
        { ok: false, error: "This ticket is shared with your tenant at view level — replies and notes are disabled" },
        { status: 403 },
      )
    }
    // Writes land on the ticket's own rows, in the OWNING tenant.
    const tenant = ticket.tenantId

    if (kind === "note") {
      const msg = await appendTicketMessage(c, tenant, ticket, {
        customerId: null, // internal notes never attach to a customer read path
        channel: "chat",
        direction: "outbound",
        status: "sent",
        fromAddress: staff?.email ?? null,
        body: text,
        createdBy: staff?.staffId ?? null,
        metadata: { source: "support_desk", internal_note: true },
      })
      await logTicketEvent(c, tenant, ticket.id, {
        type: "internal_note", actorStaffId: staff?.staffId ?? null, actorLabel: staff?.name ?? null,
        detail: { messageId: msg.id },
      }).catch(() => {})
      // §8 @mentions: the note body is parsed for @tokens; each
      // uniquely-matched staffer is notified once through the single
      // notification path (their §10 prefs apply). Fail-soft — a
      // mention never fails the note that carries it.
      const mentioned = await notifyMentions(c, {
        tenantId: tenant, ticketId: ticket.id, ticketRef: ticket.ticketRef,
        body: text,
        author: staff ? { staffId: staff.staffId, label: staff.name || staff.email } : null,
      })
      return NextResponse.json({ ok: true, kind, messageId: msg.id, mentioned })
    }

    // ── Reply — the conversation row the requester's portal thread
    // renders, through the §16 PRE-SEND controls first:
    //   1. CC allow-list: any cc recipient not on the tenant's
    //      allow-list refuses the send (nothing is written).
    //   2. Undo window: when configured, the reply is written HELD
    //      (status 'queued', presend state) — requester-invisible,
    //      legs not run — and can be undone until release.
    let cc: string[]
    try {
      cc = normalizeCcList(payload?.cc)
    } catch (e: any) {
      if (e instanceof PresendError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
      }
      throw e
    }
    const presend = await loadPresendConfig(c, tenant, TENANT_ID())
    const ccGate = checkCcRecipients(presend, cc)
    if (!ccGate.ok) {
      return NextResponse.json(
        { ok: false, error: ccGate.reason, rejectedCc: ccGate.rejected },
        { status: 400 },
      )
    }
    const held = presend.undoSeconds > 0
    const heldUntil = held ? new Date(Date.now() + presend.undoSeconds * 1000).toISOString() : null

    const msg = await appendTicketMessage(c, tenant, ticket, {
      customerId: ticket.requesterCustomerId,
      channel: "chat",
      direction: "outbound",
      status: held ? "queued" : "sent",
      fromAddress: staff?.email ?? null,
      toAddress: ticket.requesterEmail,
      body: text,
      createdBy: staff?.staffId ?? null,
      ccAddresses: cc,
      metadata: {
        source: "support_desk",
        ...(cc.length ? { cc } : {}),
        ...(held
          ? { presend_held: true, presend: { state: "held", held_until: heldUntil, cc } }
          : {}),
      },
    })

    // First public reply stamp + the open → pending transition (we've
    // answered; the ball is with the requester now).
    await c.query(
      `UPDATE public.support_tickets
          SET first_public_reply_at = COALESCE(first_public_reply_at, now()),
              status = CASE WHEN status = 'open' THEN 'pending' ELSE status END,
              updated_at = now()
        WHERE id = $1::uuid`,
      [ticket.id],
    )
    await logTicketEvent(c, tenant, ticket.id, {
      type: "reply", actorStaffId: staff?.staffId ?? null, actorLabel: staff?.name ?? null,
      detail: { messageId: msg.id, ...(held ? { presendHeld: true, heldUntil } : {}) },
    }).catch(() => {})

    if (held) {
      return NextResponse.json({
        ok: true, kind, messageId: msg.id, held: true, heldUntil, cc,
        bell: false, emailed: false, sms: null,
      })
    }

    // Notify: bell for shop-linked customers + the reply email for
    // everyone with an address + the SMS leg for SMS-origin tickets
    // (§3 threading rides along inside the dispatch). All
    // best-effort — the reply itself has already landed. The held
    // path runs this same dispatch at release time.
    const { bell, emailed, sms } = await dispatchReplyNotifications(c, tenant, ticket, {
      id: msg.id, body: text,
    })

    return NextResponse.json({ ok: true, kind, messageId: msg.id, bell, emailed, sms, cc })
  })
  return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
}

const STATUSES: SupportTicketStatus[] = ["open", "pending", "resolved", "closed"]
const PRIORITIES: SupportPriority[] = ["low", "normal", "high", "urgent"]

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const id = await ctxId(ctx)
  const payload = await req.json().catch(() => null)
  if (!payload) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  const staff = await resolveActingStaff()

  const out = await withPg(async (c) => {
    const resolvedTenant = resolveTenantId(req)
    const found = await getTicketForDesk(c, resolvedTenant, id)
    if (!found) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 })
    const { ticket, grantLevel } = found
    if (grantLevel === "view") {
      return NextResponse.json(
        { ok: false, error: "This ticket is shared with your tenant at view level — changes are disabled" },
        { status: 403 },
      )
    }
    // Writes land on the ticket's own rows, in the OWNING tenant
    // (merge targets and assignees resolve there too).
    const tenant = ticket.tenantId

    const sets: string[] = ["updated_at = now()"]
    const args: any[] = [ticket.id]
    const events: { type: string; detail: Record<string, unknown> }[] = []
    let resolvedOutcome: "resolved" | "closed" | null = null

    // Merge (v1): link to the surviving ticket + close as duplicate.
    // Content is never moved or deleted; later replies re-attach to the
    // survivor through the requester's own thread.
    if (payload.mergedIntoId) {
      const target = await getTicketById(c, tenant, String(payload.mergedIntoId))
      if (!target || target.id === ticket.id) {
        return NextResponse.json({ ok: false, error: "Merge target must be another ticket in this tenant" }, { status: 400 })
      }
      args.push(target.id); sets.push(`merged_into_id = $${args.length}::uuid`)
      sets.push("status = 'closed'", "closed_at = now()", "resolved_at = COALESCE(resolved_at, now())")
      events.push({ type: "merged", detail: { intoTicketId: target.id, intoRef: target.ticketRef } })
      events.push({ type: "status_changed", detail: { from: ticket.status, to: "closed", reason: "merged" } })
    } else if (payload.status !== undefined) {
      if (!STATUSES.includes(payload.status)) {
        return NextResponse.json({ ok: false, error: `Unknown status "${payload.status}"` }, { status: 400 })
      }
      args.push(payload.status); sets.push(`status = $${args.length}`)
      if (payload.status === "resolved") sets.push("resolved_at = now()", "closed_at = NULL")
      else if (payload.status === "closed") sets.push("closed_at = now()", "resolved_at = COALESCE(resolved_at, now())")
      else sets.push("resolved_at = NULL", "closed_at = NULL")
      if (payload.status !== ticket.status) {
        events.push({ type: "status_changed", detail: { from: ticket.status, to: payload.status } })
        if (payload.status === "resolved" || payload.status === "closed") resolvedOutcome = payload.status
      }
    }
    if (payload.priority !== undefined && payload.priority !== ticket.priority) {
      if (!PRIORITIES.includes(payload.priority)) {
        return NextResponse.json({ ok: false, error: `Unknown priority "${payload.priority}"` }, { status: 400 })
      }
      args.push(payload.priority); sets.push(`priority = $${args.length}`)
      events.push({ type: "priority_changed", detail: { from: ticket.priority, to: payload.priority } })
    }
    if (payload.category !== undefined && payload.category !== ticket.category) {
      if (!SUPPORT_CATEGORIES.includes(payload.category as SupportCategory)) {
        return NextResponse.json({ ok: false, error: `Unknown category "${payload.category}"` }, { status: 400 })
      }
      args.push(payload.category); sets.push(`category = $${args.length}`)
      events.push({ type: "category_changed", detail: { from: ticket.category, to: payload.category } })
    }
    if (payload.assignedStaffId !== undefined && payload.assignedStaffId !== ticket.assignedStaffId) {
      if (payload.assignedStaffId === null) {
        sets.push("assigned_staff_id = NULL")
        events.push({ type: "assigned", detail: { from: ticket.assignedStaffId, to: null } })
      } else {
        const chk = await c.query(
          `SELECT id, display_name FROM public.crm_staff WHERE id = $1::uuid AND tenant_id = $2 AND is_active`,
          [payload.assignedStaffId, tenant],
        )
        if (chk.rows.length === 0) {
          return NextResponse.json({ ok: false, error: "Assignee is not an active staff member of this tenant" }, { status: 400 })
        }
        args.push(payload.assignedStaffId); sets.push(`assigned_staff_id = $${args.length}::uuid`)
        events.push({ type: "assigned", detail: { from: ticket.assignedStaffId, to: payload.assignedStaffId, toName: chk.rows[0].display_name } })
      }
    }

    await c.query(`UPDATE public.support_tickets SET ${sets.join(", ")} WHERE id = $1::uuid`, args)
    for (const e of events) {
      await logTicketEvent(c, tenant, ticket.id, {
        type: e.type, actorStaffId: staff?.staffId ?? null, actorLabel: staff?.name ?? null, detail: e.detail,
      }).catch(() => {})
    }
    // §12: a desk assignment tells the new assignee — the single
    // notification path (fail-soft; the assignment itself has landed).
    if (typeof payload.assignedStaffId === "string" && payload.assignedStaffId !== ticket.assignedStaffId) {
      await notifyAssignment(c as any, tenant, { id: ticket.id, ticket_ref: ticket.ticketRef }, payload.assignedStaffId)
    }
    // The ticket_updated automations see every desk-driven change
    // (fail-soft — an engine failure never fails the desk action).
    if (events.length > 0) {
      await runTicketAutomations(c, tenant, ticket.id, "ticket_updated").catch(() => {})
    }

    const updated = await getTicketById(c, tenant, id)
    // The thank-you leg fires on the resolved/closed transition only.
    const emailed = resolvedOutcome && updated ? await notifyTicketResolved(updated, resolvedOutcome) : false
    return NextResponse.json({ ok: true, ticket: updated, emailed })
  })
  return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
}

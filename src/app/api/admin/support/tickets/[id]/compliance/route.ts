import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { getPrivacyDetails, getCaseDetails, type RegulatedActor } from "@/lib/support/regulated"
import {
  ComplianceError, hasComplianceGrant, redactMessage, redactEventBody,
  dsarStateOf, verifyDsarIdentity, generateDsarExport, fulfillDsarDeletion, closeDsar,
} from "@/lib/support/compliance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/compliance — the §18 compliance
// ACTIONS on one ticket (tree §18, lines 212–218):
//   GET  → the ticket's compliance state: visibility level, the case
//          record's legal hold, the privacy record + its derived DSAR
//          state, and the ticket's redaction history (its 'redacted'
//          events).
//   POST → { action } one of:
//          redact_message { messageId, reason }   — support.privacy
//          redact_event   { eventId, reason }     — support.privacy
//          dsar_verify    { method, note }        — support.privacy
//          dsar_export    {}                      — support.privacy
//          dsar_deletion  {}                      — support.privacy
//          dsar_close     { outcome, note }       — support.privacy
// Gates: the desk's support module gate (read for GET, write for
// POST), then the per-code grant check the §17 export route set the
// idiom for — a read-only staff grant cannot run a §18 action.
// Redaction replaces content with a marker and keeps the row; DSAR
// deletion soft-deletes + anonymizes (§0: hard delete is retention's
// alone) and reconciles legal hold — held records are retained, the
// rest erased, the request closing partially_fulfilled with the hold
// recorded as the reason.
// ============================================================================

async function actorFor(req: NextRequest): Promise<RegulatedActor> {
  const staff = await resolveActingStaff()
  return {
    userId: await getActorIdFromRequest(req),
    staffId: staff?.staffId ?? null,
    ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
    userAgent: req.headers.get("user-agent"),
  }
}

function fail(e: unknown) {
  if (e instanceof ComplianceError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
  }
  const msg = e instanceof Error ? e.message : String(e)
  if (/violates|duplicate key|invalid input/i.test(msg)) {
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
  console.error("[support-compliance] action failed:", msg)
  return NextResponse.json({ ok: false, error: "Compliance action failed" }, { status: 500 })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const { id } = await ctx.params
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const ticket = await getTicketById(c, tenant, id)
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    const raw = await c.query(
      `SELECT visibility_level FROM public.support_tickets
        WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`,
      [tenant, ticket.id],
    )
    const privacy = await getPrivacyDetails(c, tenant, ticket.id)
    const caseDetails = await getCaseDetails(c, tenant, ticket.id)
    const red = await c.query(
      `SELECT id::text AS id, detail, created_at::text AS at
         FROM public.support_ticket_events
        WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid AND event_type = 'redacted'
        ORDER BY created_at ASC LIMIT 200`,
      [tenant, ticket.id],
    )
    return NextResponse.json({
      compliance: {
        visibilityLevel: raw.rows[0]?.visibility_level ?? "standard",
        legalHold: caseDetails?.legal_hold === true,
        caseStatus: caseDetails?.status ?? null,
        privacy,
        dsarState: dsarStateOf(privacy),
        redactions: red.rows.map((r: any) => ({ id: r.id, detail: r.detail ?? {}, at: r.at })),
      },
    })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id } = await ctx.params
  const payload = await req.json().catch(() => null)
  if (!payload?.action) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  const actor = await actorFor(req)

  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const ticket = await getTicketById(c, tenant, id)
      if (!ticket) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 })
      // Every §18 action on this route runs under 'support.privacy'.
      const granted = await hasComplianceGrant(c, tenant, actor.staffId)
      if (!granted) {
        return NextResponse.json(
          { ok: false, error: "This action requires the support.privacy grant (write/full on the support module)" },
          { status: 403 },
        )
      }
      const t = { id: ticket.id, ticketRef: ticket.ticketRef, conversationId: ticket.conversationId, contactId: ticket.contactId }
      switch (payload.action) {
        case "redact_message": {
          if (!payload.messageId) return NextResponse.json({ ok: false, error: "messageId is required" }, { status: 400 })
          const r = await redactMessage(c, tenant, t, String(payload.messageId), payload.reason ?? null, actor)
          return NextResponse.json({ ok: true, ...r })
        }
        case "redact_event": {
          if (!payload.eventId) return NextResponse.json({ ok: false, error: "eventId is required" }, { status: 400 })
          const r = await redactEventBody(c, tenant, t, String(payload.eventId), payload.reason ?? null, actor)
          return NextResponse.json({ ok: true, ...r })
        }
        case "dsar_verify": {
          const privacy = await verifyDsarIdentity(c, tenant, t, { method: payload.method, note: payload.note }, actor)
          return NextResponse.json({ ok: true, privacy, dsarState: dsarStateOf(privacy) })
        }
        case "dsar_export": {
          const exp = await generateDsarExport(c, tenant, t, actor)
          return NextResponse.json({ ok: true, export: exp })
        }
        case "dsar_deletion": {
          const r = await fulfillDsarDeletion(c, tenant, t, actor)
          return NextResponse.json({ ok: true, ...r })
        }
        case "dsar_close": {
          const privacy = await closeDsar(c, tenant, t, { outcome: payload.outcome, note: payload.note }, actor)
          return NextResponse.json({ ok: true, privacy, dsarState: dsarStateOf(privacy) })
        }
        default:
          return NextResponse.json({ ok: false, error: `Unknown compliance action "${payload.action}"` }, { status: 400 })
      }
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

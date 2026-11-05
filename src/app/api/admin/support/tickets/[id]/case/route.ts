import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import {
  RegulatedError, getCaseDetails, upsertCaseDetails, type RegulatedActor,
} from "@/lib/support/regulated"
import { noteLegalHoldChange } from "@/lib/support/compliance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/case — the §6 support_case_details
// record: the generic regulated-case detail for legal |
// law_enforcement | trust_safety tickets (tree §6 lines 126–127):
// case type, deadline, status, a payload bag for the case's facts,
// and the legal_hold flag. This is the detail writer the desk uses
// for case-category tickets that are neither DMCA, privacy, nor
// chargeback.
//   GET  → the record, or null when none has been opened.
//   POST → create-or-update (caseType required on create; legalHold
//          toggles the hold; payload replaces the stored payload).
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
  if (e instanceof RegulatedError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
  }
  const msg = e instanceof Error ? e.message : String(e)
  if (/violates|duplicate key|invalid input/i.test(msg)) {
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
  console.error("[support-case] write failed:", msg)
  return NextResponse.json({ ok: false, error: "Case write failed" }, { status: 500 })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const { id } = await ctx.params
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const ticket = await getTicketById(c, tenant, id)
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    const caseDetails = await getCaseDetails(c, tenant, ticket.id)
    return NextResponse.json({ case: caseDetails })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id } = await ctx.params
  const payload = await req.json().catch(() => null)
  if (!payload) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  const actor = await actorFor(req)

  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const ticket = await getTicketById(c, tenant, id)
      if (!ticket) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 })
      const before = payload.legalHold !== undefined
        ? await getCaseDetails(c, tenant, ticket.id)
        : null
      const caseDetails = await upsertCaseDetails(c, tenant, ticket.id, {
        caseType: payload.caseType,
        deadlineAt: payload.deadlineAt,
        status: payload.status,
        payload: payload.payload,
        legalHold: payload.legalHold === true ? true : payload.legalHold === false ? false : undefined,
      }, actor)
      // §18: a legal-hold toggle joins the ticket's own trail (the
      // events vocabulary's 'legal_hold_set'), beside the audit row.
      if (before && before.legal_hold !== caseDetails.legal_hold) {
        await noteLegalHoldChange(c, tenant, ticket.id, caseDetails.legal_hold === true, actor.staffId, null).catch(() => {})
      }
      return NextResponse.json({ ok: true, case: caseDetails })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

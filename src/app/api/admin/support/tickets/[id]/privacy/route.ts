import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import {
  RegulatedError, getPrivacyDetails, upsertPrivacyDetails, type RegulatedActor,
} from "@/lib/support/regulated"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/privacy — the §6 privacy_request_
// details record for a privacy ticket (tree §6 lines 121–123):
// request type (access | deletion | correction | opt_out), identity
// verification, the statutory due date, extensions, an append-only
// fulfillment log, and the outcome.
//
// §18 gate: privacy_request_details is permission-gated on
// 'support.privacy' in RLS (platform_has_permission → a write/full
// grant on module 'support', or platform admin). The desk's operative
// app-layer equivalent is the support module gate used here, exactly
// as on every other regulated desk route.
//   GET  → the record, or null when none has been opened.
//   POST → create-or-update (requestType required on create;
//          identityVerified stamps identity_verified_at once;
//          fulfillmentNote appends to the fulfillment log).
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
  console.error("[support-privacy] write failed:", msg)
  return NextResponse.json({ ok: false, error: "Privacy write failed" }, { status: 500 })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const { id } = await ctx.params
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const ticket = await getTicketById(c, tenant, id)
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    const privacy = await getPrivacyDetails(c, tenant, ticket.id)
    return NextResponse.json({ privacy })
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
      const privacy = await upsertPrivacyDetails(c, tenant, ticket.id, {
        requestType: payload.requestType,
        identityVerified: payload.identityVerified === true,
        verificationMethod: payload.verificationMethod,
        statutoryDueAt: payload.statutoryDueAt,
        extensionGranted: payload.extensionGranted === true,
        outcome: payload.outcome,
        fulfillmentNote: payload.fulfillmentNote,
      }, actor)
      return NextResponse.json({ ok: true, privacy })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

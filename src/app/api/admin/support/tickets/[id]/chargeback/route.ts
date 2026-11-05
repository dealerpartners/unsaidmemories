import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import {
  RegulatedError, getChargebackDetails, upsertChargebackDetails, type RegulatedActor,
} from "@/lib/support/regulated"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/chargeback — the §6 chargeback_
// details record for a payments ticket (tree §6 lines 124–125):
// dispute id, processor, amount, the processor's evidence deadline,
// the evidence package reference, and the outcome. The record is
// created by the Stripe dispute webhook at filing time (see
// webhook-intake.ts); this route is the desk's read/update side —
// evidence work and outcome corrections.
//
// §18 gate: chargeback_details UPDATE/DELETE are permission-gated on
// 'support.privacy' in RLS (its INSERT keeps the documented
// membership path, migration 20261044 — conformed to, not tightened).
// The desk's operative app-layer equivalent is the support module
// gate used here.
//   GET  → the record, or null when the ticket carries none.
//   POST → update the provided fields only (explicit null clears);
//          setting outcome stamps outcome_at.
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
  console.error("[support-chargeback] write failed:", msg)
  return NextResponse.json({ ok: false, error: "Chargeback write failed" }, { status: 500 })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const { id } = await ctx.params
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const ticket = await getTicketById(c, tenant, id)
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    const chargeback = await getChargebackDetails(c, tenant, ticket.id)
    return NextResponse.json({ chargeback })
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
      const chargeback = await upsertChargebackDetails(c, tenant, ticket.id, {
        disputeId: payload.disputeId,
        processor: payload.processor,
        amount: payload.amount,
        processorDeadlineAt: payload.processorDeadlineAt,
        evidencePackageRef: payload.evidencePackageRef,
        outcome: payload.outcome,
      }, actor)
      return NextResponse.json({ ok: true, chargeback })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

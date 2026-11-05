import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { resolveActingStaff } from "@/lib/support/actor"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import {
  RegulatedError, getDesignatedAgent, upsertDesignatedAgent, type RegulatedActor,
} from "@/lib/support/regulated"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/dmca-agent — the tenant's DMCA designated-agent
// record (tree §6 line 119: dmca_designated_agent — tenant_id ·
// contact block · registered_at · renewal_due_at; one record per
// tenant, enforced by the table's UNIQUE (tenant_id)).
//
// This is the admin surface over the record. The legal act itself —
// registering the agent with the Copyright Office and keeping the
// registration current — is the business's/counsel's; what the desk
// owns is that the record the platform acts on exists, is readable,
// and is kept truthful. Every write lands in the §18 change log
// (crm_audit_log) via the regulated writers.
//   GET → the acting tenant's record, or null when none is recorded.
//   PUT → create-or-replace the record's fields.
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
  console.error("[support-dmca-agent] write failed:", msg)
  return NextResponse.json({ ok: false, error: "Designated agent write failed" }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const agent = await getDesignatedAgent(c, tenant)
    return NextResponse.json({ agent })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function PUT(req: NextRequest) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const payload = await req.json().catch(() => null)
  if (!payload) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  const actor = await actorFor(req)

  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const agent = await upsertDesignatedAgent(c, tenant, {
        agentName: payload.agentName,
        agentEmail: payload.agentEmail,
        agentAddress: payload.agentAddress,
        agentPhone: payload.agentPhone,
        registeredAt: payload.registeredAt,
        renewalDueAt: payload.renewalDueAt,
      }, actor)
      return NextResponse.json({ ok: true, agent })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

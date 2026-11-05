import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, TENANT_ID } from "@/lib/crm/enterprise"
import { resolveActingStaff } from "@/lib/support/actor"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import type { RegulatedActor } from "@/lib/support/regulated"
import {
  ComplianceError, hasComplianceGrant, evaluateRetention, runRetention,
} from "@/lib/support/compliance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/retention — §18 retention, the ONLY hard-delete
// path in support (§0: "hard delete only via retention job").
//   GET  → the schedule as read from policy_settings (scope 'support',
//          retention_days_<category> / retention_days_default) and the
//          eligibility evaluation against it: which closed tickets a
//          run would purge, which are blocked by a legal hold, and how
//          many closed tickets no schedule entry reaches.
//   POST → one run, gated on the 'support.delete' code (the desk's
//          module write gate + the acting staff's write/full grant).
//          With no schedule configured the run REFUSES — audited —
//          rather than inventing a retention period: as of this build
//          no retention_days_* values exist in policy_settings, so the
//          refusal is the live behavior until the tenant sets them.
//          A proceeding run writes a support_jobs row (type
//          'retention') in the sweep's idiom and purges each eligible
//          ticket in its own transaction through the events trigger's
//          GUC path (app.allow_event_mutation = 'on').
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
  console.error("[support-retention] run failed:", e instanceof Error ? e.message : String(e))
  return NextResponse.json({ ok: false, error: "Retention run failed" }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const evaluation = await evaluateRetention(c, tenant, TENANT_ID())
    return NextResponse.json({ evaluation })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const actor = await actorFor(req)
  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const granted = await hasComplianceGrant(c, tenant, actor.staffId)
      if (!granted) {
        return NextResponse.json(
          { ok: false, error: "Retention requires the support.delete grant (write/full on the support module)" },
          { status: 403 },
        )
      }
      const result = await runRetention(c, tenant, TENANT_ID(), actor)
      return NextResponse.json({ ok: true, result }, { status: result.refused ? 422 : 200 })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

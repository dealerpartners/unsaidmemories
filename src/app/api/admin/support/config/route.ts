import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { resolveActingStaff } from "@/lib/support/actor"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import {
  ConfigError, createSupportConfig, isConfigResource, listSupportConfig,
  removeSupportConfig, updateSupportConfig, type ConfigActor,
} from "@/lib/support/config-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/config — Support §10 configuration management.
//
// The writer side of the configuration tables the step-5 engines read
// (teams/members/skills, categories, business hours/holidays, SLA
// policies, escalation + routing rules, channels, automations, macros,
// canned replies, templates, signatures, notification prefs). Until
// this route existed the tables held 0 rows and the engines ran inert.
//
//   GET    → every family's rows visible to the acting tenant (master
//            rows + the tenant's own), plus the tenant's staff list.
//   POST   → { resource, ...fields } create.
//   PATCH  → { resource, id, ...fields } update (isActive toggles too).
//   DELETE → { resource, id } — leaf rows delete; named configuration
//            deactivates (never hard-deleted). See config-admin.ts for
//            the scope/lock rules every write passes through.
//
// Gated on the 'support' module like every desk route; every mutation
// lands in the §18 admin-configuration change log (crm_audit_log).
// ============================================================================

async function actorFor(req: NextRequest): Promise<ConfigActor> {
  const staff = await resolveActingStaff()
  return {
    userId: await getActorIdFromRequest(req),
    staffId: staff?.staffId ?? null,
    ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
    userAgent: req.headers.get("user-agent"),
  }
}

function fail(e: unknown) {
  if (e instanceof ConfigError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
  }
  const msg = e instanceof Error ? e.message : String(e)
  // Constraint violations are the caller's bad input, not a server fault.
  if (/violates|duplicate key|invalid input/i.test(msg)) {
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
  console.error("[support-config] write failed:", msg)
  return NextResponse.json({ ok: false, error: "Configuration write failed" }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const data = await listSupportConfig(c, tenant)
    return NextResponse.json({ ok: true, ...data })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

// withPg swallows errors thrown inside its callback (logs + returns
// null), so write errors are converted to responses INSIDE the callback
// — the same shape the composer route uses for macro failures.
async function runWrite(
  req: NextRequest,
  fn: (c: any, tenant: string, actor: ConfigActor) => Promise<{ row: Record<string, unknown> }>,
) {
  const actor = await actorFor(req)
  const out = await withPg(async (c) => {
    try {
      const { row } = await fn(c, resolveTenantId(req), actor)
      return NextResponse.json({ ok: true, row })
    } catch (e) {
      return fail(e)
    }
  })
  return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const body = await req.json().catch(() => null)
  if (!body || !isConfigResource(body.resource)) {
    return NextResponse.json({ ok: false, error: "Unknown or missing resource" }, { status: 400 })
  }
  return runWrite(req, (c, tenant, actor) => createSupportConfig(c, tenant, actor, body.resource, body))
}

export async function PATCH(req: NextRequest) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const body = await req.json().catch(() => null)
  if (!body || !isConfigResource(body.resource) || typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ ok: false, error: "resource and id are required" }, { status: 400 })
  }
  return runWrite(req, (c, tenant, actor) => updateSupportConfig(c, tenant, actor, body.resource, body.id, body))
}

export async function DELETE(req: NextRequest) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const body = await req.json().catch(() => null)
  const resource = body?.resource ?? req.nextUrl.searchParams.get("resource")
  const id = body?.id ?? req.nextUrl.searchParams.get("id")
  if (!isConfigResource(resource) || typeof id !== "string" || !id) {
    return NextResponse.json({ ok: false, error: "resource and id are required" }, { status: 400 })
  }
  return runWrite(req, (c, tenant, actor) => removeSupportConfig(c, tenant, actor, resource, id))
}

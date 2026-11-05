import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireCapabilityApi } from "@/lib/capabilities/guards"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, TENANT_ID } from "@/lib/crm/enterprise"
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { resolveAdminActor, requestIp } from "@/lib/admin/actor"
import {
  IMPERSONATION_TARGET_TYPES,
  resolveImpersonationTarget,
  searchImpersonationTargets,
  type ImpersonationTargetType,
} from "@/lib/admin/impersonation"

// ---------------------------------------------------------------------------
// /api/admin/impersonation — K1 · Impersonation: the governed record +
// oversight face. Tree leaves: Impersonate seller / customer / employee /
// vet / groomer.
//
// STORE: public.admin_impersonation_sessions (migration 20261064). The
// store itself refuses a blank reason (CHECK btrim(reason) <> '') and this
// route refuses it first: impersonation without a recorded reason and an
// audit row does not happen on this platform.
//
// WHAT "start" DOES AND DOES NOT DO (stated on the face as well): start
// opens the governed session record — who, whom, why, from when — and the
// oversight list below reads every record. Start itself mints nothing:
// ENTERING is the separate deliberate act at
// GET /api/admin/impersonation/enter?sessionId=, which mints the MARKED
// one-hour session (SessionPayload.impersonation) once the session leg
// specified in src/lib/admin/impersonation.ts landed — claim plumbing,
// banner, and restore-on-exit included. No unmarked takeover exists
// anywhere — by design, not by omission.
//
// GATE: M5 (DOCX §7.6) — starting and ending an impersonation are
// platform.impersonate acts, gated on that capability (tenant-scoped,
// same population the old administration module gate admitted). The
// GET oversight list stays on the administration module read gate:
// reading records is administration work, not an impersonation act.
// Tenant comes from resolveTenantId(req); every statement is tenant-bound.
// ---------------------------------------------------------------------------

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function targetTypeOf(v: unknown): ImpersonationTargetType | null {
  return typeof v === "string" && (IMPERSONATION_TARGET_TYPES as readonly string[]).includes(v)
    ? (v as ImpersonationTargetType)
    : null
}

const SESSION_COLS = `
  id::text AS id, target_type, target_id, target_label, target_auth_user_id,
  reason, status, admin_email, started_at, ended_at, ended_by`

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read")
  if (gate) return gate
  const tenant = resolveTenantId(req)
  const typeParam = req.nextUrl.searchParams.get("type")
  const q = (req.nextUrl.searchParams.get("q") || "").trim()

  try {
    const payload = await withPg(async (client) => {
      const active = await client.query(
        `SELECT ${SESSION_COLS} FROM public.admin_impersonation_sessions
          WHERE tenant_id = $1::uuid AND status = 'active'
          ORDER BY started_at DESC`,
        [tenant],
      )
      const recent = await client.query(
        `SELECT ${SESSION_COLS} FROM public.admin_impersonation_sessions
          WHERE tenant_id = $1::uuid
          ORDER BY started_at DESC LIMIT 50`,
        [tenant],
      )
      let targets: Awaited<ReturnType<typeof searchImpersonationTargets>> | null = null
      let targetType: ImpersonationTargetType | null = null
      if (typeParam) {
        targetType = targetTypeOf(typeParam)
        if (targetType) {
          targets = await searchImpersonationTargets(client, tenant, TENANT_ID(), targetType, q)
        }
      }
      const map = (r: any) => ({
        id: String(r.id),
        targetType: r.target_type,
        targetId: String(r.target_id),
        targetLabel: r.target_label,
        targetAuthUserId: r.target_auth_user_id,
        reason: r.reason,
        status: r.status,
        adminEmail: r.admin_email,
        startedAt: new Date(r.started_at).toISOString(),
        endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
        endedBy: r.ended_by,
      })
      return {
        tenantId: tenant,
        active: active.rows.map(map),
        recent: recent.rows.map(map),
        targetType,
        targets,
      }
    })
    if (!payload) {
      return NextResponse.json({ error: "Database unavailable — impersonation records could not be read." }, { status: 503 })
    }
    if (typeParam && !payload.targetType) {
      return NextResponse.json(
        { error: `type must be one of ${IMPERSONATION_TARGET_TYPES.join(", ")}` },
        { status: 400 },
      )
    }
    return NextResponse.json(payload)
  } catch (e: any) {
    console.error("[GET /api/admin/impersonation]", e)
    return NextResponse.json({ error: `Load failed: ${e.message}` }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const tenant = resolveTenantId(req)
  // No tenantId on the capability check (see the enter route): the
  // tenant bound is the governed record's tenant + caller ownership.
  const gate = await requireCapabilityApi("platform.impersonate")
  if (gate) return gate

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const action = String(body.action || "")

  try {
    if (action === "start") {
      const targetType = targetTypeOf(body.targetType)
      if (!targetType) {
        return NextResponse.json(
          { error: `targetType must be one of ${IMPERSONATION_TARGET_TYPES.join(", ")}` },
          { status: 400 },
        )
      }
      const targetId = String(body.targetId || "").trim()
      if (!targetId) {
        return NextResponse.json({ error: "targetId is required" }, { status: 400 })
      }
      const reason = String(body.reason || "").trim()
      if (!reason) {
        return NextResponse.json(
          { error: "A reason is required — impersonation without a recorded reason is refused by design." },
          { status: 400 },
        )
      }
      if (reason.length > 1000) {
        return NextResponse.json({ error: "Reason is limited to 1000 characters." }, { status: 400 })
      }

      const out = await withPg(async (client) => {
        const target = await resolveImpersonationTarget(client, tenant, TENANT_ID(), targetType, targetId)
        if (!target) return { kind: "missing" as const }
        const actor = await resolveAdminActor(client, tenant)
        const { rows } = await client.query(
          `INSERT INTO public.admin_impersonation_sessions
             (tenant_id, admin_actor_id, admin_email, admin_staff_id,
              target_type, target_id, target_label, target_auth_user_id,
              reason, ip_address)
           VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9, $10)
           RETURNING id::text AS id, started_at`,
          [
            tenant,
            actor.userId && UUID_RE.test(actor.userId) ? actor.userId : null,
            actor.email || "unknown-admin",
            actor.staffId,
            targetType,
            target.id,
            target.label,
            target.authUserId,
            reason,
            requestIp(req),
          ],
        )
        return {
          kind: "started" as const,
          id: String(rows[0].id),
          startedAt: new Date(rows[0].started_at).toISOString(),
          target,
        }
      })
      if (!out) {
        return NextResponse.json({ error: "Database unavailable — nothing was recorded." }, { status: 503 })
      }
      if (out.kind === "missing") {
        return NextResponse.json(
          { error: "That target does not exist in this tenant for the selected type." },
          { status: 404 },
        )
      }
      const actorId = await getActorIdFromRequest(req)
      await auditAction({
        action: "k1_impersonation_start",
        domain: "crm",
        tableName: "admin_impersonation_sessions",
        recordId: out.id,
        afterData: {
          tenant_id: tenant,
          target_type: targetType,
          target_id: out.target.id,
          target_label: out.target.label,
          reason,
        },
        actorUserId: actorId,
        ipAddress: requestIp(req),
      })
      return NextResponse.json({
        ok: true,
        sessionId: out.id,
        startedAt: out.startedAt,
        target: out.target,
        enterUrl: `/api/admin/impersonation/enter?sessionId=${out.id}`,
        sessionLeg:
          "The record is open. Entering is the separate deliberate act at enterUrl: it mints a MARKED one-hour session (impersonation claim: this record + the admin of record), stashes the admin's own session for restore on exit, and refuses targets with no resolvable portal identity.",
      })
    }

    if (action === "end") {
      const sessionId = String(body.sessionId || "").trim()
      if (!UUID_RE.test(sessionId)) {
        return NextResponse.json({ error: "sessionId must be an impersonation session id" }, { status: 400 })
      }
      const out = await withPg(async (client) => {
        const actor = await resolveAdminActor(client, tenant)
        // State-guarded: only an ACTIVE session of this tenant can end.
        const { rows } = await client.query(
          `UPDATE public.admin_impersonation_sessions
              SET status = 'ended', ended_at = now(),
                  ended_by = $1, updated_at = now()
            WHERE id = $2::uuid AND tenant_id = $3::uuid AND status = 'active'
            RETURNING id::text AS id, target_type, target_id, target_label, ended_at`,
          [actor.email || "unknown-admin", sessionId, tenant],
        )
        if (rows.length === 0) return { kind: "missing" as const }
        return { kind: "ended" as const, row: rows[0] }
      })
      if (!out) {
        return NextResponse.json({ error: "Database unavailable — nothing was written." }, { status: 503 })
      }
      if (out.kind === "missing") {
        return NextResponse.json(
          { error: "No active impersonation session with that id exists in this tenant." },
          { status: 404 },
        )
      }
      const actorId = await getActorIdFromRequest(req)
      await auditAction({
        action: "k1_impersonation_end",
        domain: "crm",
        tableName: "admin_impersonation_sessions",
        recordId: sessionId,
        afterData: {
          tenant_id: tenant,
          target_type: out.row.target_type,
          target_id: String(out.row.target_id),
          target_label: out.row.target_label,
          ended_at: new Date(out.row.ended_at).toISOString(),
        },
        actorUserId: actorId,
        ipAddress: requestIp(req),
      })
      return NextResponse.json({ ok: true, sessionId, endedAt: new Date(out.row.ended_at).toISOString() })
    }

    return NextResponse.json({ error: "action must be start or end" }, { status: 400 })
  } catch (e: any) {
    console.error("[POST /api/admin/impersonation]", e)
    return NextResponse.json({ error: `Write failed: ${e.message}` }, { status: 500 })
  }
}

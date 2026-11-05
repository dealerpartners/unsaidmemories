import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireCapabilityApi } from "@/lib/capabilities/guards"
import { withPg, TENANT_ID } from "@/lib/crm/enterprise"
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { resolveAdminActor, requestIp } from "@/lib/admin/actor"
import {
  ADMIN_SESSION_STASH_COOKIE,
  resolveImpersonationIdentity,
  type ImpersonationTargetType,
} from "@/lib/admin/impersonation"
import {
  SESSION_COOKIE_NAME,
  resolvePortalUser,
  sessionCookieOptions,
  signSession,
  verifySessionToken,
  type IdentityGrant,
  type ResolvedPortalUser,
} from "@/lib/portal-auth"

// ---------------------------------------------------------------------------
// GET /api/admin/impersonation/enter?sessionId= — K1 · the session leg's
// door. Entering is a deliberate act SEPARATE from starting the record:
//
//   · M5 (DOCX §7.6): gated on the platform.impersonate CAPABILITY
//     (tenant-scoped, so the platform admin and the salon hats pass
//     within their tenant — the same population the old administration
//     module gate admitted; no K1 caller is newly denied). There is
//     no separate legacy ungoverned impersonation path to archive:
//     this governed route IS the path, migrated in place to the
//     capability gate — nothing was deleted to do it;
//   · the record must be ACTIVE and owned by the calling admin (the
//     admin_email on the record must be the caller's) — nobody enters
//     another admin's impersonation;
//   · the target must have a resolvable portal identity
//     (lib/admin/impersonation resolveImpersonationIdentity) — no
//     identity, no entry, and the refusal says why;
//   · the minted token is MARKED (SessionPayload.impersonation carries
//     the record id + the admin's email + the target), lives ONE HOUR,
//     and the admin's own session cookie is stashed in
//     portal_admin_session so ending restores it exactly.
//
// The response is a redirect to the target portal's home with both
// cookies set. The banner (root layout) renders from the mark; ending
// runs through POST /api/impersonation/session.
// ---------------------------------------------------------------------------

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IMPERSONATION_TTL_SECONDS = 60 * 60

export async function GET(req: NextRequest) {
  const tenant = resolveTenantId(req)
  // No tenantId on the capability check: the tenant bound here is the
  // governed RECORD's tenant (the query below) plus record ownership —
  // an admin viewing another tenant's desk must not fail the
  // capability itself for a home-tenant mismatch. The capability says
  // the actor may impersonate; the record says in which tenant.
  const gate = await requireCapabilityApi("platform.impersonate")
  if (gate) return gate
  const sessionId = (req.nextUrl.searchParams.get("sessionId") || "").trim()
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "sessionId must be an impersonation session id" }, { status: 400 })
  }

  const out = await withPg(async (client) => {
    const actor = await resolveAdminActor(client, tenant)
    const { rows } = await client.query(
      `SELECT id::text AS id, target_type, target_id, target_label, reason,
              status, admin_email
         FROM public.admin_impersonation_sessions
        WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [sessionId, tenant],
    )
    const rec = rows[0]
    if (!rec) return { kind: "missing" as const }
    if (rec.status !== "active") return { kind: "ended" as const }
    if (!actor.email || String(rec.admin_email).toLowerCase() !== actor.email.toLowerCase()) {
      return { kind: "not_owner" as const }
    }
    const identity = await resolveImpersonationIdentity(
      client, tenant, TENANT_ID(),
      rec.target_type as ImpersonationTargetType, String(rec.target_id),
    )
    if (!identity) return { kind: "no_identity" as const, targetType: String(rec.target_type) }
    return {
      kind: "ok" as const,
      actorEmail: actor.email,
      record: {
        targetType: String(rec.target_type),
        targetId: String(rec.target_id),
        targetLabel: rec.target_label ? String(rec.target_label) : null,
        reason: String(rec.reason),
      },
      identity,
    }
  })
  if (!out) {
    return NextResponse.json({ error: "Database unavailable — no session was minted." }, { status: 503 })
  }
  if (out.kind === "missing") {
    return NextResponse.json({ error: "No impersonation session with that id exists in this tenant." }, { status: 404 })
  }
  if (out.kind === "ended") {
    return NextResponse.json({ error: "That impersonation session has already ended." }, { status: 409 })
  }
  if (out.kind === "not_owner") {
    return NextResponse.json(
      { error: "Only the admin who started this impersonation record can enter it." },
      { status: 403 },
    )
  }
  if (out.kind === "no_identity") {
    return NextResponse.json(
      {
        error:
          `That ${out.targetType} has no resolvable portal identity to enter as ` +
          "(no linked auth identity on the target's record). The governed record stands; " +
          "entering is refused rather than minting a session that resolves to nobody.",
      },
      { status: 409 },
    )
  }

  // M5 — the impersonated session is scoped to the TARGET GRANT ONLY:
  // its grant set is exactly one grant (the target's grant for this
  // scope, resolved live when the target has an auth identity), and
  // its active_grant_id is that grant. The admin's own grants are
  // never carried into it, and /api/auth/switch refuses any switch
  // while the impersonation claim is present — so the session cannot
  // widen from the target grant toward the admin's grants.
  let targetGrant: IdentityGrant = {
    scope: out.identity.scope,
    role: out.identity.role,
    membershipRole: out.identity.membershipRole,
    tenantId: tenant,
  }
  try {
    const targetUser = await resolvePortalUser(out.identity.authUserId)
    const live = targetUser?.grants?.find((g) => g.scope === out.identity.scope)
    if (live) targetGrant = live
  } catch {
    // target resolution is best-effort; the synthesized single grant
    // above still scopes the session to exactly this portal.
  }
  const user: ResolvedPortalUser = {
    authUserId: out.identity.authUserId,
    email: out.identity.email,
    name: out.identity.name,
    role: out.identity.role,
    scope: out.identity.scope,
    membershipRole: out.identity.membershipRole,
    tenantId: targetGrant.tenantId ?? tenant,
    homeTenantId: tenant,
    grants: [targetGrant],
    activeGrantId: targetGrant.id,
    impersonation: {
      sessionId,
      byEmail: out.actorEmail,
      targetType: out.record.targetType,
      targetId: out.record.targetId,
    },
  }
  const token = signSession(user, IMPERSONATION_TTL_SECONDS)

  // M5 audit: who impersonated whom, from→to grant, purpose. The
  // admin's own active grant comes from the caller's session (the
  // cookie being stashed below); purpose is the record's reason —
  // the governed record refuses a blank one by CHECK.
  const adminPayload = verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value)
  const actorId = await getActorIdFromRequest(req).catch(() => null)
  await auditAction({
    action: "k1_impersonation_enter",
    domain: "crm",
    tableName: "admin_impersonation_sessions",
    recordId: sessionId,
    afterData: {
      tenant_id: tenant,
      impersonated_by: out.actorEmail,
      from_grant_id: adminPayload?.activeGrantId ?? null,
      from_scope: adminPayload?.scope ?? null,
      to_grant_id: targetGrant.id ?? null,
      to_scope: targetGrant.scope,
      target_type: out.record.targetType,
      target_id: out.record.targetId,
      target_label: out.record.targetLabel,
      purpose: out.record.reason,
      ttl_seconds: IMPERSONATION_TTL_SECONDS,
    },
    actorUserId: actorId,
    ipAddress: requestIp(req),
  })

  const host = req.headers.get("x-forwarded-host") || req.nextUrl.host
  const cookieOpts = sessionCookieOptions(host)
  const res = NextResponse.redirect(new URL(out.identity.portalPath, req.nextUrl.origin))
  // Stash the admin's own session first (only when one is present), then
  // replace the live session cookie with the marked impersonation token.
  const adminToken = req.cookies.get(SESSION_COOKIE_NAME)?.value
  if (adminToken) {
    res.cookies.set(ADMIN_SESSION_STASH_COOKIE, adminToken, cookieOpts)
  }
  res.cookies.set(SESSION_COOKIE_NAME, token, { ...cookieOpts, maxAge: IMPERSONATION_TTL_SECONDS })
  return res
}

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  activeGrant,
  doorsForUser,
  refreshSessionGrants,
  SESSION_COOKIE_NAME,
  sessionFromPayload,
  verifySessionToken,
  resolvePortalUser,
  supabaseConfigured,
} from "@/lib/portal-auth";
import { createServerSupabase } from "@/lib/auth/server";
import { inFlightApplicationForUser } from "@/lib/onboarding/application-status";
import { resolveTenantId } from "@/lib/admin-api";
import { withPg } from "@/lib/crm/enterprise";
import { cached } from "@/lib/cache";
import { listFeatureFlags, type FlagAudience } from "@/lib/admin/feature-flags";

// ===========================================================================
// GET /api/session/bootstrap — Slice 2 (pageview tax): ONE cached call
// replacing the 4–6 per-pageview client calls the root layout + site
// chrome used to fan out (portal-session + portal/flags +
// impersonation/session, each fetched separately by every chrome
// component that mounted).
//
// FLAT SUPERSET SHAPE — a deliberate drop-in contract. Each section is
// byte-for-byte the body its old endpoint returned, merged at the top
// level, so callers switch by changing the URL (or the shared
// lib/session-bootstrap helper) and their parsing is untouched:
//
//   user          — GET /api/auth/portal-session's `user` object
//                   (id/name/email/role/stationName/avatarUrl/
//                   membershipRole/scope/grants/application), or null.
//                   Resolution mirrors that route exactly: signed
//                   portal_session cookie first, Supabase SSR session
//                   fallback second. (Mirror — keep in sync with that
//                   route; the two must never drift on the user shape.)
//   audience/flags/details — GET /api/portal/flags' body. Flag ROWS come
//                   from the same 60s per-tenant cache entry that route
//                   reads (key portal-flags:<tenant>), so bootstrap and
//                   the flags endpoint never pay twice; audience
//                   resolution stays per-request from the caller's scope.
//   impersonation — GET /api/impersonation/session's `impersonation`
//                   value (or null). No DB read at all when the session
//                   token carries no impersonation claim — the common
//                   case for ordinary visitors.
//
// FAIL-SOFT PER SECTION, never fail the whole call: a flags DB outage
// must not sign a visitor out of the chrome, and an application-lookup
// failure must not drop a valid session. (Production /api/portal/flags
// was 503ing at slice-2 baseline while portal-session answered 200 —
// this sectioning is what keeps that outage out of the session path.)
// The response itself is per-visitor and NEVER shared-cached:
// Cache-Control: no-store, same as portal-session.
// ===========================================================================

export const dynamic = "force-dynamic";

function audienceForScope(scope: string | undefined, role: string | undefined): FlagAudience {
  if (scope === "seller") return "seller";
  if (scope === "customer") return "customer";
  if (scope === "employee") return "employee";
  return "global";
}

function sessionJson(body: Record<string, unknown>): NextResponse {
  const res = NextResponse.json(body);
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}

export async function GET(req: NextRequest) {
  // --- Section 1: the portal-session user (mirror of that route). ---
  let user: Record<string, unknown> | null = null;
  let homeTenantId: string | undefined;
  let scope: string | undefined;
  let role: string | undefined;
  let impersonationClaim: unknown = null;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const payload = verifySessionToken(token);
    let resolved: ReturnType<typeof sessionFromPayload> | null = null;
    if (payload) {
      resolved = sessionFromPayload(payload);
      // M5, mirroring portal-session: doors from LIVE grants, so a
      // revoked grant closes its door on the next pageview too.
      // Impersonation sessions are returned untouched by the refresh
      // (scoped to the target grant only).
      const refreshed = await refreshSessionGrants(resolved).catch(() => null);
      if (refreshed) resolved = refreshed;
      impersonationClaim = (payload as { impersonation?: unknown }).impersonation ?? null;
    } else if (supabaseConfigured()) {
      const supabase = await createServerSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        resolved = await resolvePortalUser(session.user.id);
      }
    }
    if (resolved) {
      // The in-flight application rides the session for the account
      // drawer (portalSessionUserFrom reads user.application). It is
      // fail-soft here — unlike portal-session, which drops the whole
      // user on this lookup failing — because a case-state read outage
      // must not sign a visitor out of the chrome.
      const application = await inFlightApplicationForUser(resolved.authUserId).catch(() => null);
      user = {
        id: resolved.authUserId,
        name: resolved.name,
        email: resolved.email,
        role: resolved.role,
        stationName: resolved.stationName,
        avatarUrl: resolved.avatarUrl,
        membershipRole: resolved.membershipRole,
        scope: resolved.scope,
        active_grant_id: activeGrant(resolved).id ?? resolved.activeGrantId ?? null,
        grants: (resolved.grants ?? []).map((g) => ({ id: g.id ?? null, scope: g.scope, role: g.role })),
        doors: resolved.impersonation
          ? doorsForUser(resolved).filter((d) => d.scope === activeGrant(resolved).scope)
          : doorsForUser(resolved),
        application,
      };
      homeTenantId = (resolved as { homeTenantId?: string }).homeTenantId;
      scope = resolved.scope;
      role = resolved.role;
    }
  } catch {
    user = null;
  }

  // --- Section 2: flags (same cache entry the flags route reads). ---
  const audience = audienceForScope(scope, role);
  const tenant = homeTenantId || resolveTenantId(req);
  let flags: Record<string, boolean> = {};
  let details: Array<{ key: string; audience: string; description: string | null }> = [];
  try {
    const rows = await cached(`portal-flags:${tenant}`, 60_000, async () => {
      const r = await withPg((c) => listFeatureFlags(c, tenant));
      if (!r) throw new Error("Database unavailable");
      return r;
    });
    const mine = rows.filter((r) => r.audience === audience || r.audience === "global");
    const keys = [...new Set(mine.map((r) => r.key))];
    for (const key of keys) {
      const exact = mine.find((r) => r.key === key && r.audience === audience);
      const winner = exact ?? mine.find((r) => r.key === key && r.audience === "global");
      if (!winner) continue;
      flags[key] = winner.enabled;
      details.push({ key, audience: winner.audience, description: winner.description });
    }
  } catch {
    // Fail-soft: flags read as OFF, exactly as FlagAnnouncement treats
    // a failed flags fetch — the session above is unaffected.
    flags = {};
    details = [];
  }

  // --- Section 3: impersonation (DB read ONLY when a claim exists). ---
  let impersonation: Record<string, unknown> | null = null;
  if (impersonationClaim && typeof impersonationClaim === "object") {
    const claim = impersonationClaim as {
      sessionId: string; byEmail: string; targetType: string; targetId: string;
    };
    try {
      const record = await withPg(async (c) => {
        const { rows } = await c.query(
          `SELECT target_label, reason, status, started_at
             FROM public.admin_impersonation_sessions
            WHERE id = $1::uuid`,
          [claim.sessionId],
        );
        return rows[0] ?? null;
      }).catch(() => null);
      impersonation = {
        session_id: claim.sessionId,
        by_email: claim.byEmail,
        target_type: claim.targetType,
        target_id: claim.targetId,
        target_label: record?.target_label ?? null,
        reason: record?.reason ?? null,
        started_at: record?.started_at ?? null,
        record_status: record ? String(record.status) : "missing",
      };
    } catch {
      impersonation = null;
    }
  }

  return sessionJson({ user, audience, flags, details, impersonation });
}

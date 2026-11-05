import { NextResponse } from "next/server";
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

// ===========================================================================
// GET /api/auth/portal-session — the (portals) shell's session check.
//
// This route existed in UnSaid Memories and the imported admin layout's
// useSessionQuery fetches it on every mount, but the wholesale import
// never carried it (Lane 2 traced API imports from routes, and this one
// is fetched by a client hook). Its absence 404'd the session check, the
// layout's session query never resolved, and every (portals) admin page
// hung on the shell's loading skeleton. Restored 2026-10-30.
//
// Resolution mirrors /api/session/bootstrap section 1 EXACTLY (that
// route's header names this contract — keep the two in sync):
// signed portal_session cookie first (inert in Unsaid — verifySessionToken
// fails closed), Supabase SSR session second, resolved through
// lib/portal-auth's resolvePortalUser (the Unsaid-native bridge over
// platform_admins / portal_users / tenant_memberships / identity_grants).
//
// Always 200: { user } with user null for signed-out or unresolved
// visitors — the layout treats a non-200 as "still checking" and only a
// resolved null sends the visitor to the admin door. Per-visitor,
// never cached.
// ===========================================================================

export const dynamic = "force-dynamic";

export async function GET() {
  let user: Record<string, unknown> | null = null;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const payload = verifySessionToken(token);
    let resolved: ReturnType<typeof sessionFromPayload> | null = null;
    if (payload) {
      resolved = sessionFromPayload(payload);
      const refreshed = await refreshSessionGrants(resolved).catch(() => null);
      if (refreshed) resolved = refreshed;
    } else if (supabaseConfigured()) {
      const supabase = await createServerSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        resolved = await resolvePortalUser(session.user.id);
      }
    } else if (process.env.ADMIN_DEV_BYPASS === "1") {
      // Sandbox-only dev resolution. No Supabase project exists in the
      // local preview environment, so the admin door could never open
      // there and the admin OS was unverifiable outside Vercel. Gated
      // on ADMIN_DEV_BYPASS, which is set ONLY in the sandbox .env and
      // never on Vercel — production auth behavior is untouched.
      resolved = {
        authUserId: "dev-admin-sandbox",
        email: "sunny@unsaidmemories.com",
        name: "Sunny",
        role: "admin",
        scope: "admin",
        membershipRole: "owner",
        grants: [],
      };
    }
    if (resolved) {
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
    }
  } catch {
    user = null;
  }
  const res = NextResponse.json({ user });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}

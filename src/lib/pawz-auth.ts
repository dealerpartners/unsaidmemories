// ---------------------------------------------------------------------------
// UnSaid Memories auth adapter — transplant lane 2, 2026-10-30. This file
// REPLACES the legacy All-About-Pawz lib/pawz-auth.ts (1,591 lines); it is
// not a copy of it.
//
// The legacy pawz-auth was that platform's portal session system: HMAC
// session tokens (signSession / verifySessionToken), portal-user
// resolution, and grant doors. UnSaid Memories does not use that system —
// sessions are Supabase cookies and the one admin gate is
// lib/admin/gate.ts (portal_users + SUPABASE_TENANT_ID env tenant).
// Porting the session machinery would have created a second auth
// system inside UnSaid Memories, so only the small surface the transplanted
// routes actually import is implemented here, on UnSaid Memories's own stack:
//
//   getSupabaseAdmin / getSupabaseAnon / supabaseConfigured
//     — generic Supabase client factories (legacy implementations,
//       which read the same env names UnSaid Memories already uses).
//   isSupabaseAdmin — admin check against UnSaid Memories's stores
//       (platform_admins, portal_users, tenant_memberships), fail-closed.
//   findAuthUserByEmail — legacy implementation (Supabase admin API).
//   SESSION_COOKIE_NAME / SessionPayload / verifySessionToken
//     — kept for contract compatibility. UnSaid Memories never mints pawz
//       session tokens, so verifySessionToken fails closed (null) by
//       design: the pawz-session legs of transplanted routes
//       (impersonation/enter, onboarding/_shared, subscriptions/offers)
//       stay inert until an UnSaid Memories-native bridge replaces them;
//       those routes' own requireAdminApi gates still apply.
//   resolvePortalUser — THE BRIDGE LANDED 2026-10-30 (evening): resolves
//       a Supabase auth user from UnSaid Memories's own stores
//       (platform_admins, portal_users, tenant_memberships, live
//       identity_grants) into the ResolvedPortalUser shape the imported
//       chrome consumes. This is what lets /api/session/bootstrap answer
//       a real user for a Supabase sign-in; before it, every (portals)
//       page hung on the shell's loading skeleton. Fail-closed is
//       preserved: a user with no staff source still resolves to null.
// ---------------------------------------------------------------------------
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getSupabaseAnon(): SupabaseClient | null {
  if (!SUPABASE_URL || !ANON_KEY) return null;
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

const MEMBERSHIP_ADMIN_ROLES = ["owner", "admin", "manager"];
const PORTAL_ADMIN_ROLES = ["owner", "admin", "platform_admin"];

/**
 * True when Supabase marks this auth user as an admin in UnSaid Memories's
 * stores: a platform_admins row, an active portal_users row with an
 * admin role, or an active owner/admin/manager tenant membership.
 * Fail-closed: any store that errors or is absent simply doesn't grant.
 */
export async function isSupabaseAdmin(authUserId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin || !authUserId) return false;
  try {
    const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", authUserId).limit(1);
    if (pa && pa.length > 0) return true;
  } catch { /* table may not exist */ }
  try {
    const { data: pu } = await admin.from("portal_users").select("role, is_active").eq("user_id", authUserId);
    if ((pu || []).some((r: any) => r.is_active !== false && PORTAL_ADMIN_ROLES.includes(String(r.role || "").toLowerCase()))) return true;
  } catch { /* fall through */ }
  try {
    const { data: ms } = await admin.from("tenant_memberships").select("role, status").eq("user_id", authUserId);
    return (ms || []).some((m: any) => m.status !== "suspended" && MEMBERSHIP_ADMIN_ROLES.includes(String(m.role || "").toLowerCase()));
  } catch {
    return false;
  }
}

export async function findAuthUserByEmail(admin: SupabaseClient, email: string) {
  // Primary path: O(1) RPC against auth.users (migration 0008 in
  // the legacy platform; present wherever that migration has been applied).
  try {
    const { data, error } = await admin
      .rpc("get_auth_user_by_email", { p_email: email });
    if (error) {
      console.error("[pawz-auth] get_auth_user_by_email RPC error:", error.message);
    } else if (data && data.length > 0) {
      const row = data[0] as any;
      return {
        id: row.id,
        email: row.email,
        user_metadata: row.raw_user_meta_data || {},
        identities: [],
        created_at: row.created_at,
        last_sign_in_at: row.last_sign_in_at,
      } as any;
    }
    // RPC resolved cleanly with no rows → genuinely no user.
    if (!error) return null;
  } catch (e: any) {
    console.error("[pawz-auth] get_auth_user_by_email RPC threw:", e?.message || e);
  }

  // Fallback: paginated listUsers (only if the RPC is missing).
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users || [];
    const found = users.find((u: any) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (found) return found as any;
    if (users.length < 200 || page > 20) return null;
    page += 1;
  }
}

// --- Pawz session tokens: contract surface only, fail-closed (see header).
export const SESSION_COOKIE_NAME = "pawz_session";

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  stationName?: string | null;
  avatarUrl?: string;
  scope: string;
  membershipRole?: string;
  homeTenantId?: string;
  grants?: Array<{ id?: string; scope?: string; [key: string]: unknown }>;
  activeGrantId?: string;
  impersonation?: Record<string, unknown> | null;
  exp: number; // epoch seconds
}

export function verifySessionToken(_token: string | undefined | null): SessionPayload | null {
  // UnSaid Memories never mints pawz session tokens, so no presented token
  // can verify. Fail closed; do not reintroduce the HMAC session system.
  return null;
}

// --- Session-system surface the transplanted impersonation/tenants code
// imports. Types are the legacy platform's (types carry no behavior); the
// functions stay fail-closed per the header: UnSaid Memories does not
// resolve pawz portal users and never mints pawz session tokens.
//
// PortalRole was narrowed to the e-commerce vocabulary when the
// impersonation surface was rewritten to drop the pet-salon groomer/vet
// target types — those values no longer reach IdentityGrant or
// ResolvedPortalUser. advertiser / affiliate are still defined portal
// roles even though no impersonation target resolves to them.
export type PortalRole = "admin" | "customer" | "seller" | "advertiser" | "affiliate";

/** Auth-door ids — which portal surface a sign-in form sits on. The
 *  /api/auth/* routes accept these as ?portal= / body.portal and resolve
 *  the real role server-side; the client value is only a hint. */
export type PortalId = "admin" | "customer" | "seller" | "groomer" | "lms";

export interface ImpersonationClaim {
  sessionId: string;
  byEmail: string;
  targetType: string;
  targetId: string;
}

export interface IdentityGrant {
  id?: string;
  scope: ResolvedPortalUser["scope"];
  role: PortalRole;
  membershipRole?: string;
  tenantId?: string | null;
  displayName?: string | null;
  stationName?: string | null;
  source?: string;
}

export interface ResolvedPortalUser {
  authUserId: string;
  email: string;
  name: string;
  role: PortalRole;
  stationName?: string | null;
  tenantId?: string | null;
  displayName?: string | null;
  avatarUrl?: string;
  scope: "admin" | "employee" | "customer" | "seller" | "ads" | "affiliate";
  membershipRole?: string;
  activeGrantId?: string;
  homeTenantId?: string;
  grants?: IdentityGrant[];
  impersonation?: ImpersonationClaim;
}

/** Pure payload→user field mapping (legacy implementation). Unreachable
 *  in practice: verifySessionToken never returns a payload in UnSaid Memories. */
export function sessionFromPayload(p: SessionPayload): ResolvedPortalUser {
  return {
    authUserId: p.sub,
    email: p.email,
    name: p.name,
    role: p.role as PortalRole,
    stationName: p.stationName,
    avatarUrl: p.avatarUrl,
    scope: (p.scope as ResolvedPortalUser["scope"]) || "customer",
    membershipRole: p.membershipRole,
    homeTenantId: p.homeTenantId,
    grants: p.grants as IdentityGrant[] | undefined,
    activeGrantId: p.activeGrantId,
    impersonation: p.impersonation as ImpersonationClaim | undefined,
  };
}

export function sessionCookieOptions(_reqHost?: string | null) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

/** UnSaid Memories-native bridge (2026-10-30): resolve a Supabase auth user into
 *  the portal-user shape the imported chrome consumes (bootstrap,
 *  portal-session). Sources, strongest first: a platform_admins row
 *  (its user_id references portal_users.id — gate-verified), active
 *  portal_users staff rows, admin-family tenant_memberships; live
 *  identity_grants, when present, take over via refreshSessionGrants
 *  exactly as on the pawz-cookie path. UnSaid Memories's portal_users are
 *  staff-only today (portal='admin'; role_type carries the staff role
 *  and is kept as membershipRole; module access stays the server
 *  gate's job). No source -> null: fail-closed for strangers. */
export async function resolvePortalUser(authUserId: string): Promise<ResolvedPortalUser | null> {
  const admin = getSupabaseAdmin();
  if (!admin || !authUserId) return null;
  try {
    let email = "";
    let metaName = "";
    try {
      const { data } = await admin.auth.admin.getUserById(authUserId);
      email = data?.user?.email ?? "";
      const md = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      metaName = String(md.full_name || md.name || "");
    } catch { /* email/name fall back to the portal_users row */ }

    const { data: puData } = await admin
      .from("portal_users")
      .select("id, tenant_id, role_type, portal, display_name, email, is_owner, is_active")
      .eq("user_id", authUserId);
    const puRows = ((puData ?? []) as Array<Record<string, any>>).filter((r) => r.is_active !== false);

    let isPlatformAdmin = false;
    if (puRows.length > 0) {
      const { data: pa } = await admin
        .from("platform_admins")
        .select("user_id")
        .in("user_id", puRows.map((r) => r.id));
      isPlatformAdmin = (pa ?? []).length > 0;
    }

    const { data: msData } = await admin
      .from("tenant_memberships")
      .select("tenant_id, role, status")
      .eq("user_id", authUserId);
    const memberships = ((msData ?? []) as Array<Record<string, any>>).filter(
      (m) => m.status !== "suspended" && MEMBERSHIP_ADMIN_ROLES.includes(String(m.role || "").toLowerCase())
    );

    const grants: IdentityGrant[] = [];
    if (isPlatformAdmin) {
      grants.push({ scope: "admin", role: "admin", source: "platform_admins" });
    }
    for (const r of puRows) {
      grants.push({
        scope: "admin",
        role: "admin",
        membershipRole: r.role_type ? String(r.role_type) : undefined,
        tenantId: r.tenant_id ? String(r.tenant_id) : null,
        displayName: r.display_name ? String(r.display_name) : null,
        source: "portal_users",
      });
    }
    for (const m of memberships) {
      grants.push({
        scope: "admin",
        role: "admin",
        membershipRole: String(m.role),
        tenantId: m.tenant_id ? String(m.tenant_id) : null,
        source: "tenant_memberships",
      });
    }
    if (grants.length === 0) return null;

    const primary = grants[0];
    const firstPu = puRows[0] as Record<string, any> | undefined;
    const envTenant = process.env.SUPABASE_TENANT_ID ?? process.env.UNSAID_TENANT_ID ?? undefined;
    const resolved: ResolvedPortalUser = {
      authUserId,
      email: (firstPu?.email as string) || email,
      name:
        (firstPu?.display_name as string) ||
        metaName ||
        ((firstPu?.email as string) || email).split("@")[0] ||
        "User",
      role: "admin",
      tenantId: primary.tenantId ?? envTenant ?? null,
      displayName: (firstPu?.display_name as string) || undefined,
      scope: "admin",
      membershipRole: primary.membershipRole,
      homeTenantId: envTenant ?? (primary.tenantId ?? undefined),
      grants,
    };
    const refreshed = await refreshSessionGrants(resolved).catch(() => null);
    return refreshed ?? resolved;
  } catch {
    return null;
  }
}

/** Minting pawz session tokens is not part of UnSaid Memories. Throws so any
 *  caller fails loudly instead of issuing an unverifiable token. */
export function signSession(_user: ResolvedPortalUser, _ttlSeconds?: number): string {
  throw new Error("signSession is not available in UnSaid Memories: pawz session tokens are not minted here.");
}

// ---------------------------------------------------------------------------
// Grant-door helpers (ported from the legacy lib/pawz-auth at the 2026-10-30
// wholesale import — /api/session/bootstrap imports these). Semantics are
// the legacy platform's verbatim; ONE deviation: refreshSessionGrants does
// not adjoin an affiliate grant (Affiliate is owner-excluded in UnSaid
// Memories; the affiliate door row stays in the meta map as data but no
// grant can ever carry it here). The vet/pharmacy doors below were DROPPED
// in the e-commerce cleanup — the storefront has no telemedicine surface,
// so a grant claiming those scopes has nowhere to land.
// ---------------------------------------------------------------------------

export interface GrantDoor {
  scope: string;
  label: string;
  destination: string;
  door: string | null;
}

const GRANT_DOOR_META: Record<string, { label: string; destination: string; door: string | null }> = {
  admin: { label: "Admin", destination: "/admin/dashboard", door: "/admin-login" },
  employee: { label: "Employee Portal", destination: "/employee/dashboard", door: "/employee" },
  customer: { label: "Customer Portal", destination: "/customer/dashboard", door: "/access-customer" },
  seller: { label: "Seller Center", destination: "/seller/dashboard", door: "/access-seller" },
  ads: { label: "Ad Center", destination: "/ads", door: null },
  affiliate: { label: "Affiliate Portal", destination: "/affiliate/dashboard", door: "/affiliate/signin" },
};

export function isGrantDoorScope(scope: string): boolean {
  return Boolean(GRANT_DOOR_META[scope]);
}

export function doorsForUser(user: ResolvedPortalUser): GrantDoor[] {
  const seen = new Set<string>();
  const doors: GrantDoor[] = [];
  for (const g of user.grants ?? []) {
    const meta = GRANT_DOOR_META[g.scope];
    if (!meta || seen.has(g.scope)) continue;
    seen.add(g.scope);
    doors.push({ scope: g.scope, label: meta.label, destination: meta.destination, door: meta.door });
  }
  if (doors.length === 0) {
    const meta = GRANT_DOOR_META[user.scope];
    if (meta) doors.push({ scope: user.scope, label: meta.label, destination: meta.destination, door: meta.door });
  }
  return doors;
}

export function activeGrant(user: ResolvedPortalUser): IdentityGrant {
  const grants = user.grants ?? [];
  if (user.activeGrantId) {
    const found = grants.find((g) => g.id === user.activeGrantId);
    if (found) return found;
  }
  if (grants.length > 0) return grants[0];
  return {
    scope: user.scope,
    role: user.role,
    membershipRole: user.membershipRole,
    tenantId: user.tenantId ?? user.homeTenantId ?? null,
    displayName: user.displayName ?? undefined,
    stationName: user.stationName ?? undefined,
  };
}

const GRANT_SOURCE_RANK: Record<string, number> = {
  platform_admins: 0,
  portal_users: 1,
  tenant_memberships: 2,
  staff: 3,
  portal_customer_accounts: 4,
  customers: 5,
  legacy_cascade: 6,
  ad_center_activation: 7,
  affiliate_profiles: 8,
};

export async function refreshSessionGrants(user: ResolvedPortalUser): Promise<ResolvedPortalUser | null> {
  if (user.impersonation) return user;
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data } = await (admin as any)
      .from("identity_grants")
      .select("id, scope, role, membership_role, tenant_id, display_name, station_name, source")
      .eq("user_id", user.authUserId)
      .eq("status", "active");
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return null;
    const live: IdentityGrant[] = rows.map((g) => ({
      id: g.id ? String(g.id) : undefined,
      scope: g.scope as IdentityGrant["scope"],
      role: g.role as PortalRole,
      membershipRole: (g.membership_role as string) || undefined,
      tenantId: (g.tenant_id as string) || undefined,
      displayName: (g.display_name as string) || undefined,
      stationName: (g.station_name as string) || undefined,
      source: (g.source as string) || undefined,
    }));
    live.sort((a, b) => {
      const rank =
        (GRANT_SOURCE_RANK[a.source ?? "legacy_cascade"] ?? 6) -
        (GRANT_SOURCE_RANK[b.source ?? "legacy_cascade"] ?? 6);
      if (rank !== 0) return rank;
      const aTail = a.scope === "customer" || a.scope === "ads" ? 1 : 0;
      const bTail = b.scope === "customer" || b.scope === "ads" ? 1 : 0;
      return aTail - bTail;
    });
    const active = live.find((g) => g.id === user.activeGrantId) ?? live[0];
    return {
      ...user,
      scope: active.scope,
      role: active.role,
      membershipRole: active.membershipRole,
      tenantId: active.tenantId ?? null,
      displayName: active.displayName ?? user.displayName,
      stationName: active.stationName ?? null,
      homeTenantId: active.tenantId ?? undefined,
      grants: live,
      activeGrantId: active.id,
    };
  } catch {
    return null;
  }
}

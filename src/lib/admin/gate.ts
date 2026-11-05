import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
import { createServerClient } from "@/lib/supabase";
import {
  normalizeLevel,
  levelAtLeast,
  type AccessLevel,
  type ModuleCode,
} from "./modules";

/**
 * Gate for the admin surface (/admin pages' data + every /api/admin/*
 * route). Adapted from UnSaid Memories src/lib/admin/gate.ts (branch 10-28-2026):
 * same contract — returns null when the caller may proceed, or a
 * ready-to-return NextResponse denial — with the session verifier
 * swapped from portal-auth to Unsaid's Supabase Auth (SSR cookies via
 * @supabase/ssr, see src/lib/supabase/server.ts).
 *
 * Access model:
 *   1. The caller must carry a valid Supabase Auth session.
 *   2. The caller must be staff: a row in public.platform_admins
 *      (platform administrators — full access to everything) OR an
 *      active row in public.portal_users (staff identity; role 'owner'
 *      is full access, any other role is limited to its grants in
 *      public.portal_module_permissions).
 *   A signed-in customer has an auth account but no staff row, so they
 *   are refused — that is the fix for the previously unauthenticated
 *   /api/admin/* surface.
 *
 * CONTRACT for other modules' route handlers:
 *   import { requireAdminApi } from "@/lib/admin/gate";
 *   export async function GET(req) {
 *     const gate = await requireAdminApi();
 *     if (gate) return gate;
 *     // …handler… (module-level check, when needed:)
 *     const mod = await requireModuleApi("orders", "write");
 *     if (mod) return mod;
 *   }
 */

export interface AdminContext {
  userId: string;
  email: string | null;
  isPlatformAdmin: boolean;
  isOwner: boolean;
  portalUserId: string | null;
  role: string | null;
  /** module_key → highest granted level (normalized). */
  grants: Partial<Record<ModuleCode, AccessLevel>>;
}

async function loadAdminContext(): Promise<AdminContext | null> {
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = createServerClient();
  const email = user.email?.toLowerCase() ?? null;

  // Staff identity: portal_users is keyed by the Supabase Auth user_id;
  // role lives in role_type, ownership in is_owner (verified live).
  let portalUserId: string | null = null;
  let role: string | null = null;
  let isOwner = false;
  try {
    const { data } = await db
      .from("portal_users")
      .select("id, role_type, is_owner, is_active, invited_at, accepted_at")
      .eq("user_id", user.id)
      .order("is_active", { ascending: false })
      .limit(1);
    const row = data?.[0];
    if (row && row.is_active !== false) {
      portalUserId = row.id as string;
      role = (row.role_type as string | null) ?? null;
      isOwner = row.is_owner === true;
      // Invitation acceptance is stamped on the first gated sign-in.
      if (row.invited_at && !row.accepted_at) {
        void db
          .from("portal_users")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", row.id)
          .then(() => undefined, () => undefined);
      }
    }
  } catch {
    portalUserId = null;
  }

  // Platform administrators: platform_admins.user_id references the
  // portal_users row id (verified live), so this check runs second.
  let isPlatformAdmin = false;
  if (portalUserId) {
    try {
      const { data } = await db
        .from("platform_admins")
        .select("user_id, expires_at")
        .eq("user_id", portalUserId)
        .limit(1);
      const row = data?.[0];
      if (row && (!row.expires_at || new Date(row.expires_at as string) > new Date())) {
        isPlatformAdmin = true;
      }
    } catch {
      isPlatformAdmin = false;
    }
  }

  if (!isPlatformAdmin && !portalUserId) return null;

  // Grants: merged from BOTH stores — the platform_module_permissions
  // view (staff_id, module_code, access_level — the seeded effective
  // grants) and the portal_module_permissions table (portal_user_id,
  // module_key, permission_level — where the matrix UI writes). The
  // gate enforces the union at the highest level, matching exactly
  // what the Roles & Permissions page displays.
  const grants: Partial<Record<ModuleCode, AccessLevel>> = {};
  if (portalUserId) {
    const RANK: Record<AccessLevel, number> = { read: 1, write: 2, full: 3 };
    const absorb = (key: unknown, raw: unknown) => {
      const lvl = normalizeLevel(raw as string);
      if (lvl === "none" || typeof key !== "string") return;
      const prev = grants[key as ModuleCode];
      if (!prev || RANK[lvl] > RANK[prev]) grants[key as ModuleCode] = lvl;
    };
    try {
      const { data } = await db
        .from("platform_module_permissions")
        .select("module_code, access_level")
        .eq("staff_id", portalUserId);
      for (const g of data ?? []) absorb(g.module_code, g.access_level);
    } catch { /* view unavailable — table store below still applies */ }
    try {
      const { data } = await db
        .from("portal_module_permissions")
        .select("module_key, permission_level")
        .eq("portal_user_id", portalUserId);
      for (const g of data ?? []) absorb(g.module_key, g.permission_level);
    } catch { /* grants stay as absorbed from the view */ }
  }

  return {
    userId: user.id,
    email,
    isPlatformAdmin,
    isOwner,
    portalUserId,
    role,
    grants,
  };
}

/** The signed-in staff context, or null when the caller is not staff.
 *  NEVER cache this across requests: a process-level cache keyed by
 *  nothing served one request's context (including a non-staff null)
 *  to every other request in the window — a second, intermittent cause
 *  of staff seeing a gutted admin, found 2026-10-30 when the owner's
 *  session was bounced to /login right behind a customer request.
 *  The load is three indexed queries; correctness wins. */
export async function getAdminContext(): Promise<AdminContext | null> {
  return loadAdminContext();
}

export async function requireAdminApi(): Promise<NextResponse | null> {
  try {
    const ctx = await getAdminContext();
    if (ctx) return null;
    return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  } catch (e) {
    return NextResponse.json(
      { error: `Auth check failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 },
    );
  }
}

/** Admin + a grant at or above `level` on `module`. Platform admins and
 *  portal owners always pass (UnSaid Memories semantics). */
export async function requireModuleApi(
  module: ModuleCode,
  level: AccessLevel,
): Promise<NextResponse | null> {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  if (ctx.isPlatformAdmin || ctx.isOwner) return null;
  const have = ctx.grants[module];
  if (have && levelAtLeast(have, level)) return null;
  return NextResponse.json(
    { error: `Missing ${level} access to the ${module} module.` },
    { status: 403 },
  );
}

/** Page-level helper for server components: the modules this user may
 *  see in the sidebar. null = everything (platform admin / owner), an
 *  empty set = nothing beyond module-less sections. FAIL OPEN on error
 *  (UnSaid Memories portal-nav doctrine): returns null when the context can't be
 *  loaded, so a fetch error never locks an admin out of the shell. */
export async function allowedModulesForShell(): Promise<Set<ModuleCode> | null> {
  try {
    const ctx = await getAdminContext();
    if (!ctx) return new Set();
    if (ctx.isPlatformAdmin || ctx.isOwner) return null;
    return new Set(Object.keys(ctx.grants) as ModuleCode[]);
  } catch {
    return null;
  }
}

/**
 * Compatibility exports for module agents (fabric/trust/integrations built
 * against these shapes before the canonical gate landed). One function
 * serves both call patterns in the tree:
 *   fabric:      const gate = await requireAdmin();
 *                if (gate.error) return gate.error;  const { user } = gate;
 *   trust:       const gate = await requireAdmin(req);
 *                if (isError(gate)) return gate;      gate.portalUserId …
 * On denial the returned NextResponse also carries itself as `.error`, so
 * both patterns return the same 401/403. On success the object carries the
 * auth `user`, the `supabase` auth client, the canonical `context`, and the
 * flat AdminIdentity fields. Enforces the same staff check as
 * requireAdminApi — strictly stronger than the session-only bodies it
 * replaces.
 */
export interface AdminIdentity {
  userId: string;
  email: string | null;
  portalUserId: string | null;
  displayName: string | null;
  roleType: string | null;
  isOwner: boolean;
}

export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  let displayName: string | null = null;
  if (ctx.portalUserId) {
    try {
      const db = createServerClient();
      const { data } = await db
        .from("portal_users")
        .select("display_name")
        .eq("id", ctx.portalUserId)
        .maybeSingle();
      displayName = (data?.display_name as string | null) ?? null;
    } catch {
      displayName = null;
    }
  }
  return {
    userId: ctx.userId,
    email: ctx.email,
    portalUserId: ctx.portalUserId,
    displayName,
    roleType: ctx.role,
    isOwner: ctx.isOwner,
  };
}

export function isError(
  x: AdminIdentity | NextResponse | unknown,
): x is NextResponse {
  return x instanceof NextResponse;
}

function denialResponse(): NextResponse & { error: NextResponse } {
  const res = NextResponse.json(
    { error: "Admin sign-in required." },
    { status: 401 },
  ) as NextResponse & { error: NextResponse };
  res.error = res;
  return res;
}

export interface AdminGateSuccess {
  error?: undefined;
  supabase: Awaited<ReturnType<typeof createAuthClient>>;
  user: NonNullable<
    Awaited<
      ReturnType<
        Awaited<ReturnType<typeof createAuthClient>>["auth"]["getUser"]
      >
    >["data"]["user"]
  >;
  context: AdminContext;
  userId: string;
  email: string | null;
  portalUserId: string | null;
  displayName: string | null;
  roleType: string | null;
  isOwner: boolean;
}

export type AdminGate =
  | (NextResponse & { error: NextResponse })
  | AdminGateSuccess;

export async function requireAdmin(
  _req?: unknown,
): Promise<AdminGate> {
  const ctx = await getAdminContext();
  if (!ctx) return denialResponse();
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return denialResponse();
  const identity = await getAdminIdentity();
  return {
    supabase,
    user,
    context: ctx,
    userId: ctx.userId,
    email: ctx.email,
    portalUserId: ctx.portalUserId,
    displayName: identity?.displayName ?? null,
    roleType: ctx.role,
    isOwner: ctx.isOwner,
  };
}

/**
 * Compatibility exports for the Orders module, which was built against an
 * actor-shaped gate before the canonical gate landed:
 *   const gate = await requireAdminActor();
 *   if ("error" in gate) return gate.error;
 *   gate.actor.userId …
 * Same staff check as requireAdminApi, identity surfaced as an actor.
 */
export interface AdminActor {
  userId: string;
  email: string | null;
  role: string;
  isPlatformAdmin: boolean;
}

export async function requireAdminActor(): Promise<
  { actor: AdminActor } | { error: NextResponse }
> {
  const denial = await requireAdminApi();
  if (denial) return { error: denial };
  const ctx = await getAdminContext();
  if (!ctx) {
    return {
      error: NextResponse.json(
        { error: "Admin sign-in required." },
        { status: 401 },
      ),
    };
  }
  return {
    actor: {
      userId: ctx.userId,
      email: ctx.email,
      role: ctx.role ?? (ctx.isPlatformAdmin ? "platform_admin" : "staff"),
      isPlatformAdmin: ctx.isPlatformAdmin,
    },
  };
}

/**
 * Tenant id as a value for modules built before the env resolver landed.
 * Resolution path is the same env the resolver reads (SUPABASE_TENANT_ID,
 * falling back to UNSAID_TENANT_ID); request handlers that can should call
 * getTenantId() from "@/lib/tenant" instead.
 */
export const PLATFORM_TENANT_ID: string =
  process.env.SUPABASE_TENANT_ID ?? process.env.UNSAID_TENANT_ID ?? "";

/**
 * Compatibility export for the CRM module, built against a gate returning
 * { admin } on success and { response } on denial:
 *   const gate = await requireCrmAdmin(req);
 *   if ("response" in gate) return gate.response;
 *   gate.admin.userId …
 * Same staff check as requireAdminApi.
 */
export async function requireCrmAdmin(
  _req?: unknown,
): Promise<
  | { admin: { userId: string; email: string | null; role: string } }
  | { response: NextResponse }
> {
  const denial = await requireAdminApi();
  if (denial) return { response: denial };
  const ctx = await getAdminContext();
  if (!ctx) {
    return {
      response: NextResponse.json(
        { error: "Admin sign-in required." },
        { status: 401 },
      ),
    };
  }
  return {
    admin: {
      userId: ctx.userId,
      email: ctx.email,
      role: ctx.role ?? (ctx.isPlatformAdmin ? "platform_admin" : "staff"),
    },
  };
}

/** Integrations module alias — same env-resolved tenant id value. */
export const TENANT_ID: string = PLATFORM_TENANT_ID;

// ===========================================================================
// lib/capabilities/guards.ts — M3: the ONE capability guard.
//
// Every guard in this change resolves its actor HERE — never by
// re-implementing session resolution per route (that drift is what
// §1.4 of the DOCX describes: 1,255 handlers gating themselves).
// Identity primitives stay where they are: getCurrentUser
// (lib/auth/server, Supabase session) and rxSessionUser
// (lib/telemedicine/prescriptions, portal session) remain the two
// session readers; this module is the one place that COMBINES them
// into a capability actor, in the same order the old gates did (portal
// session first, Supabase session as fallback — modules.ts parity).
//
// ACTOR → ROLES (defined vocabulary only, roles.ts):
//   identity_grants (scope/role/membership_role) + platform_admins +
//   portal_users (role_type) + crm_staff (role) + tenant_memberships
//   (role) are all read; every source that names the person
//   contributes its role. A person with two relations holds both.
//   platform admin comes ONLY from a platform_admins row or a
//   platform_admin membership — an admin-scope session alone is NOT
//   platform admin (franchise owners carry admin-scope sessions and
//   act through the salon lenses, as they always have).
//   Legacy-admin fallback: an actor who passed the old requireAdminApi
//   (isSupabaseAdmin or a portal admin session) but maps to no defined
//   role acts through the salon operator lens for salon-object
//   capabilities. This keeps requireCapabilityApi from newly denying
//   an admin flow M3 must preserve; platform-only capabilities
//   (governance, ai_system, agreement, relationship) are NEVER granted
//   by the fallback — they keep their existing admin gate.
//   Learner is the customer's learning hat: a customer-scope actor
//   carries both customer and learner.
//   Salon admin and salon operator are the same person: a salon
//   admin/manager/owner membership yields BOTH hats (roles.ts holds
//   one shared set for them).
//
// CAPABILITY CHECK: actor holds a code when it is in any of their
// role sets OR in any active identity_grant's capabilities[] (M1's
// per-grant override store — explicit grants ADD, never remove).
// Scope is enforced by the capability row's scope_mode (M1 table):
//   platform → any tenant; tenant/grant_scope → the actor's tenant
//   (or a platform admin); self → the caller must evidence isSelf.
// A caller that cannot evidence a scope fails closed.
//
// DENIAL SHAPES (proof standard: a denied actor still fails with the
// same refusal shape): requireCapabilityApi denies with 401
// { error: "Admin sign-in required." } — byte-identical to the old
// requireAdminApi / requireModuleApi denial — whether the caller is
// unauthenticated or authenticated-but-lacking. The transition-matrix
// denial is a NEW shape (403, code transition_denied) because the old
// routes did not check transitions at all; there is no old shape to
// preserve for a move that used to sail through unchecked.
// ===========================================================================

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, sessionFromPayload, isSupabaseAdmin } from "@/lib/portal-auth";
import { getCurrentUser } from "@/lib/auth/server";
import { pgQuery } from "@/lib/pg";
import { TENANT_ID, withPg } from "@/lib/crm/enterprise";
import { isModuleDeniedForTenant } from "@/lib/franchise-access";
import { capabilitiesForRole, MODULE_CAPABILITIES } from "@/lib/capabilities/roles";
import { portalGrantsForAuthUser, levelAtLeast } from "@/lib/capabilities/module-grants";
import type { LensAudience } from "@/lib/capabilities/transitions";

export interface CapabilityActor {
  authUserId: string;
  email: string | null;
  roles: string[];
  capabilities: Set<string>;
  /** M5: the ONE grant active in the caller's session (DOCX §2.5
   *  CONTEXT) — downstream reads resolve through it, not through the
   *  caller's whole grant set. The capability SET above is still the
   *  union of the actor's roles (authority = grant ∩ verification ∩
   *  relation ∩ policy, DOCX §4.3 — no single grant may widen it);
   *  activeGrantId names which grant's context the call runs under. */
  activeGrantId?: string;
  activeScope?: string | null;
  tenantId: string | null;
  staffId: string | null;
  customerId: string | null;
  /** True when the actor passed the legacy admin gate (used only for
   *  the documented fallback in resolveCapabilityActor). */
  legacyAdmin: boolean;
}

interface SessionIdentity {
  authUserId: string;
  email: string | null;
  scope?: string | null;
  role?: string | null;
  membershipRole?: string | null;
  homeTenantId?: string | null;
  activeGrantId?: string | null;
}

async function sessionIdentity(): Promise<SessionIdentity | null> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    const payload = verifySessionToken(token);
    if (payload) {
      const user = sessionFromPayload(payload);
      if (user?.authUserId) {
        return {
          authUserId: user.authUserId,
          email: user.email ?? null,
          scope: user.scope,
          role: user.role,
          membershipRole: user.membershipRole,
          homeTenantId: user.homeTenantId,
          activeGrantId: user.activeGrantId ?? null,
        };
      }
    }
  } catch {
    /* fall through to the Supabase session */
  }
  try {
    const supabaseUser = await getCurrentUser();
    if (supabaseUser?.id) {
      return { authUserId: supabaseUser.id, email: (supabaseUser.email as string | null) ?? null };
    }
  } catch {
    /* no session */
  }
  return null;
}

function addRole(roles: Set<string>, role: string | null | undefined) {
  if (role) roles.add(role);
}

/** Map one raw role word (membership, staff, portal, grant) onto the
 *  defined vocabulary. Returns every defined role the word implies. */
export function definedRolesForWord(word: string | null | undefined, scope: string | null | undefined): string[] {
  const w = (word || "").toLowerCase().trim();
  const out: string[] = [];
  switch (w) {
    case "platform_admin":
      out.push("platform admin");
      break;
    case "owner":
    case "manager":
    case "admin":
      // A salon owner/manager/admin is one audience, two hats.
      out.push("salon admin", "salon operator");
      break;
    case "staff":
    case "employee":
    case "reception":
    case "front_desk":
      // The front_desk string stays exactly as-is (open owner
      // decision); as a role word it resolves to the operator lens.
      out.push("salon operator");
      break;
    case "accountant":
      out.push("accountant");
      break;
    case "seller":
      out.push("seller");
      break;
    case "affiliate":
      out.push("affiliate");
      break;
    case "advertiser":
    case "ads":
      out.push("advertiser");
      break;
    case "customer":
      out.push("customer", "learner");
      break;
    case "learner":
      out.push("learner");
      break;
    case "franchise_owner":
      out.push("salon admin", "salon operator");
      break;
    case "franchise_employee":
    case "internal_employee":
      out.push("salon operator");
      break;
    default:
      break;
  }
  // Scope alone implies a role only where the word above said nothing.
  if (!out.length && scope) {
    const s = scope.toLowerCase();
    if (s === "customer") out.push("customer", "learner");
    else if (s === "seller") out.push("seller");
    else if (s === "ads") out.push("advertiser");
    else if (s === "affiliate") out.push("affiliate");
    else if (s === "employee") out.push("salon operator");
  }
  return out;
}

/**
 * Resolve the calling actor: session → grants + roster rows → roles +
 * capability set. Returns null when no session resolves. Never throws
 * for a missing table — a failed lookup degrades to fewer roles, and
 * the guard then denies (fail closed).
 */
export async function resolveCapabilityActor(): Promise<CapabilityActor | null> {
  const identity = await sessionIdentity();
  if (!identity) return null;
  const { authUserId } = identity;
  const roles = new Set<string>();
  const grantCaps = new Set<string>();
  let tenantId: string | null = identity.homeTenantId ?? null;
  let staffId: string | null = null;
  let customerId: string | null = null;
  let legacyAdmin = false;

  const grants = await pgQuery<{ scope: string | null; role: string | null; membership_role: string | null; tenant_id: string | null; capabilities: string[] | null }>(
    `SELECT scope, role, membership_role, tenant_id::text AS tenant_id, capabilities
       FROM public.identity_grants WHERE user_id = $1::uuid AND status = 'active'`,
    [authUserId],
  ).catch(() => [] as never[]);
  for (const g of grants) {
    for (const r of definedRolesForWord(g.membership_role || g.role, g.scope)) addRole(roles, r);
    for (const c of g.capabilities ?? []) grantCaps.add(String(c));
    if (!tenantId && g.tenant_id) tenantId = String(g.tenant_id);
  }
  // Session claims contribute too (the session was minted from these
  // same sources; reading them here keeps a DB-down actor resolvable
  // to the same roles the session already asserts).
  for (const r of definedRolesForWord(identity.membershipRole || identity.role, identity.scope)) addRole(roles, r);

  const platformAdmin = await pgQuery<{ user_id: string }>(
    `SELECT user_id::text AS user_id FROM public.platform_admins
      WHERE user_id = $1::uuid AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
    [authUserId],
  ).catch(() => [] as never[]);
  if (platformAdmin.length) addRole(roles, "platform admin");

  const portalUsers = await pgQuery<{ role_type: string | null; tenant_id: string | null }>(
    `SELECT role_type, tenant_id::text AS tenant_id FROM public.portal_users
      WHERE user_id = $1::uuid AND is_active`,
    [authUserId],
  ).catch(() => [] as never[]);
  for (const pu of portalUsers) {
    for (const r of definedRolesForWord(pu.role_type, null)) addRole(roles, r);
    if (!tenantId && pu.tenant_id) tenantId = String(pu.tenant_id);
  }

  const staff = await pgQuery<{ id: string; role: string | null; tenant_id: string | null }>(
    `SELECT id::text AS id, role, tenant_id::text AS tenant_id FROM public.crm_staff
      WHERE user_id = $1::uuid AND is_active ORDER BY created_at ASC LIMIT 1`,
    [authUserId],
  ).catch(() => [] as never[]);
  if (staff[0]) {
    staffId = String(staff[0].id);
    for (const r of definedRolesForWord(staff[0].role, "employee")) addRole(roles, r);
    if (!tenantId && staff[0].tenant_id) tenantId = String(staff[0].tenant_id);
  }

  const memberships = await pgQuery<{ role: string | null; tenant_id: string | null }>(
    `SELECT role, tenant_id::text AS tenant_id FROM public.tenant_memberships
      WHERE user_id = $1::uuid AND status <> 'suspended' AND active`,
    [authUserId],
  ).catch(() => [] as never[]);
  for (const m of memberships) {
    for (const r of definedRolesForWord(m.role, null)) addRole(roles, r);
    if (!tenantId && m.tenant_id) tenantId = String(m.tenant_id);
  }

  // crm_customers carries NO user_id column live — the customer link
  // is the email (the same link the customer appointment routes use).
  const customers = identity.email
    ? await pgQuery<{ id: string }>(
        `SELECT id::text AS id FROM public.crm_customers WHERE lower(email) = lower($1) LIMIT 1`,
        [identity.email],
      ).catch(() => [] as never[])
    : [];
  if (customers[0]) customerId = String(customers[0].id);

  try {
    legacyAdmin = await isSupabaseAdmin(authUserId);
  } catch {
    legacyAdmin = false;
  }
  // Portal admin sessions pass the old requireAdminApi even when no
  // roster row maps to a role (franchise owners map above; anything
  // else that carried an admin-scope session counts here).
  if (!legacyAdmin && identity.scope === "admin" && identity.role === "admin") legacyAdmin = true;
  if (legacyAdmin && roles.size === 0) {
    // Documented fallback (see header): the old gate passed this
    // actor, so they act through the salon operator lens for
    // salon-object capabilities — never for platform-only ones.
    roles.add("salon operator");
  }

  const capabilities = new Set<string>(grantCaps);
  for (const role of roles) {
    for (const c of capabilitiesForRole(role)) capabilities.add(c);
  }
  return { authUserId, email: identity.email, roles: [...roles], capabilities, tenantId, staffId, customerId, legacyAdmin, activeGrantId: identity.activeGrantId ?? undefined, activeScope: identity.scope ?? null };
}

/** Scope-aware capability test. platform admin bypasses scope; every
 *  other actor must evidence the scope_mode of the capability row. */
export async function actorHasCapability(
  actor: CapabilityActor,
  capabilityCode: string,
  opts: { tenantId?: string | null; isSelf?: boolean } = {},
): Promise<boolean> {
  if (!actor.capabilities.has(capabilityCode)) return false;
  if (actor.roles.includes("platform admin")) return true;
  const rows = await pgQuery<{ scope_mode: string }>(
    `SELECT scope_mode FROM public.platform_capabilities WHERE capability_code = $1`,
    [capabilityCode],
  ).catch(() => [] as never[]);
  const scopeMode = rows[0]?.scope_mode ?? "grant_scope";
  if (scopeMode === "platform") return false; // non-admins never hold platform scope
  if (scopeMode === "self") return opts.isSelf === true;
  if (opts.tenantId && actor.tenantId && String(opts.tenantId) !== String(actor.tenantId)) return false;
  return true;
}

/** Module-grant leg: the actor works in this module at this level in
 *  the surviving portal store (or is a staff owner / platform admin,
 *  parity with the old requireModuleApi). */
export async function actorHasModule(
  actor: CapabilityActor,
  module: string,
  level: "read" | "write" | "full",
  tenantId?: string | null,
): Promise<boolean> {
  if (actor.roles.includes("platform admin")) return true;
  const tenant = tenantId ?? actor.tenantId ?? TENANT_ID();
  if (isModuleDeniedForTenant(module, tenant)) return false;
  const result = await withPg(async (client) => {
    const staff = await client.query(
      `SELECT role FROM public.crm_staff WHERE tenant_id = $1 AND user_id = $2::uuid AND is_active ORDER BY created_at ASC LIMIT 1`,
      [tenant, actor.authUserId],
    );
    if (staff.rows[0]?.role === "owner") return true;
    const grants = await portalGrantsForAuthUser(client, tenant, actor.authUserId);
    const grantLevel = grants[module];
    return !!grantLevel && levelAtLeast(grantLevel, level);
  }).catch(() => false);
  return result ?? false;
}

/** Lenses this actor may move a commitment through, most permissive
 *  first. A salon admin/operator holds BOTH manager and operator hats
 *  (one audience), so a move allowed under either hat is allowed —
 *  the hats never diverge for the same human. */
export function actorTransitionLenses(actor: CapabilityActor): LensAudience[] {
  const lenses: LensAudience[] = [];
  if (actor.roles.includes("platform admin")) lenses.push("platform");
  if (actor.roles.includes("salon admin")) lenses.push("manager");
  if (actor.roles.includes("salon operator")) lenses.push("operator");
  if (actor.roles.includes("customer") || actor.roles.includes("learner")) lenses.push("owner");
  return lenses;
}

/**
 * The capability gate for API routes. Passes (null) when the actor
 * holds the capability AND, when a module leg is given, works in that
 * module at that level. Denies with the OLD refusal shape (401,
 * "Admin sign-in required.") in every failure case — the shape the
 * routes this replaces returned from requireAdminApi/requireModuleApi.
 */
export async function requireCapabilityApi(
  capabilityCode: string,
  opts: { module?: string; level?: "read" | "write" | "full"; tenantId?: string | null; isSelf?: boolean; actor?: CapabilityActor | null } = {},
): Promise<NextResponse | null> {
  const denied = () => NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  const actor = opts.actor ?? (await resolveCapabilityActor());
  if (!actor) return denied();
  if (!(await actorHasCapability(actor, capabilityCode, { tenantId: opts.tenantId, isSelf: opts.isSelf }))) return denied();
  if (opts.module && !(await actorHasModule(actor, opts.module, opts.level ?? "read", opts.tenantId))) return denied();
  return null;
}

/** Re-export for call sites that name the concept, not the function. */
export const MODULE_CAPABILITY_MAP = MODULE_CAPABILITIES;

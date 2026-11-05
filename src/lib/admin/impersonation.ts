// ---------------------------------------------------------------------------
// impersonation.ts — K1 · Impersonation: the governed session record.
//
// STORE: public.admin_impersonation_sessions (migration 20261064, created
// live 2026-10-14 — the tree designs K1 and no impersonation record existed
// anywhere in schema or code). A session record carries: who (admin email /
// auth id / staff id, resolved server-side), whom (target type + id +
// label snapshot + the target's own auth user id where the target's table
// carries one), a REQUIRED reason (the store refuses a blank one by CHECK),
// start/end stamps, and status. Every start and end is also appended to
// crm_audit_log by the route (the K4-readable admin trail).
//
// THE SESSION LEG — BUILT (seller-admin re-audit, 2026-10-23), in the
// order this header originally specified:
//   1. SessionPayload carries the impersonation claim (sessionId +
//      byEmail + target type/id) and signSession/sessionFromPayload
//      carry it through — a minted token is now MARKED, so acts taken
//      inside it attribute to the admin of record, never silently to
//      the target.
//   2. The root layout renders ImpersonationBanner whenever the claim
//      is present; its End control calls /api/impersonation/session,
//      which ends the governed record and restores the admin's stashed
//      session cookie. Minted tokens live one hour; ending the record
//      from the desk closes the record immediately and the banner's
//      state read reports the ended record, forcing exit on sight.
//   3. "start" still only opens the record; ENTERING is the separate,
//      deliberate act at GET /api/admin/impersonation/enter?sessionId=
//      — admin-gated, owner-checked (only the admin who started the
//      record can enter it), and it refuses targets with no resolvable
//      portal identity (see resolveImpersonationIdentity).
//
// TARGET IDENTITY (firsthand): sellers carry NO user_id column — a
// seller's portal identity resolves by email at sign-in, so seller records
// store target_auth_user_id NULL and the target's email rides the label.
// crm_staff.user_id is NULL on most rows (the staff-linkage gap) — stored
// when present, NULL when the record itself carries none. customers carry
// "userId".
// ---------------------------------------------------------------------------

/** Cookie holding the admin's own session while an impersonation
 *  session is live (set by the enter route, consumed by the exit). */
export const ADMIN_SESSION_STASH_COOKIE = "portal_admin_session"

export const IMPERSONATION_TARGET_TYPES = ["seller", "customer", "employee"] as const
export type ImpersonationTargetType = (typeof IMPERSONATION_TARGET_TYPES)[number]

interface PgClientLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

export interface ImpersonationTarget {
  id: string
  label: string
  authUserId: string | null
  detail: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolve a target inside the tenant. Returns null when the record does
 * not exist for that type in that tenant (a customer target admits the
 * platform's unstamped legacy rows only under the platform tenant — the
 * same population the customer notification writer serves).
 */
export async function resolveImpersonationTarget(
  client: PgClientLike,
  tenantId: string,
  platformTenantId: string,
  targetType: ImpersonationTargetType,
  targetId: string,
): Promise<ImpersonationTarget | null> {
  if (targetType === "seller") {
    if (!UUID_RE.test(targetId)) return null
    const { rows } = await client.query(
      `SELECT id::text AS id, display_name, email, status
         FROM public.sellers
        WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, targetId],
    )
    const r = rows[0]
    if (!r) return null
    return {
      id: String(r.id),
      label: r.email ? `${r.display_name} <${r.email}>` : String(r.display_name),
      authUserId: null,
      detail: `seller · status ${r.status}`,
    }
  }
  if (targetType === "customer") {
    const { rows } = await client.query(
      `SELECT id, "firstName", "lastName", email, "userId"
         FROM public.customers
        WHERE id = $1
          AND (tenant_id = $2::uuid OR (tenant_id IS NULL AND $2::uuid = $3::uuid))`,
      [targetId, tenantId, platformTenantId],
    )
    const r = rows[0]
    if (!r) return null
    const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim()
    return {
      id: String(r.id),
      label: r.email ? `${name || "Customer"} <${r.email}>` : name || "Customer",
      authUserId: r.userId ? String(r.userId) : null,
      detail: "shop customer",
    }
  }
  if (targetType === "employee") {
    if (!UUID_RE.test(targetId)) return null
    const { rows } = await client.query(
      `SELECT id::text AS id, display_name, email, role, user_id::text AS user_id
         FROM public.crm_staff
        WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, targetId],
    )
    const r = rows[0]
    if (!r) return null
    return {
      id: String(r.id),
      label: r.email ? `${r.display_name || r.email} <${r.email}>` : String(r.display_name || r.email || "Staff"),
      authUserId: r.user_id ?? null,
      detail: `${r.role}`,
    }
  }
  return null
}

/** Candidate targets for the start form's picker (tenant-scoped, by type). */
export async function searchImpersonationTargets(
  client: PgClientLike,
  tenantId: string,
  platformTenantId: string,
  targetType: ImpersonationTargetType,
  q: string,
): Promise<ImpersonationTarget[]> {
  const like = `%${q}%`
  if (targetType === "seller") {
    const { rows } = await client.query(
      `SELECT id::text AS id, display_name, email, status FROM public.sellers
        WHERE tenant_id = $1::uuid AND ($2 = '' OR display_name ILIKE $3 OR email ILIKE $3)
        ORDER BY display_name LIMIT 20`,
      [tenantId, q, like],
    )
    return rows.map((r) => ({
      id: String(r.id),
      label: r.email ? `${r.display_name} <${r.email}>` : String(r.display_name),
      authUserId: null,
      detail: `seller · status ${r.status}`,
    }))
  }
  if (targetType === "customer") {
    const { rows } = await client.query(
      `SELECT id, "firstName", "lastName", email, "userId" FROM public.customers
        WHERE (tenant_id = $1::uuid OR (tenant_id IS NULL AND $1::uuid = $2::uuid))
          AND ($3 = '' OR email ILIKE $4 OR "firstName" ILIKE $4 OR "lastName" ILIKE $4)
        ORDER BY "lastName" NULLS LAST, email LIMIT 20`,
      [tenantId, platformTenantId, q, like],
    )
    return rows.map((r) => {
      const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim()
      return {
        id: String(r.id),
        label: r.email ? `${name || "Customer"} <${r.email}>` : name || "Customer",
        authUserId: r.userId ? String(r.userId) : null,
        detail: "shop customer",
      }
    })
  }
  if (targetType === "employee") {
    const { rows } = await client.query(
      `SELECT id::text AS id, display_name, email, role, user_id::text AS user_id
         FROM public.crm_staff
        WHERE tenant_id = $1::uuid
          AND ($2 = '' OR display_name ILIKE $3 OR email ILIKE $3)
        ORDER BY display_name NULLS LAST, email LIMIT 20`,
      [tenantId, q, like],
    )
    return rows.map((r) => ({
      id: String(r.id),
      label: r.email ? `${r.display_name || r.email} <${r.email}>` : String(r.display_name || r.email || "Staff"),
      authUserId: r.user_id ?? null,
      detail: `${r.role}`,
    }))
  }
  return []
}

export interface ImpersonationIdentity {
  /** The session's sub — the target's own auth user id where one exists. */
  authUserId: string
  email: string
  name: string
  role: "admin" | "customer" | "seller"
  scope: "employee" | "customer" | "seller"
  membershipRole?: string
  /** Where the entered session lands. */
  portalPath: string
}

/**
 * Resolve the PORTAL IDENTITY an entered session will carry for a target.
 * Returns null when the target has no resolvable portal identity — the
 * enter route refuses rather than minting a session that resolves to
 * nobody (or worse, to somebody else):
 *   seller   — identity resolves by email at sign-in; sub prefers the
 *              portal_users identity registered for that email, else the
 *              seller record id rides as sub under the impersonation mark.
 *   customer — requires customers."userId" (the customer's auth identity).
 *   employee — requires crm_staff.user_id (most staff rows carry none
 *              — the staff-linkage gap; those cannot be entered until
 *              the linkage exists, and the refusal says so).
 */
export async function resolveImpersonationIdentity(
  client: PgClientLike,
  tenantId: string,
  platformTenantId: string,
  targetType: ImpersonationTargetType,
  targetId: string,
): Promise<ImpersonationIdentity | null> {
  if (targetType === "seller") {
    if (!UUID_RE.test(targetId)) return null
    const { rows } = await client.query(
      `SELECT id::text AS id, display_name, email FROM public.sellers
        WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, targetId],
    )
    const r = rows[0]
    if (!r?.email) return null
    const { rows: pu } = await client.query(
      `SELECT user_id::text AS user_id FROM public.portal_users
        WHERE lower(email) = lower($1) AND is_active = true
        ORDER BY created_at ASC LIMIT 1`,
      [r.email],
    ).catch(() => ({ rows: [] as any[] }))
    return {
      authUserId: pu[0]?.user_id ? String(pu[0].user_id) : String(r.id),
      email: String(r.email),
      name: String(r.display_name || r.email),
      role: "seller",
      scope: "seller",
      membershipRole: "seller",
      portalPath: "/seller",
    }
  }
  if (targetType === "customer") {
    const { rows } = await client.query(
      `SELECT id, "firstName", "lastName", email, "userId"
         FROM public.customers
        WHERE id = $1
          AND (tenant_id = $2::uuid OR (tenant_id IS NULL AND $2::uuid = $3::uuid))`,
      [targetId, tenantId, platformTenantId],
    )
    const r = rows[0]
    if (!r?.userId || !r?.email) return null
    const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim()
    return {
      authUserId: String(r.userId),
      email: String(r.email),
      name: name || String(r.email),
      role: "customer",
      scope: "customer",
      membershipRole: "customer",
      portalPath: "/customer",
    }
  }
  if (targetType === "employee") {
    if (!UUID_RE.test(targetId)) return null
    const { rows } = await client.query(
      `SELECT id::text AS id, display_name, email, role, user_id::text AS user_id
         FROM public.crm_staff
        WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, targetId],
    )
    const r = rows[0]
    if (!r?.user_id || !r?.email) return null
    return {
      authUserId: String(r.user_id),
      email: String(r.email),
      name: String(r.display_name || r.email),
      role: "admin",
      scope: "employee",
      membershipRole: String(r.role || "staff"),
      portalPath: "/employee",
    }
  }
  return null
}

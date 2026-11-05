// ===========================================================================
// lib/capabilities/module-grants.ts — M3 naming-drift resolution.
//
// SURVIVOR: portal_module_permissions (see migration 20261187 for the
// live-schema reasoning: it holds the only live rows; the platform
// store held 0). Every first-party module-grant read/write in this
// change goes through this file and names portal_module_permissions.
// The old platform_module_permissions name survives ONLY as the
// compatibility VIEW over this store (migration 20261187), for
// unmigrated readers (support libs, platform_has_permission).
//
// LEVEL VOCABULARY: portal 'all' == platform 'full'; read/write pass
// through; 'none' is absence (a 'none' row denies exactly like no row
// in every gate, and writers delete instead of storing 'none' where
// the old store deleted — see upsertPortalModuleGrant).
//
// STAFF WITHOUT A PORTAL ROW: 15 of 21 live crm_staff rows have no
// portal_users row (salon staff were never portal-provisioned). A
// staff grant cannot be stored in portal_module_permissions without a
// portal_users row (FK on (tenant_id, portal_user_id)), so writers
// that target staff resolve-or-create one here: portal='employee',
// role_type='staff'. 'staff' is deliberately NOT one of the role_types
// portal-auth switches on, so it falls through to tenant-membership
// resolution exactly as today — creating the row changes no sign-in
// outcome; it only gives the grant a place to live.
// ===========================================================================

import type { Client } from "pg";

export type PortalLevel = "none" | "read" | "write" | "all";
export type PlatformLevel = "none" | "read" | "write" | "full";

export function portalLevelToPlatform(level: string | null | undefined): PlatformLevel {
  switch ((level || "none").toLowerCase()) {
    case "all":
    case "full":
      return "full";
    case "write":
      return "write";
    case "read":
      return "read";
    default:
      return "none";
  }
}

export function platformLevelToPortal(level: string | null | undefined): PortalLevel {
  switch ((level || "none").toLowerCase()) {
    case "full":
    case "all":
      return "all";
    case "write":
      return "write";
    case "read":
      return "read";
    default:
      return "none";
  }
}

const LEVEL_RANK: Record<string, number> = { none: 0, read: 1, write: 2, full: 3, all: 3 };

export function levelAtLeast(level: string | null | undefined, required: "read" | "write" | "full"): boolean {
  return (LEVEL_RANK[(level || "none").toLowerCase()] ?? 0) >= LEVEL_RANK[required];
}

/** The portal_users row(s) for an auth user in a tenant (active first). */
export async function portalUserIdsForAuthUser(
  client: Client,
  tenantId: string,
  userId: string,
): Promise<string[]> {
  const r = await client.query(
    `SELECT id::text AS id FROM public.portal_users
      WHERE tenant_id = $1::uuid AND user_id = $2::uuid
      ORDER BY is_active DESC, created_at ASC`,
    [tenantId, userId],
  );
  return r.rows.map((row: { id: string }) => String(row.id));
}

/** Find the portal identity for a staff member's auth user, creating
 *  the minimal employee portal row when none exists (see header). */
export async function portalUserIdForStaff(
  client: Client,
  args: { tenantId: string; userId: string; email?: string | null; displayName?: string | null },
): Promise<string | null> {
  const existing = await portalUserIdsForAuthUser(client, args.tenantId, args.userId);
  if (existing[0]) return existing[0];
  // No unique constraint on (tenant_id, user_id) live, so the insert
  // is guarded by WHERE NOT EXISTS, not ON CONFLICT.
  const ins = await client.query(
    `INSERT INTO public.portal_users (tenant_id, user_id, role_type, portal, email, display_name, is_active)
     SELECT $1::uuid, $2::uuid, 'staff', 'employee', $3, $4, true
      WHERE NOT EXISTS (
        SELECT 1 FROM public.portal_users
         WHERE tenant_id = $1::uuid AND user_id = $2::uuid)
     RETURNING id::text AS id`,
    [args.tenantId, args.userId, args.email ?? null, args.displayName ?? null],
  );
  if (ins.rows[0]?.id) return String(ins.rows[0].id);
  // Lost a race with another creator — re-read.
  const reread = await portalUserIdsForAuthUser(client, args.tenantId, args.userId);
  return reread[0] ?? null;
}

/** All portal module grants for an auth user in a tenant, in platform
 *  vocabulary ({ module_code: access_level }) — the shape the old
 *  platform readers consumed. */
export async function portalGrantsForAuthUser(
  client: Client,
  tenantId: string,
  userId: string,
): Promise<Record<string, PlatformLevel>> {
  const portalIds = await portalUserIdsForAuthUser(client, tenantId, userId);
  if (!portalIds.length) return {};
  const r = await client.query(
    `SELECT module_key, permission_level FROM public.portal_module_permissions
      WHERE tenant_id = $1::uuid AND portal_user_id = ANY($2::uuid[])`,
    [tenantId, portalIds],
  );
  const out: Record<string, PlatformLevel> = {};
  for (const row of r.rows as { module_key: string; permission_level: string }[]) {
    out[String(row.module_key)] = portalLevelToPlatform(row.permission_level);
  }
  return out;
}

/** Staff-scoped read: a staff row's grants via its portal identity.
 *  Returns null when the user has no crm_staff row in this tenant. */
export async function portalGrantsForStaff(
  client: Client,
  tenantId: string,
  userId: string,
): Promise<{ staffId: string; grants: Record<string, PlatformLevel> } | null> {
  const s = await client.query(
    `SELECT id::text AS id FROM public.crm_staff
      WHERE tenant_id = $1::uuid AND user_id = $2::uuid
      ORDER BY is_active DESC LIMIT 1`,
    [tenantId, userId],
  );
  if (!s.rows[0]) return null;
  const grants = await portalGrantsForAuthUser(client, tenantId, userId);
  return { staffId: String(s.rows[0].id), grants };
}

/** Write one module grant into the surviving store. 'none' deletes
 *  (absence is the deny, as in the old store). Returns the portal
 *  grant row id, or null when the grant was deleted. */
export async function upsertPortalModuleGrant(
  client: Client,
  args: { tenantId: string; portalUserId: string; moduleCode: string; accessLevel: PlatformLevel; grantedBy?: string | null },
): Promise<string | null> {
  const portalLevel = platformLevelToPortal(args.accessLevel);
  if (portalLevel === "none") {
    await client.query(
      `DELETE FROM public.portal_module_permissions
        WHERE tenant_id = $1::uuid AND portal_user_id = $2::uuid AND module_key = $3`,
      [args.tenantId, args.portalUserId, args.moduleCode],
    );
    return null;
  }
  // NOTE: portal_module_permissions carries NO unique constraint on
  // (tenant_id, portal_user_id, module_key) live, so ON CONFLICT cannot
  // target it — update-then-insert, the same pattern the provisioning
  // writers already use (WHERE NOT EXISTS).
  const upd = await client.query(
    `UPDATE public.portal_module_permissions
        SET permission_level = $4, granted_by = $5::uuid, updated_at = now()
      WHERE tenant_id = $1::uuid AND portal_user_id = $2::uuid AND module_key = $3
      RETURNING id::text AS id`,
    [args.tenantId, args.portalUserId, args.moduleCode, portalLevel, args.grantedBy ?? null],
  );
  if (upd.rows[0]?.id) return String(upd.rows[0].id);
  const ins = await client.query(
    `INSERT INTO public.portal_module_permissions (tenant_id, portal_user_id, module_key, permission_level, granted_by)
     SELECT $1::uuid, $2::uuid, $3, $4, $5::uuid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.portal_module_permissions
         WHERE tenant_id = $1::uuid AND portal_user_id = $2::uuid AND module_key = $3)
     RETURNING id::text AS id`,
    [args.tenantId, args.portalUserId, args.moduleCode, portalLevel, args.grantedBy ?? null],
  );
  return ins.rows[0]?.id ? String(ins.rows[0].id) : null;
}

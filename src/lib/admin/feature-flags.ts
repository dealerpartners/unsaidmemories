// ---------------------------------------------------------------------------
// feature-flags.ts — the server-side reader for K5 · Feature Flags.
//
// STORE: public.platform_feature_flags (migration 20261064, created live
// 2026-10-14 — the tree designs K5 Feature Flags and no flags store
// existed; the only flags surface was a local-useState matrix in
// CustomerPortalScreen that persisted nothing).
//
// SEMANTICS (stated plainly, this is the contract surfaces call):
//   * Flags are PER-TENANT rows. There is no cross-tenant flag and no
//     global-from-first-tenant default: a flag exists for a tenant only
//     when an admin recorded it for that tenant.
//   * `audience` is the tree's K5 leaf — seller | customer | employee |
//     global. "Global features" in the tree means the flag applies
//     across portals FOR THAT TENANT, so a read for a specific audience
//     falls back to the tenant's 'global' row for the same key.
//   * DEFAULT-OFF ON ABSENCE: no row (in the audience or in 'global')
//     means the feature is OFF. A surface never invents an "on" state.
//
// This reader is the seam surfaces call. The K5 consumers are wired:
// every portal reads its own audience's resolved flags through
// featureFlagsForAudience below — /api/seller/flags + the seller shell
// payload (seller), /api/customer/flags (customer), /api/employee/flags
// (employee) — and the 'global' audience reaches all three portals
// through the fallback in that same read, which is the tree's "Global
// features → all three portals" leaf.
// ---------------------------------------------------------------------------

export const FLAG_AUDIENCES = ["seller", "customer", "employee", "global"] as const
export type FlagAudience = (typeof FLAG_AUDIENCES)[number]

interface PgClientLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

export interface FeatureFlagRow {
  id: string
  audience: FlagAudience
  key: string
  description: string | null
  enabled: boolean
  updatedBy: string | null
  updatedAt: string
}

/** The one read every surface makes: is this flag on for this tenant? */
export async function isFeatureEnabled(
  client: PgClientLike,
  tenantId: string,
  audience: FlagAudience,
  flagKey: string,
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT audience, enabled
       FROM public.platform_feature_flags
      WHERE tenant_id = $1::uuid AND flag_key = $2 AND audience IN ($3, 'global')`,
    [tenantId, flagKey, audience],
  )
  if (rows.length === 0) return false
  const exact = rows.find((r) => r.audience === audience)
  if (exact) return Boolean(exact.enabled)
  const global = rows.find((r) => r.audience === "global")
  return global ? Boolean(global.enabled) : false
}

/** Every recorded flag for a tenant (optionally one audience), key order. */
export async function listFeatureFlags(
  client: PgClientLike,
  tenantId: string,
  audience?: FlagAudience,
): Promise<FeatureFlagRow[]> {
  const { rows } = await client.query(
    `SELECT id::text AS id, audience, flag_key, description, enabled,
            updated_by, updated_at
       FROM public.platform_feature_flags
      WHERE tenant_id = $1::uuid
        AND ($2::text IS NULL OR audience = $2)
      ORDER BY audience, flag_key`,
    [tenantId, audience ?? null],
  )
  return rows.map((r) => ({
    id: String(r.id),
    audience: r.audience as FlagAudience,
    key: String(r.flag_key),
    description: r.description ?? null,
    enabled: Boolean(r.enabled),
    updatedBy: r.updated_by ?? null,
    updatedAt: new Date(r.updated_at).toISOString(),
  }))
}

/**
 * The consumer read each portal makes (K5): the tenant's flags for one
 * audience, RESOLVED into a key → enabled map with the global fallback
 * applied per key — an audience row wins over the tenant's 'global' row
 * for the same key; a key recorded only in 'global' reaches this
 * audience through the fallback; a key recorded nowhere is absent from
 * the map, and absence reads OFF (the isFeatureEnabled contract). This
 * is what the three portal flag endpoints and the seller shell serve:
 * a flag an admin records for an audience now lands in that portal.
 */
export async function featureFlagsForAudience(
  client: PgClientLike,
  tenantId: string,
  audience: FlagAudience,
): Promise<Record<string, boolean>> {
  const { rows } = await client.query(
    `SELECT audience, flag_key, enabled
       FROM public.platform_feature_flags
      WHERE tenant_id = $1::uuid AND audience IN ($2, 'global')
      ORDER BY flag_key`,
    [tenantId, audience],
  )
  const resolved: Record<string, boolean> = {}
  // Global rows first, so the audience's own rows override per key.
  for (const r of rows) {
    if (r.audience === "global") resolved[String(r.flag_key)] = Boolean(r.enabled)
  }
  for (const r of rows) {
    if (r.audience === audience) resolved[String(r.flag_key)] = Boolean(r.enabled)
  }
  return resolved
}

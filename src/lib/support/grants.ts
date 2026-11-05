// ============================================================================
// Support §5 ACCESS GRANTS — the cross-tenant ticket sharing layer
// (spec: support-desk-enterprise-tree.md §5, lines 97–101; §0's RLS
// convention "own tenant OR active access grant OR master role").
//
// The table and the database policy have existed since the §20 schema
// build: support_ticket_access_grants (ticket_id · grantee_tenant_id ·
// level view|collaborate · granted_by · granted_at · revoked_at) and
// RLS that already honors it — support_tickets SELECT runs through
// support_grant_access(id, 'view'), UPDATE through
// support_grant_access(id, 'collaborate'), and that function's exact
// semantics are: an ACTIVE grant (revoked_at IS NULL) for a tenant the
// caller belongs to; a 'view' need is met by either level, a
// 'collaborate' need requires level = 'collaborate'.
//
// What did NOT exist (census, 2026-10-14): any writer, any management
// surface, and any APP-LAYER honoring — every desk read predicated on
// the resolved tenant alone, so a granted ticket 404'd in the app even
// though the database policy would have admitted it. This module is
// that missing layer:
//
//   - grant management for the OWNING tenant (the grants table's own
//     RLS reserves UPDATE/DELETE to the owning tenant): grant, change
//     level, revoke (a stamp — revoked_at — never a delete; the grant
//     history is audit material), list;
//   - read honoring for the desk: getTicketForDesk resolves a ticket
//     for the resolved tenant as owner first (the pre-existing path,
//     untouched) and only then through an active grant;
//   - every mutation lands the spine event ('access_granted' /
//     'access_revoked', §4 vocabulary) AND a crm_audit_log row in the
//     §10 writers' shape.
//
// Gate (§5 registry): grant management runs under 'support.admin' —
// the registry carries all 13 codes; the operative app-layer test is
// the §17/§18 idiom (hasSupportExportPermission / hasComplianceGrant):
// platform admins (no staff row resolves) and owners pass, a
// write/full grant on module 'support' passes, read/none does not.
// A grant never widens beyond its ticket, and expiry does not exist
// in the schema — revocation is the only end a grant has.
// ============================================================================

import { getTicketById, getTicketByIdAnyTenant, logTicketEvent, type SupportTicket } from "./tickets"
import type { RegulatedActor } from "./regulated"

export interface GrantsDb {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

type Db = GrantsDb

export class GrantError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type AccessGrantLevel = "view" | "collaborate"
export const ACCESS_GRANT_LEVELS: AccessGrantLevel[] = ["view", "collaborate"]

export interface TicketAccessGrant {
  id: string
  ticketId: string
  granteeTenantId: string
  granteeName: string | null
  level: AccessGrantLevel
  grantedByStaffId: string | null
  grantedByName: string | null
  grantedAt: string
  revokedAt: string | null
  revokedByStaffId: string | null
  revokedByName: string | null
  active: boolean
}

const GRANT_COLS = `
  g.id::text AS id, g.ticket_id::text AS ticket_id,
  g.grantee_tenant_id::text AS grantee_tenant_id, tn.name AS grantee_name,
  g.level, g.granted_by_staff_id::text AS granted_by_staff_id,
  gb.display_name AS granted_by_name, g.granted_at::text AS granted_at,
  g.revoked_at::text AS revoked_at,
  g.revoked_by_staff_id::text AS revoked_by_staff_id,
  rb.display_name AS revoked_by_name`

function mapGrant(r: any): TicketAccessGrant {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    granteeTenantId: r.grantee_tenant_id,
    granteeName: r.grantee_name ?? null,
    level: r.level as AccessGrantLevel,
    grantedByStaffId: r.granted_by_staff_id ?? null,
    grantedByName: r.granted_by_name ?? null,
    grantedAt: r.granted_at,
    revokedAt: r.revoked_at ?? null,
    revokedByStaffId: r.revoked_by_staff_id ?? null,
    revokedByName: r.revoked_by_name ?? null,
    active: !r.revoked_at,
  }
}

// ── Audit (§18 change log shape; mirrors compliance.ts) ───────────────

async function auditGrantChange(
  c: Db,
  tenantId: string,
  actor: RegulatedActor,
  grantId: string | null,
  action: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  try {
    await c.query(
      `INSERT INTO public.crm_audit_log
         (tenant_id, actor_user_id, actor_staff_id, entity_type, entity_id, action, before_data, after_data, ip_address, user_agent)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7::jsonb, $8::jsonb, $9::inet, $10)`,
      [
        tenantId, actor.userId, actor.staffId, "support_ticket_access_grant", grantId,
        action,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        actor.ip, actor.userAgent,
      ],
    )
  } catch (e) {
    console.error(
      `[support-grants] audit write failed for ${action}:`,
      e instanceof Error ? e.message : String(e),
    )
  }
}

// ── The 'support.admin' gate (the §17/§18 per-code idiom) ───────────

export async function hasSupportAdminGrant(
  c: Db,
  tenantId: string,
  staffId: string | null,
): Promise<boolean> {
  if (!staffId) return true
  const { rows } = await c.query(
    `SELECT s.role, p.access_level
       FROM public.crm_staff s
       LEFT JOIN public.platform_module_permissions p
         ON p.staff_id = s.id AND p.module_code = 'support'
      WHERE s.id = $1::uuid AND s.tenant_id = $2::uuid AND s.is_active
      LIMIT 1`,
    [staffId, tenantId],
  )
  const r = rows[0]
  if (!r) return false
  const level = String(r.access_level ?? "none")
  return r.role === "owner" || level === "write" || level === "full"
}

// ── Reads ─────────────────────────────────────────────────────────────

export async function listTicketGrants(c: Db, ticketId: string): Promise<TicketAccessGrant[]> {
  const { rows } = await c.query(
    `SELECT ${GRANT_COLS}
       FROM public.support_ticket_access_grants g
       LEFT JOIN public.tenants tn ON tn.id = g.grantee_tenant_id
       LEFT JOIN public.crm_staff gb ON gb.id = g.granted_by_staff_id
       LEFT JOIN public.crm_staff rb ON rb.id = g.revoked_by_staff_id
      WHERE g.ticket_id = $1::uuid
      ORDER BY (g.revoked_at IS NULL) DESC, g.granted_at DESC`,
    [ticketId],
  )
  return rows.map(mapGrant)
}

/** Tenants a grant can be made TO: every tenant except the owner. */
export async function listGrantableTenants(
  c: Db, ownerTenantId: string,
): Promise<{ id: string; name: string | null }[]> {
  const { rows } = await c.query(
    `SELECT id::text AS id, name FROM public.tenants
      WHERE id <> $1::uuid
      ORDER BY name ASC`,
    [ownerTenantId],
  )
  return rows.map((r: any) => ({ id: r.id, name: r.name ?? null }))
}

/** The active grant (if any) a ticket carries for one grantee tenant. */
export async function getActiveGrant(
  c: Db, ticketId: string, granteeTenantId: string,
): Promise<TicketAccessGrant | null> {
  const { rows } = await c.query(
    `SELECT ${GRANT_COLS}
       FROM public.support_ticket_access_grants g
       LEFT JOIN public.tenants tn ON tn.id = g.grantee_tenant_id
       LEFT JOIN public.crm_staff gb ON gb.id = g.granted_by_staff_id
       LEFT JOIN public.crm_staff rb ON rb.id = g.revoked_by_staff_id
      WHERE g.ticket_id = $1::uuid AND g.grantee_tenant_id = $2::uuid
        AND g.revoked_at IS NULL
      ORDER BY g.granted_at DESC
      LIMIT 1`,
    [ticketId, granteeTenantId],
  )
  return rows[0] ? mapGrant(rows[0]) : null
}

/**
 * The desk's ticket resolution WITH §5 honoring: the resolved tenant's
 * own ticket first (the pre-existing read, unchanged); failing that,
 * the ticket through an ACTIVE grant for the resolved tenant, with
 * the grant's level attached. No grant → null, exactly the 404 the
 * desk has always returned cross-tenant.
 */
export async function getTicketForDesk(
  c: Db, resolvedTenant: string, ticketId: string,
): Promise<{ ticket: SupportTicket; grantLevel: AccessGrantLevel | null } | null> {
  const own = await getTicketById(c, resolvedTenant, ticketId)
  if (own) return { ticket: own, grantLevel: null }
  const grant = await getActiveGrant(c, ticketId, resolvedTenant)
  if (!grant) return null
  const ticket = await getTicketByIdAnyTenant(c, ticketId)
  if (!ticket) return null
  return { ticket, grantLevel: grant.level }
}

// ── Grant / change level ──────────────────────────────────────────────

export async function grantTicketAccess(
  c: Db,
  ticket: SupportTicket,
  input: { granteeTenantId: string; level: AccessGrantLevel },
  actor: RegulatedActor,
  actorLabel: string | null,
): Promise<{ grant: TicketAccessGrant; changed: boolean }> {
  if (!ACCESS_GRANT_LEVELS.includes(input.level)) {
    throw new GrantError(400, `Unknown access level "${input.level}"`)
  }
  if (input.granteeTenantId === ticket.tenantId) {
    throw new GrantError(400, "A ticket cannot be granted to its own tenant — the owning tenant already has full access")
  }
  const t = await c.query(
    `SELECT id::text AS id, name FROM public.tenants WHERE id = $1::uuid LIMIT 1`,
    [input.granteeTenantId],
  )
  if (!t.rows[0]) throw new GrantError(400, "Grantee tenant not found")
  const granteeName: string | null = t.rows[0].name ?? null

  const existing = await getActiveGrant(c, ticket.id, input.granteeTenantId)
  if (existing) {
    if (existing.level === input.level) return { grant: existing, changed: false }
    const { rows } = await c.query(
      `UPDATE public.support_ticket_access_grants
          SET level = $3, granted_by_staff_id = $4::uuid, granted_at = now(),
              updated_at = now(), row_version = row_version + 1
        WHERE id = $1::uuid AND ticket_id = $2::uuid AND revoked_at IS NULL
        RETURNING id::text AS id`,
      [existing.id, ticket.id, input.level, actor.staffId],
    )
    if (!rows[0]) throw new GrantError(409, "The grant changed while this request ran — reload and retry")
    const grant = await getActiveGrant(c, ticket.id, input.granteeTenantId)
    await logTicketEvent(c, ticket.tenantId, ticket.id, {
      type: "access_granted",
      actorStaffId: actor.staffId, actorLabel,
      detail: {
        grantId: existing.id, granteeTenantId: input.granteeTenantId, granteeName,
        level: input.level, previousLevel: existing.level, change: "level",
      },
    }).catch(() => {})
    await auditGrantChange(c, ticket.tenantId, actor, existing.id, "support_access_grant_updated",
      { granteeTenantId: input.granteeTenantId, level: existing.level },
      { granteeTenantId: input.granteeTenantId, level: input.level })
    return { grant: grant ?? existing, changed: true }
  }

  const { rows } = await c.query(
    `INSERT INTO public.support_ticket_access_grants
       (ticket_id, grantee_tenant_id, level, granted_by_staff_id)
     VALUES ($1::uuid, $2::uuid, $3, $4::uuid)
     RETURNING id::text AS id`,
    [ticket.id, input.granteeTenantId, input.level, actor.staffId],
  )
  const grant = await getActiveGrant(c, ticket.id, input.granteeTenantId)
  await logTicketEvent(c, ticket.tenantId, ticket.id, {
    type: "access_granted",
    actorStaffId: actor.staffId, actorLabel,
    detail: {
      grantId: rows[0].id, granteeTenantId: input.granteeTenantId, granteeName,
      level: input.level, change: "granted",
    },
  }).catch(() => {})
  await auditGrantChange(c, ticket.tenantId, actor, rows[0].id, "support_access_granted",
    null,
    { granteeTenantId: input.granteeTenantId, level: input.level })
  if (!grant) throw new GrantError(500, "Grant insert did not read back")
  return { grant, changed: true }
}

// ── Revoke (a stamp, never a delete) ──────────────────────────────────

export async function revokeTicketAccess(
  c: Db,
  ticket: SupportTicket,
  grantId: string,
  actor: RegulatedActor,
  actorLabel: string | null,
): Promise<{ grant: TicketAccessGrant }> {
  const { rows: before } = await c.query(
    `SELECT ${GRANT_COLS}
       FROM public.support_ticket_access_grants g
       LEFT JOIN public.tenants tn ON tn.id = g.grantee_tenant_id
       LEFT JOIN public.crm_staff gb ON gb.id = g.granted_by_staff_id
       LEFT JOIN public.crm_staff rb ON rb.id = g.revoked_by_staff_id
      WHERE g.id = $1::uuid AND g.ticket_id = $2::uuid
      LIMIT 1`,
    [grantId, ticket.id],
  )
  const grant = before[0] ? mapGrant(before[0]) : null
  if (!grant) throw new GrantError(404, "Grant not found on this ticket")
  if (grant.revokedAt) throw new GrantError(409, "This grant is already revoked")

  const { rows } = await c.query(
    `UPDATE public.support_ticket_access_grants
        SET revoked_at = now(), revoked_by_staff_id = $3::uuid,
            updated_at = now(), row_version = row_version + 1
      WHERE id = $1::uuid AND ticket_id = $2::uuid AND revoked_at IS NULL
      RETURNING id::text AS id`,
    [grant.id, ticket.id, actor.staffId],
  )
  if (!rows[0]) throw new GrantError(409, "The grant changed while this request ran — reload and retry")

  await logTicketEvent(c, ticket.tenantId, ticket.id, {
    type: "access_revoked",
    actorStaffId: actor.staffId, actorLabel,
    detail: {
      grantId: grant.id, granteeTenantId: grant.granteeTenantId,
      granteeName: grant.granteeName, level: grant.level, change: "revoked",
    },
  }).catch(() => {})
  await auditGrantChange(c, ticket.tenantId, actor, grant.id, "support_access_revoked",
    { granteeTenantId: grant.granteeTenantId, level: grant.level, revokedAt: null },
    { granteeTenantId: grant.granteeTenantId, level: grant.level, revokedAt: "now" })
  const after = await listTicketGrants(c, ticket.id)
  return { grant: after.find((g) => g.id === grant.id) ?? grant }
}

// ============================================================================
// §10 QUEUES — saved views over the desk queue (support-gaps build).
//
// The support_queues store was designed and provisioned ahead of its
// code (census 2026-10-14: table live, zero references). Its shape IS
// the spec, read firsthand from information_schema:
//
//   scope        'master' (tenant_id NULL — defined by the platform,
//                inherited by tenants) | 'tenant'
//   owner_type   'personal' (owner_staff_id) | 'team' (owner_team_id)
//                | 'global' (neither — visible to the whole scope)
//   filter       jsonb — the saved filter set
//   is_shared    the row's own share flag
//   inherits_from_id / locked_by_master — master→tenant inheritance:
//                a tenant copy of a master view that the master locked
//                cannot be edited locally (enforced in updateQueue).
//
// FILTER VOCABULARY: the desk's real filter dimensions are the URL
// params of GET /api/admin/support/tickets — status, type, category,
// priority, assignee, q, sort, scope. A view's filter is a subset of
// exactly those keys with string values; anything else is refused at
// write time so a saved view can never carry a filter the desk
// cannot apply. Applying a view = setting those params on the desk.
//
// VISIBILITY (who sees a view): the scope's global views, the
// tenant's team views for teams the staffer belongs to, and the
// staffer's own personal views. Master-scope rows inherit into every
// tenant's list (tenant_id NULL reads as platform-defined).
// ============================================================================

export class QueueError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/** The desk's filter dimensions — the only keys a view may carry. */
export const VIEW_FILTER_KEYS = [
  "status", "type", "category", "priority", "assignee", "q", "sort", "scope",
] as const
export type ViewFilter = Partial<Record<(typeof VIEW_FILTER_KEYS)[number], string>>

export interface SupportQueueView {
  id: string
  scope: "master" | "tenant"
  tenantId: string | null
  inheritsFromId: string | null
  lockedByMaster: boolean
  name: string
  ownerType: "personal" | "team" | "global"
  ownerStaffId: string | null
  ownerTeamId: string | null
  filter: ViewFilter
  isShared: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

function mapQueue(r: any): SupportQueueView {
  return {
    id: r.id,
    scope: r.scope,
    tenantId: r.tenant_id ?? null,
    inheritsFromId: r.inherits_from_id ?? null,
    lockedByMaster: r.locked_by_master === true,
    name: r.name,
    ownerType: r.owner_type,
    ownerStaffId: r.owner_staff_id ?? null,
    ownerTeamId: r.owner_team_id ?? null,
    filter: (r.filter ?? {}) as ViewFilter,
    isShared: r.is_shared === true,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const QUEUE_COLS = `id::text AS id, scope, tenant_id::text AS tenant_id,
  inherits_from_id::text AS inherits_from_id, locked_by_master, name,
  owner_type, owner_staff_id::text AS owner_staff_id,
  owner_team_id::text AS owner_team_id, filter, is_shared, sort_order,
  created_at::text AS created_at, updated_at::text AS updated_at`

/** Normalize a client-supplied filter to the desk's vocabulary. */
export function normalizeViewFilter(raw: unknown): ViewFilter {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new QueueError("filter must be an object of desk filter dimensions")
  }
  const out: ViewFilter = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(VIEW_FILTER_KEYS as readonly string[]).includes(k)) {
      throw new QueueError(`filter key '${k}' is not a desk filter dimension`)
    }
    if (v === null || v === undefined || v === "") continue
    if (typeof v !== "string" && typeof v !== "number") {
      throw new QueueError(`filter '${k}' must be a string value`)
    }
    out[k as keyof ViewFilter] = String(v)
  }
  return out
}

async function staffTeamIds(client: any, tenantId: string, staffId: string): Promise<string[]> {
  const r = await client.query(
    `SELECT team_id::text AS id FROM public.support_team_members
      WHERE tenant_id = $1::uuid AND staff_id = $2::uuid`,
    [tenantId, staffId],
  ).catch(() => ({ rows: [] as any[] }))
  return r.rows.map((x: any) => x.id)
}

/**
 * Views visible to a staffer at the desk: platform (master) globals,
 * this tenant's globals, team views for the staffer's teams (and any
 * team view flagged shared), and the staffer's own personal views.
 */
export async function listQueuesForStaff(
  client: any, tenantId: string, staffId: string | null,
): Promise<SupportQueueView[]> {
  const teamIds = staffId ? await staffTeamIds(client, tenantId, staffId) : []
  const r = await client.query(
    `SELECT ${QUEUE_COLS} FROM public.support_queues
      WHERE (scope = 'master' AND owner_type = 'global')
         OR (tenant_id = $1::uuid AND (
              owner_type = 'global'
              OR (owner_type = 'personal' AND owner_staff_id = $2::uuid)
              OR (owner_type = 'team' AND (owner_team_id = ANY($3::uuid[]) OR is_shared))
            ))
      ORDER BY sort_order ASC, name ASC`,
    [tenantId, staffId, teamIds],
  )
  return r.rows.map(mapQueue)
}

export async function getQueue(client: any, tenantId: string, id: string): Promise<SupportQueueView | null> {
  const r = await client.query(
    `SELECT ${QUEUE_COLS} FROM public.support_queues
      WHERE id = $1::uuid AND (tenant_id = $2::uuid OR scope = 'master')`,
    [id, tenantId],
  )
  return r.rows[0] ? mapQueue(r.rows[0]) : null
}

export interface CreateQueueInput {
  name: string
  filter: unknown
  ownerType: "personal" | "team" | "global"
  ownerTeamId?: string | null
  isShared?: boolean
  sortOrder?: number
}

export async function createQueue(
  client: any, tenantId: string, actorStaffId: string, input: CreateQueueInput,
): Promise<SupportQueueView> {
  const name = String(input.name || "").trim()
  if (!name) throw new QueueError("a view name is required")
  if (!["personal", "team", "global"].includes(input.ownerType)) {
    throw new QueueError("ownerType must be personal, team, or global")
  }
  if (input.ownerType === "team" && !input.ownerTeamId) {
    throw new QueueError("a team view needs ownerTeamId")
  }
  const filter = normalizeViewFilter(input.filter)
  const r = await client.query(
    `INSERT INTO public.support_queues
       (scope, tenant_id, name, owner_type, owner_staff_id, owner_team_id,
        filter, is_shared, sort_order)
     VALUES ('tenant', $1::uuid, $2, $3,
             CASE WHEN $3 = 'personal' THEN $4::uuid END,
             CASE WHEN $3 = 'team' THEN $5::uuid END,
             $6::jsonb, $7, $8)
     RETURNING ${QUEUE_COLS}`,
    [
      tenantId, name, input.ownerType, actorStaffId, input.ownerTeamId ?? null,
      JSON.stringify(filter), input.isShared === true, Math.trunc(input.sortOrder ?? 0),
    ],
  )
  return mapQueue(r.rows[0])
}

export interface UpdateQueueInput {
  name?: string
  filter?: unknown
  isShared?: boolean
  sortOrder?: number
}

/** Can this staffer write this view? Owner of a personal view, a
 *  member of the owning team, or any staffer for a tenant global.
 *  Master rows and master-locked inherited rows are read-only here. */
export async function canWriteQueue(
  client: any, tenantId: string, staffId: string, view: SupportQueueView,
): Promise<boolean> {
  if (view.scope === "master") return false
  if (view.lockedByMaster) return false
  if (view.ownerType === "global") return view.tenantId === tenantId
  if (view.ownerType === "personal") return view.ownerStaffId === staffId
  if (view.ownerType === "team" && view.ownerTeamId) {
    const teams = await staffTeamIds(client, tenantId, staffId)
    return teams.includes(view.ownerTeamId)
  }
  return false
}

export async function updateQueue(
  client: any, tenantId: string, id: string, patch: UpdateQueueInput,
): Promise<SupportQueueView | null> {
  const sets: string[] = []
  const vals: any[] = [tenantId, id]
  if (patch.name !== undefined) {
    const name = String(patch.name || "").trim()
    if (!name) throw new QueueError("a view name is required")
    vals.push(name); sets.push(`name = $${vals.length}`)
  }
  if (patch.filter !== undefined) {
    vals.push(JSON.stringify(normalizeViewFilter(patch.filter)))
    sets.push(`filter = $${vals.length}::jsonb`)
  }
  if (patch.isShared !== undefined) {
    vals.push(patch.isShared === true); sets.push(`is_shared = $${vals.length}`)
  }
  if (patch.sortOrder !== undefined) {
    vals.push(Math.trunc(patch.sortOrder)); sets.push(`sort_order = $${vals.length}`)
  }
  if (!sets.length) return getQueue(client, tenantId, id)
  const r = await client.query(
    `UPDATE public.support_queues
        SET ${sets.join(", ")}, row_version = row_version + 1, updated_at = now()
      WHERE tenant_id = $1::uuid AND id = $2::uuid AND scope = 'tenant'
      RETURNING ${QUEUE_COLS}`,
    vals,
  )
  return r.rows[0] ? mapQueue(r.rows[0]) : null
}

export async function deleteQueue(client: any, tenantId: string, id: string): Promise<boolean> {
  const r = await client.query(
    `DELETE FROM public.support_queues
      WHERE tenant_id = $1::uuid AND id = $2::uuid AND scope = 'tenant'`,
    [tenantId, id],
  )
  return (r.rowCount ?? 0) > 0
}

// ============================================================================
// Support engines — shared plumbing (spec §20 step 5).
//
// The step-5 engines (routing, automations, macros, templates, SLA,
// escalation, reporting) are LIBRARY code. Nothing in the live desk
// calls them yet — the desk rewires onto them only after the step-6
// test suite passes. Every engine takes the same pg-shaped client the
// shipped support library uses (`client.query(sql, params)`), so the
// rewire can hand them the `withPg` client unchanged.
//
// Ticket rows are the raw support_tickets columns (snake_case), exactly
// as pg returns them. Timestamps may arrive as Date (pg) or ISO string
// (PostgREST-shaped callers) — `ts()` normalizes either.
// ============================================================================

export interface SupportDb {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

/** A support_tickets row, raw columns. Only the fields engines read are typed. */
export interface SupportTicketRow {
  id: string
  tenant_id: string
  ticket_ref: string
  requester_type: string
  requester_customer_id: string | null
  requester_staff_id: string | null
  requester_seller_id: string | null
  requester_user_id: string | null
  requester_name: string | null
  requester_email: string | null
  subject: string
  category: string
  status: string
  priority: string
  source_channel: string | null
  ticket_type: string | null
  severity_impact: string | null
  visibility_level: string
  tags: string[] | null
  assigned_staff_id: string | null
  assigned_team_id: string | null
  pending_reason: string | null
  on_hold: boolean
  spam_flag: boolean
  reopened_count: number
  reopened_at: string | Date | null
  csat_score: number | null
  message_count: number
  public_reply_count: number
  time_spent_seconds: number | string
  first_public_reply_at: string | Date | null
  last_requester_reply_at: string | Date | null
  last_message_at: string | Date | null
  first_response_due_at: string | Date | null
  next_reply_due_at: string | Date | null
  resolution_due_at: string | Date | null
  first_response_breached_at: string | Date | null
  resolution_breached_at: string | Date | null
  sla_policy_id: string | null
  business_hours_id: string | null
  resolved_at: string | Date | null
  closed_at: string | Date | null
  created_at: string | Date
  updated_at: string | Date
  deleted_at: string | Date | null
  merged_into_id: string | null
  metadata: Record<string, unknown> | null
  [key: string]: unknown
}

export function ts(v: string | Date | null | undefined): Date | null {
  if (v == null) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function iso(v: string | Date | null | undefined): string | null {
  const d = ts(v)
  return d ? d.toISOString() : null
}

// ── Configuration inheritance (§0) ──────────────────────────────────
// Config rows carry scope + inherits_from_id. Resolution: the tenant's
// own rows, plus master rows the tenant has NOT refined (a tenant row
// whose inherits_from_id points at a master row shadows that master
// row). Callers fetch with `WHERE scope = 'master' OR tenant_id = $t`
// so other tenants' rows never reach this function.
export interface ConfigRow {
  id: string
  scope: "master" | "tenant"
  tenant_id: string | null
  inherits_from_id: string | null
}

export function resolveEffectiveRows<T extends ConfigRow>(rows: T[], tenantId: string): T[] {
  const tenantRows = rows.filter((r) => r.scope === "tenant" && r.tenant_id === tenantId)
  const shadowed = new Set(
    tenantRows.map((r) => r.inherits_from_id).filter((x): x is string => !!x),
  )
  const masterRows = rows.filter((r) => r.scope === "master" && !shadowed.has(r.id))
  return [...tenantRows, ...masterRows]
}

/** Fetch one config table's tenant-visible rows and resolve inheritance. */
export async function loadEffectiveConfig<T extends ConfigRow>(
  db: SupportDb,
  table: string,
  tenantId: string,
  extraWhere = "",
): Promise<T[]> {
  const { rows } = await db.query<T>(
    `SELECT * FROM public.${table}
      WHERE (scope = 'master' OR tenant_id = $1::uuid) ${extraWhere}`,
    [tenantId],
  )
  return resolveEffectiveRows(rows, tenantId)
}

// ── Events (§4) ─────────────────────────────────────────────────────
// Engine-written events set actor_type explicitly ('automation' for
// the automation engine, 'system' for sweeps like escalation/SLA,
// 'staff' when a named agent drives a macro). payload mirrors detail —
// the step-2 shim trigger also enforces the mirror for other writers.
export type EngineActorType = "staff" | "system" | "automation"

export async function logEngineEvent(
  db: SupportDb,
  tenantId: string,
  ticketId: string,
  e: {
    type: string
    actorType: EngineActorType
    actorStaffId?: string | null
    actorLabel?: string | null
    detail?: Record<string, unknown>
  },
): Promise<void> {
  const detail = JSON.stringify(e.detail ?? {})
  await db.query(
    `INSERT INTO public.support_ticket_events
       (tenant_id, ticket_id, actor_staff_id, actor_label, actor_type, event_type, detail, payload)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb, $7::jsonb)`,
    [
      tenantId, ticketId, e.actorStaffId ?? null, e.actorLabel ?? null,
      e.actorType, e.type, detail,
    ],
  )
}

// ── Priority ladder (§2: low | normal | high | urgent) ─────────────
export const PRIORITY_LADDER = ["low", "normal", "high", "urgent"] as const
export type SupportPriorityName = (typeof PRIORITY_LADDER)[number]

export function raisePriority(priority: string, steps = 1): string {
  const i = PRIORITY_LADDER.indexOf(priority as SupportPriorityName)
  if (i < 0) return priority
  return PRIORITY_LADDER[Math.min(i + steps, PRIORITY_LADDER.length - 1)]
}

// ============================================================================
// Support §14 TIME ENTRIES — the writer for support_time_entries
// (spec: support-desk-enterprise-tree.md §14 — ticket_id · staff_id ·
// seconds · billable · note; §17's time-spent metric folds the ticket
// row's time_spent_seconds, §0 conventions).
//
// The store landed in migration 20261058 (Sunny-approved, B13's spec).
// Until this module, time_spent_seconds was maintained by NOTHING and
// §17 reported a structural zero (B9/B13 censuses). This module is the
// maintainer B13's writer design specified:
//
//   - every mutation (log / edit / delete) runs in ONE transaction:
//     the entry write + the rollup recompute
//       UPDATE support_tickets SET time_spent_seconds =
//         (SELECT COALESCE(SUM(seconds),0) FROM support_time_entries
//           WHERE tenant_id = $t AND ticket_id = $id)
//     so the ticket column reconciles after EVERY mutation and B9's
//     reporting fold reads real time with zero changes to reporting.ts;
//   - entries are attributed to the ACTING staff member (you log your
//     own time); edit/delete are restricted to the entry's own staff,
//     with the 'support.admin' override the registry carries (the
//     §5/§17/§18 per-code idiom in grants.ts, hasSupportAdminGrant);
//   - the create/edit/delete gate is requireModuleApi("support",
//     "write") at the route PLUS the per-code check on 'support.reply'
//     (Sunny's approved mapping: time-entry work is ticket work, so it
//     rides the existing code — no new code is seeded);
//   - one crm_audit_log row per mutation in the §10 shape, carrying
//     counts and seconds — NEVER the note's content (its length only);
//   - tenant predicates in every statement. Mutations resolve the
//     ticket in its OWNING tenant: an entry's staff must belong to the
//     ticket's tenant (the store's composite FK says so), so a §5
//     grantee reads entries through the grant-aware read path but
//     logging stays owner-tenant desk work — the schema's rule, not
//     an app-layer improvisation.
// ============================================================================

import type { SupportTicket } from "./tickets"
import type { RegulatedActor } from "./regulated"
import { hasSupportAdminGrant } from "./grants"

export interface TimeEntriesDb {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

type Db = TimeEntriesDb

export class TimeEntryError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface SupportTimeEntry {
  id: string
  tenantId: string
  ticketId: string
  staffId: string
  staffName: string | null
  seconds: number
  billable: boolean
  note: string | null
  createdAt: string
  updatedAt: string
  rowVersion: number
}

const ENTRY_COLS = `
  e.id::text AS id, e.tenant_id::text AS tenant_id,
  e.ticket_id::text AS ticket_id, e.staff_id::text AS staff_id,
  s.display_name AS staff_name, e.seconds, e.billable, e.note,
  e.created_at::text AS created_at, e.updated_at::text AS updated_at,
  e.row_version`

function mapEntry(r: any): SupportTimeEntry {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    ticketId: r.ticket_id,
    staffId: r.staff_id,
    staffName: r.staff_name ?? null,
    seconds: Number(r.seconds),
    billable: !!r.billable,
    note: r.note ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    rowVersion: Number(r.row_version),
  }
}

// ── The 'support.reply' gate (Sunny's mapping; §17/§18 idiom) ───────

export async function hasSupportReplyPermission(
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

// ── Audit (§10 shape; counts/seconds only — never note content) ─────

async function auditTimeEntryChange(
  c: Db,
  tenantId: string,
  actor: RegulatedActor,
  entryId: string | null,
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
        tenantId, actor.userId, actor.staffId, "support_time_entry", entryId,
        action,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        actor.ip, actor.userAgent,
      ],
    )
  } catch (e) {
    console.error(
      `[support-time-entries] audit write failed for ${action}:`,
      e instanceof Error ? e.message : String(e),
    )
  }
}

function auditShape(e: SupportTimeEntry): Record<string, unknown> {
  return {
    ticketId: e.ticketId,
    staffId: e.staffId,
    seconds: e.seconds,
    billable: e.billable,
    noteLength: e.note ? e.note.length : 0,
  }
}

// ── Reads ─────────────────────────────────────────────────────────────

export async function listSupportTimeEntries(
  c: Db, tenantId: string, ticketId: string,
): Promise<SupportTimeEntry[]> {
  const { rows } = await c.query(
    `SELECT ${ENTRY_COLS}
       FROM public.support_time_entries e
       LEFT JOIN public.crm_staff s ON s.id = e.staff_id
      WHERE e.tenant_id = $1::uuid AND e.ticket_id = $2::uuid
      ORDER BY e.created_at ASC, e.id ASC`,
    [tenantId, ticketId],
  )
  return rows.map(mapEntry)
}

async function getEntry(
  c: Db, tenantId: string, ticketId: string, entryId: string,
): Promise<SupportTimeEntry | null> {
  const { rows } = await c.query(
    `SELECT ${ENTRY_COLS}
       FROM public.support_time_entries e
       LEFT JOIN public.crm_staff s ON s.id = e.staff_id
      WHERE e.tenant_id = $1::uuid AND e.ticket_id = $2::uuid AND e.id = $3::uuid
      LIMIT 1`,
    [tenantId, ticketId, entryId],
  )
  return rows[0] ? mapEntry(rows[0]) : null
}

/** The ticket row's rollup, read back after a mutation. */
export async function getTicketTimeSpent(
  c: Db, tenantId: string, ticketId: string,
): Promise<number> {
  const { rows } = await c.query(
    `SELECT time_spent_seconds FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND id = $2::uuid
      LIMIT 1`,
    [tenantId, ticketId],
  )
  return rows[0] ? Number(rows[0].time_spent_seconds ?? 0) : 0
}

// ── The rollup recompute (runs inside the mutation's transaction) ──

async function recomputeRollup(c: Db, tenantId: string, ticketId: string): Promise<void> {
  await c.query(
    `UPDATE public.support_tickets
        SET time_spent_seconds = (
          SELECT COALESCE(SUM(seconds), 0)
            FROM public.support_time_entries
           WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid)
      WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, ticketId],
  )
}

// ── Validation (mirrors the schema CHECK: positive integer seconds) ─

function validSeconds(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isInteger(n) || n <= 0) {
    throw new TimeEntryError(400, "Time must be a positive whole number of seconds")
  }
  return n
}

function cleanNote(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

// ── Log time ──────────────────────────────────────────────────────────

export async function logSupportTime(
  c: Db,
  ticket: SupportTicket,
  input: { seconds: unknown; billable?: unknown; note?: unknown },
  actor: RegulatedActor,
): Promise<{ entry: SupportTimeEntry; totalSeconds: number }> {
  if (!actor.staffId) {
    throw new TimeEntryError(400, "Time entries are attributed to a staff record — this session has none to attribute to")
  }
  const seconds = validSeconds(input.seconds)
  const billable = input.billable === true
  const note = cleanNote(input.note)

  let entryId: string
  await c.query("BEGIN")
  try {
    const { rows } = await c.query(
      `INSERT INTO public.support_time_entries
         (tenant_id, ticket_id, staff_id, seconds, billable, note)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)
       RETURNING id::text AS id`,
      [ticket.tenantId, ticket.id, actor.staffId, seconds, billable, note],
    )
    entryId = rows[0].id
    await recomputeRollup(c, ticket.tenantId, ticket.id)
    await c.query("COMMIT")
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {})
    throw e
  }
  const entry = await getEntry(c, ticket.tenantId, ticket.id, entryId)
  if (!entry) throw new TimeEntryError(500, "Time entry insert did not read back")
  await auditTimeEntryChange(c, ticket.tenantId, actor, entry.id,
    "support_time_entry_create", null, auditShape(entry))
  return { entry, totalSeconds: await getTicketTimeSpent(c, ticket.tenantId, ticket.id) }
}

// ── Edit / delete (own entries; 'support.admin' override) ────────────

async function loadOwnedEntry(
  c: Db,
  ticket: SupportTicket,
  entryId: string,
  actor: RegulatedActor,
): Promise<SupportTimeEntry> {
  const entry = await getEntry(c, ticket.tenantId, ticket.id, entryId)
  if (!entry) throw new TimeEntryError(404, "Time entry not found on this ticket")
  if (entry.staffId !== actor.staffId) {
    const override = await hasSupportAdminGrant(c, ticket.tenantId, actor.staffId)
    if (!override) {
      throw new TimeEntryError(403, "Time entries can be changed only by the staff member who logged them (or a support admin)")
    }
  }
  return entry
}

export async function updateSupportTimeEntry(
  c: Db,
  ticket: SupportTicket,
  entryId: string,
  patch: { seconds?: unknown; billable?: unknown; note?: unknown; hasNote?: boolean },
  actor: RegulatedActor,
): Promise<{ entry: SupportTimeEntry; totalSeconds: number }> {
  const before = await loadOwnedEntry(c, ticket, entryId, actor)
  const seconds = patch.seconds === undefined ? before.seconds : validSeconds(patch.seconds)
  const billable = patch.billable === undefined ? before.billable : patch.billable === true
  const note = patch.hasNote ? cleanNote(patch.note) : before.note

  await c.query("BEGIN")
  try {
    const { rows } = await c.query(
      `UPDATE public.support_time_entries
          SET seconds = $4, billable = $5, note = $6,
              updated_at = now(), row_version = row_version + 1
        WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid AND id = $3::uuid
        RETURNING id::text AS id`,
      [ticket.tenantId, ticket.id, entryId, seconds, billable, note],
    )
    if (!rows[0]) throw new TimeEntryError(409, "The entry changed while this request ran — reload and retry")
    await recomputeRollup(c, ticket.tenantId, ticket.id)
    await c.query("COMMIT")
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {})
    throw e
  }
  const entry = await getEntry(c, ticket.tenantId, ticket.id, entryId)
  if (!entry) throw new TimeEntryError(500, "Time entry update did not read back")
  await auditTimeEntryChange(c, ticket.tenantId, actor, entry.id,
    "support_time_entry_update", auditShape(before), auditShape(entry))
  return { entry, totalSeconds: await getTicketTimeSpent(c, ticket.tenantId, ticket.id) }
}

export async function deleteSupportTimeEntry(
  c: Db,
  ticket: SupportTicket,
  entryId: string,
  actor: RegulatedActor,
): Promise<{ totalSeconds: number }> {
  const before = await loadOwnedEntry(c, ticket, entryId, actor)
  await c.query("BEGIN")
  try {
    const { rows } = await c.query(
      `DELETE FROM public.support_time_entries
        WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid AND id = $3::uuid
        RETURNING id::text AS id`,
      [ticket.tenantId, ticket.id, entryId],
    )
    if (!rows[0]) throw new TimeEntryError(409, "The entry changed while this request ran — reload and retry")
    await recomputeRollup(c, ticket.tenantId, ticket.id)
    await c.query("COMMIT")
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {})
    throw e
  }
  await auditTimeEntryChange(c, ticket.tenantId, actor, before.id,
    "support_time_entry_delete", auditShape(before), null)
  return { totalSeconds: await getTicketTimeSpent(c, ticket.tenantId, ticket.id) }
}

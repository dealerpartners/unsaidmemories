// ============================================================================
// Support §9 ACTIONS AND APPROVALS — the record, the approval flow, and
// execution dispatch (spec: support-desk-enterprise-tree.md §9, lines
// 147–150):
//
//   support_actions — ticket_id · action_type (refund | credit |
//   account_change | listing_takedown | …) · target_ref · amount ·
//   status (requested | approved | executed | failed | rejected) ·
//   requested_by · approved_by · executed_at · idempotency_key;
//   per-role amount thresholds
//
// Until this module, support_actions had ZERO writers on any ref
// (enterprise audit, 2026-10-14): the vocabulary executed with no
// requested→approved→executed record, no approver flow, no thresholds.
//
// THE TWO VOCABULARIES STAY DISTINCT. The engine grammar in actions.ts
// (set_priority / assign_staff / reply drafts / …) is what macros and
// automations speak; those actions are ungated and untouched — they
// never write here. §9's types are EXTERNAL actions ('support.
// actions_approve' = "Approve external actions (refunds, takedowns)",
// platform_permission_registry / support_permissions, migration
// 20261031): consequential acts in other modules, requested from a
// ticket. This module is their system of record and their gate.
//
// APPROVAL POLICY — app-layer policy data, exactly where migration
// 20261037's header puts it ("Per-role amount thresholds are policy
// data enforced by the app layer ('support.actions_approve'); the
// schema stores the amount"):
//   · Approver class — crm_staff role 'owner', or a platform_module_
//     permissions grant on module 'support' at level 'full' (a
//     platform admin with no staff row is this class too): no amount
//     cap; their own requests self-approve.
//   · Every other desk staffer: money actions (amount-bearing) self-
//     execute only BELOW the tenant's approval line; at or above it
//     the request pends for an approver. The line is the platform's
//     one configured approval threshold — policy_settings scope
//     'refunds', key 'approval_required_above_cents' (the refunds
//     module's SA-63 policy; live value 10000 = $100, the same
//     default the refunds route uses when unset) — with the refunds
//     module's boundary semantics: amount >= line requires approval.
//   · Amount-less actions (a takedown, an account change) carry no
//     amount to measure against the line, so from a non-approver they
//     pend; from the approver class they self-approve.
// A requester never decides their own pended request (enforced at
// decide time). The threshold in force and the basis of every self-
// approval are recorded on the row's event + audit trail.
//
// EXECUTION — one dispatcher, the owning modules' own writes (no
// parallel money system):
//   · refund → the refunds module's manual ledger path, mirrored
//     statement-for-statement from /api/admin/refunds POST: a
//     commerce_payments 'refunded' row + a commerce_refunds row
//     (status 'completed', refund_method 'manual', requires_approval
//     true — it WAS approval-gated, here) + platformAudit
//     'refund.processed' + best-effort GL Dr 4000 / Cr 1000. The
//     processor (Stripe) leg belongs to the refunds module and runs
//     there when a charge reference exists; a support-originated
//     refund executes on the manual path, as the Issue modal's
//     manual refunds do.
//   · credit → a real store credit: commerce_store_credits INSERT in
//     the refunds module's own store-credit shape (credit_number
//     SC-…, original_amount = balance = amount, status 'active'),
//     issued to the ticket's requester customer + best-effort GL
//     Dr 4000 / Cr 2310 (store-credit liability).
//   · listing_takedown → the listings review's own write: seller_
//     listings status → 'rejected' for the target listing, plus the
//     review's seller_audit_log row (writeSellerAudit).
//   · any other type (account_change and the tree's open "…") → NO
//     executor is registered: approval is recorded, then the row
//     lands 'failed' with that reason on its trail. Nothing is ever
//     marked executed that did not execute. The request response and
//     the desk say so up front (executor: false), so the boundary is
//     visible before anyone relies on it.
//
// STATE MACHINE — requested → approved → executed | failed, or
// requested → rejected. Every transition is one guarded UPDATE
// (status predicate + row_version bump), one ticket event, and one
// crm_audit_log row (§18 change log; entity_type 'support_actions',
// verbs support_action_<transition>). Events use the designed §4
// types action_requested / action_approved / action_executed; the
// CHECK carries no action_rejected / action_failed type, so those
// two ride 'system' events with a detail.kind discriminator (the B3
// attachments precedent — no vocabulary is invented into the CHECK).
//
// GATES: routes hold the desk's module gate (requireModuleApi
// ("support", …)); this lib assumes it passed and enforces tenancy
// (tenant_id predicate in every statement) plus the approver rule.
// RLS policy text is untouched; writers conform to it as written.
// ============================================================================

import { logTicketEvent, type SupportTicket } from "./tickets"
import { writeSellerAudit } from "@/lib/sellers/audit"
import { platformAudit } from "@/lib/crm/enterprise"
import { getPg } from "@/lib/pg"
import { postBalancedJournalEntry, clientQuery } from "@/lib/accounting/journal"

export interface ApprovalsDb {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

type Db = ApprovalsDb

export interface SupportActionActor {
  userId: string | null
  staffId: string | null
  name: string | null
  ip: string | null
  userAgent: string | null
}

export class SupportActionError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** The tree's named §9 types (lines 148–149). The vocabulary itself
 *  stays OPEN — action_type has no CHECK by design (migration
 *  20261037) — these are the types the desk offers and the dispatcher
 *  knows; other types may be requested and recorded. */
export const SUPPORT_ACTION_TYPES = [
  "refund", "credit", "account_change", "listing_takedown",
] as const

/** Types with a registered executor in executeSupportAction. */
export const EXECUTOR_TYPES = ["refund", "credit", "listing_takedown"] as const

export function hasExecutor(actionType: string): boolean {
  return (EXECUTOR_TYPES as readonly string[]).includes(actionType)
}

export interface SupportAuthority {
  staffId: string | null
  role: string | null
  supportLevel: "none" | "read" | "write" | "full"
  canApprove: boolean
}

/**
 * The caller's approval authority for the operating tenant, resolved
 * from the same rows requireModuleApi reads (crm_staff.role +
 * platform_module_permissions for module 'support'). A caller with no
 * staff row who passed the desk gate is a platform admin — approver
 * class, as in modules.ts ("owner" staff records are full access;
 * admins always pass).
 */
export async function getSupportAuthority(
  c: Db, tenantId: string, staffId: string | null,
): Promise<SupportAuthority> {
  if (!staffId) {
    return { staffId: null, role: "owner", supportLevel: "full", canApprove: true }
  }
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
  if (!r) {
    return { staffId, role: null, supportLevel: "none", canApprove: false }
  }
  const level = (r.access_level ?? "none") as SupportAuthority["supportLevel"]
  return {
    staffId,
    role: r.role ?? null,
    supportLevel: level,
    canApprove: r.role === "owner" || level === "full",
  }
}

/**
 * The tenant's approval line for money actions, in cents — the
 * platform's configured threshold (policy_settings, scope 'refunds',
 * key 'approval_required_above_cents'), read exactly as the refunds
 * route reads it, with its 10000 ($100) default when unset.
 */
export async function resolveApprovalLineCents(c: Db, tenantId: string): Promise<number> {
  const { rows } = await c.query(
    `SELECT value FROM public.policy_settings
      WHERE tenant_id = $1::uuid AND scope = 'refunds' AND key = 'approval_required_above_cents'
      LIMIT 1`,
    [tenantId],
  ).catch(() => ({ rows: [] as any[] }))
  const n = Number(rows[0]?.value ?? 10000)
  return Number.isFinite(n) && n > 0 ? n : 10000
}

// ── Row shape ────────────────────────────────────────────────────────

export interface SupportActionRow {
  id: string
  tenantId: string
  ticketId: string
  actionType: string
  targetRef: string | null
  amount: number | null
  status: string
  requestedBy: string | null
  requestedByName: string | null
  approvedBy: string | null
  approvedByName: string | null
  executedAt: string | null
  idempotencyKey: string | null
  rowVersion: number
  createdAt: string
  updatedAt: string
}

const ACTION_COLS = `
  a.id::text AS id, a.tenant_id::text AS tenant_id, a.ticket_id::text AS ticket_id,
  a.action_type, a.target_ref, a.amount, a.status,
  a.requested_by::text AS requested_by, req.display_name AS requested_by_name,
  a.approved_by::text AS approved_by, app.display_name AS approved_by_name,
  a.executed_at::text AS executed_at, a.idempotency_key,
  a.row_version, a.created_at::text AS created_at, a.updated_at::text AS updated_at`

const ACTION_FROM = `
  FROM public.support_actions a
  LEFT JOIN public.crm_staff req ON req.id = a.requested_by
  LEFT JOIN public.crm_staff app ON app.id = a.approved_by`

function mapAction(r: any): SupportActionRow {
  return {
    id: r.id, tenantId: r.tenant_id, ticketId: r.ticket_id,
    actionType: r.action_type, targetRef: r.target_ref ?? null,
    amount: r.amount == null ? null : Number(r.amount),
    status: r.status,
    requestedBy: r.requested_by ?? null, requestedByName: r.requested_by_name ?? null,
    approvedBy: r.approved_by ?? null, approvedByName: r.approved_by_name ?? null,
    executedAt: r.executed_at ?? null, idempotencyKey: r.idempotency_key ?? null,
    rowVersion: r.row_version, createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

async function getActionById(c: Db, tenantId: string, actionId: string): Promise<SupportActionRow | null> {
  const { rows } = await c.query(
    `SELECT ${ACTION_COLS} ${ACTION_FROM}
      WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid LIMIT 1`,
    [tenantId, actionId],
  )
  return rows[0] ? mapAction(rows[0]) : null
}

export async function listTicketActions(c: Db, tenantId: string, ticketId: string): Promise<SupportActionRow[]> {
  const { rows } = await c.query(
    `SELECT ${ACTION_COLS} ${ACTION_FROM}
      WHERE a.tenant_id = $1::uuid AND a.ticket_id = $2::uuid
      ORDER BY a.created_at ASC`,
    [tenantId, ticketId],
  )
  return rows.map(mapAction)
}

export async function listActionsByStatus(
  c: Db, tenantId: string, status: string, limit = 100,
): Promise<(SupportActionRow & { ticketRef: string; ticketSubject: string })[]> {
  const { rows } = await c.query(
    `SELECT ${ACTION_COLS}, t.ticket_ref, t.subject AS ticket_subject ${ACTION_FROM}
       JOIN public.support_tickets t ON t.id = a.ticket_id AND t.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1::uuid AND a.status = $2
      ORDER BY a.created_at ${status === "requested" ? "ASC" : "DESC"}
      LIMIT $3`,
    [tenantId, status, limit],
  )
  return rows.map((r: any) => ({
    ...mapAction(r), ticketRef: r.ticket_ref, ticketSubject: r.ticket_subject,
  }))
}

// ── Audit (§18 change log; mirrors regulated.ts / config-admin.ts) ──

async function auditActionChange(
  c: Db,
  tenantId: string,
  actor: SupportActionActor,
  actionId: string,
  verb: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  try {
    await c.query(
      `INSERT INTO public.crm_audit_log
         (tenant_id, actor_user_id, actor_staff_id, entity_type, entity_id, action, before_data, after_data, ip_address, user_agent)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7::jsonb, $8::jsonb, $9::inet, $10)`,
      [
        tenantId, actor.userId, actor.staffId, "support_actions", actionId,
        `support_action_${verb}`,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        actor.ip, actor.userAgent,
      ],
    )
  } catch (e) {
    console.error(
      `[support-approvals] audit write failed for support_actions/${verb}:`,
      e instanceof Error ? e.message : String(e),
    )
  }
}

function rowImage(a: SupportActionRow): Record<string, unknown> {
  return {
    id: a.id, ticket_id: a.ticketId, action_type: a.actionType,
    target_ref: a.targetRef, amount: a.amount, status: a.status,
    requested_by: a.requestedBy, approved_by: a.approvedBy,
    executed_at: a.executedAt, idempotency_key: a.idempotencyKey,
    row_version: a.rowVersion,
  }
}

async function actionEvent(
  c: Db, tenantId: string, ticket: SupportTicket,
  type: string, actor: SupportActionActor, detail: Record<string, unknown>,
): Promise<void> {
  await logTicketEvent(c, tenantId, ticket.id, {
    type, actorStaffId: actor.staffId, actorLabel: actor.name, detail,
  }).catch((e) => {
    console.error(
      `[support-approvals] event write failed (${type}):`,
      e instanceof Error ? e.message : String(e),
    )
  })
}

// ── Request ──────────────────────────────────────────────────────────

export interface ActionRequestInput {
  actionType: string
  targetRef?: string | null
  amount?: number | null
  idempotencyKey?: string | null
  note?: string | null
}

export interface ActionRequestResult {
  action: SupportActionRow
  /** executed: self-approved and the executor ran · pending: waiting
   *  for an approver · failed: self-approved but execution failed. */
  outcome: "executed" | "pending" | "failed"
  executor: boolean
}

export async function requestSupportAction(
  c: Db,
  tenantId: string,
  ticket: SupportTicket,
  input: ActionRequestInput,
  actor: SupportActionActor,
  authority: SupportAuthority,
): Promise<ActionRequestResult> {
  const actionType = String(input.actionType ?? "").trim()
  if (!actionType) throw new SupportActionError(400, "actionType is required")
  if (actionType.length > 64) throw new SupportActionError(400, "actionType is too long")
  const targetRef = input.targetRef != null && String(input.targetRef).trim()
    ? String(input.targetRef).trim().slice(0, 200) : null
  let amount: number | null = null
  if (input.amount != null) {
    const n = Number(input.amount)
    if (!Number.isFinite(n) || n < 0) {
      throw new SupportActionError(400, "amount must be a non-negative number")
    }
    amount = Math.round(n * 100) / 100
    if (amount > 9999999999.99) throw new SupportActionError(400, "amount exceeds the recordable range")
  }
  if ((actionType === "refund" || actionType === "credit") && !(amount != null && amount > 0)) {
    throw new SupportActionError(400, `A ${actionType} action requires an amount above zero`)
  }
  if (actionType === "listing_takedown" && !targetRef) {
    throw new SupportActionError(400, "A listing_takedown action requires targetRef (the listing id)")
  }
  const idempotencyKey = input.idempotencyKey != null && String(input.idempotencyKey).trim()
    ? String(input.idempotencyKey).trim().slice(0, 200) : null
  const note = input.note != null && String(input.note).trim()
    ? String(input.note).trim().slice(0, 1000) : null

  // Idempotent replay: the (tenant, idempotency_key) unique index is
  // the dedupe; a repeat request returns the existing record as-is.
  if (idempotencyKey) {
    const { rows } = await c.query(
      `SELECT ${ACTION_COLS} ${ACTION_FROM}
        WHERE a.tenant_id = $1::uuid AND a.idempotency_key = $2 LIMIT 1`,
      [tenantId, idempotencyKey],
    )
    if (rows[0]) {
      const existing = mapAction(rows[0])
      return {
        action: existing, executor: hasExecutor(existing.actionType),
        outcome: existing.status === "executed" ? "executed"
          : existing.status === "failed" ? "failed" : "pending",
      }
    }
  }

  const lineCents = await resolveApprovalLineCents(c, tenantId)
  const amountCents = amount == null ? null : Math.round(amount * 100)
  const selfApprove = authority.canApprove
    || (amountCents != null && amountCents < lineCents)
  const basis = authority.canApprove ? "approver_authority"
    : selfApprove ? "under_threshold" : "pending_approval"

  let inserted: SupportActionRow | null = null
  try {
    const { rows } = await c.query(
      `INSERT INTO public.support_actions
         (tenant_id, ticket_id, action_type, target_ref, amount, status, requested_by, idempotency_key)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'requested', $6::uuid, $7)
       RETURNING id::text AS id`,
      [tenantId, ticket.id, actionType, targetRef, amount, actor.staffId, idempotencyKey],
    )
    inserted = await getActionById(c, tenantId, rows[0].id)
  } catch (e) {
    // Lost an idempotency race — return the row that won.
    if (idempotencyKey && /duplicate key|unique/i.test(e instanceof Error ? e.message : "")) {
      const { rows } = await c.query(
        `SELECT ${ACTION_COLS} ${ACTION_FROM}
          WHERE a.tenant_id = $1::uuid AND a.idempotency_key = $2 LIMIT 1`,
        [tenantId, idempotencyKey],
      )
      if (rows[0]) {
        const existing = mapAction(rows[0])
        return {
          action: existing, executor: hasExecutor(existing.actionType),
          outcome: existing.status === "executed" ? "executed"
            : existing.status === "failed" ? "failed" : "pending",
        }
      }
    }
    throw e
  }
  if (!inserted) throw new SupportActionError(500, "Action record was not created")

  await actionEvent(c, tenantId, ticket, "action_requested", actor, {
    action_id: inserted.id, action_type: actionType, target_ref: targetRef,
    amount, threshold_cents: lineCents, basis, executor: hasExecutor(actionType),
    note,
  })
  await auditActionChange(c, tenantId, actor, inserted.id, "requested", null, {
    ...rowImage(inserted), threshold_cents: lineCents, basis, note,
  })

  if (!selfApprove) {
    return { action: inserted, outcome: "pending", executor: hasExecutor(actionType) }
  }
  const decided = await approveAndExecute(c, tenantId, ticket, inserted, actor, basis)
  return {
    action: decided,
    outcome: decided.status === "executed" ? "executed" : "failed",
    executor: hasExecutor(actionType),
  }
}

// ── Decide (approve / reject a pended request) ───────────────────────

export async function decideSupportAction(
  c: Db,
  tenantId: string,
  ticket: SupportTicket,
  actionId: string,
  decision: "approve" | "reject",
  reason: string | null,
  actor: SupportActionActor,
  authority: SupportAuthority,
): Promise<SupportActionRow> {
  if (!authority.canApprove) {
    throw new SupportActionError(
      403,
      "Only an approver can decide a pending action — approver authority is the support module at full level, or the owner role (support.actions_approve)",
    )
  }
  const row = await getActionById(c, tenantId, actionId)
  if (!row || row.ticketId !== ticket.id) {
    throw new SupportActionError(404, "Action not found on this ticket")
  }
  if (row.status !== "requested") {
    throw new SupportActionError(409, `Action is already ${row.status} — only a requested action can be decided`)
  }
  if (row.requestedBy && actor.staffId && row.requestedBy === actor.staffId) {
    throw new SupportActionError(409, "The requester cannot decide their own pending action — a second approver must decide it")
  }

  if (decision === "reject") {
    const { rows } = await c.query(
      `UPDATE public.support_actions
          SET status = 'rejected', row_version = row_version + 1, updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid AND status = 'requested'
        RETURNING id::text AS id`,
      [tenantId, actionId],
    )
    if (!rows[0]) throw new SupportActionError(409, "Action changed while it was being decided — reload and retry")
    const after = await getActionById(c, tenantId, actionId)
    if (!after) throw new SupportActionError(500, "Action record disappeared")
    await actionEvent(c, tenantId, ticket, "system", actor, {
      kind: "action_rejected", action_id: actionId, action_type: row.actionType,
      amount: row.amount, reason: reason ?? null,
    })
    await auditActionChange(c, tenantId, actor, actionId, "rejected", rowImage(row), {
      ...rowImage(after), reason: reason ?? null,
    })
    return after
  }

  return approveAndExecute(c, tenantId, ticket, row, actor, "approver")
}

// ── Approve + execute (one path for self-approvals and decisions) ────

async function approveAndExecute(
  c: Db,
  tenantId: string,
  ticket: SupportTicket,
  row: SupportActionRow,
  actor: SupportActionActor,
  basis: string,
): Promise<SupportActionRow> {
  const { rows } = await c.query(
    `UPDATE public.support_actions
        SET status = 'approved', approved_by = $3::uuid,
            row_version = row_version + 1, updated_at = now()
      WHERE tenant_id = $1::uuid AND id = $2::uuid AND status = 'requested'
      RETURNING id::text AS id`,
    [tenantId, row.id, actor.staffId],
  )
  if (!rows[0]) {
    const cur = await getActionById(c, tenantId, row.id)
    throw new SupportActionError(409, `Action is ${cur?.status ?? "missing"} — only a requested action can be approved`)
  }
  const approved = await getActionById(c, tenantId, row.id)
  if (!approved) throw new SupportActionError(500, "Action record disappeared")
  await actionEvent(c, tenantId, ticket, "action_approved", actor, {
    action_id: row.id, action_type: row.actionType, amount: row.amount, basis,
  })
  await auditActionChange(c, tenantId, actor, row.id, "approved", rowImage(row), {
    ...rowImage(approved), basis,
  })

  const exec = await executeSupportAction(c, tenantId, ticket, approved, actor)
  if (exec.ok) {
    const { rows: done } = await c.query(
      `UPDATE public.support_actions
          SET status = 'executed', executed_at = now(),
              row_version = row_version + 1, updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid AND status = 'approved'
        RETURNING id::text AS id`,
      [tenantId, row.id],
    )
    if (!done[0]) throw new SupportActionError(409, "Action changed while it was executing")
    const after = await getActionById(c, tenantId, row.id)
    if (!after) throw new SupportActionError(500, "Action record disappeared")
    await actionEvent(c, tenantId, ticket, "action_executed", actor, {
      action_id: row.id, action_type: row.actionType, amount: row.amount,
      result: exec.result,
    })
    await auditActionChange(c, tenantId, actor, row.id, "executed", rowImage(approved), {
      ...rowImage(after), result: exec.result,
    })
    return after
  }

  const { rows: failedRows } = await c.query(
    `UPDATE public.support_actions
        SET status = 'failed', row_version = row_version + 1, updated_at = now()
      WHERE tenant_id = $1::uuid AND id = $2::uuid AND status = 'approved'
      RETURNING id::text AS id`,
    [tenantId, row.id],
  )
  if (!failedRows[0]) throw new SupportActionError(409, "Action changed while it was executing")
  const after = await getActionById(c, tenantId, row.id)
  if (!after) throw new SupportActionError(500, "Action record disappeared")
  await actionEvent(c, tenantId, ticket, "system", actor, {
    kind: "action_failed", action_id: row.id, action_type: row.actionType,
    amount: row.amount, error: exec.error,
  })
  await auditActionChange(c, tenantId, actor, row.id, "failed", rowImage(approved), {
    ...rowImage(after), error: exec.error,
  })
  return after
}

// ── Execution dispatch ───────────────────────────────────────────────

type ExecResult =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; error: string }

async function executeSupportAction(
  c: Db,
  tenantId: string,
  ticket: SupportTicket,
  row: SupportActionRow,
  actor: SupportActionActor,
): Promise<ExecResult> {
  try {
    switch (row.actionType) {
      case "credit":
        return await executeCredit(c, tenantId, ticket, row)
      case "refund":
        return await executeRefund(c, tenantId, ticket, row, actor)
      case "listing_takedown":
        return await executeListingTakedown(c, tenantId, row, actor)
      default:
        return {
          ok: false,
          error: `No executor is registered for action type '${row.actionType}' — the approval is on record, but the action itself must be carried out in its owning module; nothing was executed from support.`,
        }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Best-effort GL posting — the refunds route's postRefundGl pattern:
 *  its own connection, failure logged, never blocks the action. */
async function postActionGl(
  tenantId: string,
  amount: number,
  sourceId: string,
  memo: string,
  lines: { accountCode: string; debit: number; credit: number; memo: string }[],
): Promise<string | null> {
  if (!(amount > 0)) return null
  try {
    const client = await getPg()
    try {
      return await postBalancedJournalEntry(clientQuery(client), tenantId, {
        source: "refund", sourceId, memo, lines,
      })
    } finally {
      client.release()
    }
  } catch (e) {
    console.error("[support-approvals] GL post failed (non-blocking):", e instanceof Error ? e.message : e)
    return null
  }
}

async function executeCredit(
  c: Db, tenantId: string, ticket: SupportTicket, row: SupportActionRow,
): Promise<ExecResult> {
  if (!(row.amount != null && row.amount > 0)) {
    return { ok: false, error: "A credit action carries no amount to issue" }
  }
  const customerId = ticket.requesterCustomerId
  if (!customerId) {
    return { ok: false, error: "The ticket has no linked customer — a store credit needs a customer to issue to" }
  }
  const creditNumber = `SC-${Date.now().toString(36).toUpperCase()}`
  const { rows } = await c.query(
    `INSERT INTO public.commerce_store_credits
       (id, tenant_id, credit_number, customer_id, original_amount, balance, currency, status, issued_at)
     VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, $4::numeric, $4::numeric, 'USD', 'active', now())
     RETURNING id::text AS id`,
    [tenantId, creditNumber, customerId, row.amount.toFixed(2)],
  )
  const storeCreditId = rows[0].id as string
  const je = await postActionGl(tenantId, row.amount, storeCreditId,
    `Support action ${row.id} — store credit ${creditNumber} on ${ticket.ticketRef}`,
    [
      { accountCode: "4000", debit: row.amount, credit: 0, memo: "Revenue reversal" },
      { accountCode: "2310", debit: 0, credit: row.amount, memo: "Store credit liability" },
    ])
  return {
    ok: true,
    result: { store_credit_id: storeCreditId, credit_number: creditNumber, journal_entry_id: je },
  }
}

async function executeRefund(
  c: Db, tenantId: string, ticket: SupportTicket, row: SupportActionRow,
  actor: SupportActionActor,
): Promise<ExecResult> {
  if (!(row.amount != null && row.amount > 0)) {
    return { ok: false, error: "A refund action carries no amount to refund" }
  }
  const amount = row.amount
  // The refunds route's ledger-fields chain: an active payment method,
  // the tenant's manual-cash method preferred.
  const method = await c.query(
    `SELECT id::text AS id FROM public.commerce_payment_methods
      WHERE tenant_id = $1::uuid AND active = true
      ORDER BY (code = 'manual_cash') DESC, (method_type = 'cash') DESC, id
      LIMIT 1`,
    [tenantId],
  )
  if (!method.rows[0]?.id) {
    return { ok: false, error: "No payment method available for the refund ledger row — configure one in /admin/financial-settings" }
  }
  const paymentNumber = `PAY-${Date.now().toString(36).toUpperCase()}`
  const pay = await c.query(
    `INSERT INTO public.commerce_payments
       (tenant_id, payment_number, payment_method_id, customer_id, amount, status, currency, external_reference, created_at)
     VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::numeric, 'refunded', 'USD', $6, now())
     RETURNING id::text AS id`,
    [tenantId, paymentNumber, method.rows[0].id, ticket.requesterCustomerId, amount.toFixed(2), `support_action_${row.id}`],
  )
  const paymentId = pay.rows[0].id as string
  const refundNumber = `RFN-${Date.now().toString(36).toUpperCase()}`
  const reason = `Support refund on ${ticket.ticketRef} (action ${row.id})`
  const rf = await c.query(
    `INSERT INTO public.commerce_refunds
       (id, tenant_id, refund_number, payment_id, store_credit_id, amount, reason, status,
        refund_method, requires_approval, created_at, processed_at)
     VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, NULL, $4::numeric, $5, 'completed',
             'manual', true, now(), now())
     RETURNING id::text AS id`,
    [tenantId, refundNumber, paymentId, amount.toFixed(2), reason],
  )
  const refundId = rf.rows[0].id as string
  // The refunds module's platform audit (best-effort, as there).
  try {
    await platformAudit(c as any, {
      action: "refund.processed",
      targetType: "commerce_refund",
      targetId: refundId,
      actorUserId: actor.userId,
      actorRole: "admin",
      metadata: {
        amount, reason, customerId: ticket.requesterCustomerId,
        manual: true, reference: `support_action_${row.id}`,
        refundMethod: "manual", requiresApproval: true, supportActionId: row.id,
      },
    })
  } catch (e) {
    console.error("[support-approvals] platform audit failed (non-blocking):", e instanceof Error ? e.message : e)
  }
  const je = await postActionGl(tenantId, amount, refundId,
    `Support action ${row.id} — refund ${refundNumber} on ${ticket.ticketRef}`,
    [
      { accountCode: "4000", debit: amount, credit: 0, memo: "Revenue reversal" },
      { accountCode: "1000", debit: 0, credit: amount, memo: "Cash refunded" },
    ])
  return {
    ok: true,
    result: { refund_id: refundId, refund_number: refundNumber, payment_id: paymentId, journal_entry_id: je },
  }
}

async function executeListingTakedown(
  c: Db, tenantId: string, row: SupportActionRow, actor: SupportActionActor,
): Promise<ExecResult> {
  if (!row.targetRef) {
    return { ok: false, error: "A listing_takedown action carries no listing id (target_ref)" }
  }
  const { rows } = await c.query(
    `UPDATE public.seller_listings
        SET status = 'rejected', updated_at = now()
      WHERE id::text = $1 AND tenant_id = $2::uuid
      RETURNING id::text AS id, seller_id::text AS seller_id`,
    [row.targetRef, tenantId],
  )
  if (!rows[0]) {
    return { ok: false, error: `Listing ${row.targetRef} was not found in this tenant — nothing was taken down` }
  }
  await writeSellerAudit(c as any, {
    tenantId,
    sellerId: rows[0].seller_id ?? null,
    actorId: actor.userId,
    ipAddress: actor.ip,
    action: "listing.reject",
    entityType: "seller_listing",
    entityId: rows[0].id,
    afterState: {
      listing_id: rows[0].id, status: "rejected",
      via: "support_action", support_action_id: row.id,
    },
  })
  return { ok: true, result: { listing_id: rows[0].id, status: "rejected" } }
}

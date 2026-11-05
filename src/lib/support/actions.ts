// ============================================================================
// Action grammar + applier — shared by the automation engine (§10)
// and macros (§10). The config tables store actions as jsonb arrays;
// THIS module is the grammar those arrays speak:
//
//   { type: 'set_priority',   value: 'high' }
//   { type: 'set_status',     value: 'pending' }
//   { type: 'set_category',   value: 'billing' }
//   { type: 'assign_team',    team_id: '<uuid>' }
//   { type: 'assign_staff',   staff_id: '<uuid>' }
//   { type: 'add_tags',       tags: ['vip'] }
//   { type: 'remove_tags',    tags: ['vip'] }
//   { type: 'add_watcher',    staff_id: '<uuid>' }
//   { type: 'notify_staff',   staff_id: '<uuid>', kind?, channel? }
//   { type: 'reply',          body: '…', subject?, canned_reply_id?, template_code? }
//   { type: 'internal_note',  body: '…' }
//
// Semantics:
//  - Field actions write the ticket and log their §4 event
//    (priority_changed / status_changed / category_changed /
//    team_changed / assigned / tag_changed / watcher_added).
//  - 'reply' NEVER sends from an engine: it renders into a draft the
//    caller (desk rewire phase) delivers through the normal message
//    path. canned_reply_id / template_code are expanded to a literal
//    body BEFORE apply (see macros.expandActions).
//  - 'internal_note' lands as an internal_note EVENT — per §3,
//    internal notes never live in crm_messages.
//  - dryRun computes the same result against an in-memory copy and
//    writes nothing at all — no ticket update, no event, no
//    notification.
//  - Malformed actions are skipped with a reason, never thrown: one
//    bad action in a stored rule must not wedge the whole run.
// ============================================================================

import {
  logEngineEvent, type EngineActorType,
  type SupportDb, type SupportTicketRow,
} from "./engine-shared"
import { buildRenderContext, renderTemplateString } from "./templates"
import {
  notifyAssignment, notifySupportStaff, type SupportNotificationChannel,
} from "./notifications"

export type SupportAction =
  | { type: "set_priority"; value: string }
  | { type: "set_status"; value: string }
  | { type: "set_category"; value: string }
  | { type: "assign_team"; team_id: string }
  | { type: "assign_staff"; staff_id: string }
  | { type: "add_tags"; tags: string[] }
  | { type: "remove_tags"; tags: string[] }
  | { type: "add_watcher"; staff_id: string }
  | { type: "notify_staff"; staff_id: string; kind?: string; channel?: string }
  | { type: "reply"; body?: string; subject?: string; canned_reply_id?: string; template_code?: string }
  | { type: "internal_note"; body: string }

const PRIORITIES = ["low", "normal", "high", "urgent"]
const STATUSES = ["open", "pending", "resolved", "closed"]
const CHANNELS = ["in_app", "email", "push"]

export function parseActions(raw: unknown): { actions: SupportAction[]; invalid: { index: number; reason: string }[] } {
  const actions: SupportAction[] = []
  const invalid: { index: number; reason: string }[] = []
  if (raw == null) return { actions, invalid }
  if (!Array.isArray(raw)) return { actions, invalid: [{ index: -1, reason: "actions is not an array" }] }
  raw.forEach((a, index) => {
    const bad = (reason: string) => invalid.push({ index, reason })
    if (typeof a !== "object" || a === null || typeof (a as any).type !== "string") {
      bad("action has no type")
      return
    }
    const t = (a as any).type as string
    switch (t) {
      case "set_priority":
        if (!PRIORITIES.includes((a as any).value)) { bad(`bad priority '${(a as any).value}'`); return }
        actions.push({ type: t, value: (a as any).value }); return
      case "set_status":
        if (!STATUSES.includes((a as any).value)) { bad(`bad status '${(a as any).value}'`); return }
        actions.push({ type: t, value: (a as any).value }); return
      case "set_category":
        if (typeof (a as any).value !== "string" || !(a as any).value) { bad("set_category needs a value"); return }
        actions.push({ type: t, value: (a as any).value }); return
      case "assign_team":
        if (typeof (a as any).team_id !== "string") { bad("assign_team needs team_id"); return }
        actions.push({ type: t, team_id: (a as any).team_id }); return
      case "assign_staff":
        if (typeof (a as any).staff_id !== "string") { bad("assign_staff needs staff_id"); return }
        actions.push({ type: t, staff_id: (a as any).staff_id }); return
      case "add_tags":
      case "remove_tags":
        if (!Array.isArray((a as any).tags)) { bad(`${t} needs a tags array`); return }
        actions.push({ type: t, tags: (a as any).tags.map(String) } as SupportAction); return
      case "add_watcher":
        if (typeof (a as any).staff_id !== "string") { bad("add_watcher needs staff_id"); return }
        actions.push({ type: t, staff_id: (a as any).staff_id }); return
      case "notify_staff":
        if (typeof (a as any).staff_id !== "string") { bad("notify_staff needs staff_id"); return }
        if ((a as any).channel && !CHANNELS.includes((a as any).channel)) { bad(`bad channel '${(a as any).channel}'`); return }
        actions.push({ type: t, staff_id: (a as any).staff_id, kind: (a as any).kind, channel: (a as any).channel }); return
      case "reply":
        actions.push({
          type: t, body: (a as any).body, subject: (a as any).subject,
          canned_reply_id: (a as any).canned_reply_id, template_code: (a as any).template_code,
        }); return
      case "internal_note":
        if (typeof (a as any).body !== "string") { bad("internal_note needs a body"); return }
        actions.push({ type: t, body: (a as any).body }); return
      default:
        bad(`unknown action type '${t}'`)
    }
  })
  return { actions, invalid }
}

export interface AppliedAction { type: string; detail: Record<string, unknown>; dryRun: boolean }
export interface ReplyDraft { body: string; subject: string | null; missing: string[] }
export interface ActionRunResult {
  applied: AppliedAction[]
  drafts: ReplyDraft[]
  skipped: { type: string; reason: string }[]
}

export interface ApplyOptions {
  actorType: EngineActorType
  actorStaffId?: string | null
  actorLabel?: string | null
  dryRun?: boolean
  /** Merged into every event's detail (e.g. { automation_id } / { macro_id }). */
  eventContext?: Record<string, unknown>
}

export async function applyActions(
  db: SupportDb,
  tenantId: string,
  ticket: SupportTicketRow,
  actions: SupportAction[],
  opts: ApplyOptions,
): Promise<ActionRunResult> {
  const result: ActionRunResult = { applied: [], drafts: [], skipped: [] }
  const dry = !!opts.dryRun
  // In-memory working copy: later actions see earlier actions' effects
  // (and in dry-run this copy is the ONLY thing that changes).
  const cur: Record<string, unknown> = { ...ticket }
  const ctx = buildRenderContext(ticket)

  const update = async (setSql: string, params: unknown[]) => {
    if (dry) return
    await db.query(
      `UPDATE public.support_tickets SET ${setSql}, updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, ticket.id, ...params],
    )
  }
  const event = async (type: string, detail: Record<string, unknown>) => {
    if (dry) return
    await logEngineEvent(db, tenantId, ticket.id, {
      type, actorType: opts.actorType, actorStaffId: opts.actorStaffId ?? null,
      actorLabel: opts.actorLabel ?? null,
      detail: { ...(opts.eventContext ?? {}), ...detail },
    })
  }

  for (const a of actions) {
    switch (a.type) {
      case "set_priority": {
        if (cur.priority === a.value) { result.skipped.push({ type: a.type, reason: "already set" }); break }
        const from = cur.priority
        await update("priority = $3", [a.value])
        cur.priority = a.value
        await event("priority_changed", { from, to: a.value })
        result.applied.push({ type: a.type, detail: { from, to: a.value }, dryRun: dry })
        break
      }
      case "set_status": {
        if (cur.status === a.value) { result.skipped.push({ type: a.type, reason: "already set" }); break }
        const from = cur.status
        const stamps =
          a.value === "resolved" ? ", resolved_at = COALESCE(resolved_at, now())" :
          a.value === "closed" ? ", closed_at = COALESCE(closed_at, now())" : ""
        await update(`status = $3${stamps}`, [a.value])
        cur.status = a.value
        await event("status_changed", { from, to: a.value })
        result.applied.push({ type: a.type, detail: { from, to: a.value }, dryRun: dry })
        break
      }
      case "set_category": {
        if (cur.category === a.value) { result.skipped.push({ type: a.type, reason: "already set" }); break }
        const from = cur.category
        await update("category = $3", [a.value])
        cur.category = a.value
        await event("category_changed", { from, to: a.value })
        result.applied.push({ type: a.type, detail: { from, to: a.value }, dryRun: dry })
        break
      }
      case "assign_team": {
        if (cur.assigned_team_id === a.team_id) { result.skipped.push({ type: a.type, reason: "already set" }); break }
        const from = cur.assigned_team_id
        await update("assigned_team_id = $3::uuid", [a.team_id])
        cur.assigned_team_id = a.team_id
        await event("team_changed", { from, to: a.team_id })
        result.applied.push({ type: a.type, detail: { from, to: a.team_id }, dryRun: dry })
        break
      }
      case "assign_staff": {
        if (cur.assigned_staff_id === a.staff_id) { result.skipped.push({ type: a.type, reason: "already set" }); break }
        const from = cur.assigned_staff_id
        await update("assigned_staff_id = $3::uuid", [a.staff_id])
        cur.assigned_staff_id = a.staff_id
        await event("assigned", { from, to: a.staff_id })
        // §12: the new assignee is told, through the single path.
        if (!dry) await notifyAssignment(db, tenantId, ticket, a.staff_id)
        result.applied.push({ type: a.type, detail: { from, to: a.staff_id }, dryRun: dry })
        break
      }
      case "add_tags": {
        const have = new Set((cur.tags as string[] | null) ?? [])
        const added = a.tags.filter((t) => !have.has(t))
        if (added.length === 0) { result.skipped.push({ type: a.type, reason: "tags already present" }); break }
        const next = [...have, ...added]
        if (!dry) {
          await db.query(
            `UPDATE public.support_tickets SET tags = $3::text[], updated_at = now()
              WHERE tenant_id = $1::uuid AND id = $2::uuid`,
            [tenantId, ticket.id, next],
          )
        }
        cur.tags = next
        await event("tag_changed", { added })
        result.applied.push({ type: a.type, detail: { added }, dryRun: dry })
        break
      }
      case "remove_tags": {
        const have = new Set((cur.tags as string[] | null) ?? [])
        const removed = a.tags.filter((t) => have.has(t))
        if (removed.length === 0) { result.skipped.push({ type: a.type, reason: "tags absent" }); break }
        const next = [...have].filter((t) => !removed.includes(t))
        if (!dry) {
          await db.query(
            `UPDATE public.support_tickets SET tags = $3::text[], updated_at = now()
              WHERE tenant_id = $1::uuid AND id = $2::uuid`,
            [tenantId, ticket.id, next],
          )
        }
        cur.tags = next
        await event("tag_changed", { removed })
        result.applied.push({ type: a.type, detail: { removed }, dryRun: dry })
        break
      }
      case "add_watcher": {
        if (!dry) {
          const { rows } = await db.query(
            `SELECT id FROM public.support_ticket_participants
              WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid
                AND participant_kind = 'watcher' AND staff_id = $3::uuid LIMIT 1`,
            [tenantId, ticket.id, a.staff_id],
          )
          if (rows.length > 0) { result.skipped.push({ type: a.type, reason: "already a watcher" }); break }
          await db.query(
            `INSERT INTO public.support_ticket_participants (tenant_id, ticket_id, participant_kind, staff_id)
             VALUES ($1::uuid, $2::uuid, 'watcher', $3::uuid)`,
            [tenantId, ticket.id, a.staff_id],
          )
        }
        await event("watcher_added", { staff_id: a.staff_id })
        result.applied.push({ type: a.type, detail: { staff_id: a.staff_id }, dryRun: dry })
        break
      }
      case "notify_staff": {
        if (!dry) {
          const delivered = await notifySupportStaff(db, tenantId, {
            recipientStaffId: a.staff_id,
            kind: a.kind ?? "automation",
            channel: (a.channel as SupportNotificationChannel | undefined) ?? "in_app",
            ticketId: ticket.id, ref: ticket.ticket_ref,
          })
          if (!delivered) { result.skipped.push({ type: a.type, reason: "notification write failed" }); break }
        }
        result.applied.push({ type: a.type, detail: { staff_id: a.staff_id, kind: a.kind ?? "automation" }, dryRun: dry })
        break
      }
      case "reply": {
        if (!a.body) { result.skipped.push({ type: a.type, reason: "reply has no body (expand canned_reply_id/template_code first)" }); break }
        const body = renderTemplateString(a.body, ctx)
        const subject = a.subject ? renderTemplateString(a.subject, ctx) : null
        result.drafts.push({
          body: body.text, subject: subject?.text ?? null,
          missing: [...body.missing, ...(subject?.missing ?? [])],
        })
        result.applied.push({ type: a.type, detail: { drafted: true }, dryRun: dry })
        break
      }
      case "internal_note": {
        const note = renderTemplateString(a.body, ctx)
        await event("internal_note", { note: note.text })
        result.applied.push({ type: a.type, detail: { note: note.text }, dryRun: dry })
        break
      }
    }
  }
  return result
}

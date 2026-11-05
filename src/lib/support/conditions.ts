// ============================================================================
// Condition grammar — shared by routing rules (§10), automations (§10)
// and escalation payloads. The config tables store conditions as
// free-form jsonb; THIS module is the grammar those jsonb documents
// speak. It is defined once here so a rule written for routing means
// the same thing to the automation engine.
//
// Shape:
//   {}                                   → always true
//   { field, op, value }                 → a single test
//   { all: [node, …] }                   → every child true
//   { any: [node, …] }                   → at least one child true
//   { none: [node, …] }                  → no child true
//   { all: […], any: […], none: […] }    → groups combine with AND
// Nodes nest. A bare {field…} node is shorthand for all: [itself].
//
// Fields read off the ticket context (buildTicketContext): category,
// status, priority, requester_type, source_channel, ticket_type,
// severity_impact, visibility_level, assigned_staff_id,
// assigned_team_id, assigned (boolean — an assignee exists), subject,
// requester_email, requester_name, tags, age_minutes,
// minutes_since_update, minutes_since_last_message, reopened_count,
// message_count, public_reply_count, csat_score, on_hold, spam_flag.
// Callers may merge extra fields into the context (the escalation
// engine adds sla_* states) — any context key is a legal field.
//
// Ops: eq · ne · in · not_in · gt · gte · lt · lte · contains
// (case-insensitive substring) · has / has_any / has_all (array
// fields, e.g. tags) · exists · not_exists · is_true · is_false.
// An unknown field or op evaluates to FALSE — a malformed rule must
// fail closed, never fire.
// ============================================================================

import { ts, type SupportTicketRow } from "./engine-shared"

export type ConditionValue = string | number | boolean | null
export type ConditionNode =
  | { field: string; op?: string; value?: ConditionValue | ConditionValue[] }
  | { all?: ConditionNode[]; any?: ConditionNode[]; none?: ConditionNode[] }
  | Record<string, unknown>

export type TicketContext = Record<string, unknown>

export function buildTicketContext(
  ticket: SupportTicketRow,
  now: Date = new Date(),
): TicketContext {
  const created = ts(ticket.created_at)
  const updated = ts(ticket.updated_at)
  const lastMessage = ts(ticket.last_message_at)
  const mins = (from: Date | null) =>
    from ? Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60000)) : null
  return {
    category: ticket.category,
    status: ticket.status,
    priority: ticket.priority,
    requester_type: ticket.requester_type,
    source_channel: ticket.source_channel,
    ticket_type: ticket.ticket_type,
    severity_impact: ticket.severity_impact,
    visibility_level: ticket.visibility_level,
    assigned_staff_id: ticket.assigned_staff_id,
    assigned_team_id: ticket.assigned_team_id,
    assigned: ticket.assigned_staff_id != null,
    subject: ticket.subject,
    requester_email: ticket.requester_email,
    requester_name: ticket.requester_name,
    tags: ticket.tags ?? [],
    age_minutes: mins(created),
    minutes_since_update: mins(updated),
    minutes_since_last_message: mins(lastMessage),
    reopened_count: ticket.reopened_count ?? 0,
    message_count: ticket.message_count ?? 0,
    public_reply_count: ticket.public_reply_count ?? 0,
    csat_score: ticket.csat_score,
    on_hold: !!ticket.on_hold,
    spam_flag: !!ticket.spam_flag,
  }
}

function isGroup(node: ConditionNode): node is { all?: ConditionNode[]; any?: ConditionNode[]; none?: ConditionNode[] } {
  return (
    typeof node === "object" && node !== null &&
    ("all" in node || "any" in node || "none" in node)
  )
}

function isTest(node: ConditionNode): node is { field: string; op?: string; value?: ConditionValue | ConditionValue[] } {
  return typeof node === "object" && node !== null && "field" in node
}

function evalTest(
  ctx: TicketContext,
  node: { field: string; op?: string; value?: ConditionValue | ConditionValue[] },
): boolean {
  if (!(node.field in ctx)) return false
  const actual = ctx[node.field]
  const op = node.op ?? "eq"
  const value = node.value
  switch (op) {
    case "exists":
      return actual !== null && actual !== undefined
    case "not_exists":
      return actual === null || actual === undefined
    case "is_true":
      return actual === true
    case "is_false":
      return actual === false
    case "eq":
      return actual === value
    case "ne":
      return actual !== value
    case "in":
      return Array.isArray(value) && value.includes(actual as ConditionValue)
    case "not_in":
      return Array.isArray(value) && !value.includes(actual as ConditionValue)
    case "gt":
      return typeof actual === "number" && typeof value === "number" && actual > value
    case "gte":
      return typeof actual === "number" && typeof value === "number" && actual >= value
    case "lt":
      return typeof actual === "number" && typeof value === "number" && actual < value
    case "lte":
      return typeof actual === "number" && typeof value === "number" && actual <= value
    case "contains":
      return (
        typeof actual === "string" && typeof value === "string" &&
        actual.toLowerCase().includes(value.toLowerCase())
      )
    case "has":
      return Array.isArray(actual) && actual.includes(value as ConditionValue)
    case "has_any":
      return (
        Array.isArray(actual) && Array.isArray(value) &&
        value.some((v) => actual.includes(v as ConditionValue))
      )
    case "has_all":
      return (
        Array.isArray(actual) && Array.isArray(value) &&
        value.every((v) => actual.includes(v as ConditionValue))
      )
    default:
      return false
  }
}

export function evaluateConditions(
  ctx: TicketContext,
  conditions: ConditionNode | null | undefined,
): boolean {
  if (conditions == null) return true
  if (typeof conditions !== "object") return false
  if (isTest(conditions)) return evalTest(ctx, conditions)
  if (isGroup(conditions)) {
    const g = conditions
    if (Array.isArray(g.all) && !g.all.every((n) => evaluateConditions(ctx, n))) return false
    if (Array.isArray(g.any) && g.any.length > 0 && !g.any.some((n) => evaluateConditions(ctx, n))) return false
    if (Array.isArray(g.none) && g.none.some((n) => evaluateConditions(ctx, n))) return false
    return true
  }
  // A plain object with no field and no group keys carries no tests.
  return Object.keys(conditions).length === 0
}

// ============================================================================
// Routing engine (spec §10: support_routing_rules — ordered; conditions
// → team / assignee / priority / tags / SLA; strategies round_robin |
// least_loaded | skills_based | manual).
//
// routeTicket is a pure decision over the ticket + effective config;
// applyRouting persists a decision (team / assignee / priority / tags
// with their §4 events, and the SLA stamp when the decision carries a
// policy). First fully-matching rule in rule_order wins. When no rule
// matches, the category registry's default team + SLA apply
// (support_categories.default_team_id / default_sla_policy_id).
//
// Assignee selection inside a team considers only available members
// (is_available) under their max_concurrent open-ticket cap:
//   round_robin  — longest since last assignment, then least loaded
//   least_loaded — fewest open (open+pending) tickets
//   skills_based — must hold every required skill (rule conditions
//                  .skills, defaulting to the ticket's category code);
//                  highest summed level wins; no qualifier → least
//                  loaded fallback, named in the decision reason
// An explicit target_staff_id on a rule always wins over strategy
// selection — it IS the assignee the rule names.
// ============================================================================

import {
  loadEffectiveConfig, logEngineEvent,
  type ConfigRow, type SupportDb, type SupportTicketRow,
} from "./engine-shared"
import { buildTicketContext, evaluateConditions, type ConditionNode } from "./conditions"
import { notifyAssignment } from "./notifications"
import {
  holidayDateSet, parseBusinessHours, stampTicketSla,
  type BusinessHoursDef, type BusinessHoursRow, type SlaDues, type SlaPolicyRow,
} from "./sla"

export interface RoutingRuleRow extends ConfigRow {
  name: string
  rule_order: number
  conditions: ConditionNode
  strategy: "round_robin" | "least_loaded" | "skills_based" | "manual"
  target_team_id: string | null
  target_staff_id: string | null
  set_priority: string | null
  set_tags: string[]
  sla_policy_id: string | null
  is_active: boolean
  locked_by_master: boolean
  created_at: string
}

export interface RoutingDecision {
  source: "rule" | "category_default" | "none"
  matchedRuleId: string | null
  matchedRuleName: string | null
  strategy: string
  teamId: string | null
  staffId: string | null
  priority: string | null
  tags: string[]
  slaPolicyId: string | null
  reason: string
}

interface MemberLoad {
  staff_id: string
  max_concurrent: number | null
  open_count: number
  last_assigned_at: string | null
}

async function pickTeamMember(
  db: SupportDb,
  tenantId: string,
  teamId: string,
  strategy: string,
  ticket: SupportTicketRow,
  rule: RoutingRuleRow,
): Promise<{ staffId: string | null; via: string }> {
  const { rows: members } = await db.query<{ staff_id: string; max_concurrent: number | null }>(
    `SELECT staff_id::text AS staff_id, max_concurrent
       FROM public.support_team_members
      WHERE tenant_id = $1::uuid AND team_id = $2::uuid AND is_available`,
    [tenantId, teamId],
  )
  if (members.length === 0) return { staffId: null, via: "team has no available members" }
  const ids = members.map((m) => m.staff_id)
  const { rows: loadRows } = await db.query<{ staff_id: string; open_count: number; last_assigned_at: string | null }>(
    `SELECT assigned_staff_id::text AS staff_id,
            count(*) FILTER (WHERE status IN ('open','pending'))::int AS open_count,
            max(created_at)::text AS last_assigned_at
       FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND assigned_staff_id = ANY($2::uuid[])
        AND deleted_at IS NULL
      GROUP BY 1`,
    [tenantId, ids],
  )
  const load = new Map<string, MemberLoad>(
    members.map((m) => [m.staff_id, {
      staff_id: m.staff_id, max_concurrent: m.max_concurrent,
      open_count: 0, last_assigned_at: null,
    }]),
  )
  for (const r of loadRows) {
    const entry = load.get(r.staff_id)
    if (entry) { entry.open_count = r.open_count; entry.last_assigned_at = r.last_assigned_at }
  }
  const eligible = [...load.values()].filter(
    (m) => m.max_concurrent == null || m.open_count < m.max_concurrent,
  )
  if (eligible.length === 0) return { staffId: null, via: "all members at max_concurrent" }

  const byLeastLoaded = (a: MemberLoad, b: MemberLoad) =>
    a.open_count - b.open_count || a.staff_id.localeCompare(b.staff_id)

  if (strategy === "round_robin") {
    const sorted = [...eligible].sort((a, b) => {
      const la = a.last_assigned_at ? new Date(a.last_assigned_at).getTime() : 0
      const lb = b.last_assigned_at ? new Date(b.last_assigned_at).getTime() : 0
      return la - lb || byLeastLoaded(a, b)
    })
    return { staffId: sorted[0].staff_id, via: "round_robin (longest since last assignment)" }
  }
  if (strategy === "skills_based") {
    const condSkills = (rule.conditions as any)?.skills
    const required: string[] = Array.isArray(condSkills) && condSkills.length > 0
      ? condSkills.map(String)
      : [ticket.category]
    const { rows: skillRows } = await db.query<{ staff_id: string; skill_code: string; level: number }>(
      `SELECT staff_id::text AS staff_id, skill_code, level
         FROM public.support_staff_skills
        WHERE tenant_id = $1::uuid AND staff_id = ANY($2::uuid[])
          AND skill_code = ANY($3::text[])`,
      [tenantId, ids, required],
    )
    const byStaff = new Map<string, Map<string, number>>()
    for (const r of skillRows) {
      if (!byStaff.has(r.staff_id)) byStaff.set(r.staff_id, new Map())
      byStaff.get(r.staff_id)?.set(r.skill_code, r.level)
    }
    const scored = eligible
      .map((m) => {
        const held = byStaff.get(m.staff_id)
        if (!held || !required.every((s) => held.has(s))) return null
        const score = required.reduce((sum, s) => sum + (held.get(s) ?? 0), 0)
        return { member: m, score }
      })
      .filter((x): x is { member: MemberLoad; score: number } => x !== null)
    if (scored.length === 0) {
      const fallback = [...eligible].sort(byLeastLoaded)[0]
      return { staffId: fallback.staff_id, via: `skills_based fallback to least_loaded (no member holds all of: ${required.join(", ")})` }
    }
    scored.sort((a, b) => b.score - a.score || byLeastLoaded(a.member, b.member))
    return { staffId: scored[0].member.staff_id, via: `skills_based (score ${scored[0].score} over: ${required.join(", ")})` }
  }
  // least_loaded and any unknown strategy land here.
  const sorted = [...eligible].sort(byLeastLoaded)
  return { staffId: sorted[0].staff_id, via: "least_loaded" }
}

export async function routeTicket(
  db: SupportDb,
  tenantId: string,
  ticket: SupportTicketRow,
): Promise<RoutingDecision> {
  const rules = await loadEffectiveConfig<RoutingRuleRow>(
    db, "support_routing_rules", tenantId, "AND is_active",
  )
  rules.sort((a, b) => a.rule_order - b.rule_order || a.id.localeCompare(b.id))
  const ctx = buildTicketContext(ticket)

  for (const rule of rules) {
    if (!evaluateConditions(ctx, rule.conditions)) continue
    let staffId: string | null = null
    let via: string = rule.strategy
    if (rule.target_staff_id) {
      staffId = rule.target_staff_id
      via = "explicit target_staff_id"
    } else if (rule.target_team_id) {
      const picked = await pickTeamMember(db, tenantId, rule.target_team_id, rule.strategy, ticket, rule)
      staffId = picked.staffId
      via = picked.via
    }
    return {
      source: "rule",
      matchedRuleId: rule.id,
      matchedRuleName: rule.name,
      strategy: rule.strategy,
      teamId: rule.target_team_id,
      staffId,
      priority: rule.set_priority,
      tags: rule.set_tags ?? [],
      slaPolicyId: rule.sla_policy_id,
      reason: `rule '${rule.name}' matched; assignee via ${via}`,
    }
  }

  const { rows: catRows } = await db.query<{ default_team_id: string | null; default_sla_policy_id: string | null }>(
    `SELECT default_team_id::text AS default_team_id,
            default_sla_policy_id::text AS default_sla_policy_id
       FROM public.support_categories WHERE code = $1 LIMIT 1`,
    [ticket.category],
  )
  const cat = catRows[0]
  if (cat && (cat.default_team_id || cat.default_sla_policy_id)) {
    return {
      source: "category_default",
      matchedRuleId: null, matchedRuleName: null,
      strategy: "manual",
      teamId: cat.default_team_id, staffId: null,
      priority: null, tags: [],
      slaPolicyId: cat.default_sla_policy_id,
      reason: `no routing rule matched; category '${ticket.category}' defaults applied`,
    }
  }
  return {
    source: "none",
    matchedRuleId: null, matchedRuleName: null,
    strategy: "manual",
    teamId: null, staffId: null, priority: null, tags: [], slaPolicyId: null,
    reason: "no routing rule matched and the category carries no defaults",
  }
}

export interface RoutingApplyResult {
  decision: RoutingDecision
  applied: string[]
  dues: SlaDues | null
}

export async function applyRouting(
  db: SupportDb,
  tenantId: string,
  ticket: SupportTicketRow,
  decision: RoutingDecision,
  actor: { actorType?: "system" | "staff"; staffId?: string | null } = {},
): Promise<RoutingApplyResult> {
  const applied: string[] = []
  const actorType = actor.actorType ?? "system"
  const eventDetail = { rule_id: decision.matchedRuleId, source: decision.source }

  if (decision.teamId && decision.teamId !== ticket.assigned_team_id) {
    await db.query(
      `UPDATE public.support_tickets SET assigned_team_id = $3::uuid, updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, ticket.id, decision.teamId],
    )
    await logEngineEvent(db, tenantId, ticket.id, {
      type: "team_changed", actorType, actorStaffId: actor.staffId ?? null,
      detail: { ...eventDetail, from: ticket.assigned_team_id, to: decision.teamId },
    })
    applied.push("team")
  }
  if (decision.staffId && decision.staffId !== ticket.assigned_staff_id) {
    await db.query(
      `UPDATE public.support_tickets SET assigned_staff_id = $3::uuid, updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, ticket.id, decision.staffId],
    )
    await logEngineEvent(db, tenantId, ticket.id, {
      type: "assigned", actorType, actorStaffId: actor.staffId ?? null,
      detail: { ...eventDetail, from: ticket.assigned_staff_id, to: decision.staffId, strategy: decision.strategy },
    })
    // §12: a routing assignment is an assignment — the assignee is
    // told, through the single path.
    await notifyAssignment(db, tenantId, ticket, decision.staffId)
    applied.push("assignee")
  }
  if (decision.priority && decision.priority !== ticket.priority) {
    await db.query(
      `UPDATE public.support_tickets SET priority = $3, updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, ticket.id, decision.priority],
    )
    await logEngineEvent(db, tenantId, ticket.id, {
      type: "priority_changed", actorType, actorStaffId: actor.staffId ?? null,
      detail: { ...eventDetail, from: ticket.priority, to: decision.priority },
    })
    applied.push("priority")
  }
  if (decision.tags.length > 0) {
    const have = new Set(ticket.tags ?? [])
    const added = decision.tags.filter((t) => !have.has(t))
    if (added.length > 0) {
      await db.query(
        `UPDATE public.support_tickets SET tags = $3::text[], updated_at = now()
          WHERE tenant_id = $1::uuid AND id = $2::uuid`,
        [tenantId, ticket.id, [...have, ...added]],
      )
      await logEngineEvent(db, tenantId, ticket.id, {
        type: "tag_changed", actorType, actorStaffId: actor.staffId ?? null,
        detail: { ...eventDetail, added },
      })
      applied.push("tags")
    }
  }

  let dues: SlaDues | null = null
  if (decision.slaPolicyId) {
    const { rows: policies } = await db.query<SlaPolicyRow>(
      `SELECT * FROM public.support_sla_policies WHERE id = $1::uuid LIMIT 1`,
      [decision.slaPolicyId],
    )
    const policy = policies[0]
    if (policy) {
      let def: BusinessHoursDef | null = null
      let holidays = new Set<string>()
      if (policy.business_hours_id) {
        const { rows: hoursRows } = await db.query<BusinessHoursRow>(
          `SELECT * FROM public.support_business_hours WHERE id = $1::uuid LIMIT 1`,
          [policy.business_hours_id],
        )
        if (hoursRows[0]) def = parseBusinessHours(hoursRows[0])
        const { rows: holidayRows } = await db.query<{ holiday_date: string; business_hours_id: string }>(
          `SELECT holiday_date::text AS holiday_date, business_hours_id::text AS business_hours_id
             FROM public.support_holidays WHERE business_hours_id = $1::uuid`,
          [policy.business_hours_id],
        )
        holidays = holidayDateSet(holidayRows, policy.business_hours_id)
      }
      dues = await stampTicketSla(db, tenantId, ticket, policy, def, holidays)
      applied.push("sla")
    }
  }
  return { decision, applied, dues }
}

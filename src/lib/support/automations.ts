// ============================================================================
// Automation engine (spec §10: support_automations — triggers
// ticket_created | ticket_updated | message_received | time_based;
// loop guard, dry-run, per-tenant kill switch, run log in events).
//
// runAutomations evaluates the tenant's effective automations for one
// trigger against one ticket. It NEVER cascades: actions are applied
// through the shared applier, which does not re-enter this engine, so
// an automation cannot trigger another automation inside a run.
//
// Safety rails, in evaluation order:
//   1. Kill switch — if ANY effective automation row for the tenant
//      carries kill_switch = true, the tenant's automations halt
//      entirely (the switch is a tenant-level emergency stop that
//      happens to live on the config rows).
//   2. Loop guard — a ticket that already carries loopMaxFirings
//      'automation_fired' events inside the trailing window is
//      skipped, so a pathological rule set cannot spin on one ticket.
//   3. Per-automation dry_run — conditions evaluate and the run is
//      logged, but no action writes. Caller-level opts.dryRun is a
//      pure preview: nothing is written at all, not even the run log.
// Every non-preview run logs one 'automation_fired' event per matched
// automation (§4), actor_type 'automation'.
// ============================================================================

import {
  loadEffectiveConfig, logEngineEvent,
  type ConfigRow, type SupportDb, type SupportTicketRow,
} from "./engine-shared"
import { buildTicketContext, evaluateConditions, type ConditionNode } from "./conditions"
import { applyActions, parseActions, type ActionRunResult } from "./actions"
import { expandActions } from "./macros"

export type AutomationTrigger =
  | "ticket_created" | "ticket_updated" | "message_received" | "time_based"

export interface AutomationRow extends ConfigRow {
  name: string
  trigger_event: AutomationTrigger
  conditions: ConditionNode
  actions: unknown
  dry_run: boolean
  kill_switch: boolean
  is_active: boolean
  locked_by_master: boolean
  created_at: string
}

export interface AutomationRun {
  automationId: string
  name: string
  matched: boolean
  dryRun: boolean
  applied: string[]
  drafts: number
  /** The reply drafts themselves (desk rewire: persisted to
   *  support_drafts by the intake orchestration — engines draft,
   *  humans send). Empty for unmatched and dry-run runs. */
  draftBodies: { body: string; subject: string | null; missing: string[] }[]
  skipped: { type: string; reason: string }[]
}

export interface AutomationRunResult {
  halted: boolean
  haltReason: string | null
  loopGuarded: boolean
  runs: AutomationRun[]
}

export async function runAutomations(
  db: SupportDb,
  tenantId: string,
  trigger: AutomationTrigger,
  ticket: SupportTicketRow,
  opts: { now?: Date; dryRun?: boolean; loopWindowMinutes?: number; loopMaxFirings?: number } = {},
): Promise<AutomationRunResult> {
  const now = opts.now ?? new Date()
  const all = await loadEffectiveConfig<AutomationRow>(
    db, "support_automations", tenantId, "AND is_active",
  )

  const killed = all.find((a) => a.kill_switch)
  if (killed) {
    return {
      halted: true,
      haltReason: `kill switch engaged on automation '${killed.name}' (${killed.scope} scope)`,
      loopGuarded: false, runs: [],
    }
  }

  const candidates = all
    .filter((a) => a.trigger_event === trigger)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id))

  if (!opts.dryRun) {
    const windowMinutes = opts.loopWindowMinutes ?? 10
    const maxFirings = opts.loopMaxFirings ?? 5
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.support_ticket_events
        WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid
          AND event_type = 'automation_fired'
          AND created_at > $3::timestamptz`,
      [tenantId, ticket.id, new Date(now.getTime() - windowMinutes * 60000).toISOString()],
    )
    if ((rows[0]?.n ?? 0) >= maxFirings) {
      return { halted: false, haltReason: null, loopGuarded: true, runs: [] }
    }
  }

  const ctx = buildTicketContext(ticket, now)
  const runs: AutomationRun[] = []
  for (const automation of candidates) {
    const matched = evaluateConditions(ctx, automation.conditions)
    if (!matched) {
      runs.push({
        automationId: automation.id, name: automation.name, matched: false,
        dryRun: automation.dry_run, applied: [], drafts: 0, draftBodies: [], skipped: [],
      })
      continue
    }
    const { actions, invalid } = parseActions(automation.actions)
    const expanded = await expandActions(db, tenantId, actions, ticket)
    const runDry = automation.dry_run || !!opts.dryRun
    const result: ActionRunResult = await applyActions(db, tenantId, ticket, expanded, {
      actorType: "automation",
      dryRun: runDry,
      eventContext: { automation_id: automation.id, automation_name: automation.name },
    })
    for (const inv of invalid) {
      result.skipped.push({ type: "automation_action", reason: `invalid stored action at index ${inv.index}: ${inv.reason}` })
    }
    if (!opts.dryRun) {
      await logEngineEvent(db, tenantId, ticket.id, {
        type: "automation_fired", actorType: "automation",
        detail: {
          automation_id: automation.id, automation_name: automation.name,
          trigger, dry_run: automation.dry_run,
          applied: result.applied.map((x) => x.type),
          drafts: result.drafts.length,
        },
      })
    }
    runs.push({
      automationId: automation.id, name: automation.name, matched: true,
      dryRun: runDry,
      applied: result.applied.map((x) => x.type),
      drafts: result.drafts.length,
      draftBodies: runDry ? [] : result.drafts,
      skipped: result.skipped,
    })
  }
  return { halted: false, haltReason: null, loopGuarded: false, runs }
}

// ============================================================================
// Intake orchestration — the desk rewire's seam between the shipped
// ticket spine (tickets.ts) and the step-5 engines (routing, SLA,
// automations). §20 step 6 rewire: EVERY ticket creation path runs the
// routing engine at creation — skills-based assignment + SLA due-time
// stamping — and lifecycle moments run the automation engine
// (ticket_created / message_received / ticket_updated / time_based).
//
// Everything here is FAIL-SOFT by contract: intake must never fail
// because an engine did (a webhook retry must not duplicate, a customer
// message must not 500 because a rule was malformed). Engine errors are
// logged and the ticket stands on its own — an unrouted ticket is
// visible in the desk's Unassigned view, never a lost ticket.
//
// Reply drafts an automation produces are persisted to support_drafts
// (the §10 draft store), attributed to the ticket's assignee — the
// human who will review and send them from the desk. A draft on an
// unassigned ticket has no human owner yet; it stays counted in the
// run's 'automation_fired' event and materializes on a later run once
// the ticket is assigned. Engines never send (§10): drafts are all
// they produce.
// ============================================================================

import { routeTicket, applyRouting, type RoutingApplyResult } from "./routing"
import { runAutomations, type AutomationRunResult, type AutomationTrigger } from "./automations"
import type { SupportDb, SupportTicketRow } from "./engine-shared"

/** The raw support_tickets row the engines read (snake_case, as pg returns). */
export async function getRawTicketRow(
  db: SupportDb, tenantId: string, ticketId: string,
): Promise<SupportTicketRow | null> {
  const { rows } = await db.query<SupportTicketRow>(
    `SELECT * FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`,
    [tenantId, ticketId],
  )
  return rows[0] ?? null
}

export interface IntakeResult {
  routing: RoutingApplyResult | null
  automations: AutomationRunResult | null
}

/**
 * Creation pipeline for a just-created ticket: routing decision →
 * applied (team / assignee / priority / tags / SLA stamp) → the
 * ticket_created automations evaluated against the ROUTED ticket, so
 * their conditions see the assignment and tags routing produced.
 */
export async function routeNewTicket(
  db: SupportDb, tenantId: string, ticketId: string,
): Promise<IntakeResult> {
  let routing: RoutingApplyResult | null = null
  try {
    const row = await getRawTicketRow(db, tenantId, ticketId)
    if (row) {
      const decision = await routeTicket(db, tenantId, row)
      routing = await applyRouting(db, tenantId, row, decision, { actorType: "system" })
    }
  } catch (e) {
    console.error("[support/intake] routing failed for ticket", ticketId, (e as any)?.message)
  }
  const automations = await runTicketAutomations(db, tenantId, ticketId, "ticket_created")
  return { routing, automations }
}

/**
 * Run one automation trigger against a ticket's current state and
 * persist any reply drafts the run produced. Fail-soft: returns null
 * on engine failure, the result otherwise.
 */
export async function runTicketAutomations(
  db: SupportDb,
  tenantId: string,
  ticketId: string,
  trigger: AutomationTrigger,
): Promise<AutomationRunResult | null> {
  try {
    const row = await getRawTicketRow(db, tenantId, ticketId)
    if (!row) return null
    const result = await runAutomations(db, tenantId, trigger, row)
    await persistAutomationDrafts(db, tenantId, row, result).catch((e) =>
      console.error("[support/intake] draft persistence failed for ticket", ticketId, (e as any)?.message),
    )
    return result
  } catch (e) {
    console.error("[support/intake] automations failed for ticket", ticketId, trigger, (e as any)?.message)
    return null
  }
}

async function persistAutomationDrafts(
  db: SupportDb,
  tenantId: string,
  ticket: SupportTicketRow,
  result: AutomationRunResult,
): Promise<void> {
  if (result.halted || result.loopGuarded) return
  // The draft's human owner is the ticket's CURRENT assignee (a run may
  // itself have assigned the ticket — re-read the row so the draft
  // lands with whoever owns the ticket now).
  const fresh = await getRawTicketRow(db, tenantId, ticket.id)
  const owner = fresh?.assigned_staff_id ?? ticket.assigned_staff_id
  if (!owner) return
  for (const run of result.runs) {
    if (!run.matched || run.dryRun) continue
    for (const draft of run.draftBodies) {
      await db.query(
        `INSERT INTO public.support_drafts (tenant_id, ticket_id, staff_id, body, metadata)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb)`,
        [
          tenantId, ticket.id, owner, draft.body,
          JSON.stringify({
            source: "automation",
            automation_id: run.automationId,
            automation_name: run.name,
            subject: draft.subject,
            missing: draft.missing,
          }),
        ],
      )
    }
  }
}

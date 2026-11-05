// ============================================================================
// Macro + canned-reply engine (spec §10: support_macros,
// support_canned_replies, support_templates, support_signatures).
//
// A macro is an ordered action list (the actions.ts grammar). Applying
// one expands any reply references (canned_reply_id / template_code)
// into literal rendered bodies, applies the actions as the acting
// staff member, and logs ONE 'macro_applied' event (§4) carrying the
// macro id + name alongside the per-action events.
//
// Canned replies expand standalone too: body rendered against the
// ticket context, with the acting staff member's signature appended —
// that is the text the desk composer inserts (desk phase delivers it
// through the normal message path; engines never send).
// ============================================================================

import {
  logEngineEvent, type ConfigRow, type SupportDb, type SupportTicketRow,
} from "./engine-shared"
import { applyActions, parseActions, type ActionRunResult, type SupportAction } from "./actions"
import { buildRenderContext, renderTemplate, renderTemplateString, resolveSignature, resolveTemplate } from "./templates"

export interface MacroRow extends ConfigRow {
  name: string
  description: string | null
  actions: unknown
  is_active: boolean
  locked_by_master: boolean
}

export interface CannedReplyRow extends ConfigRow {
  title: string
  body: string
  category_code: string | null
  locale: string
  is_active: boolean
  locked_by_master: boolean
}

async function loadCannedReply(
  db: SupportDb, tenantId: string, cannedId: string,
): Promise<CannedReplyRow | null> {
  const { rows } = await db.query<CannedReplyRow>(
    `SELECT * FROM public.support_canned_replies
      WHERE id = $2::uuid AND is_active
        AND (scope = 'master' OR tenant_id = $1::uuid) LIMIT 1`,
    [tenantId, cannedId],
  )
  return rows[0] ?? null
}

/**
 * Expand reply references in an action list into literal bodies:
 * canned_reply_id → the canned reply's rendered body; template_code →
 * the resolved template's rendered body (+ its subject). Unresolvable
 * references lose their body and are skipped downstream by the
 * applier ('reply has no body').
 */
export async function expandActions(
  db: SupportDb,
  tenantId: string,
  actions: SupportAction[],
  ticket: SupportTicketRow,
  opts: { locale?: string } = {},
): Promise<SupportAction[]> {
  const ctx = buildRenderContext(ticket)
  const out: SupportAction[] = []
  for (const a of actions) {
    if (a.type !== "reply" || a.body) { out.push(a); continue }
    if (a.canned_reply_id) {
      const canned = await loadCannedReply(db, tenantId, a.canned_reply_id)
      out.push({ ...a, body: canned ? renderTemplateString(canned.body, ctx).text : undefined })
      continue
    }
    if (a.template_code) {
      const ticketLocale = typeof ticket.requester_locale === "string" ? ticket.requester_locale : "en-US"
      const resolved = await resolveTemplate(db, tenantId, a.template_code, opts.locale ?? ticketLocale)
      if (resolved) {
        const rendered = renderTemplate(resolved, ctx)
        out.push({ ...a, body: rendered.body, subject: a.subject ?? rendered.subject ?? undefined })
        continue
      }
      out.push({ ...a, body: undefined })
      continue
    }
    out.push(a)
  }
  return out
}

export interface MacroRunResult extends ActionRunResult {
  macro: { id: string; name: string }
}

export async function applyMacro(
  db: SupportDb,
  tenantId: string,
  macroId: string,
  ticket: SupportTicketRow,
  actor: { staffId: string },
): Promise<MacroRunResult> {
  const { rows } = await db.query<MacroRow>(
    `SELECT * FROM public.support_macros
      WHERE id = $2::uuid AND is_active
        AND (scope = 'master' OR tenant_id = $1::uuid) LIMIT 1`,
    [tenantId, macroId],
  )
  const macro = rows[0]
  if (!macro) throw new Error(`support macro not found or inactive: ${macroId}`)
  const { actions, invalid } = parseActions(macro.actions)
  const expanded = await expandActions(db, tenantId, actions, ticket)
  const result = await applyActions(db, tenantId, ticket, expanded, {
    actorType: "staff",
    actorStaffId: actor.staffId,
    eventContext: { macro_id: macro.id, macro_name: macro.name },
  })
  for (const inv of invalid) {
    result.skipped.push({ type: "macro_action", reason: `invalid stored action at index ${inv.index}: ${inv.reason}` })
  }
  await logEngineEvent(db, tenantId, ticket.id, {
    type: "macro_applied", actorType: "staff", actorStaffId: actor.staffId,
    detail: {
      macro_id: macro.id, macro_name: macro.name,
      applied: result.applied.map((x) => x.type),
      drafts: result.drafts.length,
    },
  })
  return { ...result, macro: { id: macro.id, name: macro.name } }
}

/** A canned reply, rendered for the composer, signature appended. */
export async function expandCannedReply(
  db: SupportDb,
  tenantId: string,
  cannedId: string,
  ticket: SupportTicketRow,
  opts: { staffId?: string | null; teamId?: string | null } = {},
): Promise<{ body: string; cannedReplyId: string; signatureApplied: boolean } | null> {
  const canned = await loadCannedReply(db, tenantId, cannedId)
  if (!canned) return null
  const ctx = buildRenderContext(ticket)
  let body = renderTemplateString(canned.body, ctx).text
  let signatureApplied = false
  if (opts.staffId) {
    const signature = await resolveSignature(db, tenantId, opts.staffId, opts.teamId ?? ticket.assigned_team_id)
    if (signature) {
      body = `${body}\n\n${signature}`
      signatureApplied = true
    }
  }
  return { body, cannedReplyId: canned.id, signatureApplied }
}

// ============================================================================
// Support §18 SECURITY AND COMPLIANCE — the ACTIONS layer (spec:
// support-desk-enterprise-tree.md §18, lines 212–218).
//
// §18's data and gates were already live before this module: the §6
// regulated records and their writers (regulated.ts), the §5 permission
// codes in platform_permission_registry (support.privacy / support.delete
// / support.confidential / …), the events CHECK carrying the
// 'redacted' / 'legal_hold_set' / 'confidential_access' types, and the
// events immutability trigger whose designed release valve is the
// session GUC app.allow_event_mutation = 'on'. What did not exist
// anywhere was the ACTIONS those pieces exist for:
//
//   1. REDACTION — an authorized, audited way to remove PII from
//      ticket content. Message bodies are replaced in place with a
//      marker (the row, its timestamps, and its place in the thread
//      survive); event payloads — append-only by trigger — are
//      redacted through the GUC retention path the trigger itself
//      names. Nothing is silently deleted, and the audit trail keeps
//      the FACT of the redaction (target, fields, character counts,
//      reason) without keeping the redacted content.
//   2. DSAR WORKFLOW — privacy_request_details existed as data (B2's
//      upsert) with no workflow: no enforced states, no export, no
//      deletion fulfillment. The workflow here derives state from the
//      record (received → identity_verified → closed by outcome),
//      guards the transitions, generates the data-subject export from
//      the subject's real rows, and fulfills deletion as soft-delete +
//      message redaction + snapshot anonymization (§0: hard delete is
//      the retention job's alone). Legal hold is reconciled, not a
//      wall (Sunny, 2026-10-14): a deletion erases what is erasable
//      and RETAINS the records under hold, closing as
//      partially_fulfilled with the held refs and the hold itself
//      recorded as the reason — the resolution the customer-facing
//      intake describes before the subject ever files.
//   3. RETENTION — the §13 'retention' job type and §0's "hard delete
//      only via retention job" had no runner and no schedule. The
//      schedule is read from policy_settings (scope 'support', keys
//      retention_days_<category> / retention_days_default; tenant row
//      wins, else the master tenant's). Regulated categories (per
//      support_categories.regulated) NEVER fall back to the default —
//      §18 gives DMCA and legal records extended retention, so they
//      purge only under an explicit per-category key. NO schedule
//      values exist live today, so a run REFUSES honestly (and audits
//      the refusal) rather than inventing a period. A run that does
//      proceed purges through one transaction per ticket with the GUC
//      set — the ticket DELETE cascades its children (events,
//      messages, side tables) — records a support_jobs row in the
//      sweep's idiom, and audits counts + refs. Attachment storage
//      objects are listed on the job for the storage layer to remove;
//      they are never claimed deleted here.
//   4. TRAIL EVENTS — a confidential ticket read on the desk appends
//      'confidential_access'; a case legal-hold toggle appends
//      'legal_hold_set' (§4's vocabulary, previously writer-less).
//
// Gates (§18 line 1): the support.* codes resolve through
// platform_module_permissions on module 'support' (platform admin OR a
// write/full grant), exactly as 'support.export' does on the §17
// export route — routes run requireModuleApi("support", …) and this
// module re-checks the acting staff's grant level per action code:
// support.privacy for redaction + DSAR, support.delete for retention.
// Every mutation writes a crm_audit_log row in the §10 writers' shape
// (support_regulated_* there, support_compliance_* here). Tenant is a
// predicate in every statement. Support code never touches another
// module's tables.
// ============================================================================

import { logTicketEvent } from "./tickets"
import {
  getPrivacyDetails, upsertPrivacyDetails,
  type RegulatedActor,
} from "./regulated"

export interface ComplianceDb {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

type Db = ComplianceDb

export class ComplianceError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const REDACTION_MARKER = "[REDACTED]"
export const DSAR_DELETED_MARKER = "[DELETED — DSAR]"

// ── Audit (§18 change log; mirrors regulated.ts / config-admin.ts) ───

async function auditComplianceChange(
  c: Db,
  tenantId: string,
  actor: RegulatedActor,
  entityType: string,
  entityId: string | null,
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
        tenantId, actor.userId, actor.staffId, entityType, entityId,
        `support_compliance_${verb}`,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        actor.ip, actor.userAgent,
      ],
    )
  } catch (e) {
    console.error(
      `[support-compliance] audit write failed for ${entityType}/${verb}:`,
      e instanceof Error ? e.message : String(e),
    )
  }
}

// ── Per-code grant level (the 'support.export' idiom, §17) ───────────
// A support.* code is bound to module 'support' in the registry; its
// operative app-layer test is the acting staff's grant level on that
// module: platform admins (no staff row resolves) and owners pass, a
// write/full grant passes, read/none does not.

export type ComplianceCode = "support.privacy" | "support.delete"

export async function hasComplianceGrant(
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

// ── 1. REDACTION ─────────────────────────────────────────────────────

interface TicketRef { id: string; ticketRef: string; conversationId: string }

/**
 * Redact one conversation message: body fields become the marker, the
 * row and thread survive, the redaction is stamped into the message
 * metadata, a 'redacted' event lands on the ticket, and the audit row
 * records sizes + reason — never the content itself.
 */
export async function redactMessage(
  c: Db,
  tenantId: string,
  ticket: TicketRef,
  messageId: string,
  reason: string | null,
  actor: RegulatedActor,
): Promise<{ messageId: string; redactedAt: string }> {
  const cur = await c.query(
    `SELECT id::text AS id, body, body_text, body_html, metadata
       FROM public.crm_messages
      WHERE tenant_id = $1::uuid AND conversation_id = $2::uuid AND id = $3::uuid
      LIMIT 1`,
    [tenantId, ticket.conversationId, messageId],
  )
  const msg = cur.rows[0]
  if (!msg) throw new ComplianceError(404, "Message not found on this ticket")
  const meta = (msg.metadata ?? {}) as Record<string, unknown>
  if (meta.redacted_at) throw new ComplianceError(409, "Message is already redacted")

  const redactedAt = new Date().toISOString()
  const stamp = {
    redacted_at: redactedAt,
    redacted_by_staff_id: actor.staffId,
    redaction_reason: reason,
  }
  await c.query(
    `UPDATE public.crm_messages
        SET body = $4, body_text = $4, body_html = NULL,
            metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb
      WHERE tenant_id = $1::uuid AND conversation_id = $2::uuid AND id = $3::uuid`,
    [tenantId, ticket.conversationId, messageId, REDACTION_MARKER, JSON.stringify(stamp)],
  )
  await logTicketEvent(c, tenantId, ticket.id, {
    type: "redacted",
    actorStaffId: actor.staffId,
    detail: { target: "message", messageId, fields: ["body", "body_text", "body_html"], reason },
  }).catch(() => {})
  await auditComplianceChange(c, tenantId, actor, "crm_messages", messageId, "message_redacted",
    {
      body_chars: typeof msg.body === "string" ? msg.body.length : 0,
      body_text_chars: typeof msg.body_text === "string" ? msg.body_text.length : 0,
      had_body_html: msg.body_html != null,
    },
    { redacted: true, reason, redacted_at: redactedAt })
  return { messageId, redactedAt }
}

const EVENT_TEXT_KEYS = ["body", "note", "text", "message"] as const

/**
 * Redact the text an event payload carries (an internal note's body is
 * the live case). support_ticket_events is append-only: the UPDATE
 * runs inside one transaction with the trigger's own release valve —
 * SET LOCAL app.allow_event_mutation = 'on' — and nowhere else. The
 * 'redacted' event that records the act is a normal append, written
 * after commit, outside the mutation window.
 */
export async function redactEventBody(
  c: Db,
  tenantId: string,
  ticket: TicketRef,
  eventId: string,
  reason: string | null,
  actor: RegulatedActor,
): Promise<{ eventId: string; fields: string[] }> {
  const cur = await c.query(
    `SELECT id::text AS id, event_type, detail, payload
       FROM public.support_ticket_events
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid AND id = $3::uuid
      LIMIT 1`,
    [tenantId, ticket.id, eventId],
  )
  const ev = cur.rows[0]
  if (!ev) throw new ComplianceError(404, "Event not found on this ticket")
  const detail = (ev.detail ?? {}) as Record<string, unknown>
  if (detail.redacted_at) throw new ComplianceError(409, "Event is already redacted")
  const fields = EVENT_TEXT_KEYS.filter(
    (k) => typeof detail[k] === "string" && (detail[k] as string).length > 0,
  )
  if (fields.length === 0) {
    throw new ComplianceError(409, "Event carries no redactable text")
  }
  const before: Record<string, unknown> = {}
  const next: Record<string, unknown> = { ...detail }
  for (const k of fields) {
    before[`${k}_chars`] = (detail[k] as string).length
    next[k] = REDACTION_MARKER
  }
  const redactedAt = new Date().toISOString()
  next.redacted_at = redactedAt
  next.redacted_by_staff_id = actor.staffId

  await c.query("BEGIN")
  try {
    await c.query(`SET LOCAL app.allow_event_mutation = 'on'`)
    await c.query(
      `UPDATE public.support_ticket_events
          SET detail = $4::jsonb,
              payload = CASE WHEN payload IS NULL THEN NULL ELSE $4::jsonb END
        WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid AND id = $3::uuid`,
      [tenantId, ticket.id, eventId, JSON.stringify(next)],
    )
    await c.query("COMMIT")
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {})
    throw e
  }
  await logTicketEvent(c, tenantId, ticket.id, {
    type: "redacted",
    actorStaffId: actor.staffId,
    detail: { target: "event", eventId, eventType: ev.event_type, fields, reason },
  }).catch(() => {})
  await auditComplianceChange(c, tenantId, actor, "support_ticket_events", eventId, "event_redacted",
    before, { redacted: true, reason, redacted_at: redactedAt })
  return { eventId, fields: [...fields] }
}

// ── 2. DSAR WORKFLOW ─────────────────────────────────────────────────
// State is derived from the §6 record — no parallel state store:
//   outcome set            → closed (carrying the outcome)
//   identity_verified_at   → identity_verified
//   otherwise              → received

export type DsarState = "received" | "identity_verified" | "closed"
export const DSAR_CLOSE_OUTCOMES = ["fulfilled", "denied", "partially_fulfilled"] as const

export function dsarStateOf(details: Record<string, any> | null): DsarState | null {
  if (!details) return null
  if (details.outcome) return "closed"
  if (details.identity_verified_at) return "identity_verified"
  return "received"
}

async function subjectTickets(c: Db, tenantId: string, ticket: TicketRef & { contactId?: string | null }) {
  if (ticket.contactId) {
    const { rows } = await c.query(
      `SELECT id::text AS id, ticket_ref, conversation_id::text AS conversation_id,
              contact_id::text AS contact_id
         FROM public.support_tickets
        WHERE tenant_id = $1::uuid AND contact_id = $2::uuid
        ORDER BY created_at ASC`,
      [tenantId, ticket.contactId],
    )
    if (rows.length > 0) return rows
  }
  return [{ id: ticket.id, ticket_ref: ticket.ticketRef, conversation_id: ticket.conversationId, contact_id: ticket.contactId ?? null }]
}

export async function verifyDsarIdentity(
  c: Db,
  tenantId: string,
  ticket: TicketRef,
  input: { method?: string | null; note?: string | null },
  actor: RegulatedActor,
): Promise<Record<string, any>> {
  const details = await getPrivacyDetails(c, tenantId, ticket.id)
  if (!details) throw new ComplianceError(404, "No privacy request record on this ticket")
  if (details.outcome) throw new ComplianceError(409, "Privacy request is already closed")
  const method = String(input.method || "").trim()
  if (!method) throw new ComplianceError(400, "A verification method is required to verify identity")
  const updated = await upsertPrivacyDetails(c, tenantId, ticket.id, {
    identityVerified: true,
    verificationMethod: method,
    fulfillmentNote: input.note?.trim() || "Identity verified",
  }, actor)
  await logTicketEvent(c, tenantId, ticket.id, {
    type: "field_changed",
    actorStaffId: actor.staffId,
    detail: { field: "privacy_request", transition: "identity_verified", method },
  }).catch(() => {})
  return updated
}

/**
 * The data-subject export: the subject's own rows, assembled live —
 * contact record, every ticket the contact owns in this tenant, each
 * conversation's messages, public event history (types + stamps;
 * internal event payloads are staff work product and stay out), and
 * the privacy record itself. Generating an export is fulfillment
 * work: it appends to the request's fulfillment log and is audited.
 */
export async function generateDsarExport(
  c: Db,
  tenantId: string,
  ticket: TicketRef & { contactId?: string | null },
  actor: RegulatedActor,
): Promise<Record<string, unknown>> {
  const details = await getPrivacyDetails(c, tenantId, ticket.id)
  if (!details) throw new ComplianceError(404, "No privacy request record on this ticket")
  if (details.outcome) throw new ComplianceError(409, "Privacy request is already closed")

  let contact: Record<string, any> | null = null
  if (ticket.contactId) {
    const { rows } = await c.query(
      `SELECT id::text AS id, display_name, email_normalized, phone_normalized,
              locale, timezone, created_at::text AS created_at
         FROM public.support_contacts
        WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`,
      [tenantId, ticket.contactId],
    )
    contact = rows[0] ?? null
  }

  const subjects = await subjectTickets(c, tenantId, ticket)
  const tickets: Record<string, unknown>[] = []
  let messageCount = 0
  for (const t of subjects) {
    const head = await c.query(
      `SELECT ticket_ref, subject, category, status, priority, requester_type,
              requester_name, requester_email, requester_phone,
              created_at::text AS created_at, resolved_at::text AS resolved_at,
              closed_at::text AS closed_at
         FROM public.support_tickets
        WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`,
      [tenantId, t.id],
    )
    const msgs = await c.query(
      `SELECT direction, channel, COALESCE(body_text, body) AS body,
              COALESCE(sent_at, created_at)::text AS at
         FROM public.crm_messages
        WHERE tenant_id = $1::uuid AND conversation_id = $2::uuid
        ORDER BY created_at ASC LIMIT 1000`,
      [tenantId, t.conversation_id],
    )
    messageCount += msgs.rows.length
    const evs = await c.query(
      `SELECT event_type, created_at::text AS at
         FROM public.support_ticket_events
        WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid AND visibility = 'public'
        ORDER BY created_at ASC LIMIT 1000`,
      [tenantId, t.id],
    )
    tickets.push({
      ...(head.rows[0] ?? {}),
      messages: msgs.rows,
      public_events: evs.rows,
    })
  }

  const exportedAt = new Date().toISOString()
  await upsertPrivacyDetails(c, tenantId, ticket.id, {
    fulfillmentNote: `Data-subject export generated: ${tickets.length} ticket(s), ${messageCount} message(s)`,
  }, actor)
  await logTicketEvent(c, tenantId, ticket.id, {
    type: "field_changed",
    actorStaffId: actor.staffId,
    detail: { field: "privacy_request", transition: "export_generated", tickets: tickets.length, messages: messageCount },
  }).catch(() => {})
  await auditComplianceChange(c, tenantId, actor, "privacy_request_details", details.id,
    "dsar_export_generated", null,
    { tickets: tickets.length, messages: messageCount, exported_at: exportedAt })

  return {
    exported_at: exportedAt,
    tenant_id: tenantId,
    subject_contact: contact,
    privacy_request: {
      request_type: details.request_type,
      identity_verified_at: details.identity_verified_at,
      statutory_due_at: details.statutory_due_at,
      outcome: details.outcome,
    },
    tickets,
  }
}

/**
 * Deletion fulfillment. Guards: the request is a deletion request,
 * identity is verified, and the request is open. Fulfillment redacts
 * every erasable message body, anonymizes the erasable tickets'
 * requester snapshots, and soft-deletes them (§0 — hard delete
 * belongs to retention). THE LEGAL-HOLD RECONCILIATION: a subject
 * ticket whose case is under legal hold is NOT erased — not its
 * messages, not its snapshots, not its row — and the request closes
 * as partially_fulfilled with the held refs and the hold recorded as
 * the stated reason, exactly as the customer intake copy promises.
 * The contact row is anonymized only when nothing is held: while a
 * held record stands, the identity spine it references stays intact.
 */
export async function fulfillDsarDeletion(
  c: Db,
  tenantId: string,
  ticket: TicketRef & { contactId?: string | null },
  actor: RegulatedActor,
): Promise<{ ticketsSoftDeleted: number; messagesRedacted: number; refs: string[]; retainedUnderLegalHold: string[]; outcome: string }> {
  const details = await getPrivacyDetails(c, tenantId, ticket.id)
  if (!details) throw new ComplianceError(404, "No privacy request record on this ticket")
  if (details.request_type !== "deletion") {
    throw new ComplianceError(400, `Deletion fulfillment requires a deletion request (this is "${details.request_type}")`)
  }
  if (!details.identity_verified_at) {
    throw new ComplianceError(409, "Identity must be verified before deletion is fulfilled")
  }
  if (details.outcome) throw new ComplianceError(409, "Privacy request is already closed")

  const subjects = await subjectTickets(c, tenantId, ticket)
  const ids = subjects.map((t) => t.id)
  const holds = await c.query(
    `SELECT t.ticket_ref FROM public.support_case_details cd
       JOIN public.support_tickets t ON t.id = cd.ticket_id AND t.tenant_id = cd.tenant_id
      WHERE cd.tenant_id = $1::uuid AND cd.ticket_id = ANY($2::uuid[]) AND cd.legal_hold`,
    [tenantId, ids],
  )
  const heldRefs = holds.rows.map((r: any) => String(r.ticket_ref))
  const heldSet = new Set(heldRefs)
  const erasable = subjects.filter((t) => !heldSet.has(t.ticket_ref))

  let messagesRedacted = 0
  for (const t of erasable) {
    const upd = await c.query(
      `UPDATE public.crm_messages
          SET body = $3, body_text = $3, body_html = NULL,
              metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
        WHERE tenant_id = $1::uuid AND conversation_id = $2::uuid
          AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'redacted_at')
        RETURNING id`,
      [tenantId, t.conversation_id, REDACTION_MARKER,
       JSON.stringify({ redacted_at: new Date().toISOString(), redacted_by_staff_id: actor.staffId, redaction_reason: "dsar_deletion" })],
    )
    messagesRedacted += upd.rows.length
    if (upd.rows.length > 0) {
      await logTicketEvent(c, tenantId, t.id, {
        type: "redacted",
        actorStaffId: actor.staffId,
        detail: { target: "conversation", messages: upd.rows.length, reason: "dsar_deletion" },
      }).catch(() => {})
    }
    await c.query(
      `UPDATE public.support_tickets
          SET requester_name = $3, requester_email = NULL, requester_phone = NULL,
              subject = $3, deleted_at = now(), updated_at = now(), row_version = row_version + 1
        WHERE tenant_id = $1::uuid AND id = $2::uuid AND deleted_at IS NULL`,
      [tenantId, t.id, DSAR_DELETED_MARKER],
    )
  }
  // The contact spine is anonymized only when nothing stands under
  // hold — a held record keeps the identity it references.
  if (ticket.contactId && heldRefs.length === 0) {
    await c.query(
      `UPDATE public.support_contacts
          SET display_name = $3, email_normalized = NULL, phone_normalized = NULL,
              updated_at = now(), row_version = row_version + 1
        WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, ticket.contactId, DSAR_DELETED_MARKER],
    )
  }
  const outcome = heldRefs.length > 0 ? "partially_fulfilled" : "fulfilled"
  await upsertPrivacyDetails(c, tenantId, ticket.id, {
    outcome,
    fulfillmentNote: heldRefs.length > 0
      ? `Deletion fulfilled in part: ${erasable.length} ticket(s) soft-deleted, ${messagesRedacted} message(s) redacted. RETAINED UNDER LEGAL HOLD: ${heldRefs.join(", ")} — those records are kept under legal obligation and were not erased.`
      : `Deletion fulfilled: ${erasable.length} ticket(s) soft-deleted, ${messagesRedacted} message(s) redacted, snapshots + contact anonymized`,
  }, actor)
  await logTicketEvent(c, tenantId, ticket.id, {
    type: "field_changed",
    actorStaffId: actor.staffId,
    detail: {
      field: "privacy_request", transition: "deletion_fulfilled", outcome,
      tickets: erasable.length, messages: messagesRedacted, retained_under_legal_hold: heldRefs,
    },
  }).catch(() => {})
  await auditComplianceChange(c, tenantId, actor, "privacy_request_details", details.id,
    "dsar_deletion_fulfilled", null,
    {
      tickets: erasable.length, messages_redacted: messagesRedacted,
      refs: erasable.map((t) => t.ticket_ref), outcome,
      retained_under_legal_hold: heldRefs,
    })
  return {
    ticketsSoftDeleted: erasable.length,
    messagesRedacted,
    refs: erasable.map((t) => t.ticket_ref),
    retainedUnderLegalHold: heldRefs,
    outcome,
  }
}

export async function closeDsar(
  c: Db,
  tenantId: string,
  ticket: TicketRef,
  input: { outcome?: string | null; note?: string | null },
  actor: RegulatedActor,
): Promise<Record<string, any>> {
  const details = await getPrivacyDetails(c, tenantId, ticket.id)
  if (!details) throw new ComplianceError(404, "No privacy request record on this ticket")
  if (details.outcome) throw new ComplianceError(409, "Privacy request is already closed")
  const outcome = String(input.outcome || "")
  if (!(DSAR_CLOSE_OUTCOMES as readonly string[]).includes(outcome)) {
    throw new ComplianceError(400, `Outcome must be one of: ${DSAR_CLOSE_OUTCOMES.join(", ")}`)
  }
  if (outcome !== "denied" && !details.identity_verified_at) {
    throw new ComplianceError(409, "Identity must be verified before a request is closed as fulfilled")
  }
  const updated = await upsertPrivacyDetails(c, tenantId, ticket.id, {
    outcome,
    fulfillmentNote: input.note?.trim() || `Closed: ${outcome}`,
  }, actor)
  await logTicketEvent(c, tenantId, ticket.id, {
    type: "field_changed",
    actorStaffId: actor.staffId,
    detail: { field: "privacy_request", transition: "closed", outcome },
  }).catch(() => {})
  return updated
}

// ── 3. RETENTION ─────────────────────────────────────────────────────

export interface RetentionSchedule {
  byCategory: Record<string, number>
  defaultDays: number | null
  invalidKeys: string[]
  source: "tenant" | "master" | null
}

function parseDays(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.floor(raw)
  if (typeof raw === "string") {
    const n = Number(raw.replace(/"/g, "").trim())
    if (Number.isFinite(n)) return Math.floor(n)
  }
  return null
}

export async function loadRetentionSchedule(
  c: Db,
  tenantId: string,
  masterTenantId: string,
): Promise<RetentionSchedule> {
  const read = async (tid: string) => {
    const { rows } = await c.query(
      `SELECT key, value FROM public.policy_settings
        WHERE scope = 'support' AND tenant_id = $1::uuid AND key LIKE 'retention\\_days\\_%'`,
      [tid],
    )
    return rows
  }
  let rows = await read(tenantId)
  let source: RetentionSchedule["source"] = rows.length > 0 ? "tenant" : null
  if (rows.length === 0 && masterTenantId && masterTenantId !== tenantId) {
    rows = await read(masterTenantId)
    if (rows.length > 0) source = "master"
  }
  const byCategory: Record<string, number> = {}
  let defaultDays: number | null = null
  const invalidKeys: string[] = []
  for (const r of rows) {
    const days = parseDays(r.value)
    if (days === null || days < 0) { invalidKeys.push(String(r.key)); continue }
    if (r.key === "retention_days_default") defaultDays = days
    else byCategory[String(r.key).replace(/^retention_days_/, "")] = days
  }
  return { byCategory, defaultDays, invalidKeys, source }
}

export interface RetentionEvaluation {
  scheduleFound: boolean
  schedule: RetentionSchedule
  eligible: { id: string; ref: string; category: string; closedAt: string | null }[]
  blockedByHold: { id: string; ref: string; category: string }[]
  unscheduledClosed: number
}

export async function evaluateRetention(
  c: Db,
  tenantId: string,
  masterTenantId: string,
): Promise<RetentionEvaluation> {
  const schedule = await loadRetentionSchedule(c, tenantId, masterTenantId)
  const scheduleFound =
    Object.keys(schedule.byCategory).length > 0 || schedule.defaultDays !== null
  const reg = await c.query(
    `SELECT code FROM public.support_categories WHERE regulated AND is_active`,
  )
  const regulated = new Set(reg.rows.map((r: any) => String(r.code)))

  const { rows } = await c.query(
    `SELECT t.id::text AS id, t.ticket_ref, t.category,
            COALESCE(t.closed_at, t.resolved_at, t.updated_at)::text AS closed_at,
            EXISTS (
              SELECT 1 FROM public.support_case_details cd
               WHERE cd.tenant_id = t.tenant_id AND cd.ticket_id = t.id AND cd.legal_hold
            ) AS held
       FROM public.support_tickets t
      WHERE t.tenant_id = $1::uuid AND t.status IN ('resolved', 'closed')
        AND t.deleted_at IS NULL AND t.merged_into_id IS NULL
      ORDER BY t.created_at ASC`,
    [tenantId],
  )
  const eligible: RetentionEvaluation["eligible"] = []
  const blockedByHold: RetentionEvaluation["blockedByHold"] = []
  let unscheduledClosed = 0
  const now = Date.now()
  for (const r of rows) {
    const category = String(r.category)
    // Regulated categories purge ONLY under an explicit per-category
    // key — the default never reaches them (§18 extended retention).
    const days = schedule.byCategory[category] ??
      (regulated.has(category) ? undefined : schedule.defaultDays ?? undefined)
    if (days === undefined) { unscheduledClosed++; continue }
    const closedMs = r.closed_at ? Date.parse(r.closed_at as string) : NaN
    if (!Number.isFinite(closedMs) || now - closedMs < days * 86400000) continue
    if (r.held) blockedByHold.push({ id: r.id, ref: r.ticket_ref, category })
    else eligible.push({ id: r.id, ref: r.ticket_ref, category, closedAt: r.closed_at })
  }
  return { scheduleFound, schedule, eligible, blockedByHold, unscheduledClosed }
}

/**
 * One retention run. No schedule → the run is refused, the refusal is
 * audited, and nothing is touched. With a schedule, each eligible
 * ticket is purged in its own transaction through the GUC path (the
 * ticket DELETE cascades events — the trigger's valve — messages,
 * and every side table), and the run is recorded as a support_jobs
 * row in the sweep's idiom + a crm_audit_log row with counts/refs.
 */
export async function runRetention(
  c: Db,
  tenantId: string,
  masterTenantId: string,
  actor: RegulatedActor,
): Promise<Record<string, unknown>> {
  const ev = await evaluateRetention(c, tenantId, masterTenantId)
  if (!ev.scheduleFound) {
    await auditComplianceChange(c, tenantId, actor, "support_retention", null,
      "retention_run_refused", null,
      { reason: "no_retention_schedule", unscheduled_closed: ev.unscheduledClosed })
    return {
      refused: true,
      reason: "no_retention_schedule",
      detail: "No retention schedule is configured (policy_settings scope 'support', retention_days_* keys). Nothing was purged.",
      unscheduledClosed: ev.unscheduledClosed,
    }
  }

  const job = await c.query(
    `INSERT INTO public.support_jobs (tenant_id, type, status, started_at, payload)
     VALUES ($1::uuid, 'retention', 'running', now(), $2::jsonb)
     RETURNING id::text AS id`,
    [tenantId, JSON.stringify({ trigger: "desk", by_staff_id: actor.staffId })],
  )
  const jobId = job.rows[0].id as string

  const purged: { ref: string; category: string; messages: number }[] = []
  const failures: { ref: string; error: string }[] = []
  const storageObjectsPendingRemoval: string[] = []
  for (const t of ev.eligible) {
    try {
      const head = await c.query(
        `SELECT conversation_id::text AS conversation_id FROM public.support_tickets
          WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`,
        [tenantId, t.id],
      )
      if (!head.rows[0]) continue
      const conversationId = head.rows[0].conversation_id as string
      const msgCount = await c.query(
        `SELECT count(*)::int AS n FROM public.crm_messages
          WHERE tenant_id = $1::uuid AND conversation_id = $2::uuid`,
        [tenantId, conversationId],
      )
      const att = await c.query(
        `SELECT storage_key FROM public.support_attachments
          WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
        [tenantId, t.id],
      ).catch(() => ({ rows: [] as any[] }))
      for (const a of att.rows) if (a.storage_key) storageObjectsPendingRemoval.push(String(a.storage_key))

      await c.query("BEGIN")
      try {
        await c.query(`SET LOCAL app.allow_event_mutation = 'on'`)
        await c.query(
          `DELETE FROM public.support_tickets WHERE tenant_id = $1::uuid AND id = $2::uuid`,
          [tenantId, t.id],
        )
        await c.query(
          `DELETE FROM public.crm_conversations WHERE tenant_id = $1::uuid AND id = $2::uuid`,
          [tenantId, conversationId],
        )
        await c.query("COMMIT")
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {})
        throw e
      }
      purged.push({ ref: t.ref, category: t.category, messages: msgCount.rows[0].n as number })
    } catch (e) {
      failures.push({ ref: t.ref, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const summary = {
    trigger: "desk",
    by_staff_id: actor.staffId,
    schedule: { by_category: ev.schedule.byCategory, default_days: ev.schedule.defaultDays, source: ev.schedule.source },
    purged,
    blocked_by_hold: ev.blockedByHold.map((b) => b.ref),
    failures,
    storage_objects_pending_removal: storageObjectsPendingRemoval,
  }
  await c.query(
    `UPDATE public.support_jobs
        SET status = $3, finished_at = now(), payload = $2::jsonb, updated_at = now()
      WHERE tenant_id = $1::uuid AND id = $4::uuid`,
    [tenantId, JSON.stringify(summary), failures.length > 0 ? "failed" : "succeeded", jobId],
  )
  await auditComplianceChange(c, tenantId, actor, "support_retention", jobId, "retention_purged",
    null,
    {
      job_id: jobId,
      purged_count: purged.length,
      purged_refs: purged.map((p) => p.ref),
      blocked_by_hold: ev.blockedByHold.map((b) => b.ref),
      failures: failures.length,
    })
  return { refused: false, jobId, ...summary }
}

// ── 4. TRAIL EVENTS ──────────────────────────────────────────────────

/** §18: confidential-ticket access writes a 'confidential_access'
 *  event. Called (fail-soft) by the desk detail read when the
 *  ticket's visibility_level is 'confidential'. */
export async function noteConfidentialAccess(
  c: Db,
  tenantId: string,
  ticketId: string,
  actorStaffId: string | null,
  actorLabel: string | null,
): Promise<void> {
  await logTicketEvent(c, tenantId, ticketId, {
    type: "confidential_access",
    actorStaffId,
    actorLabel,
    detail: { visibility_level: "confidential", surface: "admin_desk" },
  })
}

/** §18/§6: a legal-hold toggle is part of the case trail — a
 *  'legal_hold_set' event beside the record's own audit row. */
export async function noteLegalHoldChange(
  c: Db,
  tenantId: string,
  ticketId: string,
  legalHold: boolean,
  actorStaffId: string | null,
  actorLabel: string | null,
): Promise<void> {
  await logTicketEvent(c, tenantId, ticketId, {
    type: "legal_hold_set",
    actorStaffId,
    actorLabel,
    detail: { legal_hold: legalHold },
  })
}

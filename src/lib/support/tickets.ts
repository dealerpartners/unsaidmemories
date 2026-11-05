// ============================================================================
// Support tickets — the spine of the support chain (Sunny, 2026-10-13).
//
// A ticket owns ONE conversation: the crm_messages rows that carry the
// ticket's conversation_id. The customer Support page, the employee and
// seller intake surfaces, and the admin Support Desk all write through the
// helpers here so the model stays identical from every door:
//
//   - one open (open/pending) ticket per customer support thread — a new
//     customer message reuses it; a message after resolve/close opens a
//     fresh ticket with a fresh conversation;
//   - non-customer requesters (employee / seller / vet / pharmacy /
//     franchise) carry their identity + user type on the ticket itself;
//     their messages are crm_messages rows with customer_id NULL and the
//     ticket's conversation_id set, so no customer's thread ever sees them;
//   - ticket_ref (SUP-<seq>) is the human identity staff quote back.
//
// Statuses: open → pending → resolved → closed (the CHECK on
// public.support_tickets). Priorities: low / normal / high / urgent.
//
// Desk rewire (§20 step 6): creation runs the routing engine (skills-
// based assignment + SLA due-time stamping) and the ticket_created
// automations through intake.ts, and an inbound message runs the
// message_received automations — every intake path comes through
// createTicket/appendTicketMessage, so no path bypasses the engines.
// The hooks are fail-soft: an engine failure never fails an intake.
// ============================================================================

import { routeNewTicket, runTicketAutomations } from "./intake"
import { resolveSupportContact } from "./parties"

export type SupportRequesterType =
  | "customer" | "employee" | "seller" | "vet" | "pharmacy" | "franchise" | "external"

/** Ticket categories = the desk's departments. */
// The category vocabulary IS the support_categories table (11 active
// master codes, read firsthand 2026-10-14; support_tickets.category is an
// FK to it). This union previously carried only 6 of the 11 codes, so
// intakes for the other five could not be typed — extended to the full
// active set when the brand opt-out intake filed its first 'legal' claim.
// 'feedback' joined the table in migration 20261079 (feedback pattern —
// submissions file here from src/lib/feedback.ts). 'contact' joined
// 2026-10-24 (owner directive: every contact form submission opens
// the chat here — filed from src/lib/contact-desk.ts).
export type SupportCategory = "general" | "billing" | "technical" | "seller_support" | "payments" | "dmca" | "chargeback" | "privacy_request" | "trust_safety" | "legal" | "law_enforcement" | "feedback" | "contact"
export const SUPPORT_CATEGORIES: SupportCategory[] = [
  "general", "billing", "technical", "seller_support", "payments", "dmca",
  "chargeback", "privacy_request", "trust_safety", "legal", "law_enforcement",
  "feedback", "contact",
]

export type SupportTicketStatus = "open" | "pending" | "resolved" | "closed"
export type SupportPriority = "low" | "normal" | "high" | "urgent"

export interface SupportTicket {
  id: string
  tenantId: string
  ticketRef: string
  requesterType: SupportRequesterType
  requesterCustomerId: string | null
  requesterStaffId: string | null
  requesterSellerId: string | null
  requesterUserId: string | null
  requesterName: string | null
  requesterEmail: string | null
  requesterPhone: string | null
  contactId: string | null
  organizationId: string | null
  subject: string
  category: SupportCategory
  status: SupportTicketStatus
  priority: SupportPriority
  assignedStaffId: string | null
  conversationId: string
  metadata: Record<string, unknown>
  firstPublicReplyAt: string | null
  mergedIntoId: string | null
  lastMessageAt: string | null
  resolvedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

const TICKET_COLS = `
  id::text AS id, tenant_id::text AS tenant_id, ticket_ref, requester_type,
  requester_customer_id::text AS requester_customer_id,
  requester_staff_id::text AS requester_staff_id,
  requester_seller_id::text AS requester_seller_id,
  requester_user_id::text AS requester_user_id,
  requester_name, requester_email, requester_phone,
  contact_id::text AS contact_id, organization_id::text AS organization_id,
  subject, category, status, priority,
  assigned_staff_id::text AS assigned_staff_id,
  conversation_id::text AS conversation_id, metadata,
  first_public_reply_at::text AS first_public_reply_at,
  merged_into_id::text AS merged_into_id,
  last_message_at::text AS last_message_at,
  resolved_at::text AS resolved_at, closed_at::text AS closed_at,
  created_at::text AS created_at, updated_at::text AS updated_at`

export function mapTicket(r: any): SupportTicket {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    ticketRef: r.ticket_ref,
    requesterType: r.requester_type,
    requesterCustomerId: r.requester_customer_id ?? null,
    requesterStaffId: r.requester_staff_id ?? null,
    requesterSellerId: r.requester_seller_id ?? null,
    requesterUserId: r.requester_user_id ?? null,
    requesterName: r.requester_name ?? null,
    requesterEmail: r.requester_email ?? null,
    requesterPhone: r.requester_phone ?? null,
    contactId: r.contact_id ?? null,
    organizationId: r.organization_id ?? null,
    subject: r.subject,
    category: r.category,
    status: r.status,
    priority: r.priority,
    assignedStaffId: r.assigned_staff_id ?? null,
    conversationId: r.conversation_id,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    firstPublicReplyAt: r.first_public_reply_at ?? null,
    mergedIntoId: r.merged_into_id ?? null,
    lastMessageAt: r.last_message_at ?? null,
    resolvedAt: r.resolved_at ?? null,
    closedAt: r.closed_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** A ticket subject from a first message: its first line, trimmed. */
export function subjectFromText(text: string, fallback = "Support conversation"): string {
  const line = String(text || "").split("\n").map((s) => s.trim()).find(Boolean) || ""
  if (!line) return fallback
  return line.length > 80 ? `${line.slice(0, 77)}…` : line
}

export async function findOpenTicketForCustomer(
  client: any, tenant: string, customerId: string,
): Promise<SupportTicket | null> {
  const r = await client.query(
    `SELECT ${TICKET_COLS} FROM public.support_tickets
      WHERE tenant_id = $1 AND requester_customer_id = $2::uuid
        AND status IN ('open','pending')
      ORDER BY created_at ASC LIMIT 1`,
    [tenant, customerId],
  )
  return r.rows[0] ? mapTicket(r.rows[0]) : null
}

export async function getTicketById(
  client: any, tenant: string, ticketId: string,
): Promise<SupportTicket | null> {
  const r = await client.query(
    `SELECT ${TICKET_COLS} FROM public.support_tickets
      WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
    [tenant, ticketId],
  )
  return r.rows[0] ? mapTicket(r.rows[0]) : null
}

/**
 * The same read WITHOUT the tenant predicate (§5): the caller is
 * grants.ts, which admits the row only when an ACTIVE access grant
 * names the caller's tenant — the tenant check happens there, against
 * the grants table, never by skipping it.
 */
export async function getTicketByIdAnyTenant(
  client: any, ticketId: string,
): Promise<SupportTicket | null> {
  const r = await client.query(
    `SELECT ${TICKET_COLS} FROM public.support_tickets
      WHERE id = $1::uuid LIMIT 1`,
    [ticketId],
  )
  return r.rows[0] ? mapTicket(r.rows[0]) : null
}

export interface CreateTicketInput {
  requesterType: SupportRequesterType
  requesterCustomerId?: string | null
  requesterStaffId?: string | null
  requesterSellerId?: string | null
  requesterUserId?: string | null
  requesterName?: string | null
  requesterEmail?: string | null
  /** §2 party snapshot: phone / locale / timezone as the intake knows
   *  them. The phone also feeds §1 contact resolution (SMS callers). */
  requesterPhone?: string | null
  requesterLocale?: string | null
  requesterTimezone?: string | null
  /** §1 linkage: an explicit contact wins; otherwise the requester is
   *  resolved (find-or-create) at creation — see parties.ts. */
  contactId?: string | null
  organizationId?: string | null
  subject: string
  category?: SupportCategory
  priority?: SupportPriority
  /** Conversation channel for the crm_conversations row (chat default). */
  channel?: string
  metadata?: Record<string, unknown>
}

export async function createTicket(
  client: any, tenant: string, input: CreateTicketInput,
): Promise<SupportTicket> {
  // The conversation is a REAL crm_conversations row: crm_messages has a
  // composite FK (tenant_id, conversation_id) → crm_conversations, so
  // the thread must exist before any message can attach to it. The
  // ticket owns the conversation 1:1 for its whole life.
  const conv = await client.query(
    `INSERT INTO public.crm_conversations
       (id, tenant_id, customer_id, channel, status, subject, last_message_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2::uuid, $3, 'open', $4, now(), now(), now())
     RETURNING id::text AS id`,
    [tenant, input.requesterCustomerId ?? null, input.channel ?? "chat", input.subject],
  )
  const conversationId = conv.rows[0].id
  // §1 PARTIES linkage: resolve the requester to a support_contacts row
  // (find-or-create over the schema's identity indexes) and stamp
  // contact_id on the ticket. Fail-soft by the intake contract — a
  // contact failure never loses the ticket; the row stands on its typed
  // requester FKs exactly as before.
  let contactId = input.contactId ?? null
  if (!contactId) {
    const contact = await resolveSupportContact(client, tenant, {
      email: input.requesterEmail ?? null,
      phone: input.requesterPhone ?? null,
      displayName: input.requesterName ?? null,
      customerId: input.requesterCustomerId ?? null,
      staffId: input.requesterStaffId ?? null,
      sellerId: input.requesterSellerId ?? null,
      locale: input.requesterLocale ?? null,
      timezone: input.requesterTimezone ?? null,
    }).catch(() => null)
    contactId = contact?.id ?? null
  }
  // B14 repair (pre-existing defect, verified identical at the B13
  // tip): this VALUES clause carried 19 placeholders for 18 params
  // and 23 expressions for 22 columns (subject cast ::uuid, metadata
  // on a ::uuid slot, $19 unbound) — the statement could never
  // execute. Clause realigned to the column list; nothing else here
  // changed.
  const r = await client.query(
    `INSERT INTO public.support_tickets
       (id, tenant_id, requester_type, requester_customer_id, requester_staff_id,
        requester_seller_id, requester_user_id, requester_name, requester_email,
        requester_phone, requester_locale, requester_timezone,
        contact_id, organization_id,
        subject, category, priority, conversation_id, metadata, last_message_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
             $7, $8, $9, $10, $11, $12, $13::uuid, $14,
             $15, $16, $17::uuid, $18::jsonb, now(), now(), now())
     RETURNING ${TICKET_COLS}`,
    [
      tenant, input.requesterType,
      input.requesterCustomerId ?? null, input.requesterStaffId ?? null,
      input.requesterSellerId ?? null, input.requesterUserId ?? null,
      input.requesterName ?? null, input.requesterEmail ?? null,
      input.requesterPhone ?? null, input.requesterLocale ?? null,
      input.requesterTimezone ?? null,
      contactId, input.organizationId ?? null,
      input.subject, input.category ?? "general", input.priority ?? "normal",
      conversationId, JSON.stringify(input.metadata ?? {}),
    ],
  )
  const ticket = mapTicket(r.rows[0])
  await logTicketEvent(client, tenant, ticket.id, {
    type: "created",
    actorLabel: input.requesterName || input.requesterEmail || input.requesterType,
    detail: { requesterType: input.requesterType, category: ticket.category },
  }).catch(() => {})
  // Routing + SLA stamping + ticket_created automations (fail-soft —
  // the returned row is the as-created ticket; routing's writes land
  // on the stored row and its events).
  await routeNewTicket(client, tenant, ticket.id).catch(() => {})
  return ticket
}

/** The customer's current support ticket, created on first contact. */
export async function getOrCreateCustomerTicket(
  client: any, tenant: string,
  customer: { id: string; name: string | null; email: string | null },
  subjectHint: string,
): Promise<{ ticket: SupportTicket; created: boolean }> {
  const existing = await findOpenTicketForCustomer(client, tenant, customer.id)
  if (existing) return { ticket: existing, created: false }
  const ticket = await createTicket(client, tenant, {
    requesterType: "customer",
    requesterCustomerId: customer.id,
    requesterName: customer.name,
    requesterEmail: customer.email,
    subject: subjectFromText(subjectHint),
  })
  return { ticket, created: true }
}

export interface AppendMessageInput {
  customerId?: string | null
  channel: string
  direction: "inbound" | "outbound"
  status: string
  fromAddress?: string | null
  toAddress?: string | null
  subject?: string | null
  body: string
  createdBy?: string | null
  metadata?: Record<string, unknown>
  /** §3 channel fields (email ingest + threaded outbound). All optional;
   *  existing writers stamp none of them. externalMessageId is the
   *  idempotent-ingest key — the partial unique index on
   *  (tenant_id, channel, external_message_id) refuses a redelivery. */
  externalMessageId?: string | null
  rfc822MessageId?: string | null
  inReplyTo?: string | null
  emailReferences?: string[]
  ccAddresses?: string[]
  bccAddresses?: string[]
  bodyText?: string | null
  bodyHtml?: string | null
  deliveryStatus?: string | null
  bounceReason?: string | null
  provider?: string | null
  providerMessageId?: string | null
  isAutoReply?: boolean
  isSystemGenerated?: boolean
  rawSourceRef?: string | null
}

/** Write one conversation row onto the ticket and stamp the ticket. */
export async function appendTicketMessage(
  client: any, tenant: string, ticket: SupportTicket, input: AppendMessageInput,
): Promise<{ id: string; at: string }> {
  const ins = await client.query(
    `INSERT INTO public.crm_messages
       (id, tenant_id, conversation_id, customer_id, channel, direction, status,
        from_address, to_address, subject, body, metadata, created_by, sent_at, created_at,
        external_message_id, rfc822_message_id, in_reply_to, email_references,
        cc_addresses, bcc_addresses, body_text, body_html, quoted_content_stripped,
        delivery_status, bounce_reason, provider, provider_message_id,
        is_auto_reply, is_system_generated, raw_source_ref)
     VALUES (gen_random_uuid(), $1, $2::uuid, $3::uuid, $4, $5, $6,
             $7, $8, $9, $10, $11::jsonb, $12::uuid, now(), now(),
             $13, $14, $15, $16::text[], $17::text[], $18::text[], $19, $20, false,
             $21, $22, $23, $24, $25, $26, $27)
     RETURNING id::text AS id, created_at::text AS at`,
    [
      tenant, ticket.conversationId, input.customerId ?? null, input.channel,
      input.direction, input.status, input.fromAddress ?? null,
      input.toAddress ?? null, input.subject ?? ticket.subject, input.body,
      JSON.stringify(input.metadata ?? {}), input.createdBy ?? null,
      input.externalMessageId ?? null, input.rfc822MessageId ?? null,
      input.inReplyTo ?? null, input.emailReferences ?? [],
      input.ccAddresses ?? [], input.bccAddresses ?? [],
      input.bodyText ?? null, input.bodyHtml ?? null,
      input.deliveryStatus ?? null, input.bounceReason ?? null,
      input.provider ?? null, input.providerMessageId ?? null,
      input.isAutoReply ?? false, input.isSystemGenerated ?? false,
      input.rawSourceRef ?? null,
    ],
  )
  await client.query(
    `UPDATE public.support_tickets
        SET last_message_at = now(), updated_at = now(),
            last_requester_reply_at = CASE WHEN $2 = 'inbound' THEN now() ELSE last_requester_reply_at END
      WHERE id = $1::uuid`,
    [ticket.id, input.direction],
  )
  // Keep the designed conversation row's activity stamp truthful too.
  await client.query(
    `UPDATE public.crm_conversations SET last_message_at = now(), updated_at = now() WHERE id = $1::uuid`,
    [ticket.conversationId],
  ).catch(() => {})
  // A message RECEIVED from the requester runs the message_received
  // automations (fail-soft). Outbound staff writes do not — the trigger
  // is the requester's move, not ours.
  if (input.direction === "inbound") {
    await runTicketAutomations(client, tenant, ticket.id, "message_received").catch(() => {})
  }
  return { id: ins.rows[0].id, at: ins.rows[0].at }
}

/** Append-only ticket audit trail — every lifecycle event, dated. */
export async function logTicketEvent(
  client: any,
  tenant: string,
  ticketId: string,
  e: { type: string; actorStaffId?: string | null; actorLabel?: string | null; detail?: Record<string, unknown> },
): Promise<string | null> {
  const r = await client.query(
    `INSERT INTO public.support_ticket_events
       (tenant_id, ticket_id, actor_staff_id, actor_label, event_type, detail)
     VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6::jsonb)
     RETURNING id::text AS id`,
    [tenant, ticketId, e.actorStaffId ?? null, e.actorLabel ?? null, e.type, JSON.stringify(e.detail ?? {})],
  )
  const eventId = (r.rows[0]?.id as string) ?? null
  // §16 outbound webhooks: every ticket event fans out to the
  // tenant's subscribed registrations (delivery + consumer job).
  // Fail-soft by the emission contract — a webhook failure never
  // fails the event that was just written.
  try {
    const { emitTicketEventWebhooks } = await import("./webhooks")
    await emitTicketEventWebhooks(client, tenant, {
      ticketId, eventId, eventType: e.type, detail: e.detail ?? {},
    })
  } catch { /* the trail is the record; webhooks ride it */ }
  return eventId
}

export async function listTicketEvents(client: any, ticketId: string) {
  const r = await client.query(
    `SELECT id::text AS id, event_type, actor_label, detail, created_at::text AS at
       FROM public.support_ticket_events
      WHERE ticket_id = $1::uuid
      ORDER BY created_at ASC
      LIMIT 500`,
    [ticketId],
  )
  return r.rows.map((e: any) => ({
    id: e.id, type: e.event_type, actorLabel: e.actor_label ?? null,
    detail: e.detail ?? {}, at: e.at,
  }))
}

/**
 * The conversation on a ticket, oldest first.
 *
 * Internal notes (staff-only, conventional ticketing pattern) are
 * crm_messages rows with metadata.internal_note = true and customer_id
 * NULL. Requester-facing reads must exclude them — pass includeInternal
 * only from the staff desk. (The customer thread reads by customer_id,
 * so NULL-customer internal notes can never surface there either.)
 */
export async function listTicketMessages(
  client: any, ticket: SupportTicket, opts: { includeInternal?: boolean } = {},
) {
  const r = await client.query(
    `SELECT id::text AS id, direction, channel, status, body, subject,
            from_address, metadata, COALESCE(sent_at, created_at)::text AS at
       FROM public.crm_messages
      WHERE conversation_id = $1::uuid
        AND ($2::boolean OR NOT (metadata @> '{"internal_note":true}'::jsonb))
        AND ($2::boolean OR NOT (metadata @> '{"presend_held":true}'::jsonb))
      ORDER BY COALESCE(sent_at, created_at) ASC, created_at ASC
      LIMIT 500`,
    [ticket.conversationId, !!opts.includeInternal],
  )
  return r.rows.map((m: any) => ({
    id: m.id,
    from: m.direction === "inbound" ? "requester" : "support",
    direction: m.direction,
    channel: m.channel,
    status: m.status,
    text: m.body || m.subject || "",
    subject: m.subject ?? null,
    fromAddress: m.from_address ?? null,
    internal: (m.metadata as any)?.internal_note === true,
    // §16 pre-send: staff reads see the held/undone state; requester
    // reads never receive these rows at all (the predicate above).
    presend: (m.metadata as any)?.presend
      ? {
          state: String((m.metadata as any).presend.state ?? ""),
          heldUntil: (m.metadata as any).presend.held_until ?? null,
        }
      : null,
    at: m.at,
  }))
}

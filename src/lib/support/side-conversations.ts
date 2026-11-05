import { logTicketEvent } from "./tickets"

// ============================================================================
// §14 SIDE CONVERSATIONS (support-gaps build) — a linked secondary
// thread on a ticket with its OWN participants (staff by FK, external
// people by email), invisible to the requester.
//
// The store (20261073) was designed from the tree's §14 text — the
// tree names no column list, so this is the smallest honest shape:
// conversation (subject, open/closed), participants, messages.
//
// INVISIBILITY IS STRUCTURAL: requester reads (the customer thread,
// attachments, CSAT) never touch these tables; the desk reads side
// conversations only through this lib's own surface. The ticket's
// events trail carries the lifecycle (opened / replied / closed) as
// 'system' events with a side_conversation discriminator — the
// event_type CHECK is a closed vocabulary with no side_conversation
// member, and widening the desk's shared CHECK for one feature is
// the larger change; the payload carries the type instead. Message
// BODIES never land on the events trail — the trail records that the
// thread moved, not what it said (§14: content stays in the thread).
// ============================================================================

export class SideConversationError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export interface SideParticipant {
  id: string
  staffId: string | null
  email: string | null
  addedByStaffId: string | null
  createdAt: string
}

export interface SideMessage {
  id: string
  authorStaffId: string | null
  authorLabel: string | null
  body: string
  createdAt: string
}

export interface SideConversation {
  id: string
  ticketId: string
  subject: string
  status: "open" | "closed"
  createdByStaffId: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  participants: SideParticipant[]
  messages: SideMessage[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Lifecycle rides the ticket's events trail. logTicketEvent throws on
 * failure (firsthand read — it is NOT fail-soft), and the thread row
 * is the record here, so a trail failure is swallowed rather than
 * failing a write that already landed — the notification path's
 * fail-soft doctrine, applied locally.
 */
async function rideEvent(
  client: any, tenantId: string, ticketId: string,
  actor: { staffId: string; label: string },
  detail: Record<string, unknown>,
) {
  try {
    await logTicketEvent(client, tenantId, ticketId, {
      type: "system",
      actorStaffId: actor.staffId,
      actorLabel: actor.label,
      detail,
    })
  } catch {
    /* the trail is a ride-along; the thread is the record */
  }
}

async function assertTicket(client: any, tenantId: string, ticketId: string) {
  const r = await client.query(
    `SELECT id::text AS id FROM public.support_tickets WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, ticketId],
  )
  if (!r.rows[0]) throw new SideConversationError("ticket not found", 404)
}

async function assertStaff(client: any, tenantId: string, staffId: string): Promise<{ id: string; label: string }> {
  const r = await client.query(
    `SELECT id::text AS id,
            COALESCE(display_name, NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), email) AS label
       FROM public.crm_staff WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, staffId],
  )
  if (!r.rows[0]) throw new SideConversationError("staff participant not found in this tenant", 400)
  return r.rows[0]
}

async function loadSide(client: any, tenantId: string, id: string): Promise<SideConversation | null> {
  const head = await client.query(
    `SELECT id::text AS id, ticket_id::text AS ticket_id, subject, status,
            created_by_staff_id::text AS created_by_staff_id,
            created_at::text AS created_at, updated_at::text AS updated_at,
            closed_at::text AS closed_at
       FROM public.support_side_conversations
      WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, id],
  )
  if (!head.rows[0]) return null
  const h = head.rows[0]
  const [parts, msgs] = await Promise.all([
    client.query(
      `SELECT id::text AS id, staff_id::text AS staff_id, email,
              added_by_staff_id::text AS added_by_staff_id, created_at::text AS created_at
         FROM public.support_side_conversation_participants
        WHERE tenant_id = $1::uuid AND side_conversation_id = $2::uuid
        ORDER BY created_at ASC`,
      [tenantId, id],
    ),
    client.query(
      `SELECT id::text AS id, author_staff_id::text AS author_staff_id,
              author_label, body, created_at::text AS created_at
         FROM public.support_side_conversation_messages
        WHERE tenant_id = $1::uuid AND side_conversation_id = $2::uuid
        ORDER BY created_at ASC LIMIT 500`,
      [tenantId, id],
    ),
  ])
  return {
    id: h.id,
    ticketId: h.ticket_id,
    subject: h.subject,
    status: h.status,
    createdByStaffId: h.created_by_staff_id ?? null,
    createdAt: h.created_at,
    updatedAt: h.updated_at,
    closedAt: h.closed_at ?? null,
    participants: parts.rows.map((p: any) => ({
      id: p.id, staffId: p.staff_id ?? null, email: p.email ?? null,
      addedByStaffId: p.added_by_staff_id ?? null, createdAt: p.created_at,
    })),
    messages: msgs.rows.map((m: any) => ({
      id: m.id, authorStaffId: m.author_staff_id ?? null,
      authorLabel: m.author_label ?? null, body: m.body, createdAt: m.created_at,
    })),
  }
}

export async function listSideConversations(
  client: any, tenantId: string, ticketId: string,
): Promise<SideConversation[]> {
  const r = await client.query(
    `SELECT id::text AS id FROM public.support_side_conversations
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid
      ORDER BY created_at ASC`,
    [tenantId, ticketId],
  )
  const out: SideConversation[] = []
  for (const row of r.rows) {
    const s = await loadSide(client, tenantId, row.id)
    if (s) out.push(s)
  }
  return out
}

export async function getSideConversation(
  client: any, tenantId: string, id: string,
): Promise<SideConversation | null> {
  return loadSide(client, tenantId, id)
}

export interface OpenSideInput {
  subject: string
  body: string
  staffIds?: string[]
  emails?: string[]
}

/** Open a side conversation on a ticket. The creator is always a
 *  participant; the opening message opens the thread. */
export async function openSideConversation(
  client: any, tenantId: string, ticketId: string,
  actor: { staffId: string; label: string },
  input: OpenSideInput,
): Promise<SideConversation> {
  const subject = String(input.subject || "").trim()
  const body = String(input.body || "").trim()
  if (!subject) throw new SideConversationError("a subject is required")
  if (!body) throw new SideConversationError("an opening message is required")
  await assertTicket(client, tenantId, ticketId)

  // Validate every participant BEFORE writing anything.
  const staff: { id: string; label: string }[] = []
  for (const sid of input.staffIds ?? []) {
    if (sid === actor.staffId) continue
    staff.push(await assertStaff(client, tenantId, sid))
  }
  const emails: string[] = []
  for (const e of input.emails ?? []) {
    const email = String(e || "").trim().toLowerCase()
    if (!EMAIL_RE.test(email)) throw new SideConversationError(`'${e}' is not an email address`)
    if (!emails.includes(email)) emails.push(email)
  }

  const ins = await client.query(
    `INSERT INTO public.support_side_conversations
       (tenant_id, ticket_id, subject, created_by_staff_id)
     VALUES ($1::uuid, $2::uuid, $3, $4::uuid)
     RETURNING id::text AS id`,
    [tenantId, ticketId, subject, actor.staffId],
  )
  const sideId = ins.rows[0].id as string
  const addPart = async (staffId: string | null, email: string | null) => {
    await client.query(
      `INSERT INTO public.support_side_conversation_participants
         (tenant_id, side_conversation_id, staff_id, email, added_by_staff_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid)
       ON CONFLICT DO NOTHING`,
      [tenantId, sideId, staffId, email, actor.staffId],
    )
  }
  await addPart(actor.staffId, null)
  for (const s of staff) await addPart(s.id, null)
  for (const e of emails) await addPart(null, e)
  await client.query(
    `INSERT INTO public.support_side_conversation_messages
       (tenant_id, side_conversation_id, author_staff_id, author_label, body)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)`,
    [tenantId, sideId, actor.staffId, actor.label, body],
  )
  await rideEvent(client, tenantId, ticketId, actor, {
    kind: "side_conversation_opened", sideConversationId: sideId, subject,
  })
  const out = await loadSide(client, tenantId, sideId)
  if (!out) throw new SideConversationError("side conversation vanished on write", 500)
  return out
}

export async function replySideConversation(
  client: any, tenantId: string, sideId: string,
  actor: { staffId: string; label: string },
  body: string,
): Promise<SideConversation> {
  const text = String(body || "").trim()
  if (!text) throw new SideConversationError("a message body is required")
  const side = await loadSide(client, tenantId, sideId)
  if (!side) throw new SideConversationError("side conversation not found", 404)
  if (side.status !== "open") throw new SideConversationError("this side conversation is closed", 409)
  await client.query(
    `INSERT INTO public.support_side_conversation_messages
       (tenant_id, side_conversation_id, author_staff_id, author_label, body)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)`,
    [tenantId, sideId, actor.staffId, actor.label, text],
  )
  await client.query(
    `UPDATE public.support_side_conversations
        SET updated_at = now(), row_version = row_version + 1
      WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, sideId],
  )
  await rideEvent(client, tenantId, side.ticketId, actor, {
    kind: "side_conversation_replied", sideConversationId: sideId,
  })
  const out = await loadSide(client, tenantId, sideId)
  if (!out) throw new SideConversationError("side conversation vanished on write", 500)
  return out
}

export async function addSideParticipant(
  client: any, tenantId: string, sideId: string,
  actor: { staffId: string; label: string },
  input: { staffId?: string; email?: string },
): Promise<SideConversation> {
  const side = await loadSide(client, tenantId, sideId)
  if (!side) throw new SideConversationError("side conversation not found", 404)
  if (side.status !== "open") throw new SideConversationError("this side conversation is closed", 409)
  let staffId: string | null = null
  let email: string | null = null
  if (input.staffId) {
    staffId = (await assertStaff(client, tenantId, input.staffId)).id
  } else if (input.email) {
    email = String(input.email).trim().toLowerCase()
    if (!EMAIL_RE.test(email)) throw new SideConversationError(`'${input.email}' is not an email address`)
  } else {
    throw new SideConversationError("a staffId or an email is required")
  }
  await client.query(
    `INSERT INTO public.support_side_conversation_participants
       (tenant_id, side_conversation_id, staff_id, email, added_by_staff_id)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid)
     ON CONFLICT DO NOTHING`,
    [tenantId, sideId, staffId, email, actor.staffId],
  )
  await rideEvent(client, tenantId, side.ticketId, actor, {
    kind: "side_conversation_participant_added", sideConversationId: sideId, staffId, email,
  })
  const out = await loadSide(client, tenantId, sideId)
  if (!out) throw new SideConversationError("side conversation vanished on write", 500)
  return out
}

export async function closeSideConversation(
  client: any, tenantId: string, sideId: string,
  actor: { staffId: string; label: string },
): Promise<SideConversation> {
  const side = await loadSide(client, tenantId, sideId)
  if (!side) throw new SideConversationError("side conversation not found", 404)
  if (side.status !== "open") throw new SideConversationError("this side conversation is already closed", 409)
  await client.query(
    `UPDATE public.support_side_conversations
        SET status = 'closed', closed_at = now(), updated_at = now(),
            row_version = row_version + 1
      WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, sideId],
  )
  await rideEvent(client, tenantId, side.ticketId, actor, {
    kind: "side_conversation_closed", sideConversationId: sideId,
  })
  const out = await loadSide(client, tenantId, sideId)
  if (!out) throw new SideConversationError("side conversation vanished on write", 500)
  return out
}

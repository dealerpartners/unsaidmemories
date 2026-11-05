import { getTicketById, logTicketEvent, type SupportTicket } from "./tickets"
import { notifyTicketReplyDetailed } from "./notify"
import { registerThreadKeys } from "./channels"
import { maybeSendSmsReply } from "./twilio"

// ============================================================================
// §16 PRE-SEND CONTROLS (support-gaps build) — the gates a desk reply
// passes BEFORE it leaves, in the desk ticket send path:
//
//   CC ALLOW-LIST — a reply may carry CC recipients only when every
//   recipient is on the tenant's support CC allow-list
//   (policy_settings scope 'support', key 'presend_cc_allow_list' —
//   a JSON array of addresses or domains, read tenant-first with the
//   master fallback, the retention schedule's idiom). No list
//   configured = CC is not permitted at all: the control fails
//   CLOSED, the send is refused with the offending recipients named,
//   and nothing is written. A configured list admits exact addresses
//   and bare/@ domains. Enforcement is a refusal, never a silent
//   strip — the sender sees exactly what was rejected and why.
//
//   UNDO WINDOW — when 'presend_undo_seconds' (same scope) is set
//   and > 0, a reply is first written HELD: a crm_messages row in
//   the store's own 'queued' status carrying metadata.presend
//   {state:'held', held_until}. While held it is invisible to every
//   requester read (listTicketMessages excludes presend-held rows
//   except on staff reads; the customer messages route excludes them
//   in its own query) and NONE of the notification legs have run.
//   The desk can undo it (state 'undone' — never released, never
//   requester-visible) until it is released: release flips the row
//   to 'sent' and runs the legs. Release happens lazily on the desk
//   ticket read, in the support sweep, and on demand — whichever
//   comes first after held_until. Undo vs release is one conditional
//   UPDATE on the held state, so exactly one of them wins.
//
//   THE LEGS — bell + email + thread keys + SMS — are the route's
//   long-standing block, extracted here as dispatchReplyNotifications
//   so the immediate path and the release path run the identical
//   code. The CC list validated above is stamped on the conversation
//   row (cc_addresses) at write time; the Resend send helper takes
//   no cc parameter today, so transport-level CC is that helper's
//   named seam — the row is the record of who was cleared to copy.
// ============================================================================

export class PresendError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export interface PresendConfig {
  ccAllowList: string[] | null
  undoSeconds: number
  source: "tenant" | "master" | null
}

export async function loadPresendConfig(
  client: any, tenantId: string, masterTenantId?: string | null,
): Promise<PresendConfig> {
  const read = async (tid: string) => {
    const r = await client.query(
      `SELECT key, value FROM public.policy_settings
        WHERE scope = 'support' AND tenant_id = $1::uuid
          AND key IN ('presend_cc_allow_list', 'presend_undo_seconds')`,
      [tid],
    ).catch(() => ({ rows: [] as any[] }))
    return r.rows as any[]
  }
  let rows = await read(tenantId)
  let source: PresendConfig["source"] = rows.length ? "tenant" : null
  if (!rows.length && masterTenantId && masterTenantId !== tenantId) {
    rows = await read(masterTenantId)
    if (rows.length) source = "master"
  }
  let ccAllowList: string[] | null = null
  let undoSeconds = 0
  for (const r of rows) {
    if (r.key === "presend_cc_allow_list") {
      try {
        const v = JSON.parse(String(r.value))
        if (Array.isArray(v)) {
          ccAllowList = v.map((x) => String(x).trim().toLowerCase()).filter(Boolean)
        }
      } catch { /* a malformed list admits nobody — fail closed */ ccAllowList = [] }
    }
    if (r.key === "presend_undo_seconds") {
      const n = Number.parseInt(String(r.value), 10)
      if (Number.isFinite(n) && n > 0) undoSeconds = Math.min(n, 3600)
    }
  }
  return { ccAllowList, undoSeconds, source }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeCcList(raw: unknown): string[] {
  if (raw === undefined || raw === null) return []
  const items = Array.isArray(raw) ? raw : String(raw).split(",")
  const out: string[] = []
  for (const v of items) {
    const e = String(v || "").trim().toLowerCase()
    if (!e) continue
    if (!EMAIL_RE.test(e)) throw new PresendError(`'${v}' is not an email address`)
    if (!out.includes(e)) out.push(e)
  }
  return out
}

function ccAdmitted(allowList: string[], email: string): boolean {
  const domain = email.split("@")[1] || ""
  return allowList.some((entry) => {
    const e = entry.replace(/^@/, "")
    return e === email || e === domain
  })
}

/** Gate: every CC recipient must be admitted by the allow-list. */
export function checkCcRecipients(
  config: PresendConfig, cc: string[],
): { ok: true } | { ok: false; rejected: string[]; reason: string } {
  if (!cc.length) return { ok: true }
  if (!config.ccAllowList || !config.ccAllowList.length) {
    return {
      ok: false,
      rejected: cc,
      reason: "CC is not permitted: no support CC allow-list is configured for this tenant (policy_settings scope 'support', key 'presend_cc_allow_list')",
    }
  }
  const rejected = cc.filter((e) => !ccAdmitted(config.ccAllowList as string[], e))
  if (rejected.length) {
    return {
      ok: false,
      rejected,
      reason: `CC recipient(s) not on the support CC allow-list: ${rejected.join(", ")}`,
    }
  }
  return { ok: true }
}

// ── The notification legs (immediate path + release path) ────────────

export interface ReplyDispatchResult {
  bell: boolean
  emailed: boolean
  sms: unknown
}

export async function dispatchReplyNotifications(
  client: any, tenant: string, ticket: SupportTicket,
  msg: { id: string; body: string },
): Promise<ReplyDispatchResult> {
  let bell = false
  if (ticket.requesterType === "customer" && ticket.requesterCustomerId) {
    const link = await client.query(
      `SELECT source_customer_id::text AS scid FROM public.crm_customers WHERE id = $1::uuid AND tenant_id = $2`,
      [ticket.requesterCustomerId, tenant],
    )
    const shopCustomerId = link.rows[0]?.scid ?? null
    if (shopCustomerId) {
      await client.query(
        `INSERT INTO public.customer_notifications
           (id, tenant_id, "customerId", type, title, body, link, "relatedId", "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, 'message', $3,
                 'Support replied to your ticket — read it in Support.',
                 '/customer/support', $4, now())`,
        [tenant, shopCustomerId, ticket.subject, msg.id],
      ).then(() => { bell = true }).catch(() => {})
    }
  }
  const lastInbound = await client.query(
    `SELECT rfc822_message_id FROM public.crm_messages
      WHERE conversation_id = $1::uuid AND direction = 'inbound' AND rfc822_message_id IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`,
    [ticket.conversationId],
  ).catch(() => ({ rows: [] as any[] }))
  const sentMail = await notifyTicketReplyDetailed(ticket, msg.body, {
    inReplyToId: lastInbound.rows[0]?.rfc822_message_id ?? null,
  })
  const emailed = sentMail.sent
  if (sentMail.messageId) {
    await client.query(
      `UPDATE public.crm_messages SET provider = 'resend', provider_message_id = $2 WHERE id = $1::uuid`,
      [msg.id, sentMail.messageId],
    ).catch(() => {})
  }
  await registerThreadKeys(client, tenant, ticket.conversationId, [ticket.ticketRef])
  const sms = await maybeSendSmsReply(client, ticket, msg.body)
  return { bell, emailed, sms }
}

// ── Held replies: release + undo ─────────────────────────────────────

export interface HeldReplyRow {
  id: string
  body: string
  heldUntil: string | null
  state: string | null
}

/** Release every due held reply for a tenant. Returns what released. */
export async function releaseDueHeldReplies(
  client: any, tenantId: string, limit = 50,
): Promise<{ released: { messageId: string; ticketId: string }[] }> {
  const due = await client.query(
    `SELECT m.id::text AS id, m.body, t.id::text AS ticket_id
       FROM public.crm_messages m
       JOIN public.support_tickets t
         ON t.conversation_id = m.conversation_id AND t.tenant_id = m.tenant_id
      WHERE m.tenant_id = $1::uuid AND m.status = 'queued'
        AND m.metadata @> '{"presend_held":true}'::jsonb
        AND m.metadata->'presend'->>'state' = 'held'
        AND (m.metadata->'presend'->>'held_until')::timestamptz <= now()
      ORDER BY m.created_at ASC LIMIT $2`,
    [tenantId, Math.max(1, Math.floor(limit))],
  )
  const released: { messageId: string; ticketId: string }[] = []
  for (const row of due.rows as any[]) {
    // One conditional flip: if an undo landed first, this matches
    // nothing and the reply stays unreleased.
    const flip = await client.query(
      `UPDATE public.crm_messages
          SET status = 'sent', sent_at = now(),
              metadata = jsonb_set(
                jsonb_set(metadata, '{presend,state}', '"sent"'),
                '{presend_held}', 'false') ||
                jsonb_build_object('presend_released_at', to_jsonb(now()))
        WHERE id = $1::uuid AND status = 'queued'
          AND metadata->'presend'->>'state' = 'held'
        RETURNING id::text AS id`,
      [row.id],
    )
    if (!flip.rows[0]) continue
    const ticket = await getTicketById(client, tenantId, row.ticket_id).catch(() => null)
    if (ticket) {
      await dispatchReplyNotifications(client, tenantId, ticket, { id: row.id, body: row.body }).catch(() => null)
      await logTicketEvent(client, tenantId, ticket.id, {
        type: "system",
        detail: { kind: "reply_send_released", messageId: row.id },
      }).catch(() => {})
    }
    released.push({ messageId: row.id, ticketId: row.ticket_id })
  }
  return { released }
}

/**
 * Undo a held reply inside its window. Exactly one of undo/release
 * wins (both are conditional on the held state). Returns the undone
 * message id, or null when the reply is not in a held state.
 */
export async function undoHeldReply(
  client: any, tenantId: string, ticket: SupportTicket, messageId: string,
  actor: { staffId: string | null; label: string | null },
): Promise<boolean> {
  const r = await client.query(
    `UPDATE public.crm_messages
        SET metadata = jsonb_set(metadata, '{presend,state}', '"undone"') ||
              jsonb_build_object('presend_undone_at', to_jsonb(now()),
                                 'presend_undone_by', to_jsonb($3::text))
      WHERE id = $1::uuid AND tenant_id = $2::uuid AND conversation_id = $4::uuid
        AND status = 'queued' AND metadata->'presend'->>'state' = 'held'
      RETURNING id::text AS id`,
    [messageId, tenantId, actor.staffId ?? actor.label ?? "support_desk", ticket.conversationId],
  )
  if (!r.rows[0]) return false
  await logTicketEvent(client, tenantId, ticket.id, {
    type: "system", actorStaffId: actor.staffId, actorLabel: actor.label,
    detail: { kind: "reply_send_undone", messageId },
  }).catch(() => {})
  return true
}

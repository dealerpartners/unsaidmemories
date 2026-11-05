// ============================================================================
// §3 CHANNELS — inbound email ingest + address routing + thread discipline.
//
// The desk's email round trip: mail arrives at a tenant's support
// addresses (support@ / privacy@ / compliance@ / legal@ / dmca@ / …),
// files into the SAME ticket spine the portals write to, and desk
// replies go back out through Resend carrying a Reply-To that routes
// the answer straight back here.
//
// Design rules honored throughout:
//  - The receiving ADDRESS classifies the intake, via the tenant's
//    support_channels config (B1's §10 store — the admin sees and edits
//    the map; there is no hardcoded local-part chain in this file).
//  - Threading matches in order: stored message ids (References /
//    In-Reply-To) → channel thread keys (support_channel_threads) →
//    the subject's [SUP-n] token. Sender sanity is required on the
//    token paths; message ids are unguessable and stand on their own.
//  - Idempotent ingest: (tenant, channel, external_message_id) is a
//    partial unique index — a redelivery lands ONCE.
//  - Inbound mail is NEVER silently dropped: anything that cannot be
//    filed (unparseable, blocked, bounce-shaped, unknown domain) is
//    held as an email_ingest_retry job row in failed state — the §13
//    quarantine B11's ops surface reads.
// ============================================================================

import crypto from "crypto"
import {
  appendTicketMessage, createTicket, getTicketById, logTicketEvent,
  subjectFromText, type SupportCategory, type SupportTicket,
} from "./tickets"
import { findSupportContact } from "./parties"
import { appendTakedownLog } from "./regulated"
import { TENANT_ID } from "@/lib/crm/enterprise"

// ── Message-id normalization ────────────────────────────────────────
// Stored rfc822 ids are kept bracket-free + lowercase so a reply's
// References chain compares cleanly no matter how the sender's client
// formatted the header.
export function normalizeMsgId(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = String(raw).replace(/[<>\s]/g, "").toLowerCase()
  return v || null
}

/** Split a References header into normalized ids, oldest first. */
export function parseReferences(raw: string | null | undefined): string[] {
  if (!raw) return []
  const out: string[] = []
  for (const part of String(raw).split(/\s+/)) {
    const n = normalizeMsgId(part)
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

/** "Display Name <a@b>" or bare "a@b" → { email (lowercase), name }. */
export function parseFromHeader(raw: string | null | undefined): { email: string | null; name: string | null } {
  if (!raw) return { email: null, name: null }
  const s = String(raw).trim()
  const angle = s.match(/^(.*?)\s*<([^<>]+)>\s*$/)
  if (angle) {
    const email = angle[2].trim().toLowerCase()
    const name = angle[1].trim().replace(/^"|"$/g, "") || null
    return { email: email.includes("@") ? email : null, name }
  }
  const bare = s.toLowerCase()
  return { email: bare.includes("@") && !/\s/.test(bare) ? bare : null, name: null }
}

/** Any address-list shape (string, comma list, array) → lowercase emails. */
export function parseAddressList(raw: unknown): string[] {
  const out: string[] = []
  const push = (v: unknown) => {
    if (typeof v !== "string") return
    for (const part of v.split(",")) {
      const { email } = parseFromHeader(part)
      if (email && !out.includes(email)) out.push(email)
    }
  }
  if (Array.isArray(raw)) raw.forEach(push)
  else push(raw)
  return out
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@")
  return at > 0 ? email.slice(at + 1).toLowerCase() : null
}

function localPartOf(email: string): string {
  const at = email.lastIndexOf("@")
  return (at > 0 ? email.slice(0, at) : email).toLowerCase()
}

/** support+SUP-0123@x → { base: 'support', token: 'SUP-0123' } */
function plusParts(email: string): { base: string; token: string | null } {
  const local = localPartOf(email)
  const plus = local.indexOf("+")
  if (plus < 0) return { base: local, token: null }
  return { base: local.slice(0, plus), token: local.slice(plus + 1) || null }
}

// ── HTML sanitizing (conservative stripper — stored mail is rendered
// back to staff, so active content must not survive storage). Removes
// script/style/iframe/object/embed/form/base blocks wholesale, event
// handler attributes, and javascript:/data: URLs. It is deliberately a
// stripper, not a parser: anything ambiguous loses the attribute.
export function sanitizeEmailHtml(html: string | null | undefined): string | null {
  if (!html) return null
  let out = String(html)
  out = out.replace(/<(script|style|iframe|object|embed|form|noscript|template|base|link|meta)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
  out = out.replace(/<(script|style|iframe|object|embed|form|base|link|meta)\b[^>]*\/?>/gi, "")
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  out = out.replace(/\s(href|src|xlink:href)\s*=\s*(["'])\s*(javascript:|data:text\/html)/gi, " $1=$2#blocked:")
  out = out.replace(/\s(href|src)\s*=\s*(javascript:|data:text\/html)/gi, " $1=#blocked")
  return out.trim() ? out : null
}

/** A text body from HTML when the mail carried no plain part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

// ── Parsed inbound shape (the normalizer's output; the route builds
// it from the provider payload, the pipeline consumes only this).
export interface ParsedInboundEmail {
  fromAddress: string | null
  fromName: string | null
  toAddresses: string[]
  ccAddresses: string[]
  bccAddresses: string[]
  subject: string | null
  text: string | null
  html: string | null
  /** Author's Message-ID, normalized. */
  rfc822MessageId: string | null
  inReplyTo: string | null
  references: string[]
  /** Provider delivery id (the dedupe key); falls back to the rfc822 id. */
  externalId: string | null
  provider: string
  /** Pointer to the provider-side raw record (never the content). */
  rawRef: string | null
  autoSubmitted: boolean
  contentType: string | null
}

// ── §10 channel config: tenant resolution + address routing ─────────

interface ChannelRow {
  tenant_id: string | null
  scope: string
  sending_domain: string | null
  allow_list: unknown
  block_list: unknown
  spam_quarantine: boolean | null
  reopen_window_days: number | null
  config: Record<string, any> | null
}

async function emailChannelRows(client: any): Promise<ChannelRow[]> {
  const r = await client.query(
    `SELECT tenant_id::text AS tenant_id, scope, sending_domain,
            allow_list, block_list, spam_quarantine, reopen_window_days, config
       FROM public.support_channels
      WHERE code = 'email' AND is_active = true
      ORDER BY (scope = 'tenant') DESC, created_at ASC`,
  ).catch(() => ({ rows: [] as any[] }))
  return r.rows as ChannelRow[]
}

function rowDomains(row: ChannelRow): string[] {
  const out: string[] = []
  if (row.sending_domain) out.push(row.sending_domain.toLowerCase())
  const extra = row.config?.inbound_domains
  if (Array.isArray(extra)) for (const d of extra) if (typeof d === "string") out.push(d.toLowerCase())
  return out
}

/** The domain inbound mail is addressed to for threading replies:
 *  the operator's explicit setting, else the site host. */
export function supportInboundDomain(): string {
  const env = (process.env.SUPPORT_INBOUND_DOMAIN || "").trim().toLowerCase()
  if (env) return env
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://unsaidmemories.com").hostname
    return host.toLowerCase()
  } catch {
    return "unsaidmemories.com"
  }
}

/** The Reply-To a desk answer carries: replies land back on the thread. */
export function supportThreadAddress(ticketRef: string, domain = supportInboundDomain()): string {
  return `support+${ticketRef}@${domain}`
}

/**
 * Which tenant owns the receiving domain? A tenant-scope channel row
 * wins; a master-scope row (or the platform's own inbound domain)
 * resolves to the master tenant — the SMS route's platform-number
 * rule, one channel over. Null = no tenant claims this mail.
 */
export async function resolveInboundTenant(
  client: any, toAddresses: string[],
): Promise<{ tenantId: string | null; via: string }> {
  const domains = [...new Set(toAddresses.map(domainOf).filter(Boolean) as string[])]
  if (!domains.length) return { tenantId: null, via: "no_recipient_domain" }
  const rows = await emailChannelRows(client)
  for (const row of rows) {
    if (row.scope !== "tenant" || !row.tenant_id) continue
    if (rowDomains(row).some((d) => domains.includes(d))) {
      return { tenantId: row.tenant_id, via: "tenant_channel_domain" }
    }
  }
  for (const row of rows) {
    if (row.scope !== "master") continue
    if (rowDomains(row).some((d) => domains.includes(d))) {
      return { tenantId: TENANT_ID(), via: "master_channel_domain" }
    }
  }
  if (domains.includes(supportInboundDomain())) {
    return { tenantId: TENANT_ID(), via: "platform_inbound_domain" }
  }
  return { tenantId: null, via: "unknown_domain" }
}

export interface AddressRouting {
  found: boolean
  routes: Record<string, string>
  defaultCategory: string
  spamQuarantine: boolean
  blockList: string[]
  allowList: string[]
  allowListEnforced: boolean
  reopenWindowDays: number
  sendingDomain: string | null
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x) => typeof x === "string").map((x) => x.toLowerCase())
}

/**
 * The tenant's address routing, from its §10 email channel row
 * (tenant scope first, master scope as the inherited default — §0's
 * resolution order). config shape (admin-edited through B1's surface):
 *   { address_routes: { "privacy": "privacy_request", ... },
 *     default_category: "general", inbound_domains: [...],
 *     allow_list_enforced: false }
 */
export async function getAddressRouting(client: any, tenantId: string): Promise<AddressRouting> {
  const rows = await emailChannelRows(client)
  const row = rows.find((r) => r.scope === "tenant" && r.tenant_id === tenantId)
    ?? rows.find((r) => r.scope === "master")
    ?? null
  const cfg = (row?.config ?? {}) as Record<string, any>
  const routes: Record<string, string> = {}
  if (cfg.address_routes && typeof cfg.address_routes === "object") {
    for (const [k, v] of Object.entries(cfg.address_routes)) {
      if (typeof v === "string") routes[k.toLowerCase()] = v
    }
  }
  return {
    found: !!row,
    routes,
    defaultCategory: typeof cfg.default_category === "string" ? cfg.default_category : "general",
    spamQuarantine: row?.spam_quarantine === true,
    blockList: strList(row?.block_list),
    allowList: strList(row?.allow_list),
    allowListEnforced: cfg.allow_list_enforced === true,
    reopenWindowDays: typeof row?.reopen_window_days === "number" ? row.reopen_window_days : 14,
    sendingDomain: row?.sending_domain ?? null,
  }
}

/** Categories a route may name = the live, active category codes. */
async function validCategory(client: any, code: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM public.support_categories WHERE code = $1 AND is_active = true LIMIT 1`,
    [code],
  ).catch(() => ({ rows: [] as any[] }))
  return r.rows.length > 0
}

function listHit(list: string[], fromAddress: string): boolean {
  const domain = domainOf(fromAddress)
  return list.some((e) => e === fromAddress || (domain !== null && e === domain))
}

// ── §13 quarantine: the held-mail ledger row ────────────────────────

export async function recordIngestHold(
  client: any,
  args: {
    tenantId: string | null
    reason: string
    parsed: ParsedInboundEmail
  },
): Promise<string | null> {
  const { parsed } = args
  const payload = {
    source: "email_ingest",
    reason: args.reason,
    from: parsed.fromAddress,
    from_name: parsed.fromName,
    to: parsed.toAddresses,
    subject: parsed.subject,
    external_id: parsed.externalId,
    rfc822_message_id: parsed.rfc822MessageId,
    provider: parsed.provider,
    raw_ref: parsed.rawRef,
    body_excerpt: (parsed.text || (parsed.html ? htmlToText(parsed.html) : "")).slice(0, 500) || null,
    held_at: new Date().toISOString(),
  }
  const r = await client.query(
    `INSERT INTO public.support_jobs
       (tenant_id, type, status, attempts, max_attempts, started_at, finished_at, last_error, payload)
     VALUES ($1::uuid, 'email_ingest_retry', 'failed', 1, 3, now(), now(), $2, $3::jsonb)
     RETURNING id::text AS id`,
    [args.tenantId, args.reason.slice(0, 500), JSON.stringify(payload)],
  ).catch(() => ({ rows: [] as any[] }))
  return r.rows[0]?.id ?? null
}

// ── Thread keys ─────────────────────────────────────────────────────

export async function registerThreadKeys(
  client: any, tenantId: string, conversationId: string, keys: string[],
): Promise<void> {
  for (const key of keys) {
    const k = key?.trim()
    if (!k) continue
    await client.query(
      `INSERT INTO public.support_channel_threads (tenant_id, channel, thread_key, conversation_id)
       VALUES ($1::uuid, 'email', $2, $3::uuid)
       ON CONFLICT (tenant_id, channel, thread_key) DO NOTHING`,
      [tenantId, k, conversationId],
    ).catch(() => {})
  }
}

async function ticketByConversation(client: any, tenantId: string, conversationId: string): Promise<SupportTicket | null> {
  const r = await client.query(
    `SELECT id::text AS id FROM public.support_tickets
      WHERE tenant_id = $1::uuid AND conversation_id = $2::uuid AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [tenantId, conversationId],
  )
  if (!r.rows[0]) return null
  return getTicketById(client, tenantId, r.rows[0].id)
}

/**
 * Thread matching, in the tree's order. Returns the ticket + how it
 * matched. Sender sanity is enforced on the token paths (subject ref,
 * plus-token): those keys are guessable, so the sender must be the
 * ticket's requester. Message-id matches stand on the ids themselves.
 */
export async function findEmailThread(
  client: any, tenantId: string, parsed: ParsedInboundEmail,
): Promise<{ ticket: SupportTicket; via: string } | null> {
  // 1. References / In-Reply-To against stored ids (either direction:
  //    an inbound's own rfc822 id, or an outbound's provider id).
  const refs: string[] = []
  if (parsed.inReplyTo) refs.push(parsed.inReplyTo)
  for (let i = parsed.references.length - 1; i >= 0; i--) {
    if (!refs.includes(parsed.references[i])) refs.push(parsed.references[i])
  }
  if (refs.length) {
    const r = await client.query(
      `SELECT conversation_id::text AS conversation_id FROM public.crm_messages
        WHERE tenant_id = $1::uuid
          AND (lower(regexp_replace(COALESCE(rfc822_message_id, ''), '[<>\\s]', '', 'g')) = ANY($2::text[])
               OR lower(COALESCE(provider_message_id, '')) = ANY($2::text[]))
        ORDER BY created_at DESC LIMIT 1`,
      [tenantId, refs],
    ).catch(() => ({ rows: [] as any[] }))
    if (r.rows[0]) {
      const t = await ticketByConversation(client, tenantId, r.rows[0].conversation_id)
      if (t) return { ticket: t, via: "message_id" }
    }
  }

  // Sender-gated paths from here: the ticket the key names must
  // belong to this sender.
  const senderOk = (t: SupportTicket) =>
    !!parsed.fromAddress && (t.requesterEmail ?? "").toLowerCase() === parsed.fromAddress

  // 2. Channel thread keys: the plus-token in the receiving address,
  //    then the thread root reference.
  const keyCandidates: string[] = []
  for (const to of parsed.toAddresses) {
    const { token } = plusParts(to)
    if (token) keyCandidates.push(token.toUpperCase())
  }
  if (parsed.references.length) keyCandidates.push(parsed.references[0])
  if (parsed.rfc822MessageId) keyCandidates.push(parsed.rfc822MessageId)
  for (const key of keyCandidates) {
    const r = await client.query(
      `SELECT conversation_id::text AS conversation_id FROM public.support_channel_threads
        WHERE tenant_id = $1::uuid AND channel = 'email' AND thread_key = $2 LIMIT 1`,
      [tenantId, key],
    ).catch(() => ({ rows: [] as any[] }))
    if (r.rows[0]) {
      const t = await ticketByConversation(client, tenantId, r.rows[0].conversation_id)
      if (t && senderOk(t)) return { ticket: t, via: "thread_key" }
    }
  }

  // 3. The subject's [SUP-n] token — the platform's standing key.
  const subjRef = (parsed.subject || "").match(/\bSUP-\d+\b/i)?.[0]?.toUpperCase()
  if (subjRef) {
    const r = await client.query(
      `SELECT id::text AS id FROM public.support_tickets
        WHERE tenant_id = $1::uuid AND ticket_ref = $2 AND deleted_at IS NULL LIMIT 1`,
      [tenantId, subjRef],
    ).catch(() => ({ rows: [] as any[] }))
    if (r.rows[0]) {
      const t = await getTicketById(client, tenantId, r.rows[0].id)
      if (t && senderOk(t)) return { ticket: t, via: "subject_ref" }
    }
  }
  return null
}

// ── The pipeline ────────────────────────────────────────────────────

export type IngestOutcome =
  | { outcome: "filed_new"; ticket: SupportTicket; messageId: string }
  | { outcome: "threaded"; ticket: SupportTicket; messageId: string; via: string; reopened: boolean }
  | { outcome: "duplicate"; ticketRef: string | null; messageId: string }
  | { outcome: "held"; jobId: string | null; reason: string }

const BOUNCE_LOCALS = new Set(["mailer-daemon", "postmaster", "mail-delivery", "delivery-daemon"])
const BOUNCE_SUBJECT = /^(delivery status|delivery failure|undeliverable|mail delivery|failure notice|returned mail|delivery has failed)/i

export function bounceShaped(parsed: ParsedInboundEmail): boolean {
  if (!parsed.fromAddress) return false
  if (BOUNCE_LOCALS.has(localPartOf(parsed.fromAddress).split("+")[0])) return true
  if (parsed.subject && BOUNCE_SUBJECT.test(parsed.subject.trim())) return true
  if (parsed.contentType && /multipart\/report/i.test(parsed.contentType)) return true
  return false
}

export async function ingestInboundEmail(
  client: any, tenantId: string, parsed: ParsedInboundEmail,
): Promise<IngestOutcome> {
  const hold = async (reason: string): Promise<IngestOutcome> => ({
    outcome: "held", reason,
    jobId: await recordIngestHold(client, { tenantId, reason, parsed }),
  })

  // Identity first: mail we cannot attribute or dedupe cannot file.
  if (!parsed.fromAddress) return hold("unparseable_no_sender")
  if (!parsed.text && !parsed.html) return hold("unparseable_no_body")
  if (!parsed.externalId) return hold("missing_message_identity")

  // Dedupe: the same delivery presented twice lands once.
  const dup = await client.query(
    `SELECT id::text AS id, conversation_id::text AS conversation_id
       FROM public.crm_messages
      WHERE tenant_id = $1::uuid AND channel = 'email' AND external_message_id = $2
      LIMIT 1`,
    [tenantId, parsed.externalId],
  ).catch(() => ({ rows: [] as any[] }))
  if (dup.rows[0]) {
    const t = await ticketByConversation(client, tenantId, dup.rows[0].conversation_id)
    return { outcome: "duplicate", ticketRef: t?.ticketRef ?? null, messageId: dup.rows[0].id }
  }

  const routing = await getAddressRouting(client, tenantId)
  if (listHit(routing.blockList, parsed.fromAddress)) return hold("sender_blocked")
  if (routing.allowListEnforced && routing.allowList.length && !listHit(routing.allowList, parsed.fromAddress)) {
    return hold("sender_not_on_allow_list")
  }
  if (bounceShaped(parsed)) return hold("bounce_or_complaint_shape")

  const bodyText = parsed.text || (parsed.html ? htmlToText(parsed.html) : "")
  const bodyHtml = sanitizeEmailHtml(parsed.html)
  const stamp = {
    externalMessageId: parsed.externalId,
    rfc822MessageId: parsed.rfc822MessageId,
    inReplyTo: parsed.inReplyTo,
    emailReferences: parsed.references,
    ccAddresses: parsed.ccAddresses,
    bccAddresses: parsed.bccAddresses,
    bodyText: bodyText || null,
    bodyHtml,
    deliveryStatus: "delivered",
    provider: parsed.provider,
    isAutoReply: parsed.autoSubmitted,
    rawSourceRef: parsed.rawRef,
  }

  // Thread onto an existing ticket when the mail answers one.
  const thread = await findEmailThread(client, tenantId, parsed)
  if (thread) {
    const { ticket, via } = thread
    try {
      const msg = await appendTicketMessage(client, tenantId, ticket, {
        customerId: ticket.requesterCustomerId ?? null,
        channel: "email",
        direction: "inbound",
        status: "received",
        fromAddress: parsed.fromAddress,
        toAddress: parsed.toAddresses[0] ?? null,
        subject: parsed.subject ?? ticket.subject,
        body: bodyText,
        metadata: { source: "email_ingest", via },
        ...stamp,
      })
      // §2 reopen window: a reply to a resolved/closed ticket inside
      // the channel's window reopens it; outside, the reply still
      // lands on the thread and the desk sees the activity.
      let reopened = false
      if (ticket.status === "resolved" || ticket.status === "closed") {
        const lastActivity = new Date(ticket.updatedAt).getTime()
        if (Date.now() - lastActivity <= routing.reopenWindowDays * 86_400_000) {
          await client.query(
            `UPDATE public.support_tickets
                SET status = 'open', resolved_at = NULL, closed_at = NULL,
                    reopened_count = reopened_count + 1, reopened_at = now(), updated_at = now()
              WHERE id = $1::uuid`,
            [ticket.id],
          ).catch(() => {})
          await logTicketEvent(client, tenantId, ticket.id, {
            type: "reopened", actorLabel: parsed.fromAddress,
            detail: { via: "email_ingest", messageId: msg.id },
          }).catch(() => {})
          reopened = true
        }
      }
      await registerThreadKeys(client, tenantId, ticket.conversationId,
        [ticket.ticketRef, parsed.rfc822MessageId ?? ""])
      return { outcome: "threaded", ticket, messageId: msg.id, via, reopened }
    } catch (e: any) {
      if (String(e?.code) === "23505") {
        const again = await ticketByConversation(client, tenantId, ticket.conversationId)
        return { outcome: "duplicate", ticketRef: again?.ticketRef ?? ticket.ticketRef, messageId: "" }
      }
      throw e
    }
  }

  // Auto-replies with no thread to answer are daemon noise — held,
  // visible, never a ticket and never dropped.
  if (parsed.autoSubmitted) return hold("auto_reply_without_thread")

  // New ticket: the receiving address classifies the intake.
  const primaryTo = parsed.toAddresses[0] ?? ""
  const { base } = primaryTo ? plusParts(primaryTo) : { base: "" }
  let category = routing.routes[base] ?? routing.defaultCategory
  if (!(await validCategory(client, category))) category = "general"

  // Requester resolution through §1 parties: a known contact carries
  // its typed link (customer / staff / seller) onto the ticket. A
  // first-time sender whose address matches a CRM customer links the
  // same way the SMS intake links by phone — createTicket's contact
  // resolution then stamps the link onto the contact it creates.
  const contact = await findSupportContact(client, tenantId, { email: parsed.fromAddress }).catch(() => null)
  let customerId = contact?.customerId ?? null
  if (!customerId) {
    const cust = await client.query(
      `SELECT id::text AS id FROM public.crm_customers
        WHERE tenant_id = $1::uuid AND lower(email) = $2 LIMIT 1`,
      [tenantId, parsed.fromAddress],
    ).catch(() => ({ rows: [] as any[] }))
    customerId = cust.rows[0]?.id ?? null
  }
  const requesterType = customerId ? "customer"
    : contact?.staffId ? "employee"
    : contact?.sellerId ? "seller" : "external"

  const ticket = await createTicket(client, tenantId, {
    requesterType: requesterType as any,
    requesterCustomerId: customerId,
    requesterStaffId: contact?.staffId ?? null,
    requesterSellerId: contact?.sellerId ?? null,
    requesterName: parsed.fromName ?? contact?.displayName ?? null,
    requesterEmail: parsed.fromAddress,
    contactId: contact && contact.customerId ? contact.id : null,
    subject: parsed.subject?.trim() || subjectFromText(bodyText, "Email to support"),
    // The category union in tickets.ts predates the live category
    // table (B10's named staleness) — the FK accepts every seeded
    // code, so the cast is at this call site with the reason stated.
    category: category as SupportCategory,
    channel: "email",
    metadata: {
      source: "email_ingest",
      routed_address: primaryTo || null,
      routed_category: category,
      routed_via: routing.found ? "channel_config" : "default_intake",
      regulated_intake: category === "privacy_request" || category === "legal" || category === "dmca"
        ? category : undefined,
    },
  })

  const msg = await appendTicketMessage(client, tenantId, ticket, {
    customerId,
    channel: "email",
    direction: "inbound",
    status: "received",
    fromAddress: parsed.fromAddress,
    toAddress: primaryTo || null,
    subject: parsed.subject ?? ticket.subject,
    body: bodyText,
    metadata: { source: "email_ingest" },
    ...stamp,
  }).catch(async (e: any) => {
    if (String(e?.code) === "23505") return { id: "", at: "" }
    throw e
  })
  if (!msg.id) {
    // Lost a dedupe race on the message insert — the ticket stands
    // (visible, never lost); report the delivery as the duplicate.
    return { outcome: "duplicate", ticketRef: ticket.ticketRef, messageId: "" }
  }

  await registerThreadKeys(client, tenantId, ticket.conversationId,
    [ticket.ticketRef, parsed.rfc822MessageId ?? "", parsed.references[0] ?? ""])

  // Regulated side-effects at intake. DMCA has a public-intake
  // precedent (the form route opens dmca_details on receipt), so an
  // emailed notice opens its record too — honestly incomplete: an
  // email attests nothing, so the workflow opens at needs_info and
  // the desk requests the missing elements. Privacy/legal records
  // open at desk triage (their intake precedents require a declared
  // request type / a staff actor) — the routing stamp above is what
  // intake honestly knows.
  if (category === "dmca") {
    await fileEmailedDmcaNotice(client, tenantId, ticket, parsed, bodyText).catch(() => {})
  }

  return { outcome: "filed_new", ticket, messageId: msg.id }
}

/** dmca_details for an emailed notice, mirroring the form route's
 *  insert: known elements recorded, the rest counted missing. */
async function fileEmailedDmcaNotice(
  client: any, tenantId: string, ticket: SupportTicket,
  parsed: ParsedInboundEmail, bodyText: string,
): Promise<void> {
  const urls = [...new Set((bodyText.match(/https?:\/\/[^\s<>"')]+/g) ?? []).map((u) => u.replace(/[.,;]+$/, "")))]
  const missing: string[] = []
  if (!parsed.fromName) missing.push("complainant_name")
  missing.push("copyrighted_work_description", "good_faith_attestation", "perjury_attestation", "signature")
  if (!urls.length) missing.push("infringing_urls")
  const det = await client.query(
    `INSERT INTO public.dmca_details
       (tenant_id, ticket_id, notice_kind, received_via, complainant_name, complainant_email,
        complainant_address, complainant_phone, complainant_is_agent, represented_owner,
        signature_text, signed_at, copyrighted_work_description, copyrighted_work_url,
        infringing_urls, good_faith_attested, perjury_attested, elements_complete,
        missing_elements, workflow_status, acknowledged_at,
        notice_received_at, authorized_agent_for_owner, rights_owner_name, signature_kind)
     VALUES ($1, $2::uuid, 'takedown', 'email', $3, $4,
             NULL, NULL, false, NULL,
             NULL, NULL, NULL, NULL,
             $5::jsonb, false, false, false,
             $6::jsonb, 'needs_info', now(),
             now(), false, NULL, NULL)
     RETURNING id::text AS id`,
    [
      tenantId, ticket.id,
      parsed.fromName, parsed.fromAddress,
      JSON.stringify(urls), JSON.stringify(missing),
    ],
  )
  if (det.rows[0]) {
    await appendTakedownLog(client, tenantId, {
      ticketId: ticket.id,
      dmcaDetailsId: det.rows[0].id,
      action: "notice_received",
      detail: {
        elementsComplete: false,
        missingElements: missing,
        workflowStatus: "needs_info",
        receivedVia: "email",
      },
    }).catch(() => {})
  }
}

// ── Webhook signature (Svix scheme — Resend's webhook signing) ────
// secret: whsec_<base64>; signed content: `${id}.${timestamp}.${body}`;
// HMAC-SHA256, base64; the header carries one or more `v1,<sig>`.
export function verifyResendWebhookSignature(
  secret: string, svixId: string, svixTimestamp: string,
  svixSignature: string, rawBody: string, toleranceSec = 300,
): boolean {
  try {
    const ts = Number(svixTimestamp)
    if (!svixId || !Number.isFinite(ts)) return false
    if (Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
    const expected = crypto.createHmac("sha256", key)
      .update(`${svixId}.${svixTimestamp}.${rawBody}`).digest()
    for (const part of svixSignature.split(" ")) {
      const [version, sig] = part.split(",")
      if (version !== "v1" || !sig) continue
      const candidate = Buffer.from(sig, "base64")
      if (candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

/**
 * Normalize a provider payload into the parsed shape. Accepts both
 * the Resend `email.received` event (data carries addressing +
 * message_id; body fields present when the caller fetched the full
 * received email and merged them in) and a direct-body payload.
 */
export function normalizeInboundPayload(payload: any): ParsedInboundEmail {
  const d = (payload?.data && typeof payload.data === "object") ? payload.data : payload ?? {}
  const headers = (d.headers && typeof d.headers === "object") ? d.headers : {}
  const headerVal = (name: string): string | null => {
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === name) return Array.isArray(v) ? String(v[0]) : String(v)
    }
    return null
  }
  const from = parseFromHeader(typeof d.from === "string" ? d.from : null)
  const auto = headerVal("auto-submitted")
  const rfc822 = normalizeMsgId(d.message_id ?? headerVal("message-id"))
  const references = parseReferences(
    (Array.isArray(d.references) ? d.references.join(" ") : d.references) ?? headerVal("references"),
  )
  return {
    fromAddress: from.email,
    fromName: from.name,
    toAddresses: parseAddressList(d.to),
    ccAddresses: parseAddressList(d.cc),
    bccAddresses: parseAddressList(d.bcc),
    subject: typeof d.subject === "string" ? d.subject : null,
    text: typeof d.text === "string" ? d.text : null,
    html: typeof d.html === "string" ? d.html : null,
    rfc822MessageId: rfc822,
    inReplyTo: normalizeMsgId(d.in_reply_to ?? headerVal("in-reply-to")),
    references,
    externalId: (typeof d.email_id === "string" && d.email_id) || rfc822,
    provider: "resend",
    rawRef: typeof d.email_id === "string" && d.email_id ? `resend:receiving:${d.email_id}` : null,
    autoSubmitted: !!auto && auto.trim().toLowerCase() !== "no",
    contentType: headerVal("content-type"),
  }
}

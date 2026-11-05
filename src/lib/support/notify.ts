// Support Desk notification legs — the email suite wired to the ticket
// lifecycle (received / reply / reminder / resolved). Every send is
// best-effort: delivery failure is reported in the return value and
// NEVER fails the ticket action that triggered it (the pickup-email
// pattern). Email subjects carry the human ticket reference [SUP-n] —
// the conventional threading key.

import { sendEmail } from "@/lib/email"
import { toResendVariables } from "@/lib/email/resend-templates"
import { BRAND } from "@/lib/email/design"
import {
  supportTicketReceivedHtml,
  supportAgentReplyHtml,
  supportReminderHtml,
  supportResolvedHtml,
} from "@/lib/email/templates/support"
import { supportThreadAddress } from "./channels"
import type { SupportTicket } from "./tickets"

export function supportViewUrl(ticket: SupportTicket): string {
  switch (ticket.requesterType) {
    case "employee":
    case "franchise":
      return `${BRAND.url}/employee/messages`
    case "seller":
      return `${BRAND.url}/seller/communication/support`
    default:
      // The customer's conversation lives in their account, under
      // Help and care — the portal opens with this ticket's thread
      // selected. (Owner ruling, 2026-11-03: support belongs in the
      // portal, not on a separate public page.)
      return `${BRAND.url}/account/help?ticket=${ticket.ticketRef}`
  }
}

function base(ticket: SupportTicket) {
  return {
    firstName: ticket.requesterName?.split(/\s+/)[0] || undefined,
    ticketRef: ticket.ticketRef,
    subject: ticket.subject,
    viewUrl: supportViewUrl(ticket),
  }
}

export interface SupportSendResult {
  sent: boolean
  /** Resend's id for the delivered message — the desk stamps it on
   *  the outbound conversation row (provider_message_id), one of the
   *  ids a reply's References chain can match (§3 threading). */
  messageId: string | null
  /** The Reply-To every support send carries: the ticket's ingest
   *  thread address, so an email answer routes back to the thread. */
  replyTo: string
}

async function send(
  ticket: SupportTicket, template: string, subject: string, html: string,
  threading?: { inReplyTo?: string | null; references?: string | null },
  extraVars?: Record<string, unknown>,
): Promise<SupportSendResult> {
  const replyTo = supportThreadAddress(ticket.ticketRef)
  if (!ticket.requesterEmail) return { sent: false, messageId: null, replyTo }
  const headers: Record<string, string> = {}
  if (threading?.inReplyTo) headers["In-Reply-To"] = threading.inReplyTo
  if (threading?.references) headers["References"] = threading.references
  const r = await sendEmail({
    to: ticket.requesterEmail,
    template,
    subject,
    html,
    tenantId: ticket.tenantId,
    replyTo,
    // The hosted designs' tokens for every support send: the ticket
    // fields, plus the caller's extras (reply text, outcome).
    variables: toResendVariables({ ...base(ticket), ...(extraVars || {}) }),
    ...(Object.keys(headers).length ? { headers } : {}),
  }).catch(() => null)
  return { sent: !!r?.ok, messageId: r?.ok ? (r.messageId ?? null) : null, replyTo }
}

async function sendOk(
  ticket: SupportTicket, template: string, subject: string, html: string,
): Promise<boolean> {
  return (await send(ticket, template, subject, html)).sent
}

/** (i) Ticket received confirmation — fired on ticket creation. */
export async function notifyTicketReceived(ticket: SupportTicket): Promise<boolean> {
  return sendOk(
    ticket, "support_ticket_received",
    `We got your message [${ticket.ticketRef}]`,
    supportTicketReceivedHtml(base(ticket)),
  )
}

/** (ii) Agent reply notification — fired from the desk reply action. */
export async function notifyTicketReply(ticket: SupportTicket, replyText: string): Promise<boolean> {
  return (await notifyTicketReplyDetailed(ticket, replyText)).sent
}

/**
 * The desk reply send, with the full result: the caller stamps the
 * Resend id onto the outbound conversation row and registers the
 * thread key. Threading headers point at the requester's latest
 * inbound message id when the caller supplies it — the ids a reply
 * can match are the ones §3 ingest looks up.
 */
export async function notifyTicketReplyDetailed(
  ticket: SupportTicket, replyText: string,
  threading?: { inReplyToId?: string | null },
): Promise<SupportSendResult> {
  const inReplyTo = threading?.inReplyToId ? `<${threading.inReplyToId}>` : null
  return send(
    ticket, "support_agent_reply",
    `Re: ${ticket.subject} [${ticket.ticketRef}]`,
    supportAgentReplyHtml({ ...base(ticket), replyText }),
    { inReplyTo, references: inReplyTo },
    { replyText },
  )
}

/** (iii) Reminder — fired from the desk 'Send reminder' action. */
export async function notifyTicketReminder(ticket: SupportTicket): Promise<boolean> {
  return sendOk(
    ticket, "support_reminder",
    `Reminder: we're waiting to hear from you [${ticket.ticketRef}]`,
    supportReminderHtml(base(ticket)),
  )
}

/** (iv) Resolved/closed with the thank-you — fired on the transition. */
export async function notifyTicketResolved(
  ticket: SupportTicket, outcome: "resolved" | "closed",
): Promise<boolean> {
  return (await send(
    ticket, "support_resolved",
    `Your ticket is ${outcome} [${ticket.ticketRef}] — thank you`,
    supportResolvedHtml({ ...base(ticket), outcome }),
    undefined,
    { outcome },
  )).sent
}

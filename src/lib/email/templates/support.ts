// ---------------------------------------------------------------------------
// Support Desk emails — the ticket lifecycle suite (Sunny, 2026-10-13:
// "we need to build the emails for the support queue — that is the biggest
// gap"). One template per lifecycle event: received → agent reply →
// reminder (waiting on the requester) → resolved/closed with the
// thank-you. All carry the human ticket reference (SUP-n) — the same ref
// that threads email subjects — and link back to the requester's own
// support surface. Sent via Resend through sendEmail(); delivery failure
// never fails the ticket action that triggered the send.
// ---------------------------------------------------------------------------

import { BRAND, simpleEmail } from "../design"

export interface SupportMailData {
  firstName?: string
  ticketRef: string
  subject: string
  /** Absolute URL of the requester's support surface. */
  viewUrl?: string
}

const view = (d: SupportMailData) => d.viewUrl || `${BRAND.url}/customer/support`
const hello = (d: SupportMailData) => (d.firstName ? `Hi ${d.firstName},` : "Hi there,")

/** (i) Ticket RECEIVED — the requester's confirmation, with the reference. */
export function supportTicketReceivedHtml(d: SupportMailData): string {
  return simpleEmail({
    preheader: `We received your message — ticket ${d.ticketRef}`,
    eyebrowText: "Support",
    heading: "We got your message",
    paragraphs: [
      hello(d),
      `Thanks for reaching out. Your message is in our support queue as ticket <strong>${d.ticketRef}</strong> — a member of our team will reply here and in your support inbox. Keep the ticket reference handy; quoting it helps us find your conversation fast.`,
    ],
    rows: [
      { label: "Ticket", value: d.ticketRef },
      { label: "Subject", value: d.subject },
    ],
    cta: { href: view(d), label: "View your support conversation" },
    note: "This is email, not live chat — replies land as our team works the queue. You'll get another email when we respond.",
    reason: "You contacted UnSaid Memories support.",
  })
}

/** (ii) Agent REPLY notification — the reply text rides along. */
export function supportAgentReplyHtml(d: SupportMailData & { replyText: string }): string {
  return simpleEmail({
    preheader: `Support replied on ticket ${d.ticketRef}`,
    eyebrowText: "Support reply",
    heading: "We replied to your ticket",
    paragraphs: [
      hello(d),
      `Our support team replied on ticket <strong>${d.ticketRef}</strong> (${d.subject}):`,
      `<em>${d.replyText.replace(/\n/g, "<br/>")}</em>`,
      "You can read the full conversation and reply from your support inbox — just replying to this email works too if you include the ticket reference.",
    ],
    rows: [{ label: "Ticket", value: d.ticketRef }],
    cta: { href: view(d), label: "Open your support conversation" },
    reason: "You have an open support ticket with UnSaid Memories.",
  })
}

/** (iii) REMINDER — the ticket is waiting on the requester. */
export function supportReminderHtml(d: SupportMailData): string {
  return simpleEmail({
    preheader: `A quick nudge about ticket ${d.ticketRef}`,
    eyebrowText: "Support reminder",
    heading: "We're waiting to hear from you",
    paragraphs: [
      hello(d),
      `Your support ticket <strong>${d.ticketRef}</strong> (${d.subject}) is waiting on a reply from you. Whenever you're ready, add a message in your support inbox and we'll pick it right back up — no need to open a new ticket.`,
    ],
    rows: [{ label: "Ticket", value: d.ticketRef }],
    cta: { href: view(d), label: "Reply to your ticket" },
    note: "If everything's already sorted, just let us know in the thread and we'll close the ticket.",
    reason: "You have an open support ticket with UnSaid Memories.",
  })
}

/** (iv) RESOLVED / CLOSED — with the thank-you. */
export function supportResolvedHtml(d: SupportMailData & { outcome: "resolved" | "closed" }): string {
  return simpleEmail({
    preheader: `Ticket ${d.ticketRef} ${d.outcome} — thank you`,
    eyebrowText: "Support",
    heading: d.outcome === "resolved" ? "Your ticket is resolved" : "Your ticket is closed",
    paragraphs: [
      hello(d),
      `Ticket <strong>${d.ticketRef}</strong> (${d.subject}) is now ${d.outcome}. Thank you for reaching out — we appreciate you giving us the chance to make it right.`,
      "If anything else comes up, replying on the ticket reopens the conversation, or you can start a fresh one from your support inbox any time.",
    ],
    rows: [{ label: "Ticket", value: d.ticketRef }],
    cta: { href: view(d), label: "View your support conversation" },
    reason: "You had a support ticket with UnSaid Memories.",
  })
}

export const SAMPLE_SUPPORT_MAIL: SupportMailData & { replyText: string; outcome: "resolved" } = {
  firstName: "Alex",
  ticketRef: "SUP-1042",
  subject: "Question about my order",
  replyText: "Thanks for asking — we've shipped the replacement and it'll arrive Saturday.",
  outcome: "resolved",
}

// ---- Capture receipts (alerts pattern) -------------------------------------
// The contact form and the feedback form are support-desk captures, so
// their confirmations live with the desk suite. Both are sent through
// the alerts pattern (src/lib/notify.ts) the moment the capture lands.

/** Contact form receipt — /api/cms/messages (Help Center → Contact Us). */
export function contactReceivedHtml(d: { firstName?: string; ticketRef?: string }): string {
  return simpleEmail({
    preheader: "We received your message — it's in our support queue.",
    eyebrowText: "Contact us",
    heading: "We got your message",
    paragraphs: [
      d.firstName ? `Hi ${d.firstName},` : "Hi there,",
      "Thanks for reaching out to UnSaid Memories. Your message has been received and is in our support queue — it opened a conversation with our team, and we'll reply to this email address, usually within one business day.",
      ...(d.ticketRef
        ? [`Your reference is <strong>${d.ticketRef}</strong> — quote it if you write in about this.`]
        : []),
      "If it's urgent — an urgent order issue — please contact us instead of waiting on email.",
    ],
    ...(d.ticketRef ? { rows: [{ label: "Reference", value: d.ticketRef }] } : {}),
    cta: { href: `${BRAND.url}/faq`, label: "Browse the FAQ" },
    reason: "You sent a message through the UnSaid Memories contact form.",
  })
}

/** Feedback receipt — /api/feedback. Carries the desk ticket reference:
 *  feedback files into the Support Desk as its own category, so the
 *  submitter gets the same reference discipline as a ticket. */
export function feedbackReceivedHtml(d: { firstName?: string; ticketRef?: string }): string {
  return simpleEmail({
    preheader: "Thanks — your feedback is with our team.",
    eyebrowText: "Feedback",
    heading: "Thanks for the feedback",
    paragraphs: [
      d.firstName ? `Hi ${d.firstName},` : "Hi there,",
      "Your feedback just landed with our team — a human reads every note. If it needs a reply, we'll write back to this email address.",
      ...(d.ticketRef
        ? [`Your reference is <strong>${d.ticketRef}</strong> — quote it if you write in about this.`]
        : []),
    ],
    ...(d.ticketRef ? { rows: [{ label: "Reference", value: d.ticketRef }] } : {}),
    reason: "You shared feedback with UnSaid Memories.",
  })
}

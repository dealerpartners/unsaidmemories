// ---------------------------------------------------------------------------
// Document signature reminder (sent via Resend): backs the
// sys_run_unsigned_docs automation — one email per customer listing every
// document on their account still waiting for their signature.
//
// Extracted from reminders.ts when the pet-only reminder templates
// (rebooking / vaccine / pet birthday / win-back) were deleted alongside
// the pet email templates cleanup (FIX-AE). This is the one reminder
// automation the store still runs — it is not pet-specific.
// ---------------------------------------------------------------------------

import { button, detailsCard, eyebrow, frame, h1, p, esc } from "../design"
import { SITE_URL } from "../../site-url"

// ---- Unsigned documents ----------------------------------------------------------

export interface UnsignedDocItem {
  name: string
  documentType?: string
}

export interface UnsignedDocReminderData {
  customerName?: string
  items: UnsignedDocItem[]
}

export function unsignedDocReminderHtml(d: UnsignedDocReminderData): string {
  return frame({
    preheader: `A document on your account is waiting for your signature.`,
    nav: true,
    body: [
      eyebrow("Signature needed"),
      h1("A document is waiting for you"),
      p(d.customerName ? `Hi ${esc(d.customerName)},` : `Hi there,`),
      p(
        `Our records show the following document${d.items.length === 1 ? " is" : "s are"} still waiting for your signature. ` +
          `Signing keeps your file complete and your visits running smoothly.`,
      ),
      detailsCard(
        "Waiting for your signature",
        d.items.map((i) => ({
          label: i.name,
          value: i.documentType || "Signature requested",
        })),
      ),
      p(`Sign in to your account portal to review and sign — or mention it at your next visit and we'll walk you through it.`),
      button(`${SITE_URL}/customer/dashboard`, "Review & sign in my portal"),
      p(`Questions? Just reply to this email.`),
    ].join(""),
    reason: `You're receiving this because a document on your account is waiting for your signature.`,
  })
}

export const SAMPLE_UNSIGNED_DOC: UnsignedDocReminderData = {
  customerName: "Jamie",
  items: [{ name: "Standard Intake Form", documentType: "Intake form" }],
}

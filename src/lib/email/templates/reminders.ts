// ---------------------------------------------------------------------------
// Reminder automations (sent via Resend): rebooking win-back, vaccine due,
// and pet birthday messages. These back the admin quick actions
// sys-run-rebooking / sys-run-vaccine / sys-run-birthday — real sends
// through sendEmail(), one email per customer with everything due for
// that customer grouped into it.
// ---------------------------------------------------------------------------

import { button, detailsCard, eyebrow, frame, h1, p, esc } from "../design"
import { SITE_URL } from "../../site-url"

const BOOK_URL = `${SITE_URL}/book/appointment`

// ---- Rebooking (win-back) ----------------------------------------------------

export interface RebookingReminderData {
  customerName?: string
  /** Human label of the last completed visit, e.g. "August 12, 2026". */
  lastVisitLabel?: string | null
}

export function rebookingReminderHtml(d: RebookingReminderData): string {
  return frame({
    preheader: `It's been a while since your last visit — your pet's next groom is due.`,
    nav: true,
    body: [
      eyebrow("We miss you"),
      h1("Time for a fresh groom?"),
      p(d.customerName ? `Hi ${esc(d.customerName)},` : `Hi there,`),
      p(
        `It's been a while since your last visit${
          d.lastVisitLabel ? ` on <strong>${esc(d.lastVisitLabel)}</strong>` : ""
        }. Your pet is due for some pampering — book the next appointment and we'll take care of the rest.`,
      ),
      button(BOOK_URL, "Book an appointment"),
      p(`Prefer to talk it through? Call us at (901) 722-1114, or just reply to this email.`),
    ].join(""),
    reason: `You're receiving this because you visited All About Pawz and haven't booked your next appointment yet.`,
  })
}

export const SAMPLE_REBOOKING: RebookingReminderData = {
  customerName: "Jamie",
  lastVisitLabel: "August 12, 2026",
}

// ---- Vaccine due -------------------------------------------------------------

export interface VaccineDueItem {
  petName: string
  vaccineName: string
  /** Human label of the expiry date, e.g. "October 28, 2026". */
  expiresLabel: string
  overdue: boolean
}

export interface VaccineReminderData {
  customerName?: string
  items: VaccineDueItem[]
}

export function vaccineReminderHtml(d: VaccineReminderData): string {
  const anyOverdue = d.items.some((i) => i.overdue)
  return frame({
    preheader: anyOverdue
      ? `A vaccine on file has expired — book a visit to keep your pet protected.`
      : `A vaccine is coming due — book a visit to keep your pet protected.`,
    nav: true,
    body: [
      eyebrow("Vaccine reminder"),
      h1(anyOverdue ? "A vaccine needs attention" : "A vaccine is coming due"),
      p(d.customerName ? `Hi ${esc(d.customerName)},` : `Hi there,`),
      p(
        `Our records show the following vaccination${d.items.length === 1 ? " is" : "s are"} due. ` +
          `Keeping vaccines current protects your pet and keeps them eligible for grooming and boarding.`,
      ),
      detailsCard(
        "Coming due",
        d.items.map((i) => ({
          label: `${i.petName} — ${i.vaccineName}`,
          value: i.overdue ? `Expired ${i.expiresLabel}` : `Expires ${i.expiresLabel}`,
        })),
      ),
      p(`Book a visit and we'll get everything up to date — bring any records from your regular vet and we'll add them to your file.`),
      button(BOOK_URL, "Book an appointment"),
    ].join(""),
    reason: `You're receiving this because a vaccine on your pet's All About Pawz record is expiring soon.`,
  })
}

export const SAMPLE_VACCINE: VaccineReminderData = {
  customerName: "Jamie",
  items: [
    { petName: "Biscuit", vaccineName: "Rabies", expiresLabel: "October 28, 2026", overdue: false },
    { petName: "Biscuit", vaccineName: "Bordetella", expiresLabel: "October 2, 2026", overdue: true },
  ],
}

// ---- Pet birthday --------------------------------------------------------------

export interface BirthdayPetItem {
  petName: string
  /** Human label of the upcoming birthday, e.g. "Thursday, October 16". */
  dateLabel: string
}

export interface PetBirthdayData {
  customerName?: string
  pets: BirthdayPetItem[]
}

export function petBirthdayHtml(d: PetBirthdayData): string {
  const names = d.pets.map((pt) => pt.petName).join(" & ")
  return frame({
    preheader: `A birthday is coming up — ${names} deserves a treat.`,
    nav: true,
    body: [
      eyebrow("Happy birthday"),
      h1(`Happy birthday, ${esc(names)}!`),
      p(d.customerName ? `Hi ${esc(d.customerName)},` : `Hi there,`),
      p(
        d.pets.length === 1
          ? `<strong>${esc(d.pets[0].petName)}</strong> has a birthday coming up on <strong>${esc(d.pets[0].dateLabel)}</strong>. Here's a complimentary birthday treat on the next visit — book a birthday groom and we'll make it a party.`
          : `Birthdays are coming up at your house: ${d.pets
              .map((pt) => `<strong>${esc(pt.petName)}</strong> on <strong>${esc(pt.dateLabel)}</strong>`)
              .join(", ")}. Each birthday pet gets a complimentary treat on their next visit.`,
      ),
      button(BOOK_URL, "Book a birthday groom"),
      button(`${SITE_URL}/shop`, "Shop birthday treats", { tone: "ink" }),
    ].join(""),
    reason: `You're receiving this because a pet on your All About Pawz account has a birthday coming up.`,
  })
}

export const SAMPLE_BIRTHDAY: PetBirthdayData = {
  customerName: "Jamie",
  pets: [{ petName: "Biscuit", dateLabel: "Thursday, October 16" }],
}

// ---- Win-back (90+ days lapsed) ------------------------------------------------
// Backs sys_run_winback. NOTE: the note-only handler this replaces promised
// "15% off your next grooming" — no live coupon backs that discount (the only
// coupon under the master tenant, SAVE10, expired 2025-12-31 and its
// promotion doesn't resolve), so this email makes NO discount promise. If a
// real win-back promotion is ever configured, add its code here deliberately.

export interface WinbackOfferData {
  customerName?: string
  /** Human label of the last completed visit, e.g. "June 3, 2026". */
  lastVisitLabel?: string | null
}

export function winbackOfferHtml(d: WinbackOfferData): string {
  return frame({
    preheader: `It's been a while since your last visit — your pet is overdue for some pampering.`,
    nav: true,
    body: [
      eyebrow("We miss you"),
      h1("It's been a while"),
      p(d.customerName ? `Hi ${esc(d.customerName)},` : `Hi there,`),
      p(
        `We haven't seen you since your last visit${
          d.lastVisitLabel ? ` on <strong>${esc(d.lastVisitLabel)}</strong>` : ""
        } — that means your pet is overdue for a groom. Book a visit and we'll get them looking (and feeling) their best again.`,
      ),
      button(BOOK_URL, "Book an appointment"),
      p(`Prefer to talk it through? Call us at (901) 722-1114, or just reply to this email.`),
    ].join(""),
    reason: `You're receiving this because it's been over 90 days since your pet's last completed visit to All About Pawz.`,
  })
}

export const SAMPLE_WINBACK: WinbackOfferData = {
  customerName: "Jamie",
  lastVisitLabel: "June 3, 2026",
}

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
          `Signing keeps your pet's file complete and their visits running smoothly.`,
      ),
      detailsCard(
        "Waiting for your signature",
        d.items.map((i) => ({
          label: i.name,
          value: i.documentType || "Signature requested",
        })),
      ),
      p(`Sign in to your customer portal to review and sign — or mention it at your next visit and we'll walk you through it.`),
      button(`${SITE_URL}/customer/dashboard`, "Review & sign in my portal"),
      p(`Questions? Call us at (901) 722-1114, or just reply to this email.`),
    ].join(""),
    reason: `You're receiving this because a document on your All About Pawz account is waiting for your signature.`,
  })
}

export const SAMPLE_UNSIGNED_DOC: UnsignedDocReminderData = {
  customerName: "Jamie",
  items: [{ name: "Standard Intake Form", documentType: "Intake form" }],
}

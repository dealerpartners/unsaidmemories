// ---------------------------------------------------------------------------
// Appointments & booking emails (sent via Resend).
// Render functions take live data; SAMPLE_* constants feed the Template
// Studio previews and test sends.
// ---------------------------------------------------------------------------

import { BRAND, button, detailsCard, eyebrow, h1, noteBox, p, steps, taglineFlourish, frame, esc } from "../design"
import { SITE_URL } from "@/lib/site-url"

/** Where the pre-visit questionnaire lives — the customer's own
 *  appointments page carries the "Start questionnaire" action per
 *  booking. Every pre-check-in invitation points here. */
export const PRE_CHECK_IN_URL = `${SITE_URL}/customer/appointments`

/** The pre check-in invitation block — shared by the confirmation and
 *  recovery emails. Rendered ONLY when the sender knows the booking's
 *  questionnaire is not complete (the flag rides AppointmentData /
 *  AbandonedData); a customer who already did the steps never gets
 *  asked twice. */
export function preCheckInInviteHtml(dogName?: string): string {
  return [
    eyebrow("Before the visit — pre check-in", "sage"),
    p(
      `Five quick steps — matting, health, needs, behavior, and an emergency contact — so ${dogName ? `<strong style="color:#1a1a1a">${esc(dogName)}</strong>'s` : "your"} stylist has everything before the visit and check-in at the salon takes seconds.`,
    ),
    button(PRE_CHECK_IN_URL, "Complete pre check-in"),
  ].join("")
}

export interface AppointmentData {
  firstName: string
  dogName?: string
  service: string
  date: string
  time?: string
  notes?: string
  bookingRef?: string
  size?: string
  /** True when the booking's pre-visit questionnaire is already done —
   *  the pre check-in invitation is then omitted (never ask twice). */
  preCheckInComplete?: boolean
  /** Optional payment summary — rendered as a second card when the caller
   *  knows the amounts (deposit/paid-in-full confirmations). */
  payment?: {
    items: string[]
    total: string
    paid: string
    balance: string
    /** When the payment WAS the booking deposit, the deposit amount as
     *  actually collected (from the deposit record — never a template
     *  constant). Rendered as an explicit deposit acknowledgment. */
    deposit?: string
  }
}

function whenLabel(d: AppointmentData): string {
  return [d.date, d.time].filter(Boolean).join(" at ")
}

function serviceLabel(d: AppointmentData): string {
  return d.size ? `${d.service} (${d.size})` : d.service
}

function apptCard(title: string, d: AppointmentData, tone: "gold" | "brick" | "sage" = "gold"): string {
  return detailsCard(
    title,
    [
      ...(d.dogName ? [{ label: "Dog", value: esc(d.dogName) }] : []),
      { label: "Service", value: esc(serviceLabel(d)) },
      { label: "When", value: esc(whenLabel(d)) },
      { label: "Where", value: `${esc(BRAND.name)} · ${esc(BRAND.city)} · ${BRAND.phone}` },
      ...(d.bookingRef ? [{ label: "Booking ref", value: esc(d.bookingRef) }] : []),
    ],
    { tone }
  )
}

// ---- Booking confirmed (deposit paid) -----------------------------------------

export function bookingConfirmedHtml(d: AppointmentData): string {
  const balanceNum = parseFloat((d.payment?.balance || "0").replace(/[^0-9.]/g, ""))
  const depositPaid = d.payment?.deposit && balanceNum > 0 ? d.payment.deposit : null
  const paymentCard = d.payment
    ? detailsCard("Your payment", [
        ...(d.payment.items.length > 0
          ? [{ label: "Services", value: d.payment.items.map((l) => esc(l)).join("<br/>") }]
          : []),
        { label: "Total (with tax)", value: esc(d.payment.total) },
        { label: "Paid now", value: esc(d.payment.paid) },
        ...(depositPaid
          ? [{ label: "Deposit paid", value: `${esc(depositPaid)} — applied toward this appointment; it comes off your total` }]
          : []),
        {
          label: balanceNum > 0 ? "Balance at the salon" : "Paid in full",
          value: balanceNum > 0 ? esc(d.payment.balance) : "Nothing owed at the visit",
        },
      ])
    : ""
  return frame({
    preheader: `${d.dogName || "Your pup"}'s appointment is confirmed — everything you need to know.`,
    body: [
      eyebrow("Booking confirmed"),
      h1(`You're all set, ${esc(d.firstName)}!`),
      taglineFlourish(),
      p(
        `${d.dogName ? `<strong style="color:#1a1a1a">${esc(d.dogName)}</strong> is booked in` : "Your appointment is booked in"} for <strong style="color:#1a1a1a">${esc(serviceLabel(d))}</strong>${d.payment ? (depositPaid ? `. Your ${esc(depositPaid)} deposit is applied toward the groom — the balance is settled in the salon on the day` : "") : ". Your deposit is applied toward the groom — the balance is settled in the salon on the day"}.`,
      ),
      apptCard("Your appointment", d),
      paymentCard,
      d.preCheckInComplete ? "" : preCheckInInviteHtml(d.dogName),
      p(`Need a different time? You can reschedule from your portal up to 24 hours before — or just call us and we'll sort it out.`),
      button(BRAND.portalUrl, "Manage in my portal"),
      noteBox(`Arriving right on time keeps every pup's day running smoothly — please give us a 5-minute cushion. Late arrivals may need a shortened service so the next dog isn't kept waiting.`),
    ].join(""),
    reason: `You're receiving this because you just booked an appointment with All About Pawz.`,
  })
}

// ---- Appointment reminder (day before) ----------------------------------------

export function appointmentReminderHtml(d: AppointmentData): string {
  return frame({
    preheader: `Tomorrow · ${whenLabel(d)} · ${d.dogName || "your pup"}'s groom is almost here.`,
    body: [
      eyebrow("Grooming tomorrow"),
      h1(`See you soon, ${esc(d.firstName)}!`),
      taglineFlourish(),
      p(
        `${d.dogName ? `<strong style="color:#1a1a1a">${esc(d.dogName)}</strong> is</strong> booked for` : "You're booked for"} <strong style="color:#1a1a1a">${esc(serviceLabel(d))}</strong> ${esc(whenLabel(d))}. Here's the quick version of everything you need:`,
      ),
      apptCard("Tomorrow's appointment", d),
      steps([
        { title: "Skip breakfast that morning", body: "A light breakfast is fine, but a full bowl right before a groom isn't ideal. Water is always good." },
        { title: "Potty break before you come", body: "A quick walk before arrival makes the whole appointment calmer (for everyone involved)." },
        { title: "Tell us anything new", body: "New mats, skin spots, or nerves? Reply to this email or note it at check-in so your groomer is ready." },
      ]),
      button(BRAND.portalUrl, "View or reschedule"),
      p(`Running behind or need a new time? Reschedule in your portal up to 24 hours before, or call the salon at ${BRAND.phone} and we'll take care of you.`, { muted: true, small: true }),
    ].join(""),
    reason: `You're receiving this reminder because you have an appointment with All About Pawz.`,
  })
}

// ---- Appointment canceled ------------------------------------------------------

export interface CanceledData extends AppointmentData {
  reason?: string
  canceledBy?: "salon" | "customer"
}

export function appointmentCanceledHtml(d: CanceledData): string {
  const bySalon = d.canceledBy !== "customer"
  return frame({
    preheader: `Your ${esc(d.date)} appointment was canceled — rebooking takes about a minute.`,
    body: [
      eyebrow("Appointment canceled", "brick"),
      h1(`Your appointment was canceled`),
      p(
        bySalon
          ? `We're sorry — we had to cancel ${d.dogName ? `<strong style="color:#1a1a1a">${esc(d.dogName)}</strong>'s` : "your"} appointment on ${esc(d.date)}. ${d.reason ? esc(d.reason) : "Nothing is wrong on your end, and any deposit transfers to your new time automatically."}`
          : `This confirms ${d.dogName ? `<strong style="color:#1a1a1a">${esc(d.dogName)}</strong>'s` : "your"} appointment on ${esc(d.date)} has been canceled as you requested.${d.reason ? " " + esc(d.reason) : ""} Any deposit stays on your account and moves to your next booking.`,
      ),
      apptCard("Canceled appointment", d, "brick"),
      button(BRAND.bookUrl, "Book a new time"),
      p(`Prefer to talk it through? Call the salon at ${BRAND.phone} — Tue–Sat 9–6, Sun 10–4.`, { muted: true, small: true }),
    ].join(""),
    reason: `You're receiving this because an appointment on your All About Pawz account was canceled.`,
  })
}

// ---- Appointment rescheduled ---------------------------------------------------

export interface RescheduledData extends AppointmentData {
  oldDate: string
  oldTime?: string
}

export function appointmentRescheduledHtml(d: RescheduledData): string {
  return frame({
    preheader: `New time confirmed: ${esc(whenLabel(d))} — your appointment was moved.`,
    body: [
      eyebrow("Appointment moved"),
      h1(`New time, all confirmed`),
      taglineFlourish(),
      p(
        `${d.dogName ? `<strong style="color:#1a1a1a">${esc(d.dogName)}</strong>'s` : "Your"} <strong style="color:#1a1a1a">${esc(serviceLabel(d))}</strong> appointment moved from ${esc([d.oldDate, d.oldTime].filter(Boolean).join(" at "))} to a new spot. Everything else — notes, deposit, preferences — carries right over.`,
      ),
      detailsCard("Your new appointment", [
        ...(d.dogName ? [{ label: "Dog", value: esc(d.dogName) }] : []),
        { label: "Service", value: esc(serviceLabel(d)) },
        { label: "New time", value: esc(whenLabel(d)) },
        { label: "Was", value: esc([d.oldDate, d.oldTime].filter(Boolean).join(" at ")) },
        ...(d.bookingRef ? [{ label: "Booking ref", value: esc(d.bookingRef) }] : []),
      ]),
      button(BRAND.portalUrl, "View in my portal"),
      noteBox(`Something come up? You can keep adjusting from your portal up to 24 hours before, or call ${BRAND.phone} and we'll help.`),
    ].join(""),
    reason: `You're receiving this because an appointment on your All About Pawz account was rescheduled.`,
  })
}

// ---- Abandoned booking / cart reminder -----------------------------------------

export interface AbandonedData {
  firstName: string
  dogName?: string
  service: string
  date: string
  time?: string
  resumeUrl: string
  /** True when this booking's pre-visit questionnaire is already done —
   *  the pre check-in invitation is then omitted (never ask twice). */
  preCheckInComplete?: boolean
  /** The deposit as the TENANT'S booking rule actually charges it
   *  (e.g. "$25.00 deposit"), supplied by the sender from the stored
   *  rule. Null when the tenant charges no deposit — the copy then
   *  speaks of the deposit step without inventing an amount. */
  depositLabel?: string | null
}

export function abandonedBookingHtml(d: AbandonedData): string {
  const dep = d.depositLabel ? esc(d.depositLabel) : "deposit"
  return frame({
    preheader: `Your booking is saved — only the deposit is left, and it takes about a minute.`,
    body: [
      eyebrow("Your booking is saved"),
      h1(`Still want that appointment${d.dogName ? ` for ${esc(d.dogName)}` : ""}?`),
      taglineFlourish(),
      p(
        `You were almost done booking a <strong style="color:#1a1a1a">${esc(d.service)}</strong>${d.date ? ` for <strong style="color:#1a1a1a">${esc(whenLabel(d as AppointmentData))}</strong>` : ""} — everything you entered is still saved. Only the ${dep} is left to lock in your slot.`,
      ),
      detailsCard("Saved and waiting", [
        ...(d.dogName ? [{ label: "Dog", value: esc(d.dogName) }] : []),
        { label: "Service", value: esc(d.service) },
        ...(d.date ? [{ label: "Requested time", value: esc(whenLabel(d as AppointmentData)) }] : []),
        { label: "What's left", value: `Just the ${dep} — credited toward the groom` },
      ]),
      button(d.resumeUrl, "Finish your booking"),
      p(`If the time no longer works, the same link picks up right where you left off — nothing gets re-typed. Questions? Just reply to this email or call the salon.`, { muted: true, small: true }),
      d.preCheckInComplete ? "" : preCheckInInviteHtml(d.dogName),
    ].join(""),
    reason: `You're receiving this because you started a booking at aapawz.com — one reminder only.`,
  })
}

// ---- Consultation request ------------------------------------------------------

export interface ConsultationData {
  firstName: string
  dogName?: string
  breed?: string
  concerns?: string
  preferredTime?: string
}

export function consultationRequestHtml(d: ConsultationData): string {
  return frame({
    preheader: `We got your consultation request — we'll be in touch within one business day.`,
    body: [
      eyebrow("Consultation requested"),
      h1(`Thanks, ${esc(d.firstName)} — we got it`),
      taglineFlourish(),
      p(`Your consultation request is in. A real human from the salon will reach out within one business day to schedule your visit and talk through the best plan for your pup.`),
      detailsCard("Your request", [
        ...(d.dogName ? [{ label: "Dog", value: esc(d.dogName) + (d.breed ? ` · ${esc(d.breed)}` : "") }] : []),
        ...(d.preferredTime ? [{ label: "Preferred time", value: esc(d.preferredTime) }] : []),
        ...(d.concerns ? [{ label: "Notes", value: esc(d.concerns) }] : []),
      ]),
      p(`Want to add anything before we call? Just reply to this email — it comes straight to us.`, { muted: true, small: true }),
    ].join(""),
    reason: `You're receiving this because you submitted a consultation request at aapawz.com.`,
  })
}

// ---- Booking request received (the "We got it" morning design) ------------------

export interface BookingRequestData {
  firstName: string
  dogName?: string
  service: string
  date: string
  time?: string
  bookingRef?: string
  /** Full intake — dog details so the email reflects everything captured. */
  breed?: string
  weight?: string
  age?: string
  size?: string
  /** payment lines carried on the request (items + total) */
  itemLines?: string[]
  total?: string
  /** The deposit as the TENANT'S booking rule actually charges it
   *  (e.g. "$25.00 deposit"), supplied by the sender from the stored
   *  rule. Null when the tenant charges no deposit. */
  depositLabel?: string | null
}

export function bookingRequestHtml(d: BookingRequestData): string {
  const dogLine = [
    d.dogName,
    d.breed,
    d.weight ? `${d.weight} lbs` : "",
    d.size ? d.size[0] + d.size.slice(1).toLowerCase() : "",
  ].filter(Boolean).join(" · ")
  const dep = d.depositLabel ? esc(d.depositLabel) : null
  return frame({
    preheader: dep
      ? `We got ${d.dogName ? d.dogName + "'s" : "your"} booking request — the ${dep} finishes it.`
      : `We got ${d.dogName ? d.dogName + "'s" : "your"} booking request.`,
    body: [
      eyebrow("Request received"),
      h1(`We got it, ${esc(d.firstName)}!`),
      taglineFlourish(),
      p(
        dep
          ? `This confirms we received your booking request${d.dogName ? ` for <strong style="color:#1a1a1a">${esc(d.dogName)}</strong>` : ""}. Once your ${dep} clears, we'll send a full confirmation with everything you need.`
          : `This confirms we received your booking request${d.dogName ? ` for <strong style="color:#1a1a1a">${esc(d.dogName)}</strong>` : ""}. We'll send a full confirmation with everything you need.`,
      ),
      detailsCard("Your request", [
        ...(dogLine ? [{ label: "Dog", value: esc(dogLine) }] : []),
        ...(d.age ? [{ label: "Age", value: esc(d.age) }] : []),
        { label: "Service", value: esc(d.service) },
        { label: "Requested date", value: esc(d.date) },
        ...(d.time ? [{ label: "Requested time", value: esc(d.time) }] : []),
        ...(d.itemLines && d.itemLines.length > 0
          ? [{ label: "Services", value: d.itemLines.map((l) => esc(l)).join("<br/>") }]
          : []),
        ...(d.total ? [{ label: "Total (with tax)", value: esc(d.total) }] : []),
        ...(d.bookingRef ? [{ label: "Booking ref", value: esc(d.bookingRef) }] : []),
      ]),
      noteBox(
        `Deposit not showing as paid? Keep an eye out for a <strong>Finish your booking</strong> email — it picks up right where you left off.`,
      ),
    ].join(""),
    reason: `You're receiving this because you just submitted a booking request at aapawz.com.`,
  })
}

// ---- Pre check-in received (customer confirmation) ----------------------------------

export interface PreCheckInReceivedData {
  firstName: string
  dogName?: string
  service: string
  date: string
  time?: string
  bookingRef?: string
}

export function preCheckInReceivedHtml(d: PreCheckInReceivedData): string {
  return frame({
    preheader: `Pre check-in complete — ${esc(d.dogName || "your pup")}'s ${esc(d.service)} on ${esc(d.date)}.`,
    body: [
      eyebrow("Pre check-in complete", "sage"),
      h1(`You're checked in, ${esc(d.firstName)}!`),
      taglineFlourish(),
      p(
        `Thank you — the pre check-in for ${d.dogName ? `<strong style="color:#1a1a1a">${esc(d.dogName)}</strong>'s` : "your"} <strong style="color:#1a1a1a">${esc(d.service)}</strong> is complete. Your stylist will have every answer before the visit — nothing left to do but show up.`,
      ),
      detailsCard("Your visit", [
        ...(d.dogName ? [{ label: "Dog", value: esc(d.dogName) }] : []),
        { label: "Service", value: esc(d.service) },
        { label: "When", value: esc([d.date, d.time].filter(Boolean).join(" at ")) },
        ...(d.bookingRef ? [{ label: "Booking ref", value: esc(d.bookingRef) }] : []),
      ]),
      button(BRAND.portalUrl, "Manage in my portal"),
      p(`Anything change before the visit — new mats, a rough night, a schedule wrinkle? Update it from your portal or call us at ${BRAND.phone}.`, { muted: true, small: true }),
    ].join(""),
    reason: `You're receiving this because you completed the pre check-in for an upcoming appointment.`,
  })
}

// ---- Pickup ready (groom complete — released to the front desk) ----------------
// Sent when the groomer releases a completed appointment from the employee
// portal (SA-131). Doubles as the visit thank-you note: it tells the
// customer their pet is ready and points at the visit photos the groomer
// marked customer-visible (they live in the portal Pet Gallery).

export interface PickupReadyData extends AppointmentData {
  groomerName?: string
}

export function pickupReadyHtml(d: PickupReadyData): string {
  return frame({
    preheader: `${d.dogName || "Your pup"}'s groom is done — ready for pickup at ${BRAND.name}.`,
    body: [
      eyebrow("Ready for pickup"),
      h1(`${esc(d.dogName || "Your pup")} is all done, ${esc(d.firstName)}!`),
      taglineFlourish(),
      p(
        `${d.dogName ? `<strong style="color:#1a1a1a">${esc(d.dogName)}</strong>'s` : "Your pet's"} <strong style="color:#1a1a1a">${esc(serviceLabel(d))}</strong> is complete${d.groomerName ? ` with ${esc(d.groomerName)}` : ""} — fresh, tidy, and waiting for you at the front desk.`,
      ),
      apptCard("Today's visit", d, "sage"),
      p(
        `Your groomer marked this visit's photos for you — see them any time in your portal's Pet Gallery. Thank you for trusting us with ${d.dogName ? esc(d.dogName) : "your pup"} today.`,
      ),
      button(BRAND.portalUrl, "View visit photos"),
      p(`Running late? Call the salon at ${BRAND.phone} and we'll keep ${d.dogName ? esc(d.dogName) : "your pup"} comfortable until you arrive.`, { muted: true, small: true }),
    ].join(""),
    reason: `You're receiving this because your pet's grooming appointment was just completed at All About Pawz.`,
  })
}

// ---- Thank you (post-visit note — employee portal step 4.2.10) ----------------
// Sent by the groomer as its OWN action from the employee portal, separate
// from the pickup-ready email above: it thanks the customer for the visit
// and points at the visit photos the Images Sent step (4.2.7) published to
// the customer's Pet Gallery. The step records only when this email is
// actually delivered — a failed send leaves the step undone.

export interface ThankYouData extends AppointmentData {
  groomerName?: string
  imageCount?: number
}

export function thankYouHtml(d: ThankYouData): string {
  return frame({
    preheader: `Thank you for visiting ${BRAND.name} — ${d.dogName ? d.dogName + "'s" : "your pet's"} visit photos are in your gallery.`,
    body: [
      eyebrow("Thank you", "sage"),
      h1(`Thank you, ${esc(d.firstName)}!`),
      taglineFlourish(),
      p(
        `Thank you for trusting us with ${d.dogName ? `<strong style="color:#1a1a1a">${esc(d.dogName)}</strong>` : "your pet"} today. ${d.dogName ? `<strong style="color:#1a1a1a">${esc(d.dogName)}</strong>` : "Your pet"} went home fresh from a <strong style="color:#1a1a1a">${esc(serviceLabel(d))}</strong>${d.groomerName ? ` with ${esc(d.groomerName)}` : ""} — and we loved having ${d.dogName ? esc(d.dogName) : "them"} in.`,
      ),
      apptCard("Today's visit", d, "sage"),
      p(
        d.imageCount && d.imageCount > 0
          ? `We sent ${d.imageCount} photo${d.imageCount === 1 ? "" : "s"} from the visit to your Pet Gallery — see how the day went, any time.`
          : `The photos from the visit are in your Pet Gallery — see how the day went, any time.`,
      ),
      button(BRAND.portalUrl, d.dogName ? `View ${d.dogName}'s photos` : "View visit photos"),
      p(`Questions about today's visit, or ready to book the next one? Call us at ${BRAND.phone} — we're happy to help.`, { muted: true, small: true }),
    ].join(""),
    reason: `You're receiving this because your pet just had a grooming visit at All About Pawz.`,
  })
}

// ---- Sample data (Template Studio previews & test sends) ------------------------

export const SAMPLE_APPOINTMENT: AppointmentData = {
  firstName: "Brea",
  dogName: "Bella",
  service: "Bath & Brush + Deshedding",
  date: "Tomorrow, Saturday",
  time: "10:00 AM",
  size: "Medium (36–50 lbs)",
  bookingRef: "BK-4F2A91",
}

export const SAMPLE_BOOKING_REQUEST: BookingRequestData = {
  firstName: "Mark",
  dogName: "Benji",
  service: "Bath & Brush",
  date: "2026-10-16",
  time: "1:00 PM",
  bookingRef: "BK-7C31D4",
  breed: "Maltipoo",
  weight: "14",
  age: "2 years old",
  size: "SMALL",
  itemLines: ["Bath & Brush — $45.00", "Deshedding Treatment — $20.00"],
  total: "$69.83",
}

// ---------------------------------------------------------------------------
// Internal staff notifications — sent to the salon (booking@ / management)
// rather than customers. Same brand frame, denser "ops" layout.
//
// Owner direction (Brea): EVERYTHING the salon captures flows back to the
// inbox — booking requests carry the full intake (dog details, service
// lines, promo, notes), pre check-ins carry every answer, shop orders and
// subscription events each get their own alert. The salon should be able to
// run the day from the inbox.
// ---------------------------------------------------------------------------

import { BRAND, button, detailsCard, eyebrow, h1, p, lineItems, frame, esc } from "../design"

// ---- New booking (salon notify) ---------------------------------------------------

export interface BookingNotifyData {
  ownerName: string
  dogName?: string
  service: string
  size?: string
  date?: string
  time?: string
  email?: string
  phone?: string
  notes?: string
  bookingRef?: string
  /** Full intake — the owner wants EVERYTHING captured in the email. */
  breed?: string
  weight?: string
  age?: string
  /** Priced service lines ("Bath & Haircut — $95.00") incl. promo/points. */
  itemLines?: string[]
  promoCode?: string
  pointsRedeemed?: number
  total?: string
}

/** "3 yr 2 mo" / "7 months old" from a birthDate — shared with email.ts senders. */
export function ageLabel(birthDate?: string): string | undefined {
  if (!birthDate) return undefined
  const d = new Date(birthDate)
  if (Number.isNaN(d.getTime())) return undefined
  const months = (Date.now() - d.getTime()) / (30.44 * 24 * 3600 * 1000)
  if (months < 0) return undefined
  if (months < 12) return `${Math.max(0, Math.round(months))} months old`
  const years = Math.floor(months / 12)
  const rem = Math.round(months % 12)
  return rem > 0 ? `${years} yr ${rem} mo` : `${years} years old`
}

export function bookingNotificationHtml(d: BookingNotifyData): string {
  const dogLine = [
    d.dogName,
    d.breed,
    d.weight ? `${d.weight} lbs` : "",
    d.size ? d.size[0] + d.size.slice(1).toLowerCase() : "",
  ].filter(Boolean).join(" · ")
  return frame({
    nav: false,
    preheader: `New booking request — ${esc(d.ownerName)}${d.dogName ? ` (${esc(d.dogName)})` : ""}.`,
    body: [
      eyebrow("New booking request"),
      h1(`${esc(d.ownerName)} just booked`),
      detailsCard("Booking details", [
        ...(dogLine ? [{ label: "Dog", value: esc(dogLine) }] : []),
        ...(d.age ? [{ label: "Age", value: esc(d.age) }] : []),
        { label: "Service", value: esc(d.size ? `${d.service} (${d.size[0] + d.size.slice(1).toLowerCase()})` : d.service) },
        { label: "When", value: esc([d.date, d.time].filter(Boolean).join(" at ") || "TBD") },
        ...(d.itemLines && d.itemLines.length > 0
          ? [{ label: "Services", value: d.itemLines.map((l) => esc(l)).join("<br/>") }]
          : []),
        ...(d.promoCode ? [{ label: "Promo applied", value: esc(d.promoCode) }] : []),
        ...(d.pointsRedeemed ? [{ label: "Perks points", value: `${d.pointsRedeemed} pts redeemed` }] : []),
        ...(d.total ? [{ label: "Total (with tax)", value: esc(d.total) }] : []),
        ...(d.bookingRef ? [{ label: "Ref", value: esc(d.bookingRef) }] : []),
      ]),
      detailsCard("Contact", [
        { label: "Email", value: esc(d.email || "—") },
        { label: "Phone", value: esc(d.phone || "—") },
        ...(d.notes ? [{ label: "Notes", value: esc(d.notes) }] : []),
      ]),
      button(`${BRAND.url}/admin/appointments`, "Open the schedule"),
    ].join(""),
    reason: `Internal notification — new booking request received through unsaidmemories.com.`,
  })
}

// ---- Pre check-in received (salon notify) ------------------------------------------

export interface PreCheckInNotifyData {
  ownerName: string
  email?: string
  dogName?: string
  service: string
  date?: string
  time?: string
  bookingRef?: string
  answers: {
    matting?: string
    healthNotes?: string
    groomingGoals?: string
    behaviorNotes?: string
    vaccinationsCurrent?: string
    sameDayShots?: string
    muzzle?: string
    sedation?: string
    emergencyName?: string
    emergencyPhone?: string
    vetName?: string
    vetPhone?: string
    authorize?: boolean
  }
}

const yn = (v?: string) => (v === "yes" ? "Yes" : v === "no" ? "No" : v ? esc(v) : "—")

export function preCheckInNotificationHtml(d: PreCheckInNotifyData): string {
  const a = d.answers || {}
  return frame({
    nav: false,
    preheader: `Pre check-in complete — ${esc(d.dogName || "a pup")}'s visit on ${esc(d.date || "the booked date")}.`,
    body: [
      eyebrow("Pre check-in received"),
      h1(`${esc(d.ownerName)} finished pre check-in`),
      p(`Every answer they gave, exactly as captured — the stylist has what they need before ${esc(d.dogName || "the pup")} walks in.`),
      detailsCard("The visit", [
        ...(d.dogName ? [{ label: "Dog", value: esc(d.dogName) }] : []),
        { label: "Service", value: esc(d.service) },
        { label: "When", value: esc([d.date, d.time].filter(Boolean).join(" at ") || "TBD") },
        ...(d.bookingRef ? [{ label: "Ref", value: esc(d.bookingRef) }] : []),
        { label: "Email", value: esc(d.email || "—") },
      ]),
      detailsCard(
        "Pre check-in answers",
        [
          { label: "Vaccinations current", value: yn(a.vaccinationsCurrent) },
          { label: "Same-day shots", value: yn(a.sameDayShots) },
          { label: "Matted on the day", value: yn(a.matting) },
          ...(a.healthNotes ? [{ label: "Health", value: esc(a.healthNotes) }] : []),
          ...(a.groomingGoals ? [{ label: "Grooming goals", value: esc(a.groomingGoals) }] : []),
          ...(a.behaviorNotes ? [{ label: "Behavior", value: esc(a.behaviorNotes) }] : []),
          { label: "Muzzle needed", value: yn(a.muzzle) },
          { label: "Sedation", value: yn(a.sedation) },
          ...(a.emergencyName || a.emergencyPhone
            ? [{ label: "Emergency contact", value: esc([a.emergencyName, a.emergencyPhone].filter(Boolean).join(" · ")) }]
            : []),
          ...(a.vetName || a.vetPhone
            ? [{ label: "Vet", value: esc([a.vetName, a.vetPhone].filter(Boolean).join(" · ")) }]
            : []),
          { label: "Liability authorized", value: a.authorize ? "Yes — accepted" : "No" },
        ],
        { tone: "sage" },
      ),
      button(`${BRAND.url}/admin/appointments`, "Open the schedule"),
    ].join(""),
    reason: `Internal notification — pre check-in questionnaire completed in the customer portal.`,
  })
}

// ---- New shop order (salon notify) ---------------------------------------------------

export interface OrderNotifyData {
  customerName: string
  email?: string
  phone?: string
  orderNumber: string
  items: { name: string; qty: string | number; price: string; imageUrl?: string }[]
  subtotal?: string
  shipping?: string
  tax?: string
  total?: string
  shipTo?: string
  /** Internal only — supplier, cost, shipping and margin per item.
   *  NEVER populated for customer-facing mail. */
  supplierLines?: { name: string; detail: string }[]
  expectedDelivery?: string
}

export function orderNotificationHtml(d: OrderNotifyData): string {
  return frame({
    nav: false,
    preheader: `New shop order — ${esc(d.orderNumber)} · ${esc(d.total || "")}`,
    body: [
      eyebrow("New shop order"),
      h1(`${esc(d.customerName)} just ordered`),
      ...(d.items.length > 0
        ? [
            lineItems(
              d.items,
              [
                ...(d.subtotal ? [{ label: "Subtotal", value: esc(d.subtotal) }] : []),
                ...(d.shipping ? [{ label: "Shipping", value: esc(d.shipping) }] : []),
                ...(d.tax ? [{ label: "Tax", value: esc(d.tax) }] : []),
                ...(d.total ? [{ label: "Total", value: esc(d.total), strong: true }] : []),
              ],
            ),
          ]
        : []),
      ...(d.supplierLines && d.supplierLines.length > 0
        ? [
            detailsCard(
              "Supplier & margin",
              d.supplierLines.map((l) => ({ label: l.name, value: esc(l.detail) })),
            ),
          ]
        : []),
      detailsCard("Order details", [
        { label: "Order number", value: esc(d.orderNumber) },
        { label: "Email", value: esc(d.email || "—") },
        { label: "Phone", value: esc(d.phone || "—") },
        ...(d.shipTo ? [{ label: "Ships to", value: esc(d.shipTo) }] : []),
        ...(d.expectedDelivery
          ? [{ label: "Expected delivery", value: esc(d.expectedDelivery) }]
          : []),
      ]),
      button(`${BRAND.url}/admin/orders`, "Open fulfillment"),
    ].join(""),
    reason: `Internal notification — shop order paid through unsaidmemories.com.`,
  })
}

// ---- Subscription event (salon notify) ------------------------------------------------

export interface SubscriptionNotifyData {
  event: "signup" | "renewal" | "plan_change" | "cancelled" | "reminder"
  memberName: string
  email?: string
  dogName?: string
  planName: string
  billingInterval?: string
  price?: string
  periodEnd?: string
  /** plan_change only */
  oldPlanName?: string
  promoCode?: string
  chargedOn?: string
}

const SUB_EVENT_COPY: Record<SubscriptionNotifyData["event"], { eyebrowText: string; headline: string }> = {
  signup: { eyebrowText: "New Bath Club member", headline: "just joined the Bath Club" },
  renewal: { eyebrowText: "Membership renewed", headline: "renewed their membership" },
  plan_change: { eyebrowText: "Membership changed", headline: "changed their plan" },
  cancelled: { eyebrowText: "Membership ending", headline: "cancelled their membership" },
  reminder: { eyebrowText: "Renewal reminder sent", headline: "was reminded about their renewal" },
}

export function subscriptionNotificationHtml(d: SubscriptionNotifyData): string {
  const copy = SUB_EVENT_COPY[d.event] || SUB_EVENT_COPY.signup
  return frame({
    nav: false,
    preheader: `${copy.eyebrowText} — ${esc(d.memberName)} · ${esc(d.planName)}`,
    body: [
      eyebrow(copy.eyebrowText),
      h1(`${esc(d.memberName)} ${copy.headline}`),
      detailsCard("Membership", [
        { label: "Member", value: esc(d.memberName) },
        { label: "Email", value: esc(d.email || "—") },
        ...(d.dogName ? [{ label: "Dog", value: esc(d.dogName) }] : []),
        ...(d.event === "plan_change" && d.oldPlanName
          ? [{ label: "Plan", value: `${esc(d.oldPlanName)} → ${esc(d.planName)}` }]
          : [{ label: "Plan", value: esc(d.planName) }]),
        ...(d.billingInterval
          ? [{ label: "Billing", value: esc(d.billingInterval) }]
          : []),
        ...(d.price ? [{ label: "Price", value: esc(d.price) }] : []),
        ...(d.chargedOn ? [{ label: "Card charged", value: esc(d.chargedOn) }] : []),
        ...(d.periodEnd ? [{ label: d.event === "cancelled" ? "Ends" : "Renews", value: esc(d.periodEnd) }] : []),
        ...(d.promoCode ? [{ label: "Promo", value: esc(d.promoCode) }] : []),
      ]),
      button(`${BRAND.url}/admin/crm`, "Open the CRM"),
    ].join(""),
    reason: `Internal notification — PAWfection Bath Club membership event.`,
  })
}

// ---- New consultation request (salon notify) ---------------------------------------

export interface ConsultationNotifyData {
  name: string
  dogName?: string
  breed?: string
  concerns?: string
  preferredTime?: string
  email?: string
  phone?: string
}

export function consultationNotificationHtml(d: ConsultationNotifyData): string {
  return frame({
    nav: false,
    preheader: `New consultation request — ${esc(d.name)}.`,
    body: [
      eyebrow("New consultation request"),
      h1(`${esc(d.name)} requested a consult`),
      detailsCard("Request details", [
        ...(d.dogName ? [{ label: "Dog", value: esc(d.dogName) + (d.breed ? ` · ${esc(d.breed)}` : "") }] : []),
        ...(d.preferredTime ? [{ label: "Preferred time", value: esc(d.preferredTime) }] : []),
        ...(d.concerns ? [{ label: "Notes", value: esc(d.concerns) }] : []),
        { label: "Email", value: esc(d.email || "—") },
        { label: "Phone", value: esc(d.phone || "—") },
      ]),
      button(`${BRAND.url}/contact`, "Reach out"),
    ].join(""),
    reason: `Internal notification — consultation request received through unsaidmemories.com.`,
  })
}

// ---- New Learning Center enrollment (management notify) ------------------------------

export interface EnrollmentNotifyData {
  name: string
  email: string
  program?: string
  enrolledAt: string
}

export function enrollmentNotificationHtml(d: EnrollmentNotifyData): string {
  return frame({
    academy: true,
    nav: false,
    preheader: `New Learning Center enrollment — ${esc(d.name || d.email)}.`,
    body: [
      eyebrow("New enrollment"),
      h1(`A new learner just enrolled`),
      detailsCard("Enrollment details", [
        { label: "Learner", value: esc(d.name || "New member") },
        { label: "Email", value: esc(d.email) },
        ...(d.program ? [{ label: "Program", value: esc(d.program) }] : []),
        { label: "Enrolled at", value: esc(d.enrolledAt) },
      ]),
      button(`${BRAND.learnUrl}/classroom`, "Open LMS dashboard"),
      p(`The learner has been seeded into the database with the learner role and can sign in to the classroom immediately.`, { muted: true, small: true }),
    ].join(""),
    reason: `Internal notification — Learning Center enrollment received.`,
  })
}

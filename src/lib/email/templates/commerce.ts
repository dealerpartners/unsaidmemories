// ---------------------------------------------------------------------------
// Payments, orders, subscriptions & memberships (sent via Resend).
// ---------------------------------------------------------------------------

import { BRAND, button, detailsCard, eyebrow, h1, lineItems, noteBox, p, taglineFlourish, frame, esc } from "../design"
import { SITE_URL } from "../../site-url"

// ---- Payment confirmation ------------------------------------------------------

export interface PaymentData {
  firstName: string
  amount: string
  whatFor: string
  method?: string
  date?: string
  ref?: string
  /** Deposit-style payments credit toward a future order. */
  depositCredit?: boolean
  portalUrl?: string
}

export function paymentConfirmationHtml(d: PaymentData): string {
  return frame({
    preheader: `Payment received — thank you, ${esc(d.firstName)}.`,
    body: [
      eyebrow("Payment received"),
      h1(`Thank you, ${esc(d.firstName)}!`),
      taglineFlourish(),
      p(`We've received your payment. Here's your receipt for your records — keep it, forward it, or never think about it again. It's also saved in your portal.`),
      detailsCard("Your receipt", [
        { label: "Amount", value: esc(d.amount), big: true },
        { label: "For", value: esc(d.whatFor) },
        ...(d.method ? [{ label: "Method", value: esc(d.method) }] : []),
        { label: "Date", value: esc(d.date || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })) },
        ...(d.ref ? [{ label: "Reference", value: esc(d.ref) }] : []),
      ]),
      ...(d.depositCredit
        ? [noteBox(`This payment is a <strong style="color:#1a1a1a">deposit</strong> — it comes right off your order total when the balance is charged.`)]
        : []),
      button(d.portalUrl || BRAND.portalUrl, "View in my portal"),
    ].join(""),
    reason: `You're receiving this receipt because a payment was made on your UnSaid Memories account.`,
  })
}

// ---- Order confirmation (shop) --------------------------------------------------

export interface OrderData {
  firstName: string
  orderNumber: string
  items: { name: string; qty: string | number; price: string; imageUrl?: string }[]
  subtotal: string
  shipping: string
  tax: string
  total: string
  shipTo?: string
  trackingNote?: string
  portalUrl?: string
}

export function orderConfirmationHtml(d: OrderData): string {
  return frame({
    preheader: `Order ${esc(d.orderNumber)} is confirmed — your pieces are being made.`,
    body: [
      eyebrow("Order confirmed"),
      h1(`Your order is in, ${esc(d.firstName)}`),
      taglineFlourish(),
      p(`Thank you. Your order is confirmed and your pieces are being made to order — here's the summary:`),
      lineItems(
        d.items,
        [
          { label: "Subtotal", value: esc(d.subtotal) },
          { label: "Shipping", value: esc(d.shipping) },
          { label: "Tax", value: esc(d.tax) },
          { label: "Total", value: esc(d.total), strong: true },
        ]
      ),
      detailsCard("Order details", [
        { label: "Order number", value: esc(d.orderNumber) },
        ...(d.shipTo ? [{ label: "Ships to", value: esc(d.shipTo) }] : []),
        { label: "Questions", value: `Reply to this email or ${BRAND.email}` },
      ]),
      button(d.portalUrl || BRAND.portalUrl, "Track my order"),
      noteBox(d.trackingNote || `You'll get another email with tracking the moment your order ships. Each piece is made to order, so allow a few business days before it leaves.`),
    ].join(""),
    reason: `You're receiving this because you placed an order at unsaidmemories.com.`,
  })
}

// ---- Subscription billing notice -------------------------------------------------

export interface SubscriptionBillingData {
  firstName: string
  planName: string
  amount: string
  billingDate: string
  cardBrand?: string
  cardLast4?: string
  manageUrl?: string
}

export function subscriptionBillingHtml(d: SubscriptionBillingData): string {
  return frame({
    preheader: `Heads up: ${esc(d.amount)} will be charged on ${esc(d.billingDate)}.`,
    body: [
      eyebrow("Upcoming billing"),
      h1(`A quick heads-up before we bill you`),
      p(`No action needed — this is just a friendly notice that your <strong style="color:#1a1a1a">${esc(d.planName)}</strong> membership renews soon and your card will be charged.`),
      detailsCard("Your renewal", [
        { label: "Amount", value: esc(d.amount), big: true },
        { label: "Billing date", value: esc(d.billingDate) },
        { label: "Plan", value: esc(d.planName) },
        ...(d.cardBrand
          ? [{ label: "Card", value: `${esc(d.cardBrand)}${d.cardLast4 ? ` ending in ${esc(d.cardLast4)}` : ""}` }]
          : []),
      ]),
      button(d.manageUrl || BRAND.portalUrl, "Review my membership"),
      noteBox(`Want to change or pause your membership? Do it any time before the billing date from your portal — no emails, no phone calls, no guilt trips.`),
    ].join(""),
    reason: `You're receiving this because you have an active UnSaid Memories membership.`,
  })
}

// ---- Membership active -----------------------------------------------------------

export interface MembershipData {
  firstName: string
  planName: string
  perks: { title: string; body?: string }[]
  renewal?: string
  manageUrl?: string
}

export function membershipActiveHtml(d: MembershipData): string {
  return frame({
    preheader: `Your ${esc(d.planName)} membership is active — here's what you unlocked.`,
    body: [
      eyebrow("Membership active"),
      h1(`Welcome to ${esc(d.planName)}`),
      taglineFlourish(),
      p(`Your membership is live starting today. Here's what being part of the family gets you:`),
      `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:1px solid #e7e5e4;">
        ${d.perks
          .map(
            (perk) => `<tr>
          <td width="44" align="center" valign="top" style="padding:16px 0 4px 16px;"><span style="display:block;width:9px;height:9px;border-radius:50%;background:#6942c2;margin:2px auto 0;"></span></td>
          <td valign="top" style="padding:14px 20px 14px 8px;">
            <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#1a1a1a;">${esc(perk.title)}</div>
            ${perk.body ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#1a1a1a;">${esc(perk.body)}</div>` : ""}
          </td>
        </tr>`
          )
          .join("")}
      </table>`,
      ...(d.renewal ? [detailsCard("Your plan", [{ label: "Renews", value: esc(d.renewal) }])] : []),
      button(d.manageUrl || BRAND.portalUrl, "Open my membership"),
      p(`Your member pricing applies automatically every time you book — nothing to remember, nothing to mention.`, { muted: true, small: true }),
    ].join(""),
    reason: `You're receiving this because you joined an UnSaid Memories membership.`,
  })
}

// ---- Membership plan changed ---------------------------------------------------------

export interface PlanChangedData {
  firstName: string
  oldPlanName: string
  newPlanName: string
  newPrice: string
  billingInterval: string
  effective: string
  renews?: string
  manageUrl?: string
}

export function subscriptionPlanChangedHtml(d: PlanChangedData): string {
  return frame({
    preheader: `Your Bath Club plan is now ${esc(d.newPlanName)} — ${esc(d.newPrice)}.`,
    body: [
      eyebrow("Membership updated"),
      h1(`Your new plan is set, ${esc(d.firstName)}`),
      taglineFlourish(),
      p(
        `You changed your PAWfection Bath Club plan. Everything else — your billing day, your pup's spot, your Perks points — stays exactly the same.`,
      ),
      detailsCard("Your membership", [
        { label: "Previous plan", value: esc(d.oldPlanName) },
        { label: "New plan", value: esc(d.newPlanName) },
        { label: "New price", value: `${esc(d.newPrice)} / ${esc(d.billingInterval)}`, big: true },
        { label: "Takes effect", value: esc(d.effective) },
        ...(d.renews ? [{ label: "Next charge", value: esc(d.renews) }] : []),
      ]),
      button(d.manageUrl || BRAND.portalUrl, "Open my membership"),
      noteBox(`Changed your mind? You can switch again or pause any time from your portal — no calls, no emails, no guilt trips.`),
    ].join(""),
    reason: `You're receiving this because you changed your UnSaid Memories membership plan.`,
  })
}

// ---- Subscription renewal reminder (Bath Club) -------------------------------------
//
// Sent by the daily cron (src/app/api/cron/subscription-reminders) a few days
// before each Bath Club charge — the owner's "月扣款前发提醒邮件".

export interface SubscriptionRenewalReminderData {
  firstName: string
  /** e.g. "PAWfection Bath Club — Small" */
  planName: string
  dogName?: string
  /** e.g. "$129.00" */
  amount: string
  interval: "monthly" | "annual"
  /** Pretty renewal date, e.g. "March 5, 2026" */
  renewsOn: string
  bathsUsed: number
  bathsIncluded: number
  manageUrl?: string
}

export function subscriptionRenewalReminderHtml(d: SubscriptionRenewalReminderData): string {
  const perPeriod = d.interval === "annual" ? "per year" : "per month"
  return frame({
    preheader: `Your membership renews on ${esc(d.renewsOn)} — ${esc(d.amount)} ${perPeriod}.`,
    body: [
      eyebrow("PAWFECTION BATH CLUB"),
      h1(`Your membership renews soon`),
      taglineFlourish(),
      p(
        `A quick heads-up, ${esc(d.firstName)} — your <strong style="color:#1a1a1a">${esc(d.planName)}</strong> renews soon and your card will be charged. Nothing to do if you're all set.`,
      ),
      detailsCard("Your renewal", [
        { label: "Membership", value: esc(d.planName) },
        { label: "Renews on", value: esc(d.renewsOn) },
        { label: "Amount", value: `${esc(d.amount)} ${perPeriod}`, big: true },
        { label: "Baths used", value: `${d.bathsUsed} / ${d.bathsIncluded} this period` },
      ]),
      button(d.manageUrl || `${SITE_URL}/customer/orders/subscriptions`, "Manage my membership"),
      noteBox(`Pause or cancel anytime in the portal — cancellation takes effect at the end of the billing cycle.`),
    ].join(""),
    reason: `You're receiving this because you have an active UnSaid Memories membership.`,
  })
}

// ---- Sample data ------------------------------------------------------------------

export const SAMPLE_PAYMENT: PaymentData = {
  firstName: "Brea",
  amount: "$25.00",
  whatFor: "Booking deposit — Bath & Brush + Deshedding for Bella",
  method: "Visa ···· 4242",
  ref: "PAY-8C31D7",
  depositCredit: true,
}

export const SAMPLE_ORDER: OrderData = {
  firstName: "Brea",
  orderNumber: "ORD-10248",
  items: [
    { name: "Oatmeal & Honey Shampoo — 16oz", qty: 1, price: "$18.00" },
    { name: "Slicker Brush — Medium", qty: 1, price: "$24.00" },
    { name: "Blushing Portal Bandana", qty: 2, price: "$12.00" },
  ],
  subtotal: "$66.00",
  shipping: "$6.50",
  tax: "$5.94",
  total: "$78.44",
  shipTo: "Memphis, TN",
}

export const SAMPLE_RENEWAL_REMINDER: SubscriptionRenewalReminderData = {
  firstName: "Brea",
  planName: "PAWfection Bath Club — Small",
  dogName: "Bella",
  amount: "$129.00",
  interval: "monthly",
  renewsOn: "March 5, 2026",
  bathsUsed: 2,
  bathsIncluded: 4,
}

// ---- Shipped notice -------------------------------------------------------------

export interface OrderShippedData {
  firstName: string
  orderNumber: string
  carrier?: string
  trackingNumber?: string
  trackingUrl?: string
  itemNames: string[]
}

export const SAMPLE_ORDER_SHIPPED: OrderShippedData = {
  firstName: "Alex",
  orderNumber: "mus4dytw-sdq6er",
  carrier: "UPS",
  trackingNumber: "1Z999AA10123456784",
  trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784",
  itemNames: ["Plush Squeaky Duck", "Oatmeal Shampoo 16oz"],
}

export function orderShippedHtml(d: OrderShippedData): string {
  return frame({
    preheader: `Order ${esc(d.orderNumber)} is on its way.`,
    body: [
      eyebrow("On its way"),
      h1(`Your order has shipped, ${esc(d.firstName)}`),
      taglineFlourish(),
      p(`Good news — ${d.itemNames.length === 1 ? "your item is" : "your items are"} on the way:`),
      p(d.itemNames.map((n) => esc(n)).join("<br/>")),
      detailsCard("Shipment", [
        { label: "Order number", value: esc(d.orderNumber) },
        ...(d.carrier ? [{ label: "Carrier", value: esc(d.carrier) }] : []),
        ...(d.trackingNumber ? [{ label: "Tracking", value: esc(d.trackingNumber) }] : []),
      ]),
      button(d.trackingUrl || BRAND.portalUrl, d.trackingUrl ? "Track my package" : "View my order"),
    ].join(""),
    reason: `You're receiving this because you placed an order at unsaidmemories.com.`,
  })
}

// ---- Packed notice --------------------------------------------------------------

export interface OrderPackedData {
  firstName: string
  orderNumber: string
  itemNames: string[]
}

export const SAMPLE_ORDER_PACKED: OrderPackedData = {
  firstName: "Alex",
  orderNumber: "mus4dytw-sdq6er",
  itemNames: ["Plush Squeaky Duck", "Oatmeal Shampoo 16oz"],
}

export function orderPackedHtml(d: OrderPackedData): string {
  return frame({
    preheader: `Order ${esc(d.orderNumber)} is being prepared.`,
    body: [
      eyebrow("Being prepared"),
      h1(`We're packing your order, ${esc(d.firstName)}`),
      taglineFlourish(),
      p(`Good news — the seller is preparing ${d.itemNames.length === 1 ? "your item" : "your items"} for shipment:`),
      p(d.itemNames.map((n) => esc(n)).join("<br/>")),
      detailsCard("Order", [{ label: "Order number", value: esc(d.orderNumber) }]),
      button(BRAND.portalUrl, "View my order"),
    ].join(""),
    reason: `You're receiving this because you placed an order at unsaidmemories.com.`,
  })
}

// ---- Delivered notice -------------------------------------------------------------

export interface OrderDeliveredData {
  firstName: string
  orderNumber: string
  carrier?: string
  trackingNumber?: string
  itemNames: string[]
}

export const SAMPLE_ORDER_DELIVERED: OrderDeliveredData = {
  firstName: "Alex",
  orderNumber: "mus4dytw-sdq6er",
  carrier: "UPS",
  trackingNumber: "1Z999AA10123456784",
  itemNames: ["Plush Squeaky Duck", "Oatmeal Shampoo 16oz"],
}

export function orderDeliveredHtml(d: OrderDeliveredData): string {
  return frame({
    preheader: `Order ${esc(d.orderNumber)} has been delivered.`,
    body: [
      eyebrow("Delivered"),
      h1(`Your order has arrived, ${esc(d.firstName)}`),
      taglineFlourish(),
      p(`${d.itemNames.length === 1 ? "Your item has" : "Your items have"} been delivered:`),
      p(d.itemNames.map((n) => esc(n)).join("<br/>")),
      detailsCard("Delivery", [
        { label: "Order number", value: esc(d.orderNumber) },
        ...(d.carrier ? [{ label: "Carrier", value: esc(d.carrier) }] : []),
        ...(d.trackingNumber ? [{ label: "Tracking", value: esc(d.trackingNumber) }] : []),
      ]),
      button(BRAND.portalUrl, "View my order"),
    ].join(""),
    reason: `You're receiving this because you placed an order at unsaidmemories.com.`,
  })
}

// ---- Groomer lead notice (partner directory) -------------------------------------

export interface GroomerLeadData {
  businessName: string
  buyerName: string
  buyerEmail: string
  buyerPhone?: string
  petName?: string
  serviceName?: string
  preferredDate?: string
  message?: string
}

export const SAMPLE_GROOMER_LEAD: GroomerLeadData = {
  businessName: "Journey Grooming Co",
  buyerName: "Alex Rivera",
  buyerEmail: "alex@example.com",
  buyerPhone: "555-010-7788",
  petName: "Biscuit",
  serviceName: "Full Groom",
  preferredDate: "Saturday",
  message: "He's a 30 lb spaniel, good with baths.",
}

export function groomerLeadHtml(d: GroomerLeadData): string {
  return frame({
    preheader: `New grooming lead for ${esc(d.businessName)} — reply to the customer directly.`,
    body: [
      eyebrow("New lead"),
      h1(`You have a new grooming lead, ${esc(d.businessName)}`),
      taglineFlourish(),
      p(`A customer found you in the UnSaid Memories partner directory and asked for grooming. Reply straight to them — this lead is yours.`),
      detailsCard("Lead", [
        { label: "Customer", value: esc(d.buyerName) },
        { label: "Email", value: esc(d.buyerEmail) },
        ...(d.buyerPhone ? [{ label: "Phone", value: esc(d.buyerPhone) }] : []),
        ...(d.petName ? [{ label: "Pet", value: esc(d.petName) }] : []),
        ...(d.serviceName ? [{ label: "Service", value: esc(d.serviceName) }] : []),
        ...(d.preferredDate ? [{ label: "Preferred timing", value: esc(d.preferredDate) }] : []),
      ]),
      ...(d.message ? [p(esc(d.message))] : []),
      button(`mailto:${encodeURIComponent(d.buyerEmail)}`, "Reply to the customer"),
    ].join(""),
    reason: `You're receiving this because your grooming business is listed in the UnSaid Memories partner directory.`,
  })
}

// ---- Abandoned cart recovery (daily sweep) -------------------------------------

export interface AbandonedCartData {
  firstName: string
  items: { name: string; qty: string | number; price: string }[]
  subtotal: string
  bagUrl: string
}

export function abandonedCartHtml(d: AbandonedCartData): string {
  return frame({
    preheader: `Your bag is saved — everything you picked is still in it.`,
    body: [
      eyebrow("Your bag is saved"),
      h1(`Forget something, ${esc(d.firstName)}?`),
      taglineFlourish(),
      p(
        `You left a few things in your bag at UnSaid Memories — they're saved exactly as you left them, and checkout takes about a minute.`,
      ),
      lineItems(d.items, [{ label: "Subtotal", value: d.subtotal, strong: true }]),
      button(d.bagUrl, "Complete your purchase"),
      p(`If you were just browsing, no worries — your bag stays saved for next time. Questions? Just reply to this email.`, { muted: true, small: true }),
    ].join(""),
    reason: `You're receiving this because you added items to your bag at unsaidmemories.com — one reminder only.`,
  })
}

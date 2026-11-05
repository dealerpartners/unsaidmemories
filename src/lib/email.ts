import "server-only"
import { Resend } from "resend"
import { repo } from "./repo"
import { SITE_URL } from "./site-url"
import { BRAND, detailsCard, eyebrow, frame, h1, p, pawDivider, taglineFlourish, esc } from "./email/design"
import {
  paymentConfirmationHtml,
  abandonedCartHtml,
  orderConfirmationHtml,
  subscriptionBillingHtml,
  membershipActiveHtml,
  subscriptionPlanChangedHtml,
  subscriptionRenewalReminderHtml,
  type PaymentData,
  type OrderData,
  type SubscriptionBillingData,
  type MembershipData,
  type PlanChangedData,
  type SubscriptionRenewalReminderData,
} from "./email/templates/commerce"
import {
  customerWelcomeHtml,
  newAccountCreatedHtml,
  teamMemberInviteHtml,
  welcomeBackHtml,
  newDeviceLoginHtml,
  type NewDeviceData,
} from "./email/templates/accounts"
import { enrollmentWelcomeHtml, classReminderHtml, completionCongratulationsHtml } from "./email/templates/learning"
import {
  enrollmentNotificationHtml,
  orderNotificationHtml,
  subscriptionNotificationHtml,
} from "./email/templates/internal"
import { getTemplateDef } from "./email/templates"
import { isCustomerFacingTemplate, recordCustomerNotification } from "./customer-notifications"
import { getEmailProviderSettings } from "./email/provider-settings"
import { resolveResendTemplate, toResendVariables } from "./email/resend-templates"
import { BREVO_HOSTED_SLUGS, renderHostedEmail } from "./email/hosted-render"
import { itemListHtml } from "./email/order-items"
import { resolveTenantId } from "@/lib/tenant-id";

// ---------------------------------------------------------------------------
// Email via Resend npm package, called from Next.js server routes.
// Sender resolution: getEmailProviderSettings() reads the per-tenant
// franchise_email_settings row (a franchisee's own Resend key + from address),
// falling back to RESEND_API_KEY in the server environment for the master
// tenant. No Edge Function. No secrets panel.
//
// Every template renders through src/lib/email/design.ts — the UnSaid Memories
// branded frame — so nothing plain-text or "single box" ever leaves the salon.
//
// RESEND TEMPLATES (owner rule): when the app's template key is mapped in
// src/lib/email/resend-templates.ts to a template that lives in the
// platform's Resend account, the send goes out through that template
// (template id/alias + variables) and the hand-built HTML below is NOT
// sent. Unmapped keys keep the HTML path until their template exists —
// they are the owner's gap list. A mapped send that Resend rejects fails
// loudly (audit FAILED); it never falls back to hand-built HTML.
// ---------------------------------------------------------------------------

// Per-key Resend client cache: one client per configured Resend key, so the
// master env key and each franchise key each reuse their own instance.
const resendClients = new Map<string, Resend>()
function resendForKey(apiKey: string): Resend {
  let c = resendClients.get(apiKey)
  if (!c) {
    c = new Resend(apiKey)
    resendClients.set(apiKey, c)
  }
  return c
}

/** Brevo send (the owner's existing email service). Always the local
 *  HTML path — Brevo renders nothing; the store's own templates are
 *  the content. Attachments are base64, the same shape Resend takes. */
async function sendViaBrevo(
  apiKey: string,
  from: string,
  opts: {
    to: string
    subject: string
    html: string
    attachments?: { filename: string; content: string }[]
    replyTo?: string
    headers?: Record<string, string>
  },
): Promise<string | undefined> {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from)
  const sender = m ? { name: m[1] || undefined, email: m[2] } : { email: from }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender,
      to: [{ email: opts.to }],
      subject: opts.subject,
      htmlContent: opts.html,
      ...(opts.attachments && opts.attachments.length > 0
        ? { attachment: opts.attachments.map((a) => ({ name: a.filename, content: a.content })) }
        : {}),
      ...(opts.replyTo ? { replyTo: { email: opts.replyTo } } : {}),
      ...(opts.headers && Object.keys(opts.headers).length > 0 ? { headers: opts.headers } : {}),
    }),
  })
  const json: any = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`Brevo send failed (${res.status})${json?.message ? `: ${json.message}` : ""}`)
  }
  return typeof json?.messageId === "string" ? json.messageId : undefined
}

const DEFAULT_FROM = "UnSaid Memories <notifications@confirmation.unsaidmemories.com>"

// Where every salon alert lands (booking requests with the exact services,
// subscription events, shop orders — the owner's inbox ruling). The
// destination is a SETTING (cms_global_content `alert_email`, default
// booking@unsaidmemories.com) so the owner can re-route the inbox from the admin
// Analytics screen without a deploy; the master toggle `alerts_enabled`
// (default on) silences every salon alert at once. Customer-facing
// recipients are NEVER routed through this helper — only the salon copies.
const DEFAULT_SALON_ALERT_TO = "orders@unsaidmemories.com"
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

type SalonAlertSettings = { email: string; enabled: boolean }
let salonAlertSettingsCache: { at: number; value: SalonAlertSettings } | null = null
const SALON_ALERT_SETTINGS_TTL_MS = 60_000

async function readSalonAlertSettings(): Promise<SalonAlertSettings> {
  if (salonAlertSettingsCache && Date.now() - salonAlertSettingsCache.at < SALON_ALERT_SETTINGS_TTL_MS) {
    return salonAlertSettingsCache.value
  }
  let email = DEFAULT_SALON_ALERT_TO
  let enabled = true
  try {
    const s = await repo.getSettings()
    const candidate = String(s.alert_email || "").trim().toLowerCase()
    if (EMAIL_RE.test(candidate)) email = candidate
    enabled = String(s.alerts_enabled ?? "true").trim().toLowerCase() !== "false"
  } catch {
    // Settings read failed — fall back to the defaults above.
  }
  salonAlertSettingsCache = { at: Date.now(), value: { email, enabled } }
  return salonAlertSettingsCache.value
}

/** The salon alert destination, read from settings at send time. Returns ""
 *  when the master toggle is off — callers treat that as "no salon copy this
 *  time" (the customer email is never affected by the toggle). */
async function salonAlertTo(): Promise<string> {
  const { email, enabled } = await readSalonAlertSettings()
  return enabled ? email : ""
}

/** Called after the admin Notifications box writes `alert_email` /
 *  `alerts_enabled` so the next send picks up the new routing immediately
 *  (the 60s cache exists for read load, not for hiding owner changes). */
export function clearSalonAlertSettingsCache() {
  salonAlertSettingsCache = null
}

/** The salon/operator alert destination for the alerts pattern
 *  (src/lib/notify.ts): the settings-driven inbox every operator alert
 *  routes to, or "" when the master `alerts_enabled` toggle is off —
 *  callers treat "" as "operator leg skipped by owner setting". */
export async function salonAlertDestination(): Promise<string> {
  return salonAlertTo()
}

// The live single-tenant id — the same default every app write uses
// (customers, bookings, memberships). email_messages/communications have
// tenant_id NOT NULL; without this the audit row silently never lands.
const TENANT_ID = resolveTenantId()

export async function sendEmail(opts: {
  customerId?: string
  to: string
  template: string
  subject: string
  html: string
  relatedBookingId?: string
  relatedInvoiceId?: string
  relatedOrderId?: string
  /** Tenant whose Resend key + from address should send this. Defaults to the
   *  master tenant (env key). Franchise sends pass the franchise tenant_id. */
  tenantId?: string
  /** Attachments (Resend: base64 content). The booking-confirmed email
   *  carries the .ics so Google/Apple/Outlook recognize the appointment
   *  as a calendar event. */
  attachments?: { filename: string; content: string }[]
  /** Reply-To override (support threading: replies route back to the
   *  ticket's ingest address). Passed through to Resend. */
  replyTo?: string
  /** Extra MIME headers (support threading: In-Reply-To / References).
   *  Passed through to Resend. */
  headers?: Record<string, string>
  /** Variables for the Resend-template path (see resend-templates.ts for
   *  the naming contract — build them with toResendVariables). Used only
   *  when this send's template key is mapped to a Resend template; the
   *  HTML path ignores them. */
  variables?: Record<string, string | number>
  /** Send category (§6.17.1.4): 'marketing' sends are refused before
   *  any provider call when the recipient sits in
   *  public.marketing_suppressions. Everything else (receipts,
   *  reminders, security, service mail) is transactional and is
   *  never suppression-checked. */
  category?: "transactional" | "marketing"
}): Promise<{ ok: boolean; messageId?: string; error?: string; suppressed?: boolean }> {
  if (!opts.to) return { ok: false, error: "No recipient" }

  if (opts.category === "marketing") {
    const { isMarketingSuppressed } = await import("@/lib/marketing-suppression")
    if (await isMarketingSuppressed(opts.to, "email")) {
      return { ok: false, suppressed: true, error: "Recipient has opted out of marketing email." }
    }
  }

  const tid = opts.tenantId || TENANT_ID

  // 0. Resolve the tenant's email provider + any Resend-template mapping
  // BEFORE the audit row, so the row records what will actually be sent.
  // Templates are shared/brand-controlled: franchise key (their domain)
  // or the master env key.
  const provider = await getEmailProviderSettings(tid)
  // The owner's split (2026-11-03): transactional mail sends via
  // Resend; marketing mail — the nudges and retargeting — sends via
  // Brevo. The route is chosen by THIS send's category, not by a
  // store-wide switch, and a category whose provider has no key
  // fails loudly below rather than silently rerouting.
  const route: "resend" | "brevo" = opts.category === "marketing" ? "brevo" : "resend"
  // The templates live in the PLATFORM's Resend account, so a mapping only
  // applies when this send goes out on the platform (env) key. A franchise
  // tenant sending on its own key keeps the HTML path.
  const onPlatformKey =
    !!process.env.RESEND_API_KEY && provider.resendApiKey === process.env.RESEND_API_KEY
  const resendTpl = onPlatformKey && route === "resend"
    ? await resolveResendTemplate(opts.template).catch(() => null)
    : null
  const variables = opts.variables ?? {}
  // For a template send there is no local HTML: the audit body becomes a
  // snapshot of exactly what Resend was asked to render (template ref +
  // variables), so the trail records the template used.
  const auditBody = resendTpl
    ? JSON.stringify({
        via: "resend_template",
        resend_template: resendTpl.ref,
        source: resendTpl.source,
        variables,
      })
    : opts.html

  // 1. Audit trail
  let emailRecord: any = null
  try {
    emailRecord = await repo.create("email_messages", {
      customerId: opts.customerId || null,
      toEmail: opts.to,
      template: opts.template,
      subject: opts.subject,
      body: auditBody,
      status: "QUEUED",
      relatedBookingId: opts.relatedBookingId || null,
      relatedInvoiceId: opts.relatedInvoiceId || null,
      relatedOrderId: opts.relatedOrderId || null,
      tenant_id: tid,
    })
  } catch (e: any) {
    console.error("[email] outbox failed:", e.message)
  }

  // 1b. In-app copy — the customer portal's notification bell. Every
  // customer-facing email ALSO lands in customer_notifications (fire-and-
  // forget, never blocks or breaks the send; written even when the email
  // itself later fails — that is when the in-app copy matters most).
  // Internal salon alerts carry no customerId, so they never appear here.
  if (opts.customerId && isCustomerFacingTemplate(opts.template)) {
    recordCustomerNotification({
      customerId: opts.customerId,
      template: opts.template,
      subject: opts.subject,
      relatedBookingId: opts.relatedBookingId,
      relatedInvoiceId: opts.relatedInvoiceId,
      relatedOrderId: opts.relatedOrderId,
    }).catch(() => {})
  }

  // 2. Provider gate — no key, no send (the audit row records why).
  if (route === "brevo" && !provider.brevoApiKey) {
    const errMsg = "Marketing mail sends via Brevo but no Brevo API key is saved — add one at Admin → Connections & Keys → Brevo"
    if (emailRecord?.id) {
      await repo.update("email_messages", emailRecord.id, { status: "FAILED", errorMessage: errMsg })
    }
    return { ok: false, error: errMsg }
  }
  if (route === "resend" && !provider.resendApiKey) {
    const errMsg = provider.tableExists
      ? "No Resend API key configured for this tenant — set one at Admin → Settings → Email"
      : "RESEND_API_KEY not set in environment"
    if (emailRecord?.id) {
      await repo.update("email_messages", emailRecord.id, { status: "FAILED", errorMessage: errMsg })
    }
    return { ok: false, error: errMsg }
  }

  // 3. Send via the routed provider (Resend for transactional,
  // Brevo for marketing — the owner's split).
  try {
    if (emailRecord?.id) {
      await repo.update("email_messages", emailRecord.id, { status: "SENDING" })
    }

    // Template path: Resend renders the mapped template with the caller's
    // variables — no local HTML, and no local subject (the template's own
    // subject rules; the audit row above keeps ours as the record of
    // intent). Attachments / reply-to / headers ride the same base
    // options in both paths. A Resend rejection here lands FAILED below —
    // never a silent fallback to the HTML that the template replaces.
    let data: { id?: string } | null = null
    let error: { message: string } | null = null
    if (route === "brevo") {
      // Brevo path: the store's own HTML. When the template key maps
      // to one of Sunny's hosted designs, THAT design is the HTML —
      // rendered here with the send's variables (her Brevo key is
      // send-scoped, so no Brevo-side template objects exist). A
      // Brevo rejection lands FAILED below — never a silent reroute.
      let brevoOpts = opts
      const hostedSlug = BREVO_HOSTED_SLUGS[opts.template]
      if (hostedSlug && opts.variables) {
        const rendered = renderHostedEmail(hostedSlug, opts.variables)
        if (rendered) brevoOpts = { ...opts, html: rendered }
      }
      try {
        data = { id: await sendViaBrevo(provider.brevoApiKey as string, provider.from, brevoOpts) }
      } catch (e: any) {
        error = { message: e?.message || "Brevo send failed" }
      }
    } else {
      const resend = resendForKey(provider.resendApiKey as string)
      const sent = resendTpl
        ? await resend.emails.send({
            from: provider.from,
            to: opts.to,
            template: { id: resendTpl.ref, variables },
            ...(opts.attachments && opts.attachments.length > 0 ? { attachments: opts.attachments } : {}),
            ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
            ...(opts.headers && Object.keys(opts.headers).length > 0 ? { headers: opts.headers } : {}),
          })
        : await resend.emails.send({
            from: provider.from,
            to: opts.to,
            subject: opts.subject,
            html: opts.html,
            ...(opts.attachments && opts.attachments.length > 0 ? { attachments: opts.attachments } : {}),
            ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
            ...(opts.headers && Object.keys(opts.headers).length > 0 ? { headers: opts.headers } : {}),
          })
      data = sent.data
      error = sent.error
    }

    if (error) {
      if (emailRecord?.id) {
        await repo.update("email_messages", emailRecord.id, {
          status: "FAILED",
          failedAt: new Date().toISOString(),
          errorMessage: error.message,
        })
      }
      return { ok: false, error: error.message }
    }

    if (emailRecord?.id) {
      await repo.update("email_messages", emailRecord.id, {
        status: "SENT",
        providerMessageId: data?.id || null,
        sentAt: new Date().toISOString(),
      })
    }

    if (opts.customerId) {
      try {
        await repo.create("communications", {
          customerId: opts.customerId,
          channel: "EMAIL",
          direction: "OUTBOUND",
          subject: opts.subject,
          body: auditBody,
          status: "SENT",
          relatedBookingId: opts.relatedBookingId || null,
          sentAt: new Date().toISOString(),
          tenant_id: tid,
        })
      } catch { /* ignore */ }
    }

    return { ok: true, messageId: data?.id }
  } catch (e: any) {
    if (emailRecord?.id) {
      try {
        await repo.update("email_messages", emailRecord.id, {
          status: "FAILED",
          failedAt: new Date().toISOString(),
          errorMessage: e.message,
        })
      } catch { /* ignore */ }
    }
    return { ok: false, error: e.message }
  }
}

function firstNameOf(fullName?: string | null): string {
  return String(fullName || "").trim().split(/\s+/)[0] || ""
}

// ---------------------------------------------------------------------------
// Senders — one per business email. Every one renders the branded templates.
// ---------------------------------------------------------------------------

export async function sendCustomerWelcome(customer: { id: string; firstName: string; lastName: string; email: string }) {
  const firstName = customer.firstName || firstNameOf(customer.lastName) || "there"
  return sendEmail({
    customerId: customer.id,
    to: customer.email,
    template: "customer_welcome",
    subject: "Welcome to UnSaid Memories",
    html: customerWelcomeHtml({ firstName }),
    variables: toResendVariables({ firstName }),
  })
}

// ---- Salon alerts: shop orders & subscription events (owner direction) ------------

export async function sendOrderPlacedAlert(o: {
  customerId?: string; customerName: string; email?: string | null; phone?: string | null
  orderNumber: string
  items: { name: string; qty: string | number; price: string; imageUrl?: string }[]
  subtotal?: string; shipping?: string; tax?: string; total?: string; shipTo?: string
  orderId?: string
  supplierLines?: { name: string; detail: string }[]
  expectedDelivery?: string
}) {
  const salonTo = await salonAlertTo()
  if (!salonTo) return { ok: false, skipped: true, error: "No salon alert recipient configured (alerts disabled or no alert email set) — alert not sent" }
  const notifyData = {
    customerName: o.customerName,
    email: o.email || "",
    phone: o.phone || "",
    orderNumber: o.orderNumber,
    // The hosted staff design renders one block: supplier lines when
    // they exist (name + economics detail), plain items otherwise.
    itemList: o.supplierLines?.length
      ? o.supplierLines.map((l) => `${l.name}\n${l.detail}`).join("\n\n")
      : o.items.map((i) => `${i.qty} × ${i.name} — ${i.price}`).join("\n"),
    adminUrl: `${SITE_URL}/admin/orders`,
    items: o.items,
    subtotal: o.subtotal,
    shipping: o.shipping,
    tax: o.tax,
    total: o.total,
    shipTo: o.shipTo,
    supplierLines: o.supplierLines,
    expectedDelivery: o.expectedDelivery,
  }
  return sendEmail({
    customerId: o.customerId,
    to: salonTo,
    template: "order_notification",
    subject: `New shop order — ${o.orderNumber}${o.total ? ` · ${o.total}` : ""}${o.customerName ? ` · ${o.customerName}` : ""}`,
    html: orderNotificationHtml(notifyData),
    variables: toResendVariables(notifyData),
    relatedOrderId: o.orderId,
  })
}

export async function sendSubscriptionAlert(s: {
  event: "signup" | "renewal" | "plan_change" | "cancelled" | "reminder"
  memberName: string; email?: string | null; dogName?: string | null
  planName: string; billingInterval?: string; price?: string
  periodEnd?: string; oldPlanName?: string; promoCode?: string; chargedOn?: string
}) {
  const salonTo = await salonAlertTo()
  if (!salonTo) return { ok: false, skipped: true, error: "No salon alert recipient configured (alerts disabled or no alert email set) — alert not sent" }
  const notifyData = {
    event: s.event,
    memberName: s.memberName,
    email: s.email || "",
    dogName: s.dogName || undefined,
    planName: s.planName,
    billingInterval: s.billingInterval,
    price: s.price,
    periodEnd: s.periodEnd,
    oldPlanName: s.oldPlanName,
    promoCode: s.promoCode,
    chargedOn: s.chargedOn,
  }
  return sendEmail({
    to: salonTo,
    template: `subscription_${s.event}`,
    subject: `${s.event === "signup" ? "New Bath Club member" : s.event === "renewal" ? "Bath Club renewal" : s.event === "plan_change" ? "Bath Club plan change" : s.event === "cancelled" ? "Bath Club cancellation" : "Bath Club renewal reminder"} — ${s.memberName} · ${s.planName}`,
    html: subscriptionNotificationHtml(notifyData),
    variables: toResendVariables(notifyData),
  })
}

// ---- Subscription plan changed (customer) -------------------------------------------

export async function sendSubscriptionPlanChanged(c: {
  to: string; customerId?: string; firstName?: string | null
  oldPlanName: string; newPlanName: string; newPrice: string
  billingInterval: string; effective: string; renews?: string
  /** salon-side alert facts */
  email?: string | null; dogName?: string | null; periodEnd?: string
}) {
  const data: PlanChangedData = {
    firstName: firstNameOf(c.firstName) || "there",
    oldPlanName: c.oldPlanName,
    newPlanName: c.newPlanName,
    newPrice: c.newPrice,
    billingInterval: c.billingInterval,
    effective: c.effective,
    renews: c.renews,
  }
  await sendEmail({
    customerId: c.customerId,
    to: c.to,
    template: "subscription_plan_changed",
    subject: `Your Bath Club plan is now ${c.newPlanName}`,
    html: subscriptionPlanChangedHtml(data),
    variables: toResendVariables({ ...data }),
  })
  // The salon's copy — the owner wants every subscription event in the inbox.
  await sendSubscriptionAlert({
    event: "plan_change",
    memberName: c.firstName || c.to,
    email: c.email || c.to,
    dogName: c.dogName,
    planName: c.newPlanName,
    oldPlanName: c.oldPlanName,
    billingInterval: c.billingInterval,
    price: c.newPrice,
    periodEnd: c.periodEnd,
  })
}

export async function sendPaymentReceipt(p: {
  customerId?: string; amount: string; type: string; email?: string; bookingId?: string
  firstName?: string
}) {
  if (!p.email) return
  const data: PaymentData = {
    firstName: p.firstName || "there",
    amount: p.amount,
    whatFor: p.type,
    ref: p.bookingId ? `PAY-${p.bookingId.replace(/-/g, "").slice(0, 6).toUpperCase()}` : undefined,
    depositCredit: /deposit/i.test(p.type || ""),
  }
  await sendEmail({
    customerId: p.customerId,
    to: p.email,
    template: "payment_confirmation",
    subject: `Receipt — your ${p.amount} payment`,
    html: paymentConfirmationHtml(data),
    variables: toResendVariables({ ...data }),
    relatedBookingId: p.bookingId,
  })
}

// ---- Shop order confirmation (Stripe webhook) -------------------------------

export async function sendOrderReceipt(o: {
  customerId?: string; email: string; firstName?: string; orderNumber: string
  items: { name: string; qty: string | number; price: string; imageUrl?: string }[]
  subtotal: string; shipping: string; tax: string; total: string
  shipTo?: string; orderId?: string
}) {
  const data: OrderData = {
    firstName: o.firstName || "there",
    orderNumber: o.orderNumber,
    items: o.items,
    subtotal: o.subtotal,
    shipping: o.shipping,
    tax: o.tax,
    total: o.total,
    shipTo: o.shipTo,
  }
  return sendEmail({
    customerId: o.customerId,
    to: o.email,
    template: "order_confirmation",
    subject: `Order ${o.orderNumber} confirmed — thank you!`,
    html: orderConfirmationHtml(data),
    variables: toResendVariables({
      ...data,
      // The hosted design's own tokens: a pre-joined item list, the
      // line count, and the portal order link.
      itemList: itemListHtml(o.items),
      itemCount: o.items.reduce((n, i) => n + (Number(i.qty) || 0), 0),
      orderUrl: `${SITE_URL}/account/orders`,
    }),
    relatedOrderId: o.orderId,
  })
}

// ---- Abandoned cart recovery (daily sweep) --------------------------------------

export async function sendAbandonedCart(b: {
  customerId?: string; email: string; firstName?: string
  items: { name: string; qty: string | number; price: string }[]
  subtotal: string; bagUrl: string
}) {
  const data = {
    firstName: b.firstName || "there",
    items: b.items,
    subtotal: b.subtotal,
    bagUrl: b.bagUrl,
  }
  return sendEmail({
    customerId: b.customerId,
    to: b.email,
    category: "marketing",
    template: "abandoned_cart",
    subject: "You left something in your bag — it's saved",
    html: abandonedCartHtml(data),
    variables: toResendVariables(data),
  })
}

// ---- Accounts & security ---------------------------------------------------------

// The right door for the person's role — the same doors the portals use.
function signinDoorFor(role: string): string {
  if (["owner", "admin", "manager"].includes(role)) return `${SITE_URL}/admin-login`
  if (role === "customer") return `${SITE_URL}/access-customer`
  return `${SITE_URL}/access-seller`
}

// Kept for backward compatibility with earlier call sites.
export function inviteHtml(opts: { actionLink: string; role: string; firstName?: string | null; lastName?: string | null }): string {
  return teamMemberInviteHtml({
    fullName: [opts.firstName, opts.lastName].filter(Boolean).join(" ").trim() || undefined,
    role: opts.role,
    actionLink: opts.actionLink,
  })
}

// Portal invite (Resend) — delivers the Supabase magic-link invitation via the
// audit-trailed pipeline. Falls back to Supabase's own mailer when Resend
// isn't configured (caller decides).
export async function sendPortalInvite(opts: {
  to: string
  actionLink: string
  role: string
  firstName?: string | null
  lastName?: string | null
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const fullName = [opts.firstName, opts.lastName].filter(Boolean).join(" ").trim()
  const inviteData = {
    fullName: fullName || undefined,
    role: opts.role,
    actionLink: opts.actionLink,
    // Sunny's design's own tokens for the same facts.
    firstName: firstNameOf(opts.firstName) || "there",
    inviteUrl: opts.actionLink,
    inviterName: "The UnSaid Memories team",
  }
  return sendEmail({
    to: opts.to,
    template: "team_member_invite",
    subject: `You're invited — ${opts.role ? opts.role.charAt(0).toUpperCase() + opts.role.slice(1) : "team member"} at UnSaid Memories`,
    html: teamMemberInviteHtml(inviteData),
    variables: toResendVariables(inviteData),
  })
}

// Kept for backward compatibility with earlier call sites.
export function provisionedWelcomeHtml(opts: { signinUrl: string; role: string; firstName?: string | null; lastName?: string | null }): string {
  return newAccountCreatedHtml({
    firstName: [opts.firstName, opts.lastName].filter(Boolean).join(" ").trim() || "there",
    role: opts.role,
    signinUrl: opts.signinUrl,
    hasTempPassword: true,
  })
}

export async function sendPortalWelcome(opts: {
  to: string
  role: string
  firstName?: string | null
  lastName?: string | null
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const firstName = firstNameOf(opts.firstName) || "there"
  const rolePretty = opts.role ? opts.role.charAt(0).toUpperCase() + opts.role.slice(1) : "Team"
  const accountData = {
    firstName,
    role: opts.role,
    signinUrl: signinDoorFor(opts.role),
    hasTempPassword: true,
  }
  return sendEmail({
    to: opts.to,
    template: "new_account_created",
    subject: `Your UnSaid Memories ${rolePretty} account is ready`,
    html: newAccountCreatedHtml(accountData),
    variables: toResendVariables(accountData),
  })
}

export async function sendWelcomeBack(opts: { to: string; firstName?: string | null; customerId?: string }) {
  const firstName = firstNameOf(opts.firstName) || "there"
  return sendEmail({
    customerId: opts.customerId,
    to: opts.to,
    category: "marketing",
    template: "welcome_back",
    subject: "Welcome back — your profile's ready when you are",
    html: welcomeBackHtml({ firstName }),
    variables: toResendVariables({ firstName }),
  })
}

export async function sendNewDeviceLogin(opts: { to: string; firstName?: string | null; device?: string; when?: string; location?: string; browser?: string }) {
  const d: NewDeviceData = {
    firstName: firstNameOf(opts.firstName) || "there",
    when: opts.when || new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "long", timeStyle: "short" }) + " (CST)",
    device: opts.device || "A new device or browser",
    location: opts.location,
  }
  return sendEmail({
    to: opts.to,
    template: "login_new_device",
    subject: "New device signed in to your account",
    html: newDeviceLoginHtml(d),
    // The hosted design's tokens: browser + timestamp + the sign-in
    // door, alongside the legacy when/device pair.
    variables: toResendVariables({
      ...d,
      browser: opts.browser || d.device,
      timestamp: d.when,
      signinUrl: `${SITE_URL}/login`,
    }),
  })
}

// ---- Learning Center ----------------------------------------------------------------

export async function sendEnrollmentWelcome(e: { to: string; firstName?: string | null; programName?: string; instructor?: string }) {
  const data = {
    firstName: firstNameOf(e.firstName) || "there",
    programName: e.programName,
    instructor: e.instructor,
  }
  return sendEmail({
    to: e.to,
    template: "enrollment_welcome",
    subject: `You're enrolled in ${e.programName || "the Learning Center"}`,
    html: enrollmentWelcomeHtml(data),
    variables: toResendVariables(data),
  })
}

export async function sendClassReminder(c: { to: string; firstName?: string | null; moduleName: string; percentComplete: number; programName?: string; minutesLeft?: number }) {
  const data = {
    firstName: firstNameOf(c.firstName) || "there",
    moduleName: c.moduleName,
    percentComplete: c.percentComplete,
    programName: c.programName,
    minutesLeft: c.minutesLeft,
  }
  return sendEmail({
    to: c.to,
    template: "class_reminder",
    subject: `${firstNameOf(c.firstName) || "Good news"}, '${c.moduleName}' is ${c.percentComplete}% done`,
    html: classReminderHtml(data),
    variables: toResendVariables(data),
  })
}

export async function sendCompletionCongratulations(c: { to: string; firstName?: string | null; completedWhat: string; completedOn?: string; nextStep?: string }) {
  const data = {
    firstName: firstNameOf(c.firstName) || "there",
    completedWhat: c.completedWhat,
    completedOn: c.completedOn || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    nextStep: c.nextStep,
  }
  return sendEmail({
    to: c.to,
    template: "completion_congratulations",
    subject: `Congratulations — you completed ${c.completedWhat}!`,
    html: completionCongratulationsHtml(data),
    variables: toResendVariables(data),
  })
}

export async function sendEnrollmentNotification(e: { name?: string; email: string; program?: string; enrolledAt?: string }) {
  const data = {
    name: e.name || "New member",
    email: e.email,
    program: e.program,
    enrolledAt: e.enrolledAt || new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "long", timeStyle: "short" }),
  }
  return sendEmail({
    to: process.env.MANAGEMENT_NOTIFY_EMAIL || "booking@unsaidmemories.com",
    template: "enrollment_notification",
    subject: `New enrollment — ${e.name || e.email}`,
    html: enrollmentNotificationHtml(data),
    variables: toResendVariables(data),
  })
}

// ---- Commerce extras -------------------------------------------------------------------

export async function sendSubscriptionBillingNotice(s: SubscriptionBillingData & {
  to: string; customerId?: string
  /** Ledger key for idempotent reminder sweeps — e.g. "subrem-<id>@<periodEnd>". */
  ledgerKey?: string
}) {
  return sendEmail({
    customerId: s.customerId,
    to: s.to,
    template: "subscription_billing_notice",
    subject: `Heads up: ${s.amount} renews on ${s.billingDate}`,
    html: subscriptionBillingHtml(s),
    variables: toResendVariables({ ...s, to: undefined, customerId: undefined, ledgerKey: undefined }),
    ...(s.ledgerKey ? { relatedBookingId: s.ledgerKey } : {}),
  })
}

export async function sendMembershipActive(m: MembershipData & { to: string; customerId?: string }) {
  return sendEmail({
    customerId: m.customerId,
    to: m.to,
    template: "membership_active",
    subject: `Your ${m.planName} membership is active`,
    html: membershipActiveHtml(m),
    variables: toResendVariables({ ...m, to: undefined, customerId: undefined }),
  })
}

// ---- Bath Club renewal reminder (pre-charge, cron) -----------------------------------

/** Sent by /api/cron/subscription-reminders a few days before each Bath Club
 *  charge — the owner's "月扣款前发提醒邮件". Same shape as the billing
 *  notice: customer email + audit trail through sendEmail. */
export async function sendSubscriptionRenewalReminder(
  s: SubscriptionRenewalReminderData & { to: string; customerId?: string },
) {
  return sendEmail({
    customerId: s.customerId,
    to: s.to,
    template: "subscription_renewal_reminder",
    subject: `Heads up: ${s.amount} renews on ${s.renewsOn}`,
    html: subscriptionRenewalReminderHtml(s),
    variables: toResendVariables({ ...s, to: undefined, customerId: undefined }),
  })
}

// ---- Template Studio test sends -----------------------------------------------------------

/** Sends any catalog template (rendered with its sample data) to a recipient. */
export async function sendTemplateTest(templateId: string, to: string): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const def = getTemplateDef(templateId)
  if (!def) return { ok: false, error: `Unknown template: ${templateId}` }
  if (def.channel !== "resend") {
    return { ok: false, error: "Supabase templates are pasted into the Supabase dashboard — they can't be test-sent from here." }
  }
  return sendEmail({
    to,
    template: `studio_test_${def.id}`,
    subject: `[TEST] ${def.subject}`,
    html: def.html,
  })
}

// ---- Manual salon messages (Customer 360 → Send Email) --------------------------------------

/** Freeform admin-typed message, wrapped in the branded frame. */
export async function sendSalonMessage(opts: {
  to: string
  customerId?: string
  subject: string
  message: string
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const paragraphs = String(opts.message || "")
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/\n/g, "<br>"))
  if (paragraphs.length === 0) paragraphs.push("&nbsp;")
  const plain = String(opts.message || "").replace(/<[^>]+>/g, "").slice(0, 90)
  const html = frame({
    preheader: plain ? `${plain}…` : "A note from UnSaid Memories.",
    body: [
      eyebrow("A note from UnSaid Memories"),
      h1("Hello from the salon"),
      taglineFlourish(),
      ...paragraphs.map((t) => p(t)),
      pawDivider(),
      p(`— The UnSaid Memories family`, { small: true, muted: true, center: true }),
    ].join(""),
    reason: `You're receiving this message because you're an UnSaid Memories customer.`,
  })
  return sendEmail({
    customerId: opts.customerId,
    to: opts.to,
    template: "salon_message",
    subject: opts.subject || "A note from UnSaid Memories",
    html,
    variables: toResendVariables({ subject: opts.subject, message: opts.message }),
  })
}

// ---- Order status updates (fulfillment queue) ------------------------------------------------

export async function sendOrderStatusUpdate(opts: {
  to: string
  customerId?: string
  orderNumber: string
  statusNote: string
  firstName?: string
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const html = frame({
    preheader: `Update on order ${opts.orderNumber}.`,
    body: [
      eyebrow("Order update"),
      h1(`Update on your order${opts.firstName ? `, ${esc(opts.firstName)}` : ""}`),
      taglineFlourish(),
      p(esc(opts.statusNote)),
      detailsCard("Your order", [
        { label: "Order number", value: esc(opts.orderNumber) },
        { label: "Questions", value: `Reply to this email or ${BRAND.email}` },
      ]),
      p(`Thank you for shopping small — it genuinely means the world to a salon like ours.`, { muted: true, small: true }),
    ].join(""),
    reason: `You're receiving this because you placed an order at unsaidmemories.com.`,
  })
  return sendEmail({
    customerId: opts.customerId,
    to: opts.to,
    template: "order_alert",
    subject: `Your order ${opts.orderNumber} — UnSaid Memories`,
    html,
    variables: toResendVariables({
      orderNumber: opts.orderNumber,
      statusNote: opts.statusNote,
      firstName: opts.firstName,
    }),
  })
}

export { BRAND as EMAIL_BRAND, esc as escapeEmailHtml }

import "server-only"
import { repo } from "./repo"
import { resolveTenantId } from "@/lib/tenant-id";

// ---------------------------------------------------------------------------
// Customer notifications — the in-app inbox behind the customer portal's
// notification bell (owner ruling: "system notifications" inside the
// customer portal — communication of order updates, a copy of their
// invoices, a copy of their orders).
//
// Every CUSTOMER-FACING email the storefront sends also lands here as an
// in-app notification, hooked centrally inside sendEmail()
// (src/lib/email.ts): if the send carries a customerId and the template is
// customer-facing, a notification row is written fire-and-forget — even
// when the email itself fails, the in-app copy still exists. Internal
// alerts never carry a customerId, so they never appear in a customer's
// bell.
//
// Writes go through the service-role repo (RLS write stays closed); reads
// are session-scoped in /api/customer/notifications.
//
// E-COMMERCE CLEANUP: the booking_* / appointment_* / salon_message /
// rebooking_reminder / pet_birthday / vaccine_reminder / precheckin_received
// / abandoned_booking / winback_offer template entries were DROPPED when
// the platform moved off pet grooming and appointments — the bell no
// longer records a notification for those (legacy templates that still
// fire from automation-executor.ts simply return early from
// recordCustomerNotification when their id is no longer in TEMPLATE_META).
// Order / invoice / subscription / account / learning notifications are
// kept: those are the e-commerce surface.
// ---------------------------------------------------------------------------

/** The notification families the bell groups and icons. */
export type NotificationType =
  | "appointment"
  | "invoice"
  | "order"
  | "subscription"
  | "account"
  | "learning"
  | "message"

export interface CustomerNotification {
  id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  relatedId: string | null
  readAt: string | null
  createdAt: string
}

const TENANT_ID = resolveTenantId()

// template id → (notification type, portal deep link, friendly one-liner).
// The TITLE is always the email subject (already customer-readable, e.g.
// "Order shipped — your candles are on the way"); body adds the
// "why is this in my bell" line.
const TEMPLATE_META: Record<
  string,
  { type: NotificationType; link: string; body: string }
> = {
  // Invoices & payments — the "copy of their invoices"
  payment_confirmation: {
    type: "invoice",
    link: "/customer/invoices",
    body: "A copy of your receipt is in your email inbox and in My Invoices.",
  },

  // Shop orders — the "copy of their orders"
  order_confirmation: {
    type: "order",
    link: "/customer/orders",
    body: "A copy of your order confirmation is in your email inbox.",
  },
  order_alert: {
    type: "order",
    link: "/customer/orders",
    body: "An update on your order — tracking and history live in My Orders.",
  },
  order_packed: {
    type: "order",
    link: "/customer/orders",
    body: "Your order is being prepared — tracking and history live in My Orders.",
  },
  order_shipped: {
    type: "order",
    link: "/customer/orders",
    body: "Your order has shipped — tracking and history live in My Orders.",
  },
  order_delivered: {
    type: "order",
    link: "/customer/orders",
    body: "Your order has been delivered — details live in My Orders.",
  },

  // Subscriptions / memberships
  subscription_billing_notice: {
    type: "subscription",
    link: "/customer/orders/subscriptions",
    body: "Your membership billed — a copy is in your email inbox.",
  },
  membership_active: {
    type: "subscription",
    link: "/customer/orders/subscriptions",
    body: "Your membership is active. Manage it any time.",
  },
  subscription_plan_changed: {
    type: "subscription",
    link: "/customer/orders/subscriptions",
    body: "Your membership plan changed — a copy is in your email inbox.",
  },
  subscription_renewal_reminder: {
    type: "subscription",
    link: "/customer/orders/subscriptions",
    body: "Your membership renews soon — see the amount and date before it charges.",
  },

  // Account
  customer_welcome: {
    type: "account",
    link: "/customer/dashboard",
    body: "Welcome to UnSaid Memories! Your orders and account history live here.",
  },
  new_account_created: {
    type: "account",
    link: "/customer/dashboard",
    body: "Your portal account was set up by our team. A copy is in your email inbox.",
  },
  welcome_back: {
    type: "account",
    link: "/customer/dashboard",
    body: "You're signed in to your portal.",
  },
  login_new_device: {
    type: "account",
    link: "/customer/profile/communication-preferences",
    body: "A new device signed in to your account. Not you? Contact us.",
  },

  // Learning Center
  enrollment_welcome: {
    type: "learning",
    link: "/customer/learn",
    body: "You're enrolled — your course lives in Learn Courses.",
  },
  class_reminder: {
    type: "learning",
    link: "/customer/learn",
    body: "Pick up where you left off — your course remembers your progress.",
  },
  completion_congratulations: {
    type: "learning",
    link: "/customer/learn",
    body: "Congratulations — your certificate details are in Learn Courses.",
  },

  // Reminder automations (quick actions) — account-scoped only.
  unsigned_doc_reminder: {
    type: "message",
    link: "/customer/dashboard",
    body: "A document on your account is waiting for your signature — details are in your email.",
  },
}

/** True when the template is one a CUSTOMER receives (not an internal alert). */
export function isCustomerFacingTemplate(template: string): boolean {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_META, template)
}

/**
 * Records the in-app copy of a customer email. Called fire-and-forget from
 * sendEmail() — never awaited on the request path, never throws.
 */
export async function recordCustomerNotification(opts: {
  customerId: string
  template: string
  subject: string
  relatedBookingId?: string
  relatedInvoiceId?: string
  relatedOrderId?: string
}): Promise<void> {
  const meta = TEMPLATE_META[opts.template]
  if (!meta) return
  try {
    await repo.create("customer_notifications", {
      customerId: opts.customerId,
      type: meta.type,
      // Titles keep the email subject verbatim — it already says exactly
      // what happened ("Order shipped — your candles are on the way").
      title: opts.subject.slice(0, 300),
      body: meta.body,
      link: meta.link,
      relatedId:
        opts.relatedBookingId || opts.relatedInvoiceId || opts.relatedOrderId || null,
      tenant_id: TENANT_ID,
    })
  } catch (e: any) {
    // The email is the primary channel — a failed in-app copy must never
    // break or slow the send.
    console.error("[notifications] record failed:", e?.message || e)
  }
}

// ---------------------------------------------------------------------------
// The master email template catalog — every email UnSaid Memories sends,
// in one place, rendered with sample data for previews and exports.
//
//   channel "supabase" → HTML contains GoTrue handlebars and is pushed to the
//                        hosted Supabase project's auth config automatically:
//                        `bun run email-templates:push` (Management API PATCH
//                        with rollback snapshot + verify).
//   channel "resend"   → rendered server-side with live data and sent via
//                        the audit-trailed sendEmail() pipeline.
// ---------------------------------------------------------------------------

import {
  confirmSignupHtml,
  inviteUserHtml,
  magicLinkHtml,
  changeEmailHtml,
  resetPasswordHtml,
  reauthenticationHtml,
  passwordChangedHtml,
  emailAddressChangedHtml,
  phoneNumberChangedHtml,
  signInMethodLinkedHtml,
  signInMethodRemovedHtml,
  mfaAddedHtml,
  mfaRemovedHtml,
} from "./auth"
import {
  paymentConfirmationHtml,
  abandonedCartHtml,
  orderConfirmationHtml,
  orderShippedHtml,
  SAMPLE_ORDER_SHIPPED,
  orderPackedHtml,
  SAMPLE_ORDER_PACKED,
  orderDeliveredHtml,
  SAMPLE_ORDER_DELIVERED,
  groomerLeadHtml,
  SAMPLE_GROOMER_LEAD,
  subscriptionBillingHtml,
  membershipActiveHtml,
  subscriptionRenewalReminderHtml,
  SAMPLE_PAYMENT,
  SAMPLE_ORDER,
  SAMPLE_RENEWAL_REMINDER,
} from "./commerce"
import {
  giftCardDeliveryHtml,
  giftCardPurchaseHtml,
  giftCardReminderHtml,
  SAMPLE_GIFT_CARD_DELIVERY,
  SAMPLE_GIFT_CARD_PURCHASE,
  SAMPLE_GIFT_CARD_REMINDER,
} from "./gift-cards"
import {
  invoiceEmailHtml,
  SAMPLE_INVOICE_EMAIL,
} from "./invoices"
import {
  customerWelcomeHtml,
  newAccountCreatedHtml,
  teamMemberInviteHtml,
  welcomeBackHtml,
  newDeviceLoginHtml,
} from "./accounts"
import { enrollmentWelcomeHtml, classReminderHtml, completionCongratulationsHtml, learnWaitlistConfirmationHtml } from "./learning"
import { couponMailerHtml, SAMPLE_COUPON, newsletterConfirmationHtml } from "./marketing"
import { unsignedDocReminderHtml, SAMPLE_UNSIGNED_DOC } from "./documents"
import { bookingNotificationHtml, consultationNotificationHtml, enrollmentNotificationHtml } from "./internal"
import {
  supportTicketReceivedHtml,
  supportAgentReplyHtml,
  supportReminderHtml,
  supportResolvedHtml,
  contactReceivedHtml,
  feedbackReceivedHtml,
  SAMPLE_SUPPORT_MAIL,
} from "./support"

export type TemplateChannel = "resend" | "supabase"
export type TemplateGroupId =
  | "auth"
  | "security"
  | "commerce"
  | "accounts"
  | "learning"
  | "marketing"
  | "internal"
  | "support"

export interface EmailTemplateDef {
  id: string
  name: string
  group: TemplateGroupId
  channel: TemplateChannel
  description: string
  subject: string
  html: string
  /** Supabase dashboard path for this template (manual fallback reference). */
  supabasePath?: string
  notes?: string[]
  /** How this template is used in production, if it's wired already. */
  wired?: string
}

export const TEMPLATE_GROUPS: { id: TemplateGroupId; label: string; description: string }[] = [
  { id: "auth", label: "Supabase Auth — Account Emails", description: "Auto-pushed to the hosted Supabase project via `bun run email-templates:push`. Supabase sends these automatically." },
  { id: "security", label: "Supabase Security Alerts", description: "Auto-pushed with the auth templates — security notice section of the Supabase project config." },
  { id: "commerce", label: "Payments, Orders & Billing", description: "Sent via Resend from checkout, Stripe webhooks, and billing." },
  { id: "accounts", label: "Accounts & Team", description: "Sent via Resend when accounts are created, invited, or signed in." },
  { id: "learning", label: "Leashed Learning Center", description: "Sent via Resend for enrollments, class nudges, and completions." },
  { id: "marketing", label: "Marketing & Offers", description: "Campaign sends — these include an unsubscribe link." },
  { id: "internal", label: "Salon Notifications (Staff)", description: "Internal alerts to booking@ and the management team." },
  { id: "support", label: "Support Desk", description: "Ticket lifecycle emails from the Support Desk — received, reply, reminder, resolved — sent via Resend." },
]

const SUPABASE_NOTES = [
  "Pushed to the hosted project in one command: bun run email-templates:push.",
  "Leave placeholders like {{ .ConfirmationURL }} and {{ .Token }} exactly as written — Supabase replaces them when the email is sent.",
  "The sample render shows the placeholders on purpose: that's the exact HTML that gets pushed.",
  "Manual fallback: copy the HTML and paste into the dashboard editor — only if you prefer doing it by hand.",
]

const PASTE_PATH = "Supabase Dashboard → your project → Authentication → Email Templates"

export const EMAIL_TEMPLATES: EmailTemplateDef[] = [
  // ---- Supabase Auth ------------------------------------------------------------
  {
    id: "supabase_confirm_signup",
    name: "Confirm sign up",
    group: "auth",
    channel: "supabase",
    description: "Ask users to confirm their email address after signing up.",
    subject: "Confirm your email — UnSaid Memories",
    html: confirmSignupHtml(),
    supabasePath: `${PASTE_PATH} → Confirm signup`,
    notes: SUPABASE_NOTES,
  },
  {
    id: "supabase_invite_user",
    name: "Invite user",
    group: "auth",
    channel: "supabase",
    description: "Invite someone to create an account.",
    subject: "Your UnSaid Memories portal invitation",
    html: inviteUserHtml(),
    supabasePath: `${PASTE_PATH} → Invite user`,
    notes: SUPABASE_NOTES,
  },
  {
    id: "supabase_magic_link",
    name: "Magic link or OTP",
    group: "auth",
    channel: "supabase",
    description: "Send a one-time sign-in link or one-time password.",
    subject: "Your UnSaid Memories sign-in code",
    html: magicLinkHtml(),
    supabasePath: `${PASTE_PATH} → Magic Link`,
    notes: SUPABASE_NOTES,
  },
  {
    id: "supabase_change_email",
    name: "Change email address",
    group: "auth",
    channel: "supabase",
    description: "Ask users to verify their new email address after changing it.",
    subject: "Confirm your new email address — UnSaid Memories",
    html: changeEmailHtml(),
    supabasePath: `${PASTE_PATH} → Change Email Address`,
    notes: SUPABASE_NOTES,
  },
  {
    id: "supabase_reset_password",
    name: "Reset password",
    group: "auth",
    channel: "supabase",
    description: "Send a password reset link or code.",
    subject: "Reset your UnSaid Memories password",
    html: resetPasswordHtml(),
    supabasePath: `${PASTE_PATH} → Reset Password`,
    notes: SUPABASE_NOTES,
  },
  {
    id: "supabase_reauthentication",
    name: "Reauthentication",
    group: "auth",
    channel: "supabase",
    description: "Ask users to verify their identity before a sensitive operation.",
    subject: "Verify it's you — UnSaid Memories security check",
    html: reauthenticationHtml(),
    supabasePath: `${PASTE_PATH} → Reauthentication`,
    notes: SUPABASE_NOTES,
  },

  // ---- Supabase Security ---------------------------------------------------------
  {
    id: "supabase_security_password_changed",
    name: "Password changed",
    group: "security",
    channel: "supabase",
    description: "Notify users when their password has changed.",
    subject: "Your UnSaid Memories password was changed",
    html: passwordChangedHtml(),
    supabasePath: `${PASTE_PATH} → Security → Password changed`,
    notes: SUPABASE_NOTES,
  },
  {
    id: "supabase_security_email_changed",
    name: "Email address changed",
    group: "security",
    channel: "supabase",
    description: "Notify users when their email address has changed.",
    subject: "Your UnSaid Memories email address was changed",
    html: emailAddressChangedHtml(),
    supabasePath: `${PASTE_PATH} → Security → Email address changed`,
    notes: SUPABASE_NOTES,
  },
  {
    id: "supabase_security_phone_changed",
    name: "Phone number changed",
    group: "security",
    channel: "supabase",
    description: "Notify users when their phone number has changed.",
    subject: "Your UnSaid Memories phone number was changed",
    html: phoneNumberChangedHtml(),
    supabasePath: `${PASTE_PATH} → Security → Phone number changed`,
    notes: SUPABASE_NOTES,
  },
  {
    id: "supabase_security_signin_linked",
    name: "Sign-in method linked",
    group: "security",
    channel: "supabase",
    description: "Notify users when a sign-in method has been linked to their account.",
    subject: "A sign-in method was linked to your account",
    html: signInMethodLinkedHtml(),
    supabasePath: `${PASTE_PATH} → Security → Sign-in method linked`,
    notes: SUPABASE_NOTES,
  },
  {
    id: "supabase_security_signin_removed",
    name: "Sign-in method removed",
    group: "security",
    channel: "supabase",
    description: "Notify users when a sign-in method has been removed from their account.",
    subject: "A sign-in method was removed from your account",
    html: signInMethodRemovedHtml(),
    supabasePath: `${PASTE_PATH} → Security → Sign-in method removed`,
    notes: SUPABASE_NOTES,
  },
  {
    id: "supabase_security_mfa_added",
    name: "MFA method added",
    group: "security",
    channel: "supabase",
    description: "Notify users when an MFA method has been added to their account.",
    subject: "Two-factor authentication was added to your account",
    html: mfaAddedHtml(),
    supabasePath: `${PASTE_PATH} → Security → MFA method added`,
    notes: SUPABASE_NOTES,
  },
  {
    id: "supabase_security_mfa_removed",
    name: "MFA method removed",
    group: "security",
    channel: "supabase",
    description: "Notify users when an MFA method has been removed from their account.",
    subject: "Two-factor authentication was removed from your account",
    html: mfaRemovedHtml(),
    supabasePath: `${PASTE_PATH} → Security → MFA method removed`,
    notes: SUPABASE_NOTES,
  },

  // ---- Commerce --------------------------------------------------------------------
  {
    id: "payment_confirmation",
    name: "Payment confirmation",
    group: "commerce",
    channel: "resend",
    description: "Receipt-style confirmation for any payment received.",
    subject: "Receipt — your $25.00 deposit",
    html: paymentConfirmationHtml(SAMPLE_PAYMENT),
    wired: "Sent automatically for deposits and payments (checkout + webhook).",
  },
  {
    id: "gift_card_delivery",
    name: "Gift card — delivered to recipient",
    group: "commerce",
    channel: "resend",
    description: "The gift card itself: design, value, redemption code and the sender's message.",
    subject: "Alex sent you an UnSaid Memories gift card",
    html: giftCardDeliveryHtml(SAMPLE_GIFT_CARD_DELIVERY),
    wired: "Sent automatically when a gift card is purchased (Stripe webhook).",
  },
  {
    id: "gift_card_purchase_confirmation",
    name: "Gift card — buyer receipt",
    group: "commerce",
    channel: "resend",
    description: "Receipt to the buyer with the card number, when the card goes to someone else.",
    subject: "Your UnSaid Memories gift card is on its way",
    html: giftCardPurchaseHtml(SAMPLE_GIFT_CARD_PURCHASE),
    wired: "Sent automatically when a gift card is purchased for another person.",
  },
  {
    id: "gift_card_reminder",
    name: "Gift card — balance reminder",
    group: "commerce",
    channel: "resend",
    description: "Reminder to a cardholder with remaining balance.",
    subject: "Don't forget your UnSaid Memories gift card balance",
    html: giftCardReminderHtml(SAMPLE_GIFT_CARD_REMINDER),
    wired: "Sent manually from Admin → Gift Cards → Remind, and in batch by the Send Gift Card Reminders quick action.",
  },
  {
    id: "invoice_send",
    name: "Invoice — send",
    group: "commerce",
    channel: "resend",
    description: "Invoice delivery with line items and payment link.",
    subject: "Your UnSaid Memories invoice is ready",
    html: invoiceEmailHtml(SAMPLE_INVOICE_EMAIL),
    wired: "Sent manually from Admin → Invoices → Send.",
  },
  {
    id: "invoice_reminder",
    name: "Invoice — payment reminder",
    group: "commerce",
    channel: "resend",
    description: "Payment reminder for an outstanding invoice.",
    subject: "Reminder: your UnSaid Memories invoice is due",
    html: invoiceEmailHtml({ ...SAMPLE_INVOICE_EMAIL, isReminder: true }),
    wired: "Sent manually from Admin → Invoices → Send Reminder, and by the payment-reminder quick actions (single, per-customer, and overdue batch).",
  },
  {
    id: "order_confirmation",
    name: "Order confirmation",
    group: "commerce",
    channel: "resend",
    description: "Shop order confirmation with items and totals.",
    subject: "Order ORD-10248 confirmed — thank you!",
    html: orderConfirmationHtml(SAMPLE_ORDER),
    wired: "Sent automatically when a shop order is paid (Stripe webhook).",
  },
  {
    id: "abandoned_cart",
    name: "Abandoned cart reminder",
    group: "commerce",
    channel: "resend",
    description: "One-time \"complete your purchase\" nudge with the saved bag's items.",
    subject: "You left something in your bag — it's saved",
    html: abandonedCartHtml({
      firstName: "Brea",
      items: [{ name: "Pet Clothes Autumn And Winter Small Dog Cotton Sweater", qty: 1, price: "$4.90" }],
      subtotal: "$4.90",
      bagUrl: "https://www.unsaidmemories.com/shop/bag",
    }),
    wired: "Sent once by the daily abandoned-carts sweep for a signed-in bag idle 4+ hours (opt-outs honored).",
  },
  {
    id: "order_shipped",
    name: "Order shipped",
    group: "commerce",
    channel: "resend",
    description: "Tracking notice sent when a supplier order is marked shipped.",
    subject: "Your UnSaid Memories order is on its way",
    html: orderShippedHtml(SAMPLE_ORDER_SHIPPED),
    wired: "Sent from Admin → Supplier Orders when tracking is entered, and from Seller Center → Orders when the seller ships.",
  },
  {
    id: "order_packed",
    name: "Order packed",
    group: "commerce",
    channel: "resend",
    description: "Preparation notice sent when the seller packs the order.",
    subject: "Your UnSaid Memories order is being prepared",
    html: orderPackedHtml(SAMPLE_ORDER_PACKED),
    wired: "Sent from Seller Center → Orders when the seller marks the order packed.",
  },
  {
    id: "order_delivered",
    name: "Order delivered",
    group: "commerce",
    channel: "resend",
    description: "Delivery notice sent when the order is marked delivered.",
    subject: "Your UnSaid Memories order has been delivered",
    html: orderDeliveredHtml(SAMPLE_ORDER_DELIVERED),
    wired: "Sent from Seller Center → Orders when the seller marks the order delivered.",
  },
  {
    id: "groomer_lead",
    name: "Groomer lead",
    group: "commerce",
    channel: "resend",
    description: "A directory lead delivered to a grooming partner — the lead-only contact path (the partner's email is never printed on their card).",
    subject: "New grooming lead from the partner directory",
    html: groomerLeadHtml(SAMPLE_GROOMER_LEAD),
    wired: "Sent from the partner directory lead form (/api/directory/groomer-lead) to the partner's account email.",
  },
  {
    id: "subscription_billing_notice",
    name: "Subscription billing notice",
    group: "commerce",
    channel: "resend",
    description: "\"Your card will be billed\" advance notice for subscriptions.",
    subject: "Heads up: $34.00 renews on February 1",
    html: subscriptionBillingHtml({
      firstName: "Brea",
      planName: "Top Dog Club — Monthly",
      amount: "$34.00",
      billingDate: "February 1",
      cardBrand: "Visa",
      cardLast4: "4242",
    }),
    wired: "Ready — send ahead of each renewal cycle.",
  },
  {
    id: "subscription_renewal_reminder",
    name: "Bath Club renewal reminder",
    group: "commerce",
    channel: "resend",
    description: "Pre-charge reminder sent a few days before each Bath Club renewal.",
    subject: "Heads up: $129.00 renews on March 5",
    html: subscriptionRenewalReminderHtml(SAMPLE_RENEWAL_REMINDER),
    wired: "Sent by the daily reminder cron (/api/cron/subscription-reminders) for memberships renewing within 3 days.",
  },
  {
    id: "membership_active",
    name: "Your membership is active",
    group: "commerce",
    channel: "resend",
    description: "Welcome to the membership with perks and renewal info.",
    subject: "Your Top Dog membership is active",
    html: membershipActiveHtml({
      firstName: "Brea",
      planName: "Top Dog Club",
      perks: [
        { title: "10% off every groom, every time", body: "Member pricing applies automatically when you book." },
        { title: "Priority booking windows", body: "First pick of Saturday slots, 48 hours before everyone else." },
        { title: "A free birthday bath", body: "Within your pup's birthday month — we'll remind you." },
      ],
      renewal: "Renews monthly · cancel any time",
    }),
    wired: "Sent when a membership is activated or renewed.",
  },

  // ---- Accounts ---------------------------------------------------------------------
  {
    id: "customer_welcome",
    name: "Welcome email",
    group: "accounts",
    channel: "resend",
    description: "Welcome to UnSaid Memories — new customer account created.",
    subject: "Welcome to UnSaid Memories",
    html: customerWelcomeHtml({ firstName: "Brea" }),
    wired: "Sent automatically when a new customer account is created.",
  },
  {
    id: "new_account_created",
    name: "New account created",
    group: "accounts",
    channel: "resend",
    description: "Owner-provisioned account with sign-in door for the role.",
    subject: "Your UnSaid Memories Customer account is ready",
    html: newAccountCreatedHtml({
      firstName: "Brea",
      role: "customer",
      signinUrl: "https://www.unsaidmemories.com/access-customer",
      hasTempPassword: true,
    }),
    wired: "Sent when the salon creates an account from the CRM.",
  },
  {
    id: "team_member_invite",
    name: "You've been invited as a team member",
    group: "accounts",
    channel: "resend",
    description: "Staff invite with role and one-time accept link.",
    subject: "You're invited — Team member at UnSaid Memories",
    html: teamMemberInviteHtml({
      fullName: "Maya Johnson",
      role: "Team Member",
      actionLink: "https://www.unsaidmemories.com/auth/set-password",
      invitedBy: "Brea",
    }),
    wired: "Sent when a team member is invited (Users & Access).",
  },
  {
    id: "welcome_back",
    name: "Welcome back",
    group: "accounts",
    channel: "resend",
    description: "Returning customer detected — profile exists, sign in to continue.",
    subject: "Welcome back — your profile's ready when you are",
    html: welcomeBackHtml({ firstName: "Brea" }),
    wired: "Sent when a booking is started with an email that already has a profile.",
  },
  {
    id: "login_new_device",
    name: "Signed in from a new device",
    group: "accounts",
    channel: "resend",
    description: "Security notice when the account is signed in from an unrecognized device.",
    subject: "New device signed in to your account",
    html: newDeviceLoginHtml({
      firstName: "Brea",
      when: "Today at 8:42 PM (CST)",
      device: "Chrome on Windows · Memphis, TN area",
    }),
    wired: "Sent on first sign-in from an unrecognized device or browser.",
  },

  // ---- Learning ----------------------------------------------------------------------
  {
    id: "enrollment_welcome",
    name: "Learning Center enrollment welcome",
    group: "learning",
    channel: "resend",
    description: "Enrollment confirmation with classroom next-steps.",
    subject: "You're enrolled in the Pet Groomer Certification",
    html: enrollmentWelcomeHtml({
      firstName: "Brea",
      programName: "Pet Groomer Certification",
      instructor: "Your Leashed Academy instructor team",
    }),
    wired: "Sent when a learner enrolls in a Learning Center program.",
  },
  {
    id: "class_reminder",
    name: "Complete your class reminder",
    group: "learning",
    channel: "resend",
    description: "Nudge to finish a module, with progress bar.",
    subject: "Brea, 'Safe Handling Fundamentals' is 60% done",
    html: classReminderHtml({
      firstName: "Brea",
      moduleName: "Safe Handling Fundamentals",
      percentComplete: 60,
      programName: "Pet Groomer Certification",
      minutesLeft: 25,
    }),
    wired: "Ready — fires from the automation sweep for stalled learners.",
  },
  {
    id: "completion_congratulations",
    name: "Congratulations — module / course / certificate",
    group: "learning",
    channel: "resend",
    description: "Celebration email for completing a module, course, or certificate.",
    subject: "Congratulations — you completed Safe Handling Fundamentals!",
    html: completionCongratulationsHtml({
      firstName: "Brea",
      completedWhat: "Safe Handling Fundamentals — Module 2",
      completedOn: "January 12, 2026",
      nextStep: "Module 3 (Breed Styling Basics) unlocks now — about 40 minutes.",
    }),
    wired: "Sent when a learner completes a module, course, or certificate.",
  },

  {
    id: "learn_waitlist_confirmation",
    name: "Learning Center waitlist confirmation",
    group: "learning",
    channel: "resend",
    description: "Receipt for joining the Enrolling Soon waitlist — the signer hears back the moment enrollment opens.",
    subject: "You're on the Learning Center waitlist",
    html: learnWaitlistConfirmationHtml(),
    wired: "Sent by /api/learn/waitlist through the alerts pattern (src/lib/notify.ts) when a waitlist signup lands.",
  },

  // ---- Marketing ------------------------------------------------------------------------
  {
    id: "unsigned_doc_reminder",
    name: "Unsigned document — signature reminder",
    group: "accounts",
    channel: "resend",
    description: "Reminder listing a customer's documents still waiting for their signature (crm_unsigned_documents, status pending), grouped per customer.",
    subject: "A document is waiting for your signature",
    html: unsignedDocReminderHtml(SAMPLE_UNSIGNED_DOC),
    wired: "Sent by the Run Unsigned Docs quick action (Admin → System → Automation), deduped 7 days per customer.",
  },
  {
    id: "sales_coupon_mailer",
    name: "Sales / discount coupons mailer",
    group: "marketing",
    channel: "resend",
    description: "Promotional offer mailer with code and fine print — includes unsubscribe.",
    subject: "Spring Fluff-Up: 20% off every groom",
    html: couponMailerHtml(SAMPLE_COUPON),
    wired: "Send to the marketing list from the Studio (test) or campaigns.",
  },
  {
    id: "newsletter_confirmation",
    name: "Newsletter — you're subscribed",
    group: "marketing",
    channel: "resend",
    description: "The 'You're subscribed' receipt for a newsletter signup — the reference instance of the alerts pattern.",
    subject: "You're on the list — UnSaid Memories",
    html: newsletterConfirmationHtml("https://www.unsaidmemories.com/api/newsletter/confirm?token=sample"),
    wired: "Sent by /api/newsletter/subscribe through the alerts pattern (src/lib/notify.ts) the moment the subscriber row lands.",
  },

  // ---- Internal --------------------------------------------------------------------------
  {
    id: "booking_notification",
    name: "New booking (salon alert)",
    group: "internal",
    channel: "resend",
    description: "Internal alert to the salon when a booking lands.",
    subject: "New booking — Brea (Bella) · Sat 10:00 AM",
    html: bookingNotificationHtml({
      ownerName: "Brea Freeman",
      dogName: "Bella",
      service: "Bath & Brush + Deshedding",
      size: "Medium",
      date: "Saturday",
      time: "10:00 AM",
      email: "brea@example.com",
      phone: "901-555-0142",
      bookingRef: "BK-4F2A91",
    }),
    wired: "Sent to booking@unsaidmemories.com when a booking is confirmed.",
  },
  {
    id: "consultation_notification",
    name: "New consultation request (salon alert)",
    group: "internal",
    channel: "resend",
    description: "Internal alert when a consultation form is submitted.",
    subject: "New consultation request — Brea",
    html: consultationNotificationHtml({
      name: "Brea Freeman",
      dogName: "Bella",
      breed: "Goldendoodle",
      concerns: "First groom — a little nervous around blow dryers.",
      preferredTime: "Weekday mornings",
      email: "brea@example.com",
      phone: "901-555-0142",
    }),
    wired: "Sent to booking@unsaidmemories.com when a consult is requested.",
  },
  {
    id: "enrollment_notification",
    name: "New enrollment (management alert)",
    group: "internal",
    channel: "resend",
    description: "Internal alert when a learner enrolls in the Learning Center.",
    subject: "New enrollment — Brea Freeman",
    html: enrollmentNotificationHtml({
      name: "Brea Freeman",
      email: "brea@example.com",
      program: "Pet Groomer Certification",
      enrolledAt: "January 12, 2026 at 8:42 PM",
    }),
    wired: "Sent to management when a learner enrolls.",
  },

  // ---- Support Desk -------------------------------------------------------------
  {
    id: "support_ticket_received",
    name: "Support ticket received",
    group: "support",
    channel: "resend",
    description: "Confirmation to the requester when a support ticket is created, with the ticket reference.",
    subject: "We got your message [SUP-1042]",
    html: supportTicketReceivedHtml(SAMPLE_SUPPORT_MAIL),
    wired: "Sent on ticket creation from every intake (customer/employee/seller support pages, DMCA form, SMS, webhook).",
  },
  {
    id: "contact_received",
    name: "Contact form received",
    group: "support",
    channel: "resend",
    description: "Receipt for a public contact-form message (Help Center → Contact Us).",
    subject: "We got your message — UnSaid Memories",
    html: contactReceivedHtml({ firstName: "Alex" }),
    wired: "Sent by /api/cms/messages through the alerts pattern (src/lib/notify.ts) when the message lands.",
  },
  {
    id: "feedback_received",
    name: "Feedback received",
    group: "support",
    channel: "resend",
    description: "Receipt for a feedback submission — feedback files into the Support Desk under its own category and the submitter gets the ticket reference.",
    subject: "Thanks for the feedback — UnSaid Memories",
    html: feedbackReceivedHtml({ firstName: "Alex", ticketRef: "SUP-1042" }),
    wired: "Sent by /api/feedback through the alerts pattern (src/lib/notify.ts) when the submission lands.",
  },
  {
    id: "support_agent_reply",
    name: "Support agent reply",
    group: "support",
    channel: "resend",
    description: "Notifies the requester when staff reply on their ticket; the reply text rides along.",
    subject: "Re: Question about my grooming appointment [SUP-1042]",
    html: supportAgentReplyHtml(SAMPLE_SUPPORT_MAIL),
    wired: "Sent from the admin Support Desk reply action.",
  },
  {
    id: "support_reminder",
    name: "Support ticket reminder",
    group: "support",
    channel: "resend",
    description: "A nudge when a ticket is waiting on the requester's reply.",
    subject: "Reminder: we're waiting to hear from you [SUP-1042]",
    html: supportReminderHtml(SAMPLE_SUPPORT_MAIL),
    wired: "Sent from the admin Support Desk 'Send reminder' action.",
  },
  {
    id: "support_resolved",
    name: "Support ticket resolved / closed",
    group: "support",
    channel: "resend",
    description: "Resolved/closed confirmation with the thank-you.",
    subject: "Your ticket is resolved [SUP-1042] — thank you",
    html: supportResolvedHtml(SAMPLE_SUPPORT_MAIL),
    wired: "Sent when a ticket transitions to resolved or closed in the Support Desk.",
  },
]

export function getTemplateDef(id: string): EmailTemplateDef | undefined {
  return EMAIL_TEMPLATES.find((t) => t.id === id)
}

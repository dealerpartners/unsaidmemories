// ---------------------------------------------------------------------------
// sellers/notify.ts — THE seller notification service.
//
// Before this module, the seller communication layer was a store with no
// senders: public.seller_notifications existed (and the seller shell's
// unread count + the communication/notifications inbox read it), and
// public.seller_notification_preferences existed with a working
// GET/POST — but NOTHING read the preferences before sending, and the
// only writers were a handful of admin actions hand-rolling INSERTs.
// No seller was ever notified about a new order, a payout decision, a
// low-stock crossing, or a new-device login; the admin broadcast was
// in-portal only (no email leg ever left the platform).
//
// notifySeller is the single door every seller notification goes
// through:
//
//   notifySeller({ tenantId, sellerId, event, type?, title, body, link })
//
//   - Loads the seller (tenant-scoped; the seller row is resolved
//     server-side from the id the CALLER resolved — client-supplied
//     ids are never trusted anywhere in this stack, and this service
//     adds no new way to name a seller) and their preferences row.
//     No prefs row → the migration defaults (the same DEFAULTS the
//     preferences route returns: every channel/event on except SMS).
//   - In-portal leg: when channel_in_portal AND the event toggle are
//     on, inserts one seller_notifications row — the store the shell
//     badge and the inbox already read.
//   - Email leg: when channel_email AND the event toggle are on, sends
//     through the house sendEmail (src/lib/email.ts — Resend, branded
//     frame, email_messages audit row) to the seller's own email.
//   - SMS leg: channel_sms exists in the preference model, but no
//     tenant SMS sender is configured anywhere on this platform, so
//     the leg is honestly reported as not_configured — never faked.
//   - `security` events (new-login alerts) ignore the event toggles
//     AND the channel toggles: they always deliver in-portal + email.
//     A seller cannot opt out of being told someone signed in as them
//     (standard platform behavior — and the preferences UI's Account
//     bucket already describes security notices as platform-sent).
//
// Failure isolation is the contract: every leg is attempted inside its
// own try/catch, notifySeller NEVER throws, and a notification failure
// must never break the business operation that triggered it (checkout,
// webhook, admin decision, sign-in). Callers may still wrap the call —
// several do, out of house habit — but they don't have to.
//
// Callers inside a withPg callback may pass their client so the
// preference read + notification insert ride the same connection as
// the decision they announce; the email leg always goes through
// sendEmail on its own path.
// ---------------------------------------------------------------------------

import { withPg } from "@/lib/crm/enterprise"
import { SITE_URL } from "@/lib/site-url"
import { readSellerNotificationEmail } from "./notification-email"

export type SellerNotifyEvent =
  | "orders"
  | "payments"
  | "governance"
  | "policies"
  | "listings"
  | "account"
  | "security"

export interface NotifySellerArgs {
  tenantId: string
  sellerId: string
  event: SellerNotifyEvent
  /** seller_notifications.notification_type. Defaults per event when
   *  omitted; callers with an established vocabulary (listing_review,
   *  announcement, …) pass theirs through unchanged. */
  type?: string
  title: string
  body?: string | null
  link?: string | null
}

export interface NotifySellerResult {
  /** The seller row exists under this tenant. When false, nothing was
   *  written or sent — the id named no seller of this tenant. */
  sellerFound: boolean
  /** A seller_notifications row was inserted. */
  inPortal: boolean
  /** The email leg was sent (sendEmail accepted it). */
  emailSent: boolean
  emailError?: string
  /** off — the seller hasn't enabled SMS (or the event); not_configured
   *  — the seller asked for SMS but the platform has no tenant SMS
   *  sender configured, so nothing was sent. */
  sms: "off" | "not_configured"
}

/** Minimal client surface — the audit.ts PgClientLike pattern, so any
 *  withPg callback can hand its client over without casts at the call
 *  site. */
type PgClientLike = {
  query: (text: string, params?: unknown[]) => Promise<unknown>
}

// The preference model's fixed fields (migration 20261093) and its
// defaults — the same values the preferences route's DEFAULTS returns
// when a seller has never saved preferences.
const PREF_FIELDS = [
  "channel_in_portal",
  "channel_email",
  "channel_sms",
  "event_orders",
  "event_payments",
  "event_governance",
  "event_policies",
  "event_listings",
  "event_account",
] as const
type PrefField = (typeof PREF_FIELDS)[number]

const PREF_DEFAULTS: Record<PrefField, boolean> = {
  channel_in_portal: true,
  channel_email: true,
  channel_sms: false,
  event_orders: true,
  event_payments: true,
  event_governance: true,
  event_policies: true,
  event_listings: true,
  event_account: true,
}

const EVENT_TOGGLE: Record<Exclude<SellerNotifyEvent, "security">, PrefField> = {
  orders: "event_orders",
  payments: "event_payments",
  governance: "event_governance",
  policies: "event_policies",
  listings: "event_listings",
  account: "event_account",
}

const DEFAULT_TYPE: Record<SellerNotifyEvent, string> = {
  orders: "order",
  payments: "payout",
  governance: "governance",
  policies: "policy",
  listings: "listing",
  account: "account",
  security: "security",
}

interface ResolvedChannels {
  inPortal: boolean
  email: boolean
  sms: "off" | "not_configured"
}

/** Pure channel decision — exported for the verification scripts and
 *  any future reader that needs to explain a delivery. Security
 *  ignores every toggle. */
export function resolveSellerChannels(
  prefs: Record<PrefField, boolean>,
  event: SellerNotifyEvent,
): ResolvedChannels {
  if (event === "security") {
    return { inPortal: true, email: true, sms: "off" }
  }
  const toggle = EVENT_TOGGLE[event]
  const eventOn = prefs[toggle]
  return {
    inPortal: prefs.channel_in_portal && eventOn,
    email: prefs.channel_email && eventOn,
    sms: prefs.channel_sms && eventOn ? "not_configured" : "off",
  }
}

async function rows(
  client: PgClientLike,
  sql: string,
  params: unknown[],
): Promise<Record<string, unknown>[]> {
  const res = (await client.query(sql, params)) as {
    rows?: Record<string, unknown>[]
  }
  return res?.rows ?? []
}

async function deliver(
  client: PgClientLike,
  args: NotifySellerArgs,
): Promise<NotifySellerResult> {
  const result: NotifySellerResult = {
    sellerFound: false,
    inPortal: false,
    emailSent: false,
    sms: "off",
  }

  const sellerRows = await rows(
    client,
    `SELECT id::text AS id, email FROM public.sellers
      WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
    [args.tenantId, args.sellerId],
  )
  const seller = sellerRows[0]
  if (!seller) return result
  result.sellerFound = true
  const sellerEmail = String(seller.email || "").trim()
  // The address notifications actually go to: the seller-set
  // notification address (Account → Notifications) when one is set,
  // else the account email on the seller record. The record email is
  // the seller's identity address — for the house seller it's the
  // owner/admin inbox, which is how order alerts used to land with
  // the admin instead of the address the seller works from.
  const notifyEmail =
    (await readSellerNotificationEmail(client, args.sellerId)) || sellerEmail

  // Preferences: the seller's saved row, or the model's defaults.
  const prefs: Record<PrefField, boolean> = { ...PREF_DEFAULTS }
  try {
    const prefRows = await rows(
      client,
      `SELECT ${PREF_FIELDS.join(", ")} FROM public.seller_notification_preferences
        WHERE tenant_id = $1 AND seller_id = $2::uuid LIMIT 1`,
      [args.tenantId, args.sellerId],
    )
    const row = prefRows[0]
    if (row) {
      for (const f of PREF_FIELDS) {
        if (typeof row[f] === "boolean") prefs[f] = row[f] as boolean
      }
    }
  } catch {
    // Preferences store unreadable — fall back to the defaults rather
    // than silencing the seller entirely.
  }

  const channels = resolveSellerChannels(prefs, args.event)
  result.sms = channels.sms
  const type = args.type || DEFAULT_TYPE[args.event]

  // ---- In-portal leg -------------------------------------------------
  if (channels.inPortal) {
    try {
      await client.query(
        `INSERT INTO public.seller_notifications
           (tenant_id, seller_id, notification_type, title, body, link)
         VALUES ($1, $2::uuid, $3, $4, $5, $6)`,
        [
          args.tenantId,
          args.sellerId,
          type,
          args.title,
          args.body ?? null,
          args.link ?? null,
        ],
      )
      result.inPortal = true
    } catch (e) {
      console.error(
        "[notifySeller] in-portal leg failed:",
        e instanceof Error ? e.message : e,
      )
    }
  }

  // ---- Email leg -----------------------------------------------------
  if (channels.email && notifyEmail) {
    try {
      const { sendEmail } = await import("@/lib/email")
      const { frame, eyebrow, h1, p, button, linkFallback, pawDivider, esc } =
        await import("@/lib/email/design")
      const url = args.link ? `${SITE_URL}${args.link}` : null
      const html = frame({
        preheader: args.title,
        body: [
          eyebrow("UnSaid Memories — Seller Center"),
          h1(esc(args.title)),
          ...(args.body ? [p(esc(args.body))] : []),
          ...(url ? [button(url, "View in Seller Center")] : []),
          ...(url ? [linkFallback(url)] : []),
          pawDivider(),
          p(
            "You're receiving this because it's a notification for your seller account. Manage which events email you in Seller Center → Account → Notifications (security sign-in alerts always send).",
            { small: true, muted: true },
          ),
        ].join(""),
        reason: "Notification for your UnSaid Memories seller account.",
      })
      const { toResendVariables } = await import("@/lib/email/resend-templates")
      const sent = await sendEmail({
        to: notifyEmail,
        template: "seller_notification",
        subject: args.title,
        html,
        variables: toResendVariables({ title: args.title, body: args.body, linkUrl: url }),
        tenantId: args.tenantId,
      })
      result.emailSent = sent.ok
      if (!sent.ok) result.emailError = sent.error
    } catch (e) {
      result.emailError = e instanceof Error ? e.message : String(e)
      console.error("[notifySeller] email leg failed:", result.emailError)
    }
  }

  return result
}

/**
 * Deliver one seller notification through every channel the seller's
 * preferences allow. NEVER throws — see the header contract.
 *
 * Pass the caller's withPg client when the notification announces a
 * write made on that client (admin decisions); omit it and the service
 * opens its own connection (order attribution, sign-in, sweeps).
 */
export async function notifySeller(
  args: NotifySellerArgs,
  client?: PgClientLike,
): Promise<NotifySellerResult> {
  const fallback: NotifySellerResult = {
    sellerFound: false,
    inPortal: false,
    emailSent: false,
    sms: "off",
  }
  try {
    if (client) return await deliver(client, args)
    const out = await withPg((c) => deliver(c as PgClientLike, args))
    return out ?? fallback
  } catch (e) {
    console.error(
      "[notifySeller] delivery failed:",
      e instanceof Error ? e.message : e,
    )
    return fallback
  }
}

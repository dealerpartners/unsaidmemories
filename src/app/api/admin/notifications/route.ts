import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import type { Client } from "pg"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, platformAudit } from "@/lib/crm/enterprise"
import { getCurrentUser } from "@/lib/auth/server"
import { clearSalonAlertSettingsCache } from "@/lib/email"

// ---------------------------------------------------------------------------
// /api/admin/notifications — the Notifications box on the custom report
// (the admin Analytics & Reporting screen). The owner's standing ruling:
// every captured business event lands in the salon's inbox as an email
// alert — booking requests (with the exact services), subscription events,
// and shop orders. This route shows the routing, the live alert activity,
// and persists the owner's changes:
//
//   GET   /api/admin/notifications   destination + master toggle + per-type
//                                    counts + last 10 salon-alert emails
//   PATCH /api/admin/notifications   { alertEmail?, alertsEnabled? }
//
// Destination + master toggle persist in cms_global_content keys
// `alert_email` / `alerts_enabled` — the same table every other salon
// setting lives in. src/lib/email.ts reads them at send time (60s cache,
// cleared by PATCH below), so re-routing the inbox needs no deploy.
// Counts + recent log come straight from the email_messages audit trail
// the sendEmail path writes on every send.
// ---------------------------------------------------------------------------

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEFAULT_DESTINATION = "booking@unsaidmemories.com"
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// The three alert types — these mirror the REAL senders in src/lib/email.ts
// (the `template:` values they pass): booking_notification from
// sendBookingRequest/sendBookingConfirmation, subscription_<event> from
// sendSubscriptionAlert, order_notification from sendOrderPlacedAlert.
const ALERT_TYPES: {
  key: string
  label: string
  description: string
  templates: string[]
}[] = [
  {
    key: "booking",
    label: "New booking requests",
    description: "With the exact services requested — the full intake lands in the salon inbox the moment a request is submitted.",
    templates: ["booking_notification"],
  },
  {
    key: "subscription",
    label: "Subscription events",
    description: "Signups, plan changes, renewals — every Bath Club membership event, straight to the inbox.",
    templates: [
      "subscription_signup",
      "subscription_renewal",
      "subscription_plan_change",
      "subscription_cancelled",
      "subscription_reminder",
    ],
  },
  {
    key: "order",
    label: "Shop orders",
    description: "New paid orders from the shop, with the items and totals.",
    templates: ["order_notification"],
  },
]

// The recent-activity feed shows everything that lands in the salon inbox —
// the three owner-named types PLUS the other salon copies (pre check-in,
// consultation) and the routing test this panel fires.
const RECENT_TEMPLATES: string[] = [
  ...new Set([
    ...ALERT_TYPES.flatMap((t) => t.templates),
    "precheckin_notification",
    "consultation_notification",
    "alert_routing_test",
  ]),
]

type NotificationsPayload = {
  destination: string
  alertsEnabled: boolean
  types: {
    key: string
    label: string
    description: string
    sent7d: number
    sentTotal: number
    lastSentAt: string | null
  }[]
  recent: {
    id: string
    template: string
    subject: string
    toEmail: string
    status: string
    createdAt: string
  }[]
}

async function readRouting(client: Client, tenant: string): Promise<{ destination: string; alertsEnabled: boolean }> {
  const res = await client.query(
    `SELECT content_key, value_text FROM public.cms_global_content
      WHERE tenant_id = $1 AND locale = 'en-US' AND content_key IN ('alert_email','alerts_enabled')`,
    [tenant],
  )
  let destination = DEFAULT_DESTINATION
  let alertsEnabled = true
  for (const row of res.rows) {
    if (row.content_key === "alert_email") {
      const v = String(row.value_text || "").trim().toLowerCase()
      if (EMAIL_RE.test(v)) destination = v
    } else if (row.content_key === "alerts_enabled") {
      alertsEnabled = String(row.value_text ?? "true").trim().toLowerCase() !== "false"
    }
  }
  return { destination, alertsEnabled }
}

async function buildPayload(client: Client, tenant: string): Promise<NotificationsPayload> {
  const { destination, alertsEnabled } = await readRouting(client, tenant)

  // Per-type counts — rows actually DELIVERED to the current destination
  // (FAILED/QUEUED attempts still show in the recent feed below, with their
  // status, so nothing is hidden).
  const countsRes = await client.query(
    `SELECT template,
            COUNT(*) FILTER (WHERE status = 'SENT')::int AS sent_total,
            COUNT(*) FILTER (WHERE status = 'SENT' AND "createdAt" >= NOW() - interval '7 days')::int AS sent_7d,
            MAX(COALESCE("sentAt", "createdAt")) FILTER (WHERE status = 'SENT') AS last_sent_at
       FROM public.email_messages
      WHERE tenant_id = $1 AND "toEmail" = $2 AND template = ANY($3::text[])
      GROUP BY template`,
    [tenant, destination, ALERT_TYPES.flatMap((t) => t.templates)],
  )
  const byTemplate = new Map<string, any>()
  for (const row of countsRes.rows) byTemplate.set(row.template, row)

  const types = ALERT_TYPES.map((t) => {
    let sent7d = 0
    let sentTotal = 0
    let lastSentAt: string | null = null
    for (const tpl of t.templates) {
      const row = byTemplate.get(tpl)
      if (!row) continue
      sent7d += row.sent_7d || 0
      sentTotal += row.sent_total || 0
      if (row.last_sent_at) {
        const iso = new Date(row.last_sent_at).toISOString()
        if (!lastSentAt || iso > lastSentAt) lastSentAt = iso
      }
    }
    return { key: t.key, label: t.label, description: t.description, sent7d, sentTotal, lastSentAt }
  })

  const recentRes = await client.query(
    `SELECT id, template, subject, "toEmail", status, "createdAt"
       FROM public.email_messages
      WHERE tenant_id = $1 AND "toEmail" = $2 AND template = ANY($3::text[])
      ORDER BY "createdAt" DESC
      LIMIT 10`,
    [tenant, destination, RECENT_TEMPLATES],
  )
  const recent = recentRes.rows.map((r: any) => ({
    id: r.id,
    template: r.template,
    subject: r.subject,
    toEmail: r.toEmail,
    status: r.status,
    createdAt: new Date(r.createdAt).toISOString(),
  }))

  return { destination, alertsEnabled, types, recent }
}

export async function GET(req: NextRequest) {
  const tenant = resolveTenantId(req);
  const gate = await requireModuleApi("administration", "read")
  if (gate) return gate

  try {
    const payload = await withPg((client) => buildPayload(client, tenant))
    if (!payload) {
      return NextResponse.json(
        { error: "Database unavailable — alert routing could not be read." },
        { status: 503 },
      )
    }
    return NextResponse.json(payload)
  } catch (e: any) {
    console.error("[GET /api/admin/notifications]", e)
    return NextResponse.json({ error: `Load failed: ${e.message}` }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const tenant = resolveTenantId(req);
  const gate = await requireModuleApi("administration", "write")
  if (gate) return gate

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const updates: { key: string; value: string; label: string }[] = []
  if (body.alertEmail !== undefined) {
    const email = String(body.alertEmail || "").trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "alertEmail must be a valid email address" }, { status: 400 })
    }
    updates.push({ key: "alert_email", value: email, label: "Alert Email" })
  }
  if (body.alertsEnabled !== undefined) {
    updates.push({
      key: "alerts_enabled",
      value: body.alertsEnabled ? "true" : "false",
      label: "Alerts Enabled",
    })
  }
  if (updates.length === 0) {
    return NextResponse.json(
      { error: "Nothing to update — send alertEmail and/or alertsEnabled" },
      { status: 400 },
    )
  }

  const actor = await getCurrentUser()

  try {
    const payload = await withPg(async (client) => {
      // Both locales live in cms_global_content — write en-US (what
      // repo.getSettings() and the email senders read) and en (what older
      // readers scan), the same defensive double-write the salon-info
      // migration script performs.
      for (const u of updates) {
        for (const locale of ["en-US", "en"]) {
          await client.query(
            `INSERT INTO public.cms_global_content (tenant_id, content_key, label, value_text, content_group, locale)
             VALUES ($1, $2, $3, $4, 'general', $5)
             ON CONFLICT (tenant_id, content_key, locale)
             DO UPDATE SET value_text = EXCLUDED.value_text, label = EXCLUDED.label, updated_at = now()`,
            [tenant, u.key, u.label, u.value, locale],
          )
        }
      }
      await platformAudit(client, {
        action: "notifications.update",
        targetType: "cms_global_content",
        actorUserId: actor?.id || null,
        actorRole: "admin",
        metadata: { keys: updates.map((u) => u.key) },
      }).catch((e: any) => console.error("[notifications] audit failed:", e.message))
      return buildPayload(client, tenant)
    })

    if (!payload) {
      return NextResponse.json({ error: "Database unavailable — settings not saved." }, { status: 503 })
    }

    // The email senders cache routing for 60s — drop it so the new inbox
    // takes effect on the very next alert, not a minute from now.
    clearSalonAlertSettingsCache()
    return NextResponse.json(payload)
  } catch (e: any) {
    console.error("[PATCH /api/admin/notifications]", e)
    return NextResponse.json({ error: `Save failed: ${e.message}` }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { notifySeller } from "@/lib/sellers/notify"

// ---------------------------------------------------------------------------
// /api/admin/notifications/seller-broadcast — K3 · Notifications, the ADMIN
// writer for seller broadcasts (Admin Portal Tree K3: notifications per
// audience; the seller audience's data-graph pair). This is the follow-on
// leg to the employee broadcast writer (/api/admin/notifications/broadcast)
// and mirrors its discipline exactly, adapted to the seller store.
//
// STORE: public.seller_notifications. The table is PER-SELLER: tenant_id +
// seller_id are both NOT NULL, so there is no broadcast row — a send fans
// out one row per recipient. The seller reader already exists on the seller
// portal (GET /api/seller/notifications, predicates: tenant_id + own
// seller_id, unread = is_read false; POST marks read by id); until this
// route existed nothing wrote the table, so every seller's notification
// list was empty by construction. Rows written here carry exactly the
// fields the reader consumes: notification_type, title, body, link,
// is_read (default false), created_at.
//
// DELIVERY (seller comms layer): the fan-out now goes through
// notifySeller (src/lib/sellers/notify.ts) per recipient, event
// "policies" — the preference model has no platform-announcement
// toggle of its own (its fixed buckets are orders / payments /
// governance / policies / listings / account), and a platform
// broadcast is a platform notice in the policies family; the
// notification_type stays "announcement". Each seller's own channel
// preferences now govern the broadcast: the in-portal row lands only
// when their in-portal + policies toggles allow it, and the broadcast
// gains the email leg it never had for sellers who allow email.
//
// AUDIENCE: the tenant's sellers whose relationship is live — every status
// in the live sellers_status_check vocabulary (applied | approved |
// suspended) except 'closed', the terminal state (the analog of the
// employee writer's is_active filter). The picker shows each seller's own
// status so nothing about the audience is hidden from the admin.
//
// SCOPING: the tenant comes from resolveTenantId(req) — the admin's
// selected tenant — and is a predicate in every statement. A broadcast can
// only ever reach sellers of that one tenant; naming seller ids from
// another tenant matches zero rows (the tenant predicate is in the
// INSERT's SELECT, not checked afterwards).
//
// GATE: requireModuleApi("administration", …) — the same module the
// sibling K tools use (K3 employee broadcast, K4 audit viewer, K6 system
// health). Read level lists recipients/history; the send requires write.
//
// AUDIT: every successful send appends one crm_audit_log row through
// auditAction (domain "crm" — the store B1's admin config writes use),
// carrying tenant, audience, recipient count, and title — never the body.
// ---------------------------------------------------------------------------

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NOTIFICATION_TYPE = "announcement"
const TITLE_MAX = 200
const BODY_MAX = 2000
const LINK_MAX = 500
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SELLERS_SQL = `
  SELECT id::text AS id, display_name, legal_name, email, status
    FROM public.sellers
   WHERE tenant_id = $1 AND status <> 'closed'
   ORDER BY display_name ASC NULLS LAST, legal_name ASC NULLS LAST, email ASC NULLS LAST`

const RECENT_SQL = `
  SELECT title, body, link, created_at,
         count(*)::int AS recipients,
         count(*) FILTER (WHERE is_read)::int AS read_count
    FROM public.seller_notifications
   WHERE tenant_id = $1 AND notification_type = $2
   GROUP BY title, body, link, created_at
   ORDER BY created_at DESC
   LIMIT 25`

// The recipient set — exactly the audience the old INSERT…SELECT
// targeted (tenant-scoped, live relationship: every status except
// 'closed'; for a selected send, the tenant predicate stays in the
// SELECT so ids from another tenant match zero rows).
const RECIPIENTS_ALL_SQL = `
  SELECT s.id::text AS id
    FROM public.sellers s
   WHERE s.tenant_id = $1::uuid AND s.status <> 'closed'`

const RECIPIENTS_SELECTED_SQL = `
  SELECT s.id::text AS id
    FROM public.sellers s
   WHERE s.tenant_id = $1::uuid AND s.status <> 'closed' AND s.id = ANY($2::uuid[])`

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read")
  if (gate) return gate
  const tenant = resolveTenantId(req)

  try {
    const payload = await withPg(async (client) => {
      const sellersRes = await client.query(SELLERS_SQL, [tenant])
      const recentRes = await client.query(RECENT_SQL, [tenant, NOTIFICATION_TYPE])
      return {
        tenantId: tenant,
        sellers: sellersRes.rows.map((r: any) => ({
          id: r.id,
          name: r.display_name || r.legal_name || r.email || "Unnamed seller",
          email: r.email,
          status: r.status,
        })),
        broadcasts: recentRes.rows.map((r: any) => ({
          title: r.title,
          body: r.body,
          link: r.link,
          createdAt: new Date(r.created_at).toISOString(),
          recipients: r.recipients,
          readCount: r.read_count,
        })),
      }
    })
    if (!payload) {
      return NextResponse.json({ error: "Database unavailable — broadcast data could not be read." }, { status: 503 })
    }
    return NextResponse.json(payload)
  } catch (e: any) {
    console.error("[GET /api/admin/notifications/seller-broadcast]", e)
    return NextResponse.json({ error: `Load failed: ${e.message}` }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write")
  if (gate) return gate
  const tenant = resolveTenantId(req)

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const title = String(body.title || "").trim()
  if (!title) {
    return NextResponse.json({ error: "A title is required — sellers see it as the notification headline." }, { status: 400 })
  }
  if (title.length > TITLE_MAX) {
    return NextResponse.json({ error: `Title is limited to ${TITLE_MAX} characters.` }, { status: 400 })
  }
  const text = String(body.body || "").trim()
  if (text.length > BODY_MAX) {
    return NextResponse.json({ error: `Body is limited to ${BODY_MAX} characters.` }, { status: 400 })
  }
  const linkRaw = String(body.link || "").trim()
  if (linkRaw && (!linkRaw.startsWith("/") || linkRaw.length > LINK_MAX)) {
    return NextResponse.json(
      { error: "Link must be an internal path starting with / (it opens inside the seller portal)." },
      { status: 400 },
    )
  }

  const audience = body.audience === "selected" ? "selected" : "all"
  let sellerIds: string[] = []
  if (audience === "selected") {
    if (!Array.isArray(body.sellerIds) || body.sellerIds.length === 0) {
      return NextResponse.json({ error: "Select at least one seller, or send to all sellers." }, { status: 400 })
    }
    sellerIds = [...new Set(body.sellerIds.map((v: unknown) => String(v)))]
    if (sellerIds.length > 200 || sellerIds.some((id) => !UUID_RE.test(id))) {
      return NextResponse.json({ error: "sellerIds must be seller record ids (max 200)." }, { status: 400 })
    }
  }

  try {
    const delivery = await withPg(async (client) => {
      const res =
        audience === "selected"
          ? await client.query(RECIPIENTS_SELECTED_SQL, [tenant, sellerIds])
          : await client.query(RECIPIENTS_ALL_SQL, [tenant])
      const recipientIds = (res.rows as { id: string }[]).map((r) => r.id)
      let delivered = 0
      for (const sellerId of recipientIds) {
        const result = await notifySeller(
          {
            tenantId: tenant,
            sellerId,
            event: "policies",
            type: NOTIFICATION_TYPE,
            title,
            body: text || null,
            link: linkRaw || null,
          },
          client,
        )
        if (result.inPortal || result.emailSent) delivered++
      }
      return { recipients: recipientIds.length, delivered }
    })
    if (delivery === null) {
      return NextResponse.json({ error: "Database unavailable — nothing was sent." }, { status: 503 })
    }
    if (delivery.recipients === 0) {
      return NextResponse.json(
        {
          error:
            audience === "selected"
              ? "None of the selected sellers are in the selected tenant — nothing was sent."
              : "No sellers in the selected tenant — nothing was sent.",
        },
        { status: 400 },
      )
    }
    const sent = delivery.delivered

    const actorId = await getActorIdFromRequest(req)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
    await auditAction({
      action: "k3_seller_broadcast_send",
      domain: "crm",
      tableName: "seller_notifications",
      afterData: { tenant_id: tenant, audience, recipients: delivery.recipients, delivered: sent, title },
      actorUserId: actorId,
      ipAddress: ip,
    })

    return NextResponse.json({ ok: true, sent, recipients: delivery.recipients, tenantId: tenant, audience })
  } catch (e: any) {
    console.error("[POST /api/admin/notifications/seller-broadcast]", e)
    return NextResponse.json({ error: `Send failed: ${e.message}` }, { status: 500 })
  }
}

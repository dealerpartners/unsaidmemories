import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit"

// ---------------------------------------------------------------------------
// /api/admin/notifications/broadcast — K3 · Notifications, the ADMIN writer
// for employee broadcasts (Admin Portal Tree K3: "Broadcast to employees" /
// "Broadcast to groomers" — both audiences are crm_staff of one tenant).
//
// STORE: public.employee_notifications (migration 20261052, shaped on
// seller_notifications). The table is PER-STAFF: tenant_id + staff_id are
// both NOT NULL and staff_id FKs to crm_staff(id), so there is no
// broadcast row — a send fans out one row per recipient. The employee
// reader already exists (/api/employee/notifications, predicates:
// tenant_id + own staff_id, newest first); until this route existed
// nothing wrote the table, so every employee's list was empty by
// construction.
//
// SCOPING: the tenant comes from resolveTenantId(req) — the admin's
// selected tenant — and is a predicate in every statement. A broadcast
// can only ever reach staff of that one tenant; naming staff ids from
// another tenant matches zero rows (the tenant predicate is in the
// INSERT's SELECT, not checked afterwards).
//
// GATE: requireModuleApi("administration", …) — the same module the
// sibling K tools use (K4 audit viewer, K6 system health, and the
// alert-routing route beside this one in /api/admin/notifications).
// Read level lists recipients/history; the send requires write.
//
// AUDIT: every successful send appends one crm_audit_log row through
// auditAction (domain "crm" — the store B1's admin config writes use),
// carrying tenant, audience, recipient count, and title.
// ---------------------------------------------------------------------------

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NOTIFICATION_TYPE = "announcement"
const TITLE_MAX = 200
const BODY_MAX = 2000
const LINK_MAX = 500
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const STAFF_SQL = `
  SELECT id::text AS id, display_name, email, role, is_service_staff
    FROM public.crm_staff
   WHERE tenant_id = $1 AND is_active
   ORDER BY display_name ASC NULLS LAST, email ASC NULLS LAST`

const RECENT_SQL = `
  SELECT title, body, link, created_at,
         count(*)::int AS recipients,
         count(*) FILTER (WHERE is_read)::int AS read_count
    FROM public.employee_notifications
   WHERE tenant_id = $1 AND notification_type = $2
   GROUP BY title, body, link, created_at
   ORDER BY created_at DESC
   LIMIT 25`

const INSERT_ALL_SQL = `
  INSERT INTO public.employee_notifications (tenant_id, staff_id, notification_type, title, body, link)
  SELECT $1::uuid, s.id, $2, $3, $4, $5
    FROM public.crm_staff s
   WHERE s.tenant_id = $1::uuid AND s.is_active
  RETURNING id`

const INSERT_SELECTED_SQL = `
  INSERT INTO public.employee_notifications (tenant_id, staff_id, notification_type, title, body, link)
  SELECT $1::uuid, s.id, $2, $3, $4, $5
    FROM public.crm_staff s
   WHERE s.tenant_id = $1::uuid AND s.is_active AND s.id = ANY($6::uuid[])
  RETURNING id`

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read")
  if (gate) return gate
  const tenant = resolveTenantId(req)

  try {
    const payload = await withPg(async (client) => {
      const staffRes = await client.query(STAFF_SQL, [tenant])
      const recentRes = await client.query(RECENT_SQL, [tenant, NOTIFICATION_TYPE])
      return {
        tenantId: tenant,
        staff: staffRes.rows.map((r: any) => ({
          id: r.id,
          name: r.display_name || r.email || "Unnamed staff",
          email: r.email,
          role: r.role,
          isGroomer: Boolean(r.is_service_staff),
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
    console.error("[GET /api/admin/notifications/broadcast]", e)
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
    return NextResponse.json({ error: "A title is required — staff see it as the notification headline." }, { status: 400 })
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
      { error: "Link must be an internal path starting with / (it opens inside the employee portal)." },
      { status: 400 },
    )
  }

  const audience = body.audience === "selected" ? "selected" : "all"
  let staffIds: string[] = []
  if (audience === "selected") {
    if (!Array.isArray(body.staffIds) || body.staffIds.length === 0) {
      return NextResponse.json({ error: "Select at least one staff member, or send to all active staff." }, { status: 400 })
    }
    staffIds = [...new Set(body.staffIds.map((v: unknown) => String(v)))]
    if (staffIds.length > 200 || staffIds.some((id) => !UUID_RE.test(id))) {
      return NextResponse.json({ error: "staffIds must be staff record ids (max 200)." }, { status: 400 })
    }
  }

  try {
    const sent = await withPg(async (client) => {
      const res =
        audience === "selected"
          ? await client.query(INSERT_SELECTED_SQL, [tenant, NOTIFICATION_TYPE, title, text || null, linkRaw || null, staffIds])
          : await client.query(INSERT_ALL_SQL, [tenant, NOTIFICATION_TYPE, title, text || null, linkRaw || null])
      return res.rowCount ?? 0
    })
    if (sent === null) {
      return NextResponse.json({ error: "Database unavailable — nothing was sent." }, { status: 503 })
    }
    if (sent === 0) {
      return NextResponse.json(
        {
          error:
            audience === "selected"
              ? "None of the selected staff are active in the selected tenant — nothing was sent."
              : "No active staff in the selected tenant — nothing was sent.",
        },
        { status: 400 },
      )
    }

    const actorId = await getActorIdFromRequest(req)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
    await auditAction({
      action: "k3_employee_broadcast_send",
      domain: "crm",
      tableName: "employee_notifications",
      afterData: { tenant_id: tenant, audience, recipients: sent, title },
      actorUserId: actorId,
      ipAddress: ip,
    })

    return NextResponse.json({ ok: true, sent, tenantId: tenant, audience })
  } catch (e: any) {
    console.error("[POST /api/admin/notifications/broadcast]", e)
    return NextResponse.json({ error: `Send failed: ${e.message}` }, { status: 500 })
  }
}

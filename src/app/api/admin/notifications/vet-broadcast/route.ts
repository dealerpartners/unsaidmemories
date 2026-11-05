import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit"

// ---------------------------------------------------------------------------
// /api/admin/notifications/vet-broadcast — K3 · Notifications, the ADMIN
// writer for vet broadcasts (Admin Portal Tree K3: "Broadcast to vets").
//
// STORE: public.vet_notifications (migration 20261064, created live
// 2026-10-14). The K3 census found employee / seller / customer
// notification stores but NO vet store — the tree names the audience, so
// the store was designed from the platform's own precedent: it mirrors
// seller_notifications / employee_notifications column-for-column,
// vet-keyed with the vet FK the telemed stores carry. The table is
// PER-VET, so a send fans out one row per recipient.
//
// POPULATION: the tenant's bookable roster — clinical.veterinarians rows of
// the tenant. The roster holds 0 rows today, so a send honestly reaches
// nobody and refuses with that stated (the composer face shows the roster
// count). No vet-side reader exists yet — the telemedicine portal's
// notification face is that track's surface; this writer is the store's
// first writer, and rows wait for the reader exactly as
// employee_notifications did before its reader was wired.
//
// Discipline mirrors the employee broadcast writer (admin-k3-broadcast):
// administration gate, tenant as a predicate inside every statement,
// INSERT…SELECT fan-out, one crm_audit_log row per send, no email leg.
// ---------------------------------------------------------------------------

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NOTIFICATION_TYPE = "announcement"
const TITLE_MAX = 200
const BODY_MAX = 2000
const LINK_MAX = 500
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const VETS_SQL = `
  SELECT id::text AS id, display_name, status
    FROM clinical.veterinarians
   WHERE tenant_id = $1
   ORDER BY display_name ASC NULLS LAST`

const RECENT_SQL = `
  SELECT title, body, link, created_at,
         count(*)::int AS recipients,
         count(*) FILTER (WHERE is_read)::int AS read_count
    FROM public.vet_notifications
   WHERE tenant_id = $1 AND notification_type = $2
   GROUP BY title, body, link, created_at
   ORDER BY created_at DESC
   LIMIT 25`

const INSERT_ALL_SQL = `
  INSERT INTO public.vet_notifications (tenant_id, vet_id, notification_type, title, body, link)
  SELECT $1::uuid, v.id, $2, $3, $4, $5
    FROM clinical.veterinarians v
   WHERE v.tenant_id = $1::uuid
  RETURNING id`

const INSERT_SELECTED_SQL = `
  INSERT INTO public.vet_notifications (tenant_id, vet_id, notification_type, title, body, link)
  SELECT $1::uuid, v.id, $2, $3, $4, $5
    FROM clinical.veterinarians v
   WHERE v.tenant_id = $1::uuid AND v.id = ANY($6::uuid[])
  RETURNING id`

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read")
  if (gate) return gate
  const tenant = resolveTenantId(req)

  try {
    const payload = await withPg(async (client) => {
      const vetsRes = await client.query(VETS_SQL, [tenant])
      const recentRes = await client.query(RECENT_SQL, [tenant, NOTIFICATION_TYPE])
      return {
        tenantId: tenant,
        roster: vetsRes.rows.length,
        vets: vetsRes.rows.map((r: any) => ({
          id: String(r.id),
          name: r.display_name || "Unnamed veterinarian",
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
    console.error("[GET /api/admin/notifications/vet-broadcast]", e)
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
    return NextResponse.json({ error: "A title is required — vets see it as the notification headline." }, { status: 400 })
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
      { error: "Link must be an internal path starting with / (it opens inside the telemedicine portal)." },
      { status: 400 },
    )
  }

  const audience = body.audience === "selected" ? "selected" : "all"
  let vetIds: string[] = []
  if (audience === "selected") {
    if (!Array.isArray(body.vetIds) || body.vetIds.length === 0) {
      return NextResponse.json({ error: "Select at least one veterinarian, or send to all vets." }, { status: 400 })
    }
    vetIds = [...new Set(body.vetIds.map((v: unknown) => String(v)))]
    if (vetIds.length > 200 || vetIds.some((id) => !UUID_RE.test(id))) {
      return NextResponse.json({ error: "vetIds must be veterinarian record ids (max 200)." }, { status: 400 })
    }
  }

  try {
    const sent = await withPg(async (client) => {
      const res =
        audience === "selected"
          ? await client.query(INSERT_SELECTED_SQL, [tenant, NOTIFICATION_TYPE, title, text || null, linkRaw || null, vetIds])
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
              ? "None of the selected veterinarians belong to the selected tenant — nothing was sent."
              : "No veterinarians on the selected tenant's roster yet — nothing was sent.",
        },
        { status: 400 },
      )
    }

    const actorId = await getActorIdFromRequest(req)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
    await auditAction({
      action: "k3_vet_broadcast_send",
      domain: "crm",
      tableName: "vet_notifications",
      afterData: { tenant_id: tenant, audience, recipients: sent, title },
      actorUserId: actorId,
      ipAddress: ip,
    })

    return NextResponse.json({ ok: true, sent, tenantId: tenant, audience })
  } catch (e: any) {
    console.error("[POST /api/admin/notifications/vet-broadcast]", e)
    return NextResponse.json({ error: `Send failed: ${e.message}` }, { status: 500 })
  }
}

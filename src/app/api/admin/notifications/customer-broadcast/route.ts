import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, TENANT_ID } from "@/lib/crm/enterprise"
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit"

// ---------------------------------------------------------------------------
// /api/admin/notifications/customer-broadcast — K3 · Notifications, the
// ADMIN writer for customer broadcasts (Admin Portal Tree K3: "Broadcast
// to customers"). It mirrors the employee broadcast writer
// (/api/admin/notifications/broadcast, admin-k3-broadcast) exactly in
// discipline: administration gate, tenant from resolveTenantId(req) as a
// predicate inside every statement, INSERT…SELECT fan-out so the
// recipient count is the database's own count, and one crm_audit_log row
// per send.
//
// STORE: public.customer_notifications — the table is PER-CUSTOMER
// ("customerId" keys the SHOP customers.id, text — not crm_customers), so
// there is no broadcast row: a send fans out one row per recipient. The
// customer reader already exists (/api/customer/notifications: the
// session's own customerId, newest first). Until this route existed the
// only writers were single-customer sends (the email hook in
// src/lib/email.ts + targeted CRM/support writes), so a broadcast had no
// path at all.
//
// POPULATION (stated on the composer face): the tenant's shop customers —
// rows stamped tenant_id = the resolved tenant, PLUS, when the resolved
// tenant is the platform tenant (TENANT_ID(), the env tenant), the legacy
// rows whose tenant_id IS NULL. Those unstamped rows are the platform
// tenant's in practice: the existing notification writer
// (recordCustomerNotification) stamps TENANT_ID on every customer copy it
// records, whatever row the customer came from. Another tenant never
// reaches them — the predicate names the platform tenant explicitly.
//
// NO EMAIL LEG: a broadcast writes the in-app store only. (Customer email
// is per-event through sendEmail's templates; there is no broadcast email
// template, and this route does not invent one.)
// ---------------------------------------------------------------------------

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NOTIFICATION_TYPE = "announcement"
const TITLE_MAX = 200
const BODY_MAX = 2000
const LINK_MAX = 500

const POPULATION = `
  (c.tenant_id = $1::uuid OR (c.tenant_id IS NULL AND $1::uuid = $2::uuid))`

const CUSTOMERS_SQL = `
  SELECT c.id AS id,
         nullif(trim(coalesce(c."firstName", '') || ' ' || coalesce(c."lastName", '')), '') AS name,
         c.email
    FROM public.customers c
   WHERE ${POPULATION}
   ORDER BY c."lastName" ASC NULLS LAST, c.email ASC NULLS LAST`

// customer_notifications timestamps are camelCase ("createdAt") — the
// snake_case created_at this query originally used does not exist on
// the table, so every GET threw 42703 inside withPg, which swallowed
// it and surfaced as 503 "Database unavailable" (root-caused
// 2026-11-02 against the live schema; the database was never down).
const RECENT_SQL = `
  SELECT title, body, link, "createdAt" AS created_at,
         count(*)::int AS recipients,
         count(*) FILTER (WHERE "readAt" IS NOT NULL)::int AS read_count
    FROM public.customer_notifications
   WHERE tenant_id = $1 AND type = $2
   GROUP BY title, body, link, "createdAt"
   ORDER BY "createdAt" DESC
   LIMIT 25`

const INSERT_ALL_SQL = `
  INSERT INTO public.customer_notifications (tenant_id, "customerId", type, title, body, link)
  SELECT $1::uuid, c.id, $3, $4, $5, $6
    FROM public.customers c
   WHERE ${POPULATION}
  RETURNING id`

const INSERT_SELECTED_SQL = `
  INSERT INTO public.customer_notifications (tenant_id, "customerId", type, title, body, link)
  SELECT $1::uuid, c.id, $3, $4, $5, $6
    FROM public.customers c
   WHERE ${POPULATION} AND c.id = ANY($7::text[])
  RETURNING id`

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read")
  if (gate) return gate
  const tenant = resolveTenantId(req)

  try {
    const payload = await withPg(async (client) => {
      const customersRes = await client.query(CUSTOMERS_SQL, [tenant, TENANT_ID()])
      const recentRes = await client.query(RECENT_SQL, [tenant, NOTIFICATION_TYPE])
      return {
        tenantId: tenant,
        population: customersRes.rows.length,
        customers: customersRes.rows.map((r: any) => ({
          id: String(r.id),
          name: r.name || r.email || "Unnamed customer",
          email: r.email,
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
    console.error("[GET /api/admin/notifications/customer-broadcast]", e)
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
    return NextResponse.json({ error: "A title is required — customers see it as the notification headline." }, { status: 400 })
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
      { error: "Link must be an internal path starting with / (it opens inside the customer portal)." },
      { status: 400 },
    )
  }

  const audience = body.audience === "selected" ? "selected" : "all"
  let customerIds: string[] = []
  if (audience === "selected") {
    if (!Array.isArray(body.customerIds) || body.customerIds.length === 0) {
      return NextResponse.json({ error: "Select at least one customer, or send to all customers." }, { status: 400 })
    }
    customerIds = [...new Set(body.customerIds.map((v: unknown) => String(v)))]
    if (customerIds.length > 500 || customerIds.some((id) => !id || id.length > 100)) {
      return NextResponse.json({ error: "customerIds must be customer record ids (max 500)." }, { status: 400 })
    }
  }

  try {
    const sent = await withPg(async (client) => {
      const res =
        audience === "selected"
          ? await client.query(INSERT_SELECTED_SQL, [
              tenant,
              TENANT_ID(),
              NOTIFICATION_TYPE,
              title,
              text || null,
              linkRaw || null,
              customerIds,
            ])
          : await client.query(INSERT_ALL_SQL, [tenant, TENANT_ID(), NOTIFICATION_TYPE, title, text || null, linkRaw || null])
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
              ? "None of the selected customers belong to the selected tenant — nothing was sent."
              : "No customers in the selected tenant — nothing was sent.",
        },
        { status: 400 },
      )
    }

    const actorId = await getActorIdFromRequest(req)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
    await auditAction({
      action: "k3_customer_broadcast_send",
      domain: "crm",
      tableName: "customer_notifications",
      afterData: { tenant_id: tenant, audience, recipients: sent, title },
      actorUserId: actorId,
      ipAddress: ip,
    })

    return NextResponse.json({ ok: true, sent, tenantId: tenant, audience })
  } catch (e: any) {
    console.error("[POST /api/admin/notifications/customer-broadcast]", e)
    return NextResponse.json({ error: `Send failed: ${e.message}` }, { status: 500 })
  }
}

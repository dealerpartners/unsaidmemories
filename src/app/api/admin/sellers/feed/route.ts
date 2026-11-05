import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"

export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/sellers/feed — marketplace seller feed ingestion queue.
//
//   GET   ?q=...&status=pending|approved|rejected|suspended&limit=
//         Lists seller_feed_items joined with sellers, searchable by
//         seller name, SKU, or product name.
//   POST  { seller_id, sku, product_name } — add a feed item manually.
//   PATCH { id, status } — approve / reject / suspend a feed item.
// ============================================================================

const PAGE = 100

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read")
  if (denied) return denied
  const sp = req.nextUrl.searchParams
  const tenant = resolveTenantId(req)
  const q = (sp.get("q") || "").trim()
  const status = (sp.get("status") || "").trim()
  const limit = Math.min(Math.max(Number(sp.get("limit")) || PAGE, 1), 500)
  const like = `%${q.replace(/[%_]/g, "")}%`

  const out = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT f.id::text AS id, f.tenant_id::text AS tenant_id,
              f.seller_id::text AS seller_id, f.sku, f.product_name,
              f.status, f.created_at::text AS created_at,
              s.display_name AS seller_name, s.seller_type, s.status AS seller_status
         FROM public.seller_feed_items f
         LEFT JOIN public.sellers s ON s.id = f.seller_id
        WHERE f.tenant_id = $1
          AND ($2 = '' OR f.status = $2)
          AND ($3 = '%%' OR f.sku ILIKE $3 OR f.product_name ILIKE $3
               OR COALESCE(s.display_name, '') ILIKE $3 OR COALESCE(s.legal_name, '') ILIKE $3)
        ORDER BY f.created_at DESC NULLS LAST
        LIMIT ${limit}`,
      [tenant, status, like],
    )
    const counts = (
      await c.query(
        `SELECT count(*)::int AS all,
                count(*) FILTER (WHERE status = 'pending')::int AS pending,
                count(*) FILTER (WHERE status = 'approved')::int AS approved,
                count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
                count(*) FILTER (WHERE status = 'suspended')::int AS suspended
           FROM public.seller_feed_items WHERE tenant_id = $1`,
        [tenant],
      )
    ).rows[0]
    return { counts, rows }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write")
  if (denied) return denied
  const b = await req.json().catch(() => ({}))
  const tenant = resolveTenantId(req)
  const sellerId = String(b.seller_id || "").trim()
  const sku = String(b.sku || "").trim()
  const productName = String(b.product_name || "").trim()
  if (!sellerId) return NextResponse.json({ error: "seller_id required" }, { status: 400 })

  const out = await withPg(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO public.seller_feed_items (tenant_id, seller_id, sku, product_name, status)
       VALUES ($1, $2::uuid, NULLIF($3, ''), NULLIF($4, ''), 'pending')
       RETURNING id::text AS id, status`,
      [tenant, sellerId, sku, productName],
    )
    if (!rows[0]) throw new Error("Feed item insert did not land");
    return { ok: true, item: rows[0] }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json(out, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write")
  if (denied) return denied
  const b = await req.json().catch(() => ({}))
  const tenant = resolveTenantId(req)
  const id = String(b.id || "").trim()
  const status = String(b.status || "").trim().toLowerCase()
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  if (!["pending", "approved", "rejected", "suspended"].includes(status)) {
    return NextResponse.json({ error: "status must be pending|approved|rejected|suspended" }, { status: 400 })
  }

  const out = await withPg(async (c) => {
    const { rows } = await c.query(
      `UPDATE public.seller_feed_items
          SET status = $3
        WHERE tenant_id = $1 AND id = $2::uuid
        RETURNING id::text AS id, status`,
      [tenant, id, status],
    )
    if (!rows[0]) return { error: "Feed item not found" }
    return { ok: true, item: rows[0] }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  if ("error" in out) return NextResponse.json(out, { status: 404 })
  return NextResponse.json(out)
}

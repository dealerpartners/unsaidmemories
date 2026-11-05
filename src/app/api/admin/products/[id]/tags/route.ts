import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"

export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/products/[id]/tags — product tag management.
//
//   GET    — tags for one product (catalog item id).
//   POST   { tag } — add a tag (deduped, lowercased).
//   DELETE ?tag=... — remove a tag.
// ============================================================================

export async function GET(req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireModuleApi("products_services", "read")
  if (gate) return gate
  const { id } = await params
  const tenant = resolveTenantId(req)

  const rows = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT id::text AS id, tag, created_at::text AS created_at
         FROM public.commerce_product_tags
        WHERE tenant_id = $1 AND product_id = $2::uuid
        ORDER BY tag`,
      [tenant, id],
    )
    return rows
  })
  if (!rows) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json({ tags: rows })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const tenant = resolveTenantId(req)
  const tag = String(b.tag || "").trim().toLowerCase().slice(0, 60)
  if (!tag) return NextResponse.json({ error: "tag required" }, { status: 400 })

  const out = await withPg(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO public.commerce_product_tags (tenant_id, product_id, tag)
       SELECT $1, $2::uuid, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM public.commerce_product_tags
          WHERE tenant_id = $1 AND product_id = $2::uuid AND tag = $3
       )
       RETURNING id::text AS id, tag`,
      [tenant, id, tag],
    )
    return { ok: true, tag: rows[0] || { tag }, deduped: !rows[0] }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json(out, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate
  const { id } = await params
  const tag = (req.nextUrl.searchParams.get("tag") || "").trim().toLowerCase()
  const tenant = resolveTenantId(req)
  if (!tag) return NextResponse.json({ error: "tag required" }, { status: 400 })

  const out = await withPg(async (c) => {
    const { rows } = await c.query(
      `DELETE FROM public.commerce_product_tags
        WHERE tenant_id = $1 AND product_id = $2::uuid AND tag = $3
        RETURNING id::text AS id`,
      [tenant, id, tag],
    )
    return { ok: true, removed: rows.length }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json(out)
}

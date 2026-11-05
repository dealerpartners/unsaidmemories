import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, TENANT_ID } from "@/lib/crm/enterprise"

// ============================================================================
// GET /api/admin/promotions/targets?q=<product search>
// Picker data for the promotion generator: the catalog taxonomy (all
// nodes — deals attach to taxonomy_nodes, whose subtrees the register
// resolves scope through) plus product search over commerce_catalog_items.
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("products_services", "read")
  if (gate) return gate

  const q = (req.nextUrl.searchParams.get("q") || "").trim()

  const out = await withPg(async (client) => {
    const tenant = TENANT_ID()
    const tax = await client.query(
      `SELECT id::text AS id, name, slug, parent_id::text AS "parentId"
       FROM public.taxonomy_nodes ORDER BY name ASC`,
    )
    let products: Array<{ id: string; name: string }> = []
    if (q) {
      const p = await client.query(
        `SELECT id::text AS id, name FROM public.commerce_catalog_items
         WHERE tenant_id = $1 AND active = true AND name ILIKE $2
         ORDER BY name ASC LIMIT 20`,
        [tenant, `%${q}%`],
      )
      products = p.rows
    }
    return { taxonomy: tax.rows, products }
  })

  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json(out)
}

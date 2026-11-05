import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop"
import { addMapping } from "@/lib/admin/filters-live"

// ============================================================================
// /api/admin/filters/[id]/map — assign a filter group to a category.
// Live store: inserts a public.node_filters row (attribute ↔ taxonomy
// node). The shop resolves assignments through v_node_filter_spec, and
// an assignment inherits down the node's subtree.
//   body: { category_id: <taxonomy node uuid>, display_order?: number }
//
// There is NO global mapping in the live store — node_filters always
// names a node — so a null/omitted category_id is refused with that
// explanation instead of being written nowhere.
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  const { id: filterId } = await ctx.params

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const categoryId =
    body.category_id === null || body.category_id === undefined || body.category_id === ""
      ? null
      : String(body.category_id)

  if (!categoryId) {
    return NextResponse.json(
      {
        error:
          "Global mappings don't exist in the live taxonomy — a filter is assigned to a category node, and the assignment inherits to its subcategories. Pick a category (a top-level node covers its whole subtree).",
      },
      { status: 400 },
    )
  }

  try {
    const created = await addMapping(
      filterId,
      categoryId,
      body.display_order !== undefined ? Number(body.display_order) : undefined,
    )
    revalidateShop()
    return NextResponse.json({ mapping: created })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Create failed: ${msg}` }, { status: 502 })
  }
}

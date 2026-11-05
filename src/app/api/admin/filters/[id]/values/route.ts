import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop"
import { addFilterValue } from "@/lib/admin/filters-live"

// ============================================================================
// /api/admin/filters/[id]/values — add a value to a filter group.
// Live store: inserts a public.attribute_values row for the attribute.
//   body: { value, slug?, display_order? }
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

  const value = String(body.value || "").trim()
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 })

  try {
    const created = await addFilterValue(
      filterId,
      value,
      body.slug ? String(body.slug) : undefined,
      body.display_order !== undefined ? Number(body.display_order) : undefined,
    )
    revalidateShop()
    return NextResponse.json({ value: created })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Create failed: ${msg}` }, { status: 502 })
  }
}

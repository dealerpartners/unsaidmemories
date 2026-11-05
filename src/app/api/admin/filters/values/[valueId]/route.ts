import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop"
import { removeFilterValue } from "@/lib/admin/filters-live"

// ============================================================================
// /api/admin/filters/values/[valueId] — delete a single filter value
// (a public.attribute_values row in the live store). The filter system's
// own per-node selections of the value are removed with it; a value that
// product data still references is refused by the database and the error
// is returned as-is.
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ valueId: string }> }) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  const { valueId } = await ctx.params

  try {
    await removeFilterValue(valueId)
    revalidateShop()
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Delete failed: ${msg}` }, { status: 502 })
  }
}

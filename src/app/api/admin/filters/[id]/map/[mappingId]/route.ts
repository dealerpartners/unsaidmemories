import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop"
import { removeMapping } from "@/lib/admin/filters-live"

// ============================================================================
// /api/admin/filters/[id]/map/[mappingId] — delete a single filter→
// category assignment (a public.node_filters row in the live store),
// together with its per-node value selections.
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; mappingId: string }> },
) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  const { mappingId } = await ctx.params

  try {
    await removeMapping(mappingId)
    revalidateShop()
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Delete failed: ${msg}` }, { status: 502 })
  }
}

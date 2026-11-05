import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop"
import { deleteFilterGroup, renameFilterGroup } from "@/lib/admin/filters-live"

// ============================================================================
// /api/admin/filters/[id] — admin-gated PATCH + DELETE for a filter group
// (a public.attributes row in the live store).
//
// PATCH persists name (and slug when supplied) only. The legacy is_active
// and scope fields have no column in the live store — they are derived
// from the group's node_filters assignments and cannot be written, so
// they are ignored here rather than silently pretending to save.
//
// DELETE cascades through the filter system's own tables (per-node value
// selections → assignments → values → the attribute). If product data
// still references the attribute, the database refuses the final delete
// and that error is returned as-is.
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  const { id } = await ctx.params

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  try {
    const updated = await renameFilterGroup(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      slug: typeof body.slug === "string" ? body.slug : undefined,
    })
    revalidateShop()
    return NextResponse.json({ filter: updated })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Update failed: ${msg}` }, { status: 502 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  const { id } = await ctx.params

  try {
    await deleteFilterGroup(id)
    revalidateShop()
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Delete failed: ${msg}` }, { status: 502 })
  }
}

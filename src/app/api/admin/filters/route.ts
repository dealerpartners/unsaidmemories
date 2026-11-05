import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop"
import { createFilterGroup, loadFiltersEditorData } from "@/lib/admin/filters-live"

// ============================================================================
// /api/admin/filters — admin-gated CRUD for the storefront filter system.
//
// REPOINTED to the live store (see src/lib/admin/filters-live.ts): filter
// groups are public.attributes, values are public.attribute_values,
// mappings are public.node_filters, and the category list is the
// published public.taxonomy_nodes tree. The legacy pet_* filter tables
// are not read by the shop anymore and are no longer touched here.
//
//   GET   { filters, mappings, categories } in the editor's shapes —
//         filters carry nested values; is_active/scope are DERIVED from
//         live assignments (a group is live where it is mapped).
//   POST  create a filter group (an attribute):
//           body { name, slug? } — slug defaults to a slugified name.
//
// Nested routes:
//   PATCH/DELETE  /api/admin/filters/[id]
//   POST          /api/admin/filters/[id]/values          add a value
//   DELETE        /api/admin/filters/values/[valueId]      remove a value
//   POST          /api/admin/filters/[id]/map             map filter→node
//   DELETE        /api/admin/filters/[id]/map/[mappingId]  remove a mapping
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest) {
  const gate = await requireModuleApi("products_services", "read")
  if (gate) return gate

  try {
    const data = await loadFiltersEditorData()
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Load failed: ${msg}` }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const name = String(body.name || "").trim()
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })

  try {
    const created = await createFilterGroup(name)
    revalidateShop()
    return NextResponse.json({ filter: created })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Create failed: ${msg}` }, { status: 502 })
  }
}

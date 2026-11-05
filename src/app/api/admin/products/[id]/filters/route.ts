import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg"

// ============================================================================
// POST /api/admin/products/[id]/filters
//
// Saves the "Filters & Facets" selections (and manufacturing fields) for a
// product. Called by the admin product form AFTER the product itself saves.
//
// Body:
//   {
//     "filters": { "<query_param>": ["<value_slug>", ...], ... },
//     "manufacturer": "Acme Pet Co",        // optional — real manufacturer,
//                                           // NOT the supplier
//     "country_of_origin": "USA"            // optional
//   }
//
// Filter storage: product_attribute_values(product_id, attribute_id,
// attribute_value_id). product_id is the commerce_catalog_items id — the same
// id the admin form uses for all product operations. Existing rows for the
// product are deleted and the new selection set inserted (simplest correct
// upsert; selections are small).
//
// Manufacturing storage: merged into erp_products.metadata as
// {manufacturer, country_of_origin} via the catalog item → sku → product join.
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  const { id: productId } = await ctx.params
  if (!productId) {
    return NextResponse.json({ error: "Missing product id" }, { status: 400 })
  }

  let body: {
    filters?: Record<string, string[]>
    manufacturer?: string
    country_of_origin?: string
    supplier_name?: string
    supplier_sku?: string
    supplier_reorder_url?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const filters = body.filters ?? {}
  const manufacturer = (body.manufacturer ?? "").trim()
  const countryOfOrigin = (body.country_of_origin ?? "").trim()
  const supplierName = (body.supplier_name ?? "").trim()
  const supplierSku = (body.supplier_sku ?? "").trim()
  const supplierReorderUrl = (body.supplier_reorder_url ?? "").trim()

  try {
    // --- Resolve query_param → attributes.id --------------------------------
    const queryParams = Object.keys(filters).filter((k) => k && k.length <= 80)
    const attrBySlug = new Map<string, string>()
    if (queryParams.length > 0) {
      const attrRows = await pgQuery<{ id: string; slug: string }>(
        `SELECT id, slug FROM attributes WHERE slug = ANY($1::text[])`,
        [queryParams]
      )
      for (const r of attrRows) attrBySlug.set(r.slug, r.id)
    }

    // --- Resolve (attribute_id, value_slug) → attribute_values.id ------------
    const valueByKey = new Map<string, string>() // `${attrId}:${slug}` → value id
    const wanted: { attrId: string; slugs: string[] }[] = []
    for (const qp of queryParams) {
      const attrId = attrBySlug.get(qp)
      if (!attrId) continue
      const slugs = (filters[qp] ?? [])
        .map((s) => String(s).toLowerCase().slice(0, 80))
        .filter(Boolean)
      if (slugs.length === 0) continue
      wanted.push({ attrId, slugs })
    }
    for (const w of wanted) {
      const valRows = await pgQuery<{ id: string; slug: string }>(
        `SELECT id, slug FROM attribute_values
         WHERE attribute_id = $1 AND slug = ANY($2::text[])`,
        [w.attrId, w.slugs]
      )
      for (const r of valRows) valueByKey.set(`${w.attrId}:${r.slug}`, r.id)
    }

    // --- Replace the product's attribute rows --------------------------------
    await pgQuery(`DELETE FROM product_attribute_values WHERE product_id = $1`, [productId])
    let saved = 0
    for (const w of wanted) {
      for (const slug of w.slugs) {
        const valueId = valueByKey.get(`${w.attrId}:${slug}`)
        if (!valueId) continue // unknown value slug — skip, don't invent rows
        await pgQuery(
          `INSERT INTO product_attribute_values (product_id, attribute_id, attribute_value_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [productId, w.attrId, valueId]
        )
        saved++
      }
    }

    // --- Manufacturing → erp_products.metadata --------------------------------
    // --- Supplier (internal only) → erp_products.metadata --------------------
    const meta: Record<string, string> = {}
    if (manufacturer) meta.manufacturer = manufacturer
    if (countryOfOrigin) meta.country_of_origin = countryOfOrigin
    // Supplier fields are namespaced as internal — never exposed publicly.
    if (supplierName || supplierSku || supplierReorderUrl) {
      const supplier: Record<string, string> = { _internal: "true" }
      if (supplierName) supplier.name = supplierName
      if (supplierSku) supplier.sku = supplierSku
      if (supplierReorderUrl) supplier.reorder_url = supplierReorderUrl
      meta.supplier_internal = JSON.stringify(supplier)
    }
    if (Object.keys(meta).length > 0) {
      await pgQuery(
        `UPDATE erp_products ep
         SET metadata = COALESCE(ep.metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
         FROM erp_product_skus sku
         JOIN commerce_catalog_items ci ON ci.sku_id = sku.id
         WHERE ci.id = $1 AND ep.id = sku.product_id`,
        [productId, JSON.stringify(meta)]
      )
    }

    return NextResponse.json({ success: true, saved })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Failed to save filters: ${msg}` }, { status: 502 })
  }
}

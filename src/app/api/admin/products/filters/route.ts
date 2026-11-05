import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg"

// ============================================================================
// GET /api/admin/products/filters
//
// Powers the "Filters & Facets" section of the admin product form.
//
//   (no params)              → { nodes: [{id,name,slug,path}] } — taxonomy
//                              picker options (with breadcrumb paths)
//   ?node_id=<uuid>          → { node_id, filters, selections,
//                              product_node_id } — filter sections from
//                              v_node_filter_spec for that node
//   ?category=<slug>         → same, resolving the taxonomy node by slug
//   &product_id=<uuid>       → existing product_attribute_values for the
//                              product as {query_param: [value_slug,...]},
//                              plus the product's current taxonomy node
//   ?product_id=<uuid>       → (no node) resolves the product's own taxonomy
//                              node first, then returns its filters; empty
//                              filters if the product has no node yet
//
// Only filters with value_source='predefined' are user-selectable in the form
// (selectable:true). 'brand' / 'cms' / 'computed' filters are derived and
// returned with selectable:false.
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type FilterValue = { value: string; slug: string }

type FilterSection = {
  query_param: string
  display_name: string
  sort_order: number
  value_source: string
  display_type: string
  is_required: boolean
  allow_new_values: boolean
  selectable: boolean
  allowed_values: FilterValue[]
  inherited: boolean
  defined_on_node_id: string | null
}

const NODE_LIST_SQL = `WITH RECURSIVE tree AS (
   SELECT id, name, slug, parent_id, name::text AS path, 0 AS depth
   FROM taxonomy_nodes WHERE parent_id IS NULL
   UNION ALL
   SELECT tn.id, tn.name, tn.slug, tn.parent_id,
          tree.path || ' / ' || tn.name, tree.depth + 1
   FROM taxonomy_nodes tn JOIN tree ON tn.parent_id = tree.id
 )
 SELECT id, name, slug, path FROM tree ORDER BY path`

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("products_services", "read")
  if (gate) return gate

  const sp = req.nextUrl.searchParams
  const nodeIdParam = sp.get("node_id")
  const categorySlug = sp.get("category")
  const productId = sp.get("product_id")

  let nodeId: string | null = nodeIdParam

  // --- New product, no node yet: return picker options ---------------------
  if (!nodeId && !categorySlug && !productId) {
    try {
      const nodes = await pgQuery<{ id: string; name: string; slug: string; path: string }>(NODE_LIST_SQL)
      return NextResponse.json({ nodes })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: `Failed to load taxonomy nodes: ${msg}` }, { status: 502 })
    }
  }

  // --- Resolve via category slug -------------------------------------------
  if (!nodeId && categorySlug) {
    try {
      const rows = await pgQuery<{ id: string }>(
        `SELECT id FROM taxonomy_nodes WHERE slug = $1 LIMIT 1`,
        [categorySlug]
      )
      nodeId = rows[0]?.id ?? null
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: `Failed to resolve category: ${msg}` }, { status: 502 })
    }
  }

  // --- Resolve via the product's own taxonomy node (edit mode) --------------
  if (!nodeId && productId) {
    try {
      const nodeRows = await pgQuery<{ node_ids: string[] | null }>(
        `SELECT metadata->'taxonomy_node_ids' AS node_ids
         FROM commerce_catalog_items WHERE id = $1`,
        [productId]
      )
      const ids = nodeRows[0]?.node_ids
      if (Array.isArray(ids) && ids.length > 0 && typeof ids[0] === "string") {
        nodeId = ids[0]
      }
    } catch {
      nodeId = null
    }
  }

  if (!nodeId) {
    // Product has no taxonomy node yet — UI shows the picker prompt.
    if (productId) {
      return NextResponse.json({ node_id: null, filters: [], selections: {}, product_node_id: null })
    }
    return NextResponse.json({ error: "Unknown category or node" }, { status: 404 })
  }

  // --- Filter sections for the node -----------------------------------------
  let filters: FilterSection[]
  try {
    const rows = await pgQuery<{
      query_param: string
      display_name: string
      sort_order: number
      value_source: string
      display_type: string
      is_required: boolean
      allow_new_values: boolean
      allowed_values: FilterValue[] | null
      inherited: boolean
      defined_on_node_id: string | null
    }>(
      `SELECT query_param,
              filter AS display_name,
              sort_order,
              value_source,
              display_type,
              is_required,
              allow_new_values,
              allowed_values,
              inherited,
              defined_on_node_id
       FROM v_node_filter_spec
       WHERE node_id = $1
       ORDER BY sort_order ASC`,
      [nodeId]
    )
    filters = rows.map((r) => ({
      query_param: r.query_param,
      display_name: r.display_name,
      sort_order: r.sort_order,
      value_source: r.value_source,
      display_type: r.display_type,
      is_required: r.is_required,
      allow_new_values: r.allow_new_values,
      selectable: r.value_source === "predefined",
      allowed_values: Array.isArray(r.allowed_values) ? r.allowed_values : [],
      inherited: r.inherited,
      defined_on_node_id: r.defined_on_node_id,
    }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Failed to load filters: ${msg}` }, { status: 502 })
  }

  // --- Existing selections + manufacturing + supplier (edit mode) ---------------
  let selections: Record<string, string[]> = {}
  let manufacturing: { manufacturer: string; country_of_origin: string } = {
    manufacturer: "",
    country_of_origin: "",
  }
  let supplier: { supplier_name: string; supplier_sku: string; supplier_reorder_url: string } = {
    supplier_name: "",
    supplier_sku: "",
    supplier_reorder_url: "",
  }
  if (productId) {
    try {
      const selRows = await pgQuery<{ query_param: string; value_slug: string }>(
        `SELECT fa.slug AS query_param, av.slug AS value_slug
         FROM product_attribute_values pav
         JOIN attribute_values av ON av.id = pav.attribute_value_id
         JOIN attributes fa ON fa.id = pav.attribute_id
         WHERE pav.product_id = $1`,
        [productId]
      )
      for (const r of selRows) {
        const arr = selections[r.query_param] ?? []
        if (!arr.includes(r.value_slug)) arr.push(r.value_slug)
        selections[r.query_param] = arr
      }
    } catch {
      selections = {}
    }
    try {
      const mRows = await pgQuery<{ manufacturer: string | null; country_of_origin: string | null; supplier_internal: string | null }>(
        `SELECT ep.metadata->>'manufacturer' AS manufacturer,
                ep.metadata->>'country_of_origin' AS country_of_origin,
                ep.metadata->>'supplier_internal' AS supplier_internal
         FROM erp_products ep
         JOIN erp_product_skus sku ON sku.product_id = ep.id
         JOIN commerce_catalog_items ci ON ci.sku_id = sku.id
         WHERE ci.id = $1
         LIMIT 1`,
        [productId]
      )
      if (mRows[0]) {
        manufacturing = {
          manufacturer: mRows[0].manufacturer ?? "",
          country_of_origin: mRows[0].country_of_origin ?? "",
        }
        try {
          const s = JSON.parse(mRows[0].supplier_internal ?? "{}")
          supplier = {
            supplier_name: s.name ?? "",
            supplier_sku: s.sku ?? "",
            supplier_reorder_url: s.reorder_url ?? "",
          }
        } catch {
          // no supplier data
        }
      }
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({ node_id: nodeId, filters, selections, product_node_id: nodeId, manufacturing, supplier })
}

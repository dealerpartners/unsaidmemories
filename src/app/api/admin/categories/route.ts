import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop"
import { withPg } from "@/lib/crm/enterprise"
import { createServerClient } from "@/lib/supabase"

// ============================================================================
// /api/admin/categories — admin-gated CRUD for the ONE category store:
// public.categories, the tree the schema itself enforces —
// products.category_id and supplier_catalog_products.category_id are
// foreign keys INTO it, every categorized design's category_id resolves
// in it, and the studio catalog contract (fetchCategoryLite in
// lib/supabase, behind /api/admin/studio/catalog) reads it.
//
// CORRECTED 2026-10-31 (publish-wizard Step 4 defect): this route's GET
// previously read public.taxonomy_nodes, which holds ZERO rows in this
// database — the "436+ nodes" census in the old header was transplanted
// doctrine, never true here. GET returned 200 with an empty list, so
// every reader (publish wizard Step 4, the design studio's category
// picker, AdminProductsPage) rendered its no-categories state while the
// New Design wizard, reading public.categories, worked. GET now reads
// public.categories through the same Supabase REST face as
// fetchCategoryLite: active rows only, NO tenant filter (the tree's
// rows do not sit on the env tenant; fetchCategoryLite reads them
// unfiltered for the same reason).
//
//   GET   every active category (parent-first, sort_order, name),
//         mapped to this route's established row shape.
//   POST  create a node; path + depth derive from the parent, in the
//         tree's own convention (child path = parent path + '/' + slug).
//         NOTE: POST still writes taxonomy_nodes — a separate latent
//         inconsistency, left untouched by the Step 4 fix.
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NODE_TYPES = ["animal", "department", "category", "subcategory"] as const
const STATUSES = ["published", "draft", "archived"] as const

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const NODE_COLS = `id::text AS id, parent_id::text AS parent_id,
  name, display_name, slug, node_type, status,
  sort_order, is_featured, is_gated, hero_image_url,
  product_count, depth, path, subject_id::text AS subject_id`

export async function GET(_req: NextRequest) {
  const gate = await requireModuleApi("products_services", "read")
  if (gate) return gate

  // The real tree: public.categories (see header). Read through the
  // same Supabase REST face every other publish-wizard load uses, and
  // mapped into this route's established row shape: depth is the
  // wizard's 0-based indent (categories.level is 1-based, roots = 1),
  // display_name has no source column (readers fall back to name).
  const db = createServerClient()
  const { data, error } = await db
    .from("categories")
    .select("id, parent_id, name, slug, level, sort_order, is_active")
    .eq("is_active", true)
    .order("level", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
  if (error) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  }
  const categories = (data ?? []).map((r: any) => ({
    id: r.id as string,
    parent_id: (r.parent_id as string | null) ?? null,
    name: r.name as string,
    display_name: null,
    slug: r.slug as string,
    node_type: "category",
    status: "published",
    sort_order: r.sort_order ?? 0,
    is_featured: false,
    is_gated: false,
    hero_image_url: null,
    product_count: null,
    depth: Math.max(Number(r.level ?? 1) - 1, 0),
    path: null,
    subject_id: null,
    is_active: true,
  }))
  return NextResponse.json({ categories })
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate
  const tenant = resolveTenantId(req)

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  const slug = slugify(typeof body.slug === "string" && body.slug ? body.slug : name)
  if (!name || !slug) {
    return NextResponse.json({ error: "name (or slug) is required" }, { status: 400 })
  }
  const nodeType = NODE_TYPES.includes(body.node_type) ? body.node_type : "category"
  const status = STATUSES.includes(body.status) ? body.status : "draft"
  const parentId =
    typeof body.parent_id === "string" && body.parent_id ? body.parent_id : null

  const out = await withPg(async (c) => {
    let parent: { path: string; depth: number; subject_id: string | null } | null = null
    if (parentId) {
      const { rows } = await c.query(
        `SELECT path, depth, subject_id::text AS subject_id FROM public.taxonomy_nodes
          WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
        [tenant, parentId],
      )
      if (!rows[0]) return { error: "Parent category not found", status: 400 as const }
      parent = rows[0]
    }
    const path = parent ? `${parent.path}/${slug}` : `/shop/${slug}`
    const depth = parent ? Number(parent.depth) + 1 : 1
    const animalId = nodeType === "animal" ? null : (parent?.subject_id ?? null)
    const { rows } = await c.query(
      `INSERT INTO public.taxonomy_nodes
         (tenant_id, parent_id, subject_id, node_type, name, display_name, slug,
          path, depth, sort_order, is_featured, is_gated, hero_image_url, status)
       VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, false, $12, $13)
       RETURNING ${NODE_COLS}`,
      [
        tenant, parentId, animalId, nodeType, name,
        typeof body.display_name === "string" && body.display_name ? body.display_name : name,
        slug, path, depth, Number(body.sort_order ?? 0),
        !!body.is_featured, body.hero_image_url ?? body.hero_image ?? null, status,
      ],
    )
    return { category: rows[0] }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status })
  revalidateShop()
  return NextResponse.json(out)
}

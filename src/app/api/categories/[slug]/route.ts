/**
 * GET /api/categories/[slug]
 *
 * Public category page data: the category, its breadcrumb ancestors,
 * its child categories, and a first page of products (published admin
 * products + supplier catalog products in the subtree).
 *
 * Query: ?page=1&perPage=32
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TENANT_ID = getTenantId();

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await ctx.params;
    const supabase = createServerClient();
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(sp.get("perPage") || "32", 10) || 32));
    const offset = (page - 1) * perPage;

    const { data: category, error: catErr } = await supabase
      .from("categories")
      .select("id, parent_id, level, name, slug, description")
      .eq("slug", slug)
      .or(`tenant_id.eq.${TENANT_ID},tenant_id.is.null`)
      .eq("is_active", true)
      .maybeSingle();
    if (catErr) throw catErr;
    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    // Breadcrumb ancestors.
    const ancestors: { id: string; name: string; slug: string }[] = [];
    let pid: string | null = category.parent_id;
    while (pid) {
      const { data: p } = await supabase
        .from("categories")
        .select("id, parent_id, name, slug")
        .eq("id", pid)
        .maybeSingle();
      if (!p) break;
      ancestors.unshift({ id: p.id, name: p.name, slug: p.slug });
      pid = p.parent_id;
    }

    // Children.
    const { data: children } = await supabase
      .from("categories")
      .select("id, name, slug, description")
      .eq("parent_id", category.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    // All descendant ids (self + children recursively).
    const allIds = new Set<string>([category.id]);
    async function collect(cid: string) {
      const { data } = await supabase.from("categories").select("id").eq("parent_id", cid);
      if (data) for (const c of data) { if (!allIds.has(c.id)) { allIds.add(c.id); await collect(c.id); } }
    }
    await collect(category.id);
    const ids = [...allIds];

    // Published admin products in this subtree.
    const { data: adminProducts } = await supabase
      .from("products")
      .select("id, name, slug, description")
      .in("category_id", ids)
      .or(`tenant_id.eq.${TENANT_ID},tenant_id.is.null`)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    // Supplier catalog products in this subtree.
    const { data: supplierProducts, count } = await supabase
      .from("supplier_catalog_products")
      .select("id, name, brand_name, image_url", { count: "exact" })
      .eq("is_hidden", false)
      .in("category_id", ids)
      .order("name", { ascending: true })
      .range(offset, offset + perPage - 1);

    return NextResponse.json({
      category,
      ancestors,
      children: children ?? [],
      products: {
        curated: (adminProducts ?? []).map((p) => ({ ...p, source: "catalog" as const })),
        supplier: (supplierProducts ?? []).map((p) => ({ ...p, source: "supplier" as const })),
        supplierTotal: count ?? 0,
      },
      page,
      perPage,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load category" },
      { status: 500 }
    );
  }
}

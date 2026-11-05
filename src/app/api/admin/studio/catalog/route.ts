import { NextRequest, NextResponse } from "next/server";
import {
  categoryChain,
  createServerClient,
  descendantCategoryIds,
  fetchCategoryLite,
  fetchMinPricesBatch,
  fetchProductsByCategoryRecursive,
  fetchSupplierProducts,
} from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";
import { classifyKind, KIND_TO_PRODUCT_TYPE_FALLBACK } from "@/lib/fabric/catalog-shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/studio/catalog — the Product Library (architecture
 * doc §9): the ONE joined read for product selection. It serves the same
 * data that flows out to the storefront marketplace, flowing back in:
 * supplier_catalog_products joined to the categories tree the storefront
 * groups by (category path on every product; category reads are
 * recursive over the subtree, exactly like a storefront category page),
 * product kind (classifyKind), min price, image, variant count, supplier.
 *
 * Modes:
 * - Browse cards: ?level=children[&parent=<category_id>] — the category
 *   cards for one level of the tree (roots when no parent), each with
 *   its live subtree product count + hasChildren, plus the breadcrumb
 *   path and the parent's own subtree count.
 * - Products: ?search&supplier&category&limit(<=100)&offset — a page of
 *   products with `total`. Search is tokenized: every word must appear
 *   in the product name, its brand, or a category name on its path.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const { searchParams } = new URL(req.url);
    const db = createServerClient();

    /* ---- Browse mode: category cards for one tree level ---- */
    if (searchParams.get("level") === "children") {
      const parentId = searchParams.get("parent") || null;
      const tree = await fetchCategoryLite();
      const byParent = new Map<string | null, typeof tree>();
      for (const n of tree) {
        const list = byParent.get(n.parent_id) ?? [];
        list.push(n);
        byParent.set(n.parent_id, list);
      }
      const subtreeCount = async (id: string) => {
        const { count } = await db
          .from("supplier_catalog_products")
          .select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .in("category_id", descendantCategoryIds(tree, id));
        return count ?? 0;
      };
      const children = byParent.get(parentId) ?? [];
      const cards = await Promise.all(
        children.map(async (n) => ({
          id: n.id,
          name: n.name,
          slug: n.slug,
          count: await subtreeCount(n.id),
          hasChildren: (byParent.get(n.id) ?? []).length > 0,
        })),
      );
      return NextResponse.json({
        cards,
        path: parentId
          ? categoryChain(tree, parentId).map((n) => ({ id: n.id, name: n.name, slug: n.slug }))
          : [],
        parentCount: parentId ? await subtreeCount(parentId) : 0,
      });
    }

    /* ---- Products mode: one page of the joined read ---- */
    const search = searchParams.get("search") ?? undefined;
    const supplier = searchParams.get("supplier") ?? undefined;
    const categoryId = searchParams.get("category") ?? undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "24", 10) || 24, 100);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

    // A category selection reads the whole subtree — identical to a
    // storefront category page (fetchProductsByCategoryRecursive).
    const { products, total } = categoryId
      ? await fetchProductsByCategoryRecursive(categoryId, limit, offset, { search, supplier })
      : await fetchSupplierProducts({ search, supplier, categoryId, limit, offset });

    const prices = await fetchMinPricesBatch(products.map((p) => p.id));

    const { data: suppliers } = await db
      .from("suppliers")
      .select("id, name, slug");
    const supplierById = new Map((suppliers ?? []).map((s: any) => [s.id, s]));

    // Category path per product, walked on the same tree (one fetch).
    const tree = products.length ? await fetchCategoryLite() : [];
    const pathFor = (cid: string | null) =>
      cid ? categoryChain(tree, cid).map((n) => n.name) : [];

    return NextResponse.json({
      total,
      products: products.map((p) => {
        const kind = classifyKind(p.name);
        const pricing = prices.get(p.id);
        const categoryPath = pathFor(p.category_id);
        return {
          id: p.id,
          name: p.name,
          brand_name: p.brand_name,
          supplier_id: p.supplier_id,
          supplier_name: supplierById.get(p.supplier_id)?.name ?? null,
          supplier_slug: supplierById.get(p.supplier_id)?.slug ?? null,
          category_id: p.category_id,
          category_path: categoryPath,
          category_name: categoryPath[categoryPath.length - 1] ?? null,
          image_url: p.image_url,
          variant_count: p.variant_count,
          kind,
          productType: KIND_TO_PRODUCT_TYPE_FALLBACK[kind],
          minPrice: pricing?.minPrice ?? null,
          sizes: pricing?.sizes ?? [],
          colors: pricing?.colors ?? [],
        };
      }),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

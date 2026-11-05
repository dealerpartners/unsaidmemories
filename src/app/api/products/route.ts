import { NextRequest, NextResponse } from "next/server";
import {
  fetchProductsByCategoryRecursive,
  fetchSupplierProducts,
  fetchMinPricesBatch,
  type SupplierProduct,
} from "@/lib/supabase";
import { getCachedCategoryProducts, resolveCategoryBySlugOrName } from "@/lib/catalog-cache";
import { fetchProductsForStaticPath, isStaticPath } from "@/lib/static-catalog";

// GET /api/products?path=apparel/men&page=2&perPage=32
//   &search=mug&supplier=<supplier_id>&category=<category_id>
// Returns enriched supplier catalog products for the given category slug path.
// Supports pagination for the client "Load More" (page 1 = first perPage items).
// Plain path queries share the SAME cached fetch as the SSR pages
// (getCachedCategoryProducts — 5-min cache + NAME-based category resolution),
// so the API and the SSR always return identical data. Filters
// (search / supplier / direct category_id) bypass the cache and query
// Supabase directly.

function enrich(rawProducts: SupplierProduct[], pricing: Map<string, { minPrice: number | null; variantCount: number; sizes: string[]; colors: string[] }>) {
  return rawProducts.map((p) => {
    const pr = pricing.get(p.id);
    return {
      id: p.id,
      name: p.name,
      brand: p.brand_name,
      image: p.image_url || (p.images?.[0] ?? null),
      images: p.images,
      variantCount: pr?.variantCount ?? p.variant_count ?? 0,
      // Her set price for the listing wins over the supplier from-price.
      minPrice: p.listing_price ?? pr?.minPrice ?? null,
      sizes: pr?.sizes ?? [],
      colors: pr?.colors ?? [],
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get("path") || "";
    const slugs = path.split("/").filter(Boolean);
    const search = req.nextUrl.searchParams.get("search") || "";
    const supplier = req.nextUrl.searchParams.get("supplier") || "";
    const categoryId = req.nextUrl.searchParams.get("category") || "";
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("perPage") || "32", 10) || 32));
    const offset = (page - 1) * perPage;

    // ── Plain path query (no filters): static taxonomy paths resolve
    //    through the static→DB mapping (identical to the SSR first
    //    page); anything else keeps the legacy cached fetch. ──
    if (!search && !supplier && !categoryId) {
      if (slugs.length && isStaticPath(slugs)) {
        const r = await fetchProductsForStaticPath(path, perPage, offset);
        return NextResponse.json({ products: r.products, total: r.total });
      }
      const r = await getCachedCategoryProducts(path, perPage, offset);
      return NextResponse.json({ products: r.products, total: r.total });
    }

    // ── Filtered queries: direct Supabase ──
    let rawProducts: SupplierProduct[];
    let total: number;

    if (categoryId) {
      // Direct category filter (takes precedence over path).
      const r = await fetchProductsByCategoryRecursive(categoryId, perPage, offset, { search, supplier });
      rawProducts = r.products;
      total = r.total;
    } else if (!slugs.length) {
      // Root + filters — broad fetch across all categories.
      const r = await fetchSupplierProducts({ limit: perPage, offset, search, supplier });
      rawProducts = r.products;
      total = r.total;
    } else {
      // Path + filters — resolve by slug-or-name (mismatch-safe), then filter.
      const resolved = await resolveCategoryBySlugOrName(slugs);
      if (!resolved) return NextResponse.json({ products: [], total: 0 });
      const r = await fetchProductsByCategoryRecursive(resolved.category.id, perPage, offset, { search, supplier });
      rawProducts = r.products;
      total = r.total;
    }

    if (!rawProducts.length) return NextResponse.json({ products: [], total });

    const ids = rawProducts.map((p) => p.id);
    const pricing = await fetchMinPricesBatch(ids);
    return NextResponse.json({ products: enrich(rawProducts, pricing), total });
  } catch (e) {
    // Missing Supabase env vars at runtime or unexpected failure — return
    // empty so the grid shows "No products here yet" instead of a 500.
    return NextResponse.json({ products: [], total: 0, error: "catalog-unavailable" });
  }
}

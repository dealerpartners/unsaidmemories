import { unstable_cache } from "next/cache";
import {
  fetchCategoryByPath,
  fetchProductsByCategoryRecursive,
  fetchSupplierProducts,
  fetchMinPricesBatch,
} from "@/lib/supabase";
import { productSlug } from "@/lib/product-slug";

// Server-only product fetch — cached via unstable_cache (5-min SWR).
// Both the shop page (RSC) and the /api/products route share this, so the
// SSR HTML and the Load-More results are always consistent.
// Pattern lifted from AllAboutPawz (src/lib/shop/market-data.ts).

export type CatalogProduct = {
  id: string;
  name: string;
  brand: string | null;
  image: string | null;
  images: string[] | null;
  variantCount: number;
  minPrice: number | null;
  sizes: string[];
  colors: string[];
  slug: string;
};

async function fetchCategoryProductsUncached(
  slugs: string[],
  limit = 32,
  offset = 0,
): Promise<{ products: CatalogProduct[]; total: number }> {
  let rawProducts;
  let total: number;

  if (!slugs.length) {
    const r = await fetchSupplierProducts({ limit, offset });
    rawProducts = r.products;
    total = r.total;
  } else {
    const result = await fetchCategoryByPath(slugs);
    if (!result) return { products: [], total: 0 };
    const r = await fetchProductsByCategoryRecursive(result.category.id, limit, offset);
    rawProducts = r.products;
    total = r.total;
  }

  if (!rawProducts.length) return { products: [], total };

  const ids = rawProducts.map((p) => p.id);
  const pricing = await fetchMinPricesBatch(ids);

  const products: CatalogProduct[] = rawProducts.map((p) => {
    const pr = pricing.get(p.id);
    return {
      id: p.id,
      name: p.name,
      brand: p.brand_name,
      image: p.image_url || (p.images?.[0] ?? null),
      images: p.images,
      variantCount: pr?.variantCount ?? p.variant_count ?? 0,
      minPrice: pr?.minPrice ?? null,
      sizes: pr?.sizes ?? [],
      colors: pr?.colors ?? [],
      slug: productSlug(String(p.name), String(p.id)),
    };
  });

  return { products, total };
}

// unstable_cache key must be a single serializable arg — join slugs with "/".
export const getCategoryProducts = unstable_cache(
  async (slugsKey: string, limit: number, offset: number): Promise<{ products: CatalogProduct[]; total: number }> => {
    const slugs = slugsKey ? slugsKey.split("/") : [];
    return fetchCategoryProductsUncached(slugs, limit, offset);
  },
  ["category-products-v1"],
  { revalidate: 300, tags: ["catalog"] },
);

// Convenience wrapper — accepts a slugs array directly.
export async function getInitialProducts(slugs: string[], limit = 32): Promise<{ products: CatalogProduct[]; total: number }> {
  return getCategoryProducts(slugs.join("/"), limit, 0);
}

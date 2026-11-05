/**
 * catalog-cache.ts — cached server-side catalog fetchers.
 *
 * Kim's pattern: "The server component fetches the products (via
 * unstable_cache, 5-min revalidate) and passes them as props to the
 * client grid. The client grid seeds useState from those props — no
 * useEffect, no fetch, no 'Loading…' state on first paint.
 * fetch() is only used for 'Load More' (subsequent pages)."
 *
 * Every fetcher below is wrapped in `unstable_cache` with a 5-minute
 * revalidate. The cache key is derived from the function arguments, so
 * different category paths / pages cache independently.
 */

import { unstable_cache } from "next/cache";
import {
  fetchCategoryByPath,
  fetchProductsByCategoryRecursive,
  fetchSupplierProducts,
  fetchMinPricesBatch,
  createServerClient,
  type SupplierProduct,
} from "./supabase";
import { taxonomy } from "@/lib/taxonomy";
import type { CatalogProduct } from "@/components/catalog-card";
import { fetchProductFacets } from "@/lib/product-facets";

/** 5 minutes — matches Kim's revalidate requirement. */
const REVALIDATE_SECONDS = 300;

/** Enriched product shape returned to grids (matches /api/products). */
export type EnrichedProduct = CatalogProduct;

// ── Name-based category resolution ─────────────────────────────
// Supabase slugs don't always match the static taxonomy slugs
// ("wall-art" vs "wall-art-2", "cards-and-stationery" vs
// "cards-stationery", "home-living" vs "home-and-living"…), but the
// NAMES always match — so we resolve Supabase categories by name.

/** Map a URL slug path to a category-NAME path via the static taxonomy. */
export function slugsToNames(slugs: string[]): string[] | null {
  let nodes: any[] = taxonomy;
  const names: string[] = [];
  for (const slug of slugs) {
    const found = nodes.find((n: any) => n.slug === slug);
    if (!found) return null;
    names.push(found.name);
    nodes = found.children || [];
  }
  return names;
}

/** Resolve a Supabase category (id, name, slug + ancestors) by NAME path.
 *  Returns the same shape as fetchCategoryByPath so it's a drop-in. */
export async function resolveCategoryByNames(
  names: string[],
): Promise<{ category: { id: string; name: string; slug: string }; ancestors: { id: string; name: string; slug: string }[] } | null> {
  const supabase = createServerClient();
  let parentId: string | null = null;
  const chain: { id: string; name: string; slug: string }[] = [];
  for (const name of names) {
    let query = supabase
      .from("categories")
      .select("id, name, slug")
      .eq("name", name)
      .eq("is_active", true);
    if (parentId !== null) query = query.eq("parent_id", parentId);
    else query = query.is("parent_id", null);
    const { data, error } = await query.limit(1);
    if (error || !data || data.length === 0) return null;
    chain.push(data[0] as { id: string; name: string; slug: string });
    parentId = data[0].id;
  }
  if (!chain.length) return null;
  return { category: chain[chain.length - 1], ancestors: chain.slice(0, -1) };
}

/** Resolve a category by slug path, falling back to NAME resolution when
 *  the slug walk fails (slug mismatches). Returns the fetchCategoryByPath
 *  shape. */
export async function resolveCategoryBySlugOrName(
  slugs: string[],
): Promise<{ category: { id: string; name: string; slug: string }; ancestors: { id: string; name: string; slug: string }[] } | null> {
  const slugResult = await fetchCategoryByPath(slugs);
  if (slugResult) return slugResult;
  const names = slugsToNames(slugs);
  if (!names) return null;
  return resolveCategoryByNames(names);
}

async function enrichProducts(
  rawProducts: SupplierProduct[],
): Promise<EnrichedProduct[]> {
  if (!rawProducts.length) return [];
  const ids = rawProducts.map((p) => p.id);
  const [pricing, facetMap] = await Promise.all([
    fetchMinPricesBatch(ids),
    fetchProductFacets(ids),
  ]);
  return rawProducts.map((p) => {
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
      facets: facetMap.get(p.id) ?? [],
    };
  });
}

/**
 * Fetch enriched products for a category slug path (e.g. "apparel/hoodies").
 * Empty path = shop root (broad fetch). Cached 5 minutes.
 */
async function fetchCategoryProductsUncached(
  path: string,
  limit: number,
  offset: number,
): Promise<{ products: EnrichedProduct[]; total: number }> {
  const slugs = path.split("/").filter(Boolean);

  let rawProducts: SupplierProduct[];
  let total: number;

  if (!slugs.length) {
    const r = await fetchSupplierProducts({ limit, offset });
    rawProducts = r.products;
    total = r.total;
  } else {
    // Resolve by slug first, then by NAME (robust against slug mismatches
    // between the static taxonomy and Supabase — wall-art vs wall-art-2 etc).
    const resolved = await resolveCategoryBySlugOrName(slugs);
    if (!resolved) return { products: [], total: 0 };
    const r = await fetchProductsByCategoryRecursive(resolved.category.id, limit, offset);
    rawProducts = r.products;
    total = r.total;
  }

  return { products: await enrichProducts(rawProducts), total };
}

export const getCachedCategoryProducts = unstable_cache(
  fetchCategoryProductsUncached,
  ["catalog-category-products"],
  { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
);

/**
 * Fetch up to 4 related products for the PDP "Things you may like" rail.
 * Same-category products, excluding the current one. Cached 5 minutes.
 */
async function fetchRecommendationsUncached(
  productId: string,
  categoryId: string | null,
): Promise<EnrichedProduct[]> {
  if (!categoryId) return [];
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("supplier_catalog_products")
    .select("*")
    .eq("is_hidden", false)
    .eq("category_id", categoryId)
    .neq("id", productId)
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(4);
  if (error || !data) return [];
  return enrichProducts(data as SupplierProduct[]);
}

export const getCachedRecommendations = unstable_cache(
  fetchRecommendationsUncached,
  ["catalog-recommendations"],
  { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
);

/**
 * UnSaid Picks for the PDP — up to 3 REAL products from OTHER departments
 * (recent first, image required, deduped against the product itself and the
 * "You may also like" rail). Mirrors the reference PDP's picks rail: real
 * catalog items only, never editorial stock cards. Cached 5 minutes.
 */
async function fetchPdpPicksUncached(
  productId: string,
  categoryId: string | null,
  excludeIds: string[],
): Promise<EnrichedProduct[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("supplier_catalog_products")
    .select("*")
    .eq("is_hidden", false)
    .not("image_url", "is", null)
    .neq("id", productId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error || !data) return [];
  const excluded = new Set([productId, ...excludeIds]);
  const rows = (data as SupplierProduct[])
    .filter((p) => !excluded.has(p.id))
    .filter((p) => !categoryId || p.category_id !== categoryId)
    .slice(0, 3);
  return enrichProducts(rows);
}

export const getPdpPicks = unstable_cache(
  fetchPdpPicksUncached,
  ["catalog-pdp-picks"],
  { revalidate: REVALIDATE_SECONDS, tags: ["catalog"] },
);

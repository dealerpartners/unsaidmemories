import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service role key.
 * Use this in server components, route handlers, and server actions.
 * NEVER import this in client components — it bypasses RLS.
 */
export function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * Safe variant of createServerClient — returns null instead of
 * throwing when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.
 * Use this in admin pages that should degrade to a "connect your
 * database" card instead of 500-ing when the env is not configured.
 * (createServerClient above still throws for routes that genuinely
 * require the DB to function — auth callbacks, webhooks, etc.)
 */
export function tryCreateServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    return createClient(url, key, { auth: { persistSession: false } });
  } catch {
    return null;
  }
}

/**
 * Public Supabase client using the anon key.
 * Safe to use in client components — respects RLS.
 */
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createClient(url, key);
}

// ── Types ────────────────────────────────────────────────────

export type SupplierProduct = {
  id: string;
  supplier_id: string;
  external_id: string;
  external_id_type: string | null;
  name: string;
  brand_name: string | null;
  category_id: string | null;
  variant_count: number | null;
  image_url: string | null;
  images: string[] | null;
  canonical_product_id?: string | null;
  created_at: string;
  /* Columns written by publishing/overrides, read by the joined catalog. */
  original_name?: string | null;
  description?: string | null;
  edited?: boolean;
  is_hidden?: boolean;
  listing_price?: number | null;
};

export type SupplierVariant = {
  id: string;
  supplier_id: string;
  supplier_catalog_product_id: string;
  external_id: string;
  name: string;
  size: string | null;
  color: string | null;
  print_specs: Record<string, unknown> | null;
  price_snapshot: number | null;
  canonical_product_id?: string | null;
  created_at: string;
};

// ── Query helpers for supplier catalog ───────────────────────

/**
 * Fetch supplier catalog products with server-side pagination.
 * Returns products that have images first, then those without.
 */
export async function fetchSupplierProducts(opts: {
  categoryId?: string | null;
  /** Filter to products in ANY of these categories (takes precedence over categoryId). */
  categoryIds?: string[];
  hasImagesOnly?: boolean;
  limit?: number;
  offset?: number;
  /** Name search (ilike). */
  search?: string;
  /** Filter by supplier_id. */
  supplier?: string;
  /** Server-side sort (default: images first, then name). */
  sort?: CatalogSort;
  /** Restrict to these product ids (takes precedence over category filters). */
  restrictIds?: string[];
  /** Exclude these product ids (the designed set, for not-designed pages). */
  excludeIds?: string[];
} = {}): Promise<{ products: SupplierProduct[]; total: number }> {
  const supabase = createServerClient();
  const limit = opts.limit ?? 24;
  const offset = opts.offset ?? 0;

  let query = supabase
    .from("supplier_catalog_products")
    .select("*", { count: "exact" })
    .eq("is_hidden", false);

  if (opts.restrictIds && opts.restrictIds.length) {
    query = query.in("id", opts.restrictIds);
  } else if (opts.categoryIds && opts.categoryIds.length) {
    query = query.in("category_id", opts.categoryIds);
  } else if (opts.categoryId) {
    query = query.eq("category_id", opts.categoryId);
  }

  if (opts.excludeIds && opts.excludeIds.length) {
    query = query.not("id", "in", `(${opts.excludeIds.join(",")})`);
  }

  if (opts.hasImagesOnly) {
    query = query.not("image_url", "is", null);
  }

  if (opts.search) {
    query = query.ilike("name", `%${opts.search}%`);
  }

  if (opts.supplier) {
    query = query.eq("supplier_id", opts.supplier);
  }

  for (const [col, asc] of sortColumns(opts.sort)) {
    query = query.order(col, asc);
  }

  const { data, count, error } = await query
    .range(offset, offset + limit - 1);

  if (error || !data) return { products: [], total: 0 };
  return { products: data as SupplierProduct[], total: count ?? 0 };
}

/**
 * Collect a category ID + all of its descendant category IDs (breadth-first
 * walk of the categories tree). Used so a department page (e.g. /apparel) can
 * list every product that lives anywhere beneath it — supplier catalog
 * products are tagged with leaf category_ids, not top-level ones.
 */
export async function fetchDescendantCategoryIds(
  parentId: string,
): Promise<string[]> {
  const supabase = createServerClient();
  const ids = [parentId];
  let frontier: string[] = [parentId];
  while (frontier.length) {
    const { data, error } = await supabase
      .from("categories")
      .select("id")
      .in("parent_id", frontier)
      .eq("is_active", true);
    if (error || !data || data.length === 0) break;
    const childIds = data.map((c) => c.id);
    ids.push(...childIds);
    frontier = childIds;
  }
  return ids;
}

/**
 * Fetch variants for a specific supplier catalog product.
 * Returns size/color options and pricing.
 */
export async function fetchVariantsForProduct(productId: string): Promise<SupplierVariant[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("supplier_catalog_variants")
    .select("*")
    .eq("supplier_catalog_product_id", productId)
    .order("price_snapshot", { ascending: true });

  if (error || !data) return [];
  return data as SupplierVariant[];
}

/**
 * Get the minimum price from variants for a product.
 */
export async function fetchMinPrice(productId: string): Promise<number | null> {
  const variants = await fetchVariantsForProduct(productId);
  const prices = variants
    .map((v) => v.price_snapshot)
    .filter((p): p is number => p !== null && p > 0);
  return prices.length ? Math.min(...prices) : null;
}

/**
 * Batch fetch min prices for multiple products.
 * More efficient than calling fetchMinPrice for each.
 */
export async function fetchMinPricesBatch(productIds: string[]): Promise<Map<string, { minPrice: number | null; variantCount: number; sizes: string[]; colors: string[] }>> {
  const supabase = createServerClient();
  const result = new Map<string, { minPrice: number | null; variantCount: number; sizes: string[]; colors: string[] }>();

  if (!productIds.length) return result;

  // Page through the rows: a single PostgREST response caps at 1000 rows,
  // which silently truncated counts/prices for variant-heavy products.
  const PAGE = 1000;
  const data: { supplier_catalog_product_id: string; price_snapshot: number | null; size: string | null; color: string | null }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data: page, error } = await supabase
      .from("supplier_catalog_variants")
      .select("supplier_catalog_product_id, price_snapshot, size, color")
      .in("supplier_catalog_product_id", productIds)
      .range(offset, offset + PAGE - 1);
    if (error) return result;
    if (!page?.length) break;
    data.push(...page);
    if (page.length < PAGE) break;
  }

  for (const v of data) {
    const pid = v.supplier_catalog_product_id;
    if (!result.has(pid)) {
      result.set(pid, { minPrice: null, variantCount: 0, sizes: [], colors: [] });
    }
    const entry = result.get(pid)!;
    entry.variantCount++;
    if (v.price_snapshot && (entry.minPrice === null || v.price_snapshot < entry.minPrice)) {
      entry.minPrice = v.price_snapshot;
    }
    if (v.size && !entry.sizes.includes(v.size)) entry.sizes.push(v.size);
    if (v.color && !entry.colors.includes(v.color)) entry.colors.push(v.color);
  }

  return result;
}

export type ProductPricing = {
  minPrice: number | null;
  variantCount: number;
  sizes: string[];
  colors: string[];
};

/**
 * Fetch pricing (min supplier cost + variant count + distinct sizes/colors)
 * for a set of supplier catalog products.
 *
 * Uses `fetchMinPricesBatch` for the primary fetch (one `.in()` query). Any
 * product ID not represented in that result — which can happen on pages that
 * include a product with thousands of variants (the PostgREST per-request row
 * cap is 1000) — gets a per-product fallback via `fetchMinPrice`, so the grid
 * still shows a real price wherever one exists. The fallback is capped at 12
 * missing IDs to bound latency on the rare mega-variant page.
 */
export async function fetchMarketplacePricing(
  productIds: string[],
): Promise<Map<string, ProductPricing>> {
  if (!productIds.length) return new Map();

  const batch = await fetchMinPricesBatch(productIds);

  const missing = productIds.filter((id) => !batch.has(id)).slice(0, 12);
  if (missing.length) {
    const fallbacks = await Promise.all(
      missing.map(async (id) => {
        const minPrice = await fetchMinPrice(id);
        return [id, minPrice] as const;
      }),
    );
    for (const [id, minPrice] of fallbacks) {
      if (!batch.has(id)) {
        batch.set(id, { minPrice, variantCount: 0, sizes: [], colors: [] });
      }
    }
  }

  return batch;
}

export type Category = {
  id: string;
  tenant_id: string | null;
  parent_id: string | null;
  level: number;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type Product = {
  id: string;
  tenant_id: string | null;
  category_id: string | null;
  brand_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  created_at: string;
};

export type Brand = {
  id: string;
  name: string;
  slug: string;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  price: number | null;
  compare_at_price: number | null;
  is_active: boolean | null;
  created_at: string | null;
};

/**
 * A product with the lowest active variant price attached, ready for
 * marketplace display. `minPrice` is null when the product has no priced
 * variants yet (which is the case for several UnSaid placeholder rows).
 */
export type ProductWithPricing = Product & {
  minPrice: number | null;
  compareAtPrice: number | null;
  variantCount: number;
};

export type Collection = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

// ── Query helpers ────────────────────────────────────────────

/**
 * Fetch a category by its slug path (e.g. ["apparel", "t-shirts-polo-shirts"]).
 * Walks the hierarchy from top-level down, matching slug at each level.
 */
export async function fetchCategoryByPath(
  slugs: string[]
): Promise<{ category: Category; ancestors: Category[] } | null> {
  const supabase = createServerClient();
  let parentId: string | null = null;
  const ancestors: Category[] = [];

  for (const slug of slugs) {
    const query = supabase
      .from("categories")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .order("sort_order");

    if (parentId !== null) {
      query.eq("parent_id", parentId);
    } else {
      query.is("parent_id", null);
    }

    const { data, error } = await query.limit(1).single();
    if (error || !data) return null;
    ancestors.push(data);
    parentId = data.id;
  }

  const category = ancestors[ancestors.length - 1];
  return { category, ancestors: ancestors.slice(0, -1) };
}

/**
 * Fetch direct children of a category.
 */
export async function fetchChildren(parentId: string | null): Promise<Category[]> {
  const supabase = createServerClient();
  const query = parentId
    ? supabase.from("categories").select("*").eq("parent_id", parentId).eq("is_active", true).order("sort_order")
    : supabase.from("categories").select("*").is("parent_id", null).eq("is_active", true).order("sort_order");
  const { data, error } = await query;
  if (error || !data) return [];
  return data;
}

/**
 * Fetch products for a category recursively (includes all descendant categories).
 */
export async function fetchProductsByCategoryRecursive(
  categoryId: string,
  limit = 24,
  offset = 0,
  opts: {
    search?: string;
    supplier?: string;
    sort?: CatalogSort;
    restrictIds?: string[];
    excludeIds?: string[];
  } = {}
): Promise<{ products: SupplierProduct[]; total: number }> {
  const supabase = createServerClient();
  const allIds = new Set<string>([categoryId]);
  async function collectChildren(pid: string) {
    const { data } = await supabase.from("categories").select("id").eq("parent_id", pid).eq("is_active", true);
    if (data) for (const c of data) { if (!allIds.has(c.id)) { allIds.add(c.id); await collectChildren(c.id); } }
  }
  await collectChildren(categoryId);
  const idsArray = Array.from(allIds);
  let q = supabase
    .from("supplier_catalog_products")
    .select("*", { count: "exact" })
    .eq("is_hidden", false)
    .in("category_id", idsArray);
  if (opts.restrictIds && opts.restrictIds.length) q = q.in("id", opts.restrictIds);
  if (opts.excludeIds && opts.excludeIds.length) q = q.not("id", "in", `(${opts.excludeIds.join(",")})`);
  if (opts.search) q = q.ilike("name", `%${opts.search}%`);
  if (opts.supplier) q = q.eq("supplier_id", opts.supplier);
  for (const [col, asc] of sortColumns(opts.sort)) {
    q = q.order(col, asc);
  }

  const { data, count, error } = await q
    .range(offset, offset + limit - 1);
  if (error || !data) return { products: [], total: 0 };
  return { products: data as SupplierProduct[], total: count ?? 0 };
}

/**
 * Fetch brands for a category (from products in that category).
 */
export async function fetchBrandsByCategory(categoryId: string): Promise<{ brand_name: string; count: number }[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("supplier_catalog_products")
    .select("brand_name")
    .eq("is_hidden", false)
    .eq("category_id", categoryId)
    .not("brand_name", "is", null);
  if (error || !data) return [];
  const brandMap = new Map<string, number>();
  for (const p of data) {
    if (p.brand_name) { brandMap.set(p.brand_name, (brandMap.get(p.brand_name) || 0) + 1); }
  }
  return Array.from(brandMap.entries()).map(([brand_name, count]) => ({ brand_name, count })).sort((a, b) => b.count - a.count);
}

/**
 * Fetch products for a category (direct match on category_id).
 */
export async function fetchProductsByCategory(categoryId: string): Promise<Product[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("category_id", categoryId)
    .eq("status", "published")
    .order("name");
  if (error || !data) return [];
  return data;
}

/**
 * Fetch products for a category with the lowest active variant price attached.
 * Used by the marketplace pages so the grid shows a real price when one exists.
 */
export async function fetchProductsByCategoryWithPricing(
  categoryId: string,
): Promise<ProductWithPricing[]> {
  const supabase = createServerClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .eq("category_id", categoryId)
    .eq("status", "published")
    .order("name");
  if (error || !products || products.length === 0) return [];

  const productIds = products.map((p) => p.id);
  const { data: variants, error: vErr } = await supabase
    .from("product_variants")
    .select("product_id,price,compare_at_price,is_active")
    .in("product_id", productIds)
    .eq("is_active", true);
  if (vErr || !variants) {
    return products.map((p) => ({
      ...p,
      minPrice: null,
      compareAtPrice: null,
      variantCount: 0,
    }));
  }

  // Group variants by product_id, computing min price + first compare_at_price.
  const byProduct = new Map<
    string,
    { minPrice: number | null; compareAtPrice: number | null; count: number }
  >();
  for (const v of variants) {
    const entry = byProduct.get(v.product_id) ?? {
      minPrice: null,
      compareAtPrice: null,
      count: 0,
    };
    if (v.price != null) {
      entry.minPrice =
        entry.minPrice == null ? v.price : Math.min(entry.minPrice, v.price);
    }
    if (v.compare_at_price != null && entry.compareAtPrice == null) {
      entry.compareAtPrice = v.compare_at_price;
    }
    entry.count += 1;
    byProduct.set(v.product_id, entry);
  }

  return products.map((p) => {
    const e = byProduct.get(p.id);
    return {
      ...p,
      minPrice: e?.minPrice ?? null,
      compareAtPrice: e?.compareAtPrice ?? null,
      variantCount: e?.count ?? 0,
    };
  });
}

/**
 * Fetch a small set of featured products across all categories (used on the
 * `/shop` landing). Returns up to `limit` products (default 8) with the
 * lowest variant price attached.
 */
export async function fetchFeaturedProducts(limit = 8): Promise<ProductWithPricing[]> {
  const supabase = createServerClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !products || products.length === 0) return [];

  const productIds = products.map((p) => p.id);
  const { data: variants } = await supabase
    .from("product_variants")
    .select("product_id,price,compare_at_price,is_active")
    .in("product_id", productIds)
    .eq("is_active", true);

  const byProduct = new Map<
    string,
    { minPrice: number | null; compareAtPrice: number | null; count: number }
  >();
  for (const v of variants ?? []) {
    const entry = byProduct.get(v.product_id) ?? {
      minPrice: null,
      compareAtPrice: null,
      count: 0,
    };
    if (v.price != null) {
      entry.minPrice =
        entry.minPrice == null ? v.price : Math.min(entry.minPrice, v.price);
    }
    if (v.compare_at_price != null && entry.compareAtPrice == null) {
      entry.compareAtPrice = v.compare_at_price;
    }
    entry.count += 1;
    byProduct.set(v.product_id, entry);
  }

  return products.map((p) => {
    const e = byProduct.get(p.id);
    return {
      ...p,
      minPrice: e?.minPrice ?? null,
      compareAtPrice: e?.compareAtPrice ?? null,
      variantCount: e?.count ?? 0,
    };
  });
}

/**
 * Count products directly in each of the given category IDs (used to show a
 * "N products" badge on a category card without an extra round-trip per card).
 */
export async function fetchProductCountsByCategory(
  categoryIds: string[],
): Promise<Map<string, number>> {
  const supabase = createServerClient();
  const result = new Map<string, number>();
  if (categoryIds.length === 0) return result;
  const { data, error } = await supabase
    .from("products")
    .select("category_id")
    .eq("status", "published")
    .in("category_id", categoryIds);
  if (error || !data) return result;
  for (const row of data) {
    if (!row.category_id) continue;
    result.set(row.category_id, (result.get(row.category_id) ?? 0) + 1);
  }
  return result;
}

/**
 * Fetch all top-level categories (parent_id is null).
 */
export async function fetchTopCategories(): Promise<Category[]> {
  return fetchChildren(null);
}

/**
 * Fetch all category slugs for static generation.
 * Returns an array of slug arrays (paths).
 */
export async function fetchAllCategoryPaths(): Promise<string[][]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id,slug,parent_id,level")
    .eq("is_active", true)
    .order("level")
    .order("sort_order");

  if (error || !data) return [];

  // Build a map: id → { slug, parent_id }
  const map = new Map<string, { slug: string; parent_id: string | null }>();
  for (const c of data) {
    map.set(c.id, { slug: c.slug, parent_id: c.parent_id });
  }

  // For each category, walk up the parent chain to build the full path
  const paths: string[][] = [];
  for (const c of data) {
    const path: string[] = [c.slug];
    let parentId = c.parent_id;
    while (parentId) {
      const parent = map.get(parentId);
      if (!parent) break;
      path.unshift(parent.slug);
      parentId = parent.parent_id;
    }
    paths.push(path);
  }

  return paths;
}

/** Sort keys the admin catalog/products grids accept (query ?sort=&dir=). */
export type CatalogSort = "name" | "name-desc" | "variants" | "variants-asc" | "newest";

// ── Category-lite tree helpers ───────────────────────────────

export interface CategoryLiteNode {
  id: string;
  name: string;
  slug: string | null;
  parent_id: string | null;
  children: CategoryLiteNode[];
}

/** Order columns for a CatalogSort key (default: images first, then name). */
function sortColumns(sort?: CatalogSort): Array<[string, { ascending: boolean; nullsFirst?: boolean }]> {
  switch (sort) {
    case "name":
      return [["name", { ascending: true }]];
    case "name-desc":
      return [["name", { ascending: false }]];
    case "variants":
      return [["variant_count", { ascending: false, nullsFirst: false }]];
    case "variants-asc":
      return [["variant_count", { ascending: true, nullsFirst: false }]];
    case "newest":
      return [["created_at", { ascending: false }]];
    default:
      return [
        ["image_url", { ascending: false, nullsFirst: false }],
        ["name", { ascending: true }],
      ];
  }
}

/** The active categories as a client-side tree (id/name/slug/children). */
export async function fetchCategoryLite(): Promise<CategoryLiteNode[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id")
    .eq("is_active", true)
    .order("name");
  if (error || !data) return [];
  const nodes = new Map<string, CategoryLiteNode>();
  for (const r of data as Array<{ id: string; name: string; slug: string | null; parent_id: string | null }>) {
    nodes.set(r.id, { id: r.id, name: r.name, slug: r.slug ?? null, parent_id: r.parent_id ?? null, children: [] });
  }
  const roots: CategoryLiteNode[] = [];
  for (const r of data as Array<{ id: string; parent_id: string | null }>) {
    const node = nodes.get(r.id)!;
    const parent = r.parent_id ? nodes.get(r.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Chain of tree nodes from the root level down to `id` (empty when absent). */
export function categoryChain(tree: CategoryLiteNode[], id: string): CategoryLiteNode[] {
  const walk = (nodes: CategoryLiteNode[], chain: CategoryLiteNode[]): CategoryLiteNode[] | null => {
    for (const n of nodes) {
      if (n.id === id) return [...chain, n];
      const found = walk(n.children, [...chain, n]);
      if (found) return found;
    }
    return null;
  };
  return walk(tree, []) ?? [];
}

/** `id` plus every descendant category id in the tree (includes `id` itself). */
export function descendantCategoryIds(tree: CategoryLiteNode[], id: string | null | undefined): string[] {
  if (!id) return [];
  const out: string[] = [];
  const walk = (nodes: CategoryLiteNode[], collecting: boolean) => {
    for (const n of nodes) {
      const hit = collecting || n.id === id;
      if (hit) out.push(n.id);
      walk(n.children, hit);
    }
  };
  walk(tree, false);
  return out;
}

/**
 * static-catalog.ts — product fetching for STATIC taxonomy paths.
 *
 * The storefront renders from the static taxonomy (src/lib/taxonomy.ts) —
 * the DB `categories` table is never the render source. But products live
 * in the DB against the OLD (pre-reparenting) category tree, so a static
 * path is mapped to DB categories for product lookup only:
 *
 *   1. Same-name-in-department, when MORE THAN ONE DB category in the
 *      department shares the node's name: the re-parented merged nodes
 *      (e.g. the four "Hoodies" branches folded into one) match every
 *      such DB category; their recursive product sets are unioned
 *      (disjoint — a product has one category_id — so totals add
 *      exactly). For merged nodes this check runs FIRST: a merged node
 *      can also have an exact name-path match (the DB kept one branch
 *      at the new path), and that single branch is only part of the
 *      merged set.
 *   2. Exact NAME-path walk (static names → DB parent chain) when the
 *      name is unique in the department. This covers most nodes,
 *      including the restored breakouts /shop/apparel/men and
 *      /shop/apparel/apparel-for-babies (their DB subtrees still exist
 *      even though the re-parented static tree moved their children up).
 *   3. Grouping nodes with no DB counterpart ("Collections & Occasions",
 *      "Hoodies & Sweatshirts", …) union their static children's sets.
 *   4. A node with no DB match anywhere renders an honest empty page
 *      (e.g. "Mugs & Drinkware", 0 products in the spec).
 *
 * Taxonomy completion (2026-10-30) changed two things:
 *
 *   a. Restored breakout subtrees — Apparel → Kids / Men / Women /
 *      Apparel for Babies, whose children were dissolved by the
 *      re-parenting and are now restored in the static tree — resolve
 *      EXACT-PATH-FIRST (see resolveDbCategoryIds): their static
 *      subtree mirrors the DB subtree 1:1, so the exact branch is the
 *      node's complete set. Without this, /shop/apparel/men/hoodies
 *      would union all four "Hoodies" branches (3,659 products)
 *      instead of serving the Men's 605. The union remains available
 *      there only as a last-resort fallback. Every pre-existing node
 *      keeps the legacy strategy order above, unchanged.
 *   b. Secondary links: products carry one primary category_id, but
 *      derived children (Babies product types, Business & commercial
 *      families, Framed prints by frame material) attach through
 *      public.product_taxonomy_links (migration 20261030080000,
 *      populated by scripts/classify-taxonomy-links.cjs) — UnSaid Memories's
 *      one-primary + facet-attach model. A linked product keeps its
 *      primary page AND appears on the derived node's page; node
 *      membership = primary category sets + links for the node's
 *      static slug path.
 */

import { unstable_cache } from "next/cache";
import {
  createServerClient,
  fetchProductsByCategoryRecursive,
  fetchMinPricesBatch,
  type Category,
  type SupplierProduct,
} from "./supabase";
import {
  taxonomy,
  findCategoryByPath,
  type TaxonomyNode,
} from "./taxonomy";
import type { CatalogProduct } from "@/components/catalog-card";
import { fetchProductFacets } from "./product-facets";

const REVALIDATE_SECONDS = 300;
const TENANT_SAFE_LIMIT = 1000;

export type EnrichedProduct = CatalogProduct;

// ── DB category snapshot (for name matching) ────────────────

async function loadDbCategories(): Promise<Category[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("is_active", true);
  if (error || !data) return [];
  return data as Category[];
}

const getDbCategories = unstable_cache(loadDbCategories, ["static-catalog-db-categories"], {
  revalidate: REVALIDATE_SECONDS,
});

function dbChildrenMap(cats: Category[]): Map<string | null, Category[]> {
  const map = new Map<string | null, Category[]>();
  for (const c of cats) {
    const key = c.parent_id ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return map;
}

function dbRootName(cat: Category, byId: Map<string, Category>): string {
  let cur: Category = cat;
  const seen = new Set<string>();
  while (cur.parent_id && byId.has(cur.parent_id) && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.parent_id)!;
  }
  return cur.name;
}

/** Strategy 1: walk the DB tree by NAME path. */
function walkDbByNames(
  names: string[],
  children: Map<string | null, Category[]>,
): Category | null {
  let parent: string | null = null;
  let found: Category | null = null;
  for (const name of names) {
    const cand = (children.get(parent) ?? []).filter((c) => c.name === name);
    const first = cand[0];
    if (!first) return null;
    found = first;
    parent = first.id;
  }
  return found;
}

/** Static children union (strategy 3), shared by both precedence orders. */
function unionChildrenIds(
  node: TaxonomyNode,
  names: string[],
  cats: Category[],
  children: Map<string | null, Category[]>,
  byId: Map<string, Category>,
): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(
      ...resolveDbCategoryIds(child, [...names, child.name], cats, children, byId),
    );
  }
  return [...new Set(ids)];
}

/**
 * Apparel breakout roots restored by the taxonomy completion build.
 * Inside these subtrees the static tree mirrors the DB category tree
 * 1:1 (the children dissolved by the re-parenting are back), so the
 * exact name-path is authoritative there.
 */
const BREAKOUT_ROOTS = new Set(["Kids", "Men", "Women", "Apparel for Babies"]);

/**
 * Resolve a static node to the DB category ids whose recursive product
 * sets make up the node's PRIMARY products (secondary links are merged
 * separately in the fetch below).
 */
function resolveDbCategoryIds(
  node: TaxonomyNode,
  names: string[],
  cats: Category[],
  children: Map<string | null, Category[]>,
  byId: Map<string, Category>,
): string[] {
  const dept = names[0];
  const sameName = cats.filter(
    (c) => c.name === node.name && dbRootName(c, byId) === dept,
  );

  // Restored breakout subtrees: exact name-path FIRST — the exact DB
  // branch is the node's complete set (e.g. Apparel/Men/Hoodies = the
  // Men's 605, not the 3,659-product all-branches "Hoodies" union).
  // The same-name union survives only as the last-resort fallback it
  // was meant to be.
  const inBreakout =
    dept === "Apparel" && names.length > 1 && BREAKOUT_ROOTS.has(names[1]);
  if (inBreakout) {
    const exact = walkDbByNames(names, children);
    if (exact) return [exact.id];
    if (sameName.length === 1) return [sameName[0].id];
    if (node.children.length)
      return unionChildrenIds(node, names, cats, children, byId);
    if (sameName.length > 1) return sameName.map((c) => c.id);
    return [];
  }

  // Strategy 1 (all pre-existing nodes, unchanged): merged re-parented
  // node — several DB categories in the same department share this
  // name; union them all, even when one of them also matches the exact
  // name path.
  if (sameName.length > 1) return sameName.map((c) => c.id);

  // Strategy 2: exact name-path walk (unique names only reach here).
  const exact = walkDbByNames(names, children);
  if (exact) return [exact.id];
  if (sameName.length === 1) return [sameName[0].id];

  // Strategy 3: grouping node — union the static children's sets.
  if (node.children.length)
    return unionChildrenIds(node, names, cats, children, byId);
  return [];
}

// ── Enrichment (same shape as catalog-cache / /api/products) ─

async function enrichProducts(rawProducts: SupplierProduct[]): Promise<EnrichedProduct[]> {
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
 * Secondary-link membership for a static slug path
 * (public.product_taxonomy_links via the taxonomy_link_* RPCs from
 * migration 20261030080000). Defensive: any RPC failure reads as "no
 * links", so a database without the migration behaves exactly like the
 * pre-link resolver.
 */
async function fetchLinkedProducts(
  pathKey: string,
  window: number,
): Promise<{ products: SupplierProduct[]; total: number }> {
  try {
    const supabase = createServerClient();
    const [countRes, rowsRes] = await Promise.all([
      supabase.rpc("taxonomy_link_count", { p_path: pathKey }),
      supabase.rpc("taxonomy_link_products", {
        p_path: pathKey,
        p_limit: window,
        p_offset: 0,
      }),
    ]);
    if (countRes.error || rowsRes.error) return { products: [], total: 0 };
    return {
      products: (rowsRes.data as SupplierProduct[] | null) ?? [],
      total: Number(countRes.data) || 0,
    };
  } catch {
    return { products: [], total: 0 };
  }
}

// ── Main fetch ──────────────────────────────────────────────

async function fetchStaticPathProductsUncached(
  path: string,
  limit: number,
  offset: number,
): Promise<{ products: EnrichedProduct[]; total: number }> {
  const slugs = path.split("/").filter(Boolean);
  if (!slugs.length) return { products: [], total: 0 };
  const found = findCategoryByPath(slugs);
  if (!found) return { products: [], total: 0 };

  const names = [...found.ancestors.map((a) => a.name), found.node.name];
  const cats = await getDbCategories();
  const children = dbChildrenMap(cats);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const ids = resolveDbCategoryIds(found.node, names, cats, children, byId);

  const window = Math.min(TENANT_SAFE_LIMIT, offset + limit);
  const linked = await fetchLinkedProducts(slugs.join("/"), window);

  // Fast path (pre-completion behavior, untouched): exactly one DB
  // category and no secondary links — the DB pages the result itself.
  if (ids.length === 1 && linked.total === 0) {
    const r = await fetchProductsByCategoryRecursive(ids[0], limit, offset);
    return { products: await enrichProducts(r.products), total: r.total };
  }
  if (!ids.length && linked.total === 0) return { products: [], total: 0 };

  // Window merge: the primary subtrees' sets (0..n of them) plus the
  // node's secondary links, merged in created_at order (the recursive
  // fetch's own order), deduped by product id. Primary sets are
  // disjoint (one category_id per product) and links never duplicate a
  // product within a path, so totals add exactly.
  const parts = await Promise.all(
    ids.map((id) => fetchProductsByCategoryRecursive(id, window, 0)),
  );
  const total =
    parts.reduce((sum, p) => sum + p.total, 0) + linked.total;
  const seen = new Set<string>();
  const merged: SupplierProduct[] = [];
  for (const p of parts) {
    for (const prod of p.products) {
      if (seen.has(prod.id)) continue;
      seen.add(prod.id);
      merged.push(prod);
    }
  }
  for (const prod of linked.products) {
    if (seen.has(prod.id)) continue;
    seen.add(prod.id);
    merged.push(prod);
  }
  merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return {
    products: await enrichProducts(merged.slice(offset, offset + limit)),
    total,
  };
}

export const fetchProductsForStaticPath = unstable_cache(
  fetchStaticPathProductsUncached,
  ["static-catalog-products"],
  { revalidate: REVALIDATE_SECONDS },
);

/** True when a slug path exists in the static taxonomy. */
export function isStaticPath(slugs: string[]): boolean {
  if (!slugs.length) return true;
  return findCategoryByPath(slugs) !== null;
}

export { taxonomy };

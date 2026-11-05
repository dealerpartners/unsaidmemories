/**
 * The admin joined catalog — ONE product universe for /admin/catalog and
 * /admin/products: the storefront feed itself.
 *
 * The read is the exact join the shop and the studio picker already use
 * (lib/supabase.ts): supplier_catalog_products under the categories tree
 * (recursive over the subtree, tokenized search), min price from the
 * variants batch helper, and the owner's listing overrides merged in
 * (lib/catalog-overrides.ts). There is no second "admin" product list —
 * every item sitting on the front end is here, under the same tree.
 *
 * Design status rides on the real publish linkage, found in
 * lib/fabric/publish.ts: designs.supplier_catalog_product_id is the
 * catalog blank a design was made on, designs.published_product_id the
 * products row it published as, and publishing also writes a MIRROR row
 * into supplier_catalog_products whose id IS the products id.
 */
import {
  createServerClient,
  fetchMinPricesBatch,
  fetchProductsByCategoryRecursive,
  fetchSupplierProducts,
  type CatalogSort,
} from "@/lib/supabase";
import { fetchCategoryOverrides } from "@/lib/catalog-overrides";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";

export type DesignStatus = "published" | "designed" | "none";

export type PublishedProductRef = {
  id: string;
  slug: string | null;
  name: string;
  status: string;
};

export type JoinedCatalogRow = {
  id: string;
  name: string;
  originalName: string | null;
  edited: boolean;
  description: string | null;
  brand_name: string | null;
  supplier_id: string;
  supplier_name: string | null;
  category_id: string | null;
  category_path: string[];
  image_url: string | null;
  is_hidden: boolean;
  variant_count: number;
  /** Supplier from-price (min variant price_snapshot). */
  min_price: number | null;
  /** Her set price for the listing, when she has set one. */
  listing_price: number | null;
  design_status: DesignStatus;
  published_product: PublishedProductRef | null;
};

export type DesignedIndex = {
  /** Catalog ids that have at least one design (or are a published mirror). */
  designed: Set<string>;
  /** Catalog id → the sellable product it published as. */
  publishedByBlank: Map<string, PublishedProductRef>;
};

/** The design/publish linkage over the whole catalog (small sets: the
 *  designs table and the products table, joined to the mirror rows). */
export async function fetchDesignedIndex(): Promise<DesignedIndex> {
  const db = createServerClient();
  const designed = new Set<string>();
  const publishedByBlank = new Map<string, PublishedProductRef>();

  const [{ data: designs }, { data: products }] = await Promise.all([
    db
      .from("designs")
      .select("supplier_catalog_product_id, status, published_product_id")
      .not("supplier_catalog_product_id", "is", null),
    db.from("products").select("id, slug, name, status"),
  ]);
  const productById = new Map((products ?? []).map((p: any) => [p.id, p]));

  for (const d of designs ?? []) {
    const blankId = (d as any).supplier_catalog_product_id as string;
    designed.add(blankId);
    const pubId = (d as any).published_product_id as string | null;
    if ((d as any).status === "published" && pubId && productById.has(pubId)) {
      const p = productById.get(pubId);
      publishedByBlank.set(blankId, { id: p.id, slug: p.slug, name: p.name, status: p.status });
    }
  }

  // Mirror rows: a published product IS a catalog row (id = products id).
  if (productById.size) {
    const { data: mirrors } = await db
      .from("supplier_catalog_products")
      .select("id")
      .in("id", [...productById.keys()]);
    for (const m of mirrors ?? []) {
      designed.add(m.id);
      const p = productById.get(m.id);
      if (p.status === "published") {
        publishedByBlank.set(m.id, { id: p.id, slug: p.slug, name: p.name, status: p.status });
      }
    }
  }

  return { designed, publishedByBlank };
}

export type JoinedCatalogQuery = {
  categoryId?: string;
  search?: string;
  supplierId?: string;
  design?: "designed" | "not-designed";
  sort?: CatalogSort;
  page?: number;
  perPage?: number;
};

/** One page of the joined catalog, with prices + design status attached. */
export async function fetchJoinedCatalogPage(
  opts: JoinedCatalogQuery,
): Promise<{ rows: JoinedCatalogRow[]; total: number; page: number; perPage: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(100, Math.max(1, opts.perPage ?? 48));
  const offset = (page - 1) * perPage;

  const index = await fetchDesignedIndex();
  const restrictIds = opts.design === "designed" ? [...index.designed] : undefined;
  const excludeIds = opts.design === "not-designed" ? [...index.designed] : undefined;

  const { products, total } = opts.categoryId
    ? await fetchProductsByCategoryRecursive(opts.categoryId, perPage, offset, {
        search: opts.search,
        supplier: opts.supplierId,
        sort: opts.sort,
        restrictIds,
        excludeIds,
      })
    : await fetchSupplierProducts({
        search: opts.search,
        supplier: opts.supplierId,
        sort: opts.sort,
        restrictIds,
        excludeIds,
        limit: perPage,
        offset,
      });

  const db = createServerClient();
  const [{ data: suppliers }, catNodes] = await Promise.all([
    db.from("suppliers").select("id, name"),
    fetchAdminCategories(),
  ]);
  const supplierById = new Map((suppliers ?? []).map((s: any) => [s.id, s.name]));
  const catById = new Map(catNodes.map((n) => [n.id, n]));
  const pathFor = (cid: string | null): string[] => {
    const chain: string[] = [];
    let cur = cid ? catById.get(cid) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.unshift(cur.name);
      cur = cur.parent_id ? catById.get(cur.parent_id) : undefined;
    }
    return chain;
  };

  const prices = await fetchMinPricesBatch(products.map((p) => p.id));

  const rows: JoinedCatalogRow[] = products.map((p) => {
    const pricing = prices.get(p.id);
    const published = index.publishedByBlank.get(p.id) ?? null;
    return {
      id: p.id,
      name: p.name,
      originalName: p.original_name ?? null,
      edited: p.edited ?? false,
      description: p.description ?? null,
      brand_name: p.brand_name,
      supplier_id: p.supplier_id,
      supplier_name: supplierById.get(p.supplier_id) ?? null,
      category_id: p.category_id,
      category_path: pathFor(p.category_id),
      image_url: p.image_url,
      is_hidden: p.is_hidden ?? false,
      variant_count: pricing?.variantCount ?? p.variant_count ?? 0,
      min_price: pricing?.minPrice ?? null,
      listing_price: p.listing_price ?? null,
      design_status: published ? "published" : index.designed.has(p.id) ? "designed" : "none",
      published_product: published,
    };
  });

  return { rows, total, page, perPage };
}

export type CatalogStock = { onHand: number; reserved: number };

/**
 * Tracked stock for a page of catalog rows, through the only bridge that
 * exists between the catalog and the stock ledger: a catalog row IS a
 * products row when it is a published mirror (same id), and a designed
 * row points at the product it published as; stock itself is held per
 * product variant (erp_inventory_balances.sku_id → product_variants.id →
 * products.id). Rows with no published product, or products with no
 * balance rows, are ABSENT from the returned map — the caller renders an
 * honest "—", never an invented number.
 */
export async function fetchStockByCatalogRows(
  rows: { id: string; published_product: { id: string } | null }[],
): Promise<Map<string, CatalogStock>> {
  const out = new Map<string, CatalogStock>();
  const productToRows = new Map<string, string[]>();
  const add = (productId: string, rowId: string) => {
    const list = productToRows.get(productId) ?? [];
    list.push(rowId);
    productToRows.set(productId, list);
  };
  for (const r of rows) {
    add(r.id, r.id); // published-mirror rows: the catalog id IS the product id
    if (r.published_product && r.published_product.id !== r.id) {
      add(r.published_product.id, r.id);
    }
  }
  const productIds = [...productToRows.keys()];
  if (!productIds.length) return out;

  const db = createServerClient();
  const { data: variants } = await db
    .from("product_variants")
    .select("id, product_id")
    .in("product_id", productIds);
  const variantToProduct = new Map(
    (variants ?? []).map((v: any) => [v.id as string, v.product_id as string]),
  );
  const variantIds = [...variantToProduct.keys()];
  if (!variantIds.length) return out;

  const { data: balances } = await db
    .from("erp_inventory_balances")
    .select("sku_id, on_hand, reserved")
    .eq("tenant_id", PLATFORM_TENANT_ID)
    .in("sku_id", variantIds);

  const perProduct = new Map<string, CatalogStock>();
  for (const b of balances ?? []) {
    const pid = variantToProduct.get((b as any).sku_id);
    if (!pid) continue;
    const cur = perProduct.get(pid) ?? { onHand: 0, reserved: 0 };
    cur.onHand += Number((b as any).on_hand || 0);
    cur.reserved += Number((b as any).reserved || 0);
    perProduct.set(pid, cur);
  }
  for (const [pid, stock] of perProduct) {
    for (const rowId of productToRows.get(pid) ?? []) out.set(rowId, stock);
  }
  return out;
}

export type AdminCategoryNode = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  level: number;
  /** Live count of front-end items in this category's whole subtree. */
  subtree_count: number;
  children: AdminCategoryNode[];
};

type CategoryRow = Omit<AdminCategoryNode, "subtree_count" | "children">;

/** Every category row (active AND inactive), in tree order. */
export async function fetchAdminCategories(): Promise<CategoryRow[]> {
  const db = createServerClient();
  const { data: cats } = await db
    .from("categories")
    .select("id, parent_id, name, slug, description, sort_order, is_active, level")
    .order("sort_order");
  return (cats ?? []) as CategoryRow[];
}

/**
 * The full category tree for admin — INCLUDING inactive categories (she
 * manages them here; the storefront tree hides them) — with live subtree
 * counts over the front-end feed. Counts use each product's EFFECTIVE
 * shelf (her override category when she moved it, else the mirror's).
 */
export async function fetchAdminCategoryTree(): Promise<{ nodes: AdminCategoryNode[]; flat: AdminCategoryNode[] }> {
  const db = createServerClient();
  const nodes = await fetchAdminCategories();

  // Effective shelf per front-end item: one paged pull of (id, category_id)
  // over the visible feed + her category moves applied on top.
  const overrides = await fetchCategoryOverrides();
  const movedTo = new Map(overrides.map((o) => [o.supplier_catalog_product_id, o.category_id]));
  const direct = new Map<string, number>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await db
      .from("supplier_catalog_products")
      .select("id, category_id")
      .eq("is_hidden", false)
      .order("id")
      .range(from, from + PAGE - 1);
    const batch = data ?? [];
    for (const r of batch as any[]) {
      const cid = movedTo.get(r.id) ?? r.category_id;
      if (cid) direct.set(cid, (direct.get(cid) ?? 0) + 1);
    }
    if (batch.length < PAGE) break;
  }

  const byParent = new Map<string | null, typeof nodes>();
  for (const n of nodes) {
    const list = byParent.get(n.parent_id) ?? [];
    list.push(n);
    byParent.set(n.parent_id, list);
  }
  const build = (parent: string | null): AdminCategoryNode[] =>
    (byParent.get(parent) ?? []).map((n) => {
      const children = build(n.id);
      const subtree = (direct.get(n.id) ?? 0) + children.reduce((s, c) => s + c.subtree_count, 0);
      return { ...n, children, subtree_count: subtree };
    });
  const tree = build(null);
  return { nodes: tree, flat: nodes.map((n) => ({ ...n, children: [], subtree_count: direct.get(n.id) ?? 0 })) };
}

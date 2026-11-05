import type { Metadata } from "next";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import {
  fetchAdminCategoryTree,
  fetchJoinedCatalogPage,
  type AdminCategoryNode,
} from "@/lib/admin/joined-catalog";
import { CatalogStatusToggle, CatalogCollectionAssign, CreateCategoryForm } from "@/components/admin/erp-actions";
import { CategoryEditor, ListingEditor, type CategoryOption } from "@/components/admin/listing-editor";
import type { CatalogSort } from "@/lib/supabase";

export const metadata: Metadata = { title: "Product Catalog — Admin" };
export const dynamic = "force-dynamic";

// THE catalog admin: one joined catalog — the storefront feed itself
// (supplier_catalog_products under the same categories tree the shop
// groups by, the studio picker's own contract). There is no second
// product list: every item on the front end is here, and her edits
// (catalog_listing_overrides) are the values shown.

type Params = {
  categoryId?: string;
  source?: string; // legacy: old storefront/supplier links land here, on the one joined view
  supplierId?: string;
  q?: string;
  design?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

function toCatalogSort(sort?: string, dir?: string): CatalogSort | undefined {
  if (sort === "name") return dir === "desc" ? "name-desc" : "name";
  if (sort === "variants") return dir === "asc" ? "variants-asc" : "variants";
  if (sort === "newest") return "newest";
  return undefined;
}

function flattenOptions(nodes: AdminCategoryNode[], prefix = ""): CategoryOption[] {
  const out: CategoryOption[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, label: prefix + n.name });
    out.push(...flattenOptions(n.children, prefix + n.name + " › "));
  }
  return out;
}

export default async function CatalogAdminPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10));
  // Legacy links: ?source=supplier&supplierId=X lands on the joined view
  // with that supplier as a filter; ?source=storefront is just the view.
  const supplierId = params.supplierId || undefined;
  const design =
    params.design === "designed" || params.design === "not-designed" ? params.design : undefined;
  const sort = toCatalogSort(params.sort, params.dir);

  const [tree, result] = await Promise.all([
    fetchAdminCategoryTree(),
    fetchJoinedCatalogPage({
      categoryId: params.categoryId,
      search: params.q,
      supplierId,
      design,
      sort,
      page,
    }),
  ]);
  const sb = createServerClient();
  const { data: suppliers } = await sb.from("suppliers").select("id, slug, name").order("name");
  const categoryOptions = flattenOptions(tree.nodes);

  // Collections + current memberships for this page's rows
  // (product_collections shares the catalog id space).
  const { data: cols } = await sb.from("collections").select("id, name").order("name");
  const collections = (cols ?? []) as { id: string; name: string }[];
  const memberships = new Map<string, string[]>();
  const rowIds = result.rows.map((r) => r.id);
  if (rowIds.length) {
    const { data: links } = await sb
      .from("product_collections")
      .select("product_id, collection_id")
      .in("product_id", rowIds);
    for (const l of links ?? []) {
      const arr = memberships.get(l.product_id as string) || [];
      arr.push(l.collection_id as string);
      memberships.set(l.product_id as string, arr);
    }
  }

  const totalPages = Math.ceil(result.total / result.perPage);
  const activeCategory = params.categoryId
    ? tree.flat.find((n) => n.id === params.categoryId)
    : undefined;

  const href = (over: Partial<Omit<Params, "page">> & { page?: number }) => {
    const merged: Record<string, string> = {};
    const put = (k: string, v?: string | number) => {
      if (v !== undefined && v !== "" && v !== null) merged[k] = String(v);
    };
    put("categoryId", over.categoryId !== undefined ? over.categoryId : params.categoryId);
    put("supplierId", over.supplierId !== undefined ? over.supplierId : supplierId);
    put("q", over.q !== undefined ? over.q : params.q);
    put("design", over.design !== undefined ? over.design : design);
    put("sort", over.sort !== undefined ? over.sort : params.sort);
    put("dir", over.dir !== undefined ? over.dir : params.dir);
    put("page", over.page !== undefined ? over.page : undefined);
    const qs = new URLSearchParams(merged).toString();
    return qs ? `/admin/catalog?${qs}` : "/admin/catalog";
  };

  const sortHeader = (label: string, key: string, tip: string) => {
    const active = params.sort === key;
    const nextDir = active && params.dir !== "desc" ? "desc" : "asc";
    return (
      <Link
        href={href({ sort: key, dir: key === "newest" ? undefined : nextDir, page: 1 })}
        data-tip={tip}
        className={`text-foreground no-underline${active ? " font-bold" : ""}`}
      >
        {label}
        {active ? (key === "newest" ? " ↓" : params.dir === "desc" ? " ↓" : " ↑") : ""}
      </Link>
    );
  };

  const TreeNodes = ({ nodes, depth }: { nodes: AdminCategoryNode[]; depth: number }) => (
    <ul className="m-0 list-none pl-3.5">
      {nodes.map((n) => (
        <li key={n.id} className="text-[13px] leading-7">
          <span className="inline-flex flex-wrap items-baseline gap-1.5">
            <Link
              href={href({ categoryId: n.id, page: 1 })}
              className={params.categoryId === n.id ? "font-bold text-[#0077c5] no-underline" : "no-underline"}
              data-tip={`Show the products on “${n.name}” and every shelf under it — the same shelves shoppers see.`}
            >
              {n.name}
            </Link>
            <span className="text-xs text-muted-foreground">{n.subtree_count.toLocaleString()}</span>
            {!n.is_active && <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold">Off</span>}
          </span>
          <CategoryEditor
            category={{
              id: n.id,
              name: n.name,
              description: n.description,
              parent_id: n.parent_id,
              sort_order: n.sort_order,
              is_active: n.is_active,
            }}
            categories={categoryOptions}
          />
          {n.children.length > 0 && <TreeNodes nodes={n.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );

  // The (portals) Orders/Accounting band + table pattern (owner's one
  // design system, 2026-10-30): search and filters live in the band
  // directly above the table inside the same bordered frame; the
  // table is w-full text-sm, header row bg-muted, cells p-3, rows
  // divided by border-t with a muted hover.
  const bandInput = "w-64 rounded border border-border bg-card p-1.5 text-xs";
  const bandSelect = "rounded border border-border bg-card p-1.5 text-xs";
  const bandBtn = "rounded border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted";
  const primaryBtn = "rounded-lg border border-[#171420] bg-[#171420] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#000000]";
  const rowBtn = "rounded border border-border bg-card px-2.5 py-1.5 text-xs font-semibold hover:bg-muted";
  const chip = "inline-block rounded px-2 py-1 text-xs font-semibold";

  return (
    <div className="[font-family:Inter,system-ui,sans-serif]">
      <div className="prd-page-head">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Product Catalog</h1>
          <span className="adm-badge">{result.total.toLocaleString()} products</span>
          {activeCategory && <span className="adm-badge">Shelf: {activeCategory.name}</span>}
        </div>
      </div>

      <div className="grid grid-cols-[260px_1fr] items-start gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-1.5 text-[15px] font-bold">Categories</div>
          <ul className="m-0 list-none pl-3.5">
            <li className="text-[13px] leading-7">
              <Link href={href({ categoryId: "", page: 1 })} className={!params.categoryId ? "font-bold text-[#0077c5] no-underline" : "no-underline"} data-tip="Show every product, whatever shelf it sits on.">
                All products
              </Link>
            </li>
          </ul>
          <TreeNodes nodes={tree.nodes} depth={0} />
          <div className="mt-3.5">
            <div className="mb-1.5 text-[15px] font-bold">Create category</div>
            <CreateCategoryForm parents={categoryOptions} />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <form method="get" className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            {params.categoryId && <input type="hidden" name="categoryId" value={params.categoryId} />}
            <input
              className={bandInput}
              name="q"
              defaultValue={params.q || ""}
              placeholder="Search products…"
              data-tip="Type part of a product's name — yours or the supplier's — then press Search."
            />
            <select
              className={bandSelect}
              name="supplierId"
              defaultValue={supplierId || ""}
              data-tip="Show only one printing supplier's products — the company that makes and ships them."
              aria-label="Supplier"
            >
              <option value="">All suppliers</option>
              {(suppliers || []).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              className={bandSelect}
              name="design"
              defaultValue={design || ""}
              data-tip="Designed means you have made a design on the blank. Not designed means it is still a plain blank waiting for one."
              aria-label="Design status"
            >
              <option value="">Designed &amp; not designed</option>
              <option value="designed">Designed</option>
              <option value="not-designed">Not designed</option>
            </select>
            <select
              className={bandSelect}
              name="sort"
              defaultValue={params.sort || ""}
              data-tip="Change the order of the list."
              aria-label="Sort"
            >
              <option value="">Shop order</option>
              <option value="name">Name</option>
              <option value="variants">Most variants</option>
              <option value="newest">Newest</option>
            </select>
            <button className={bandBtn} type="submit" data-tip="Show the list with these choices.">
              Search
            </button>
            {(params.q || supplierId || design || params.sort) && (
              <Link href={href({ q: "", supplierId: "", design: "", sort: "", dir: "", page: 1 })} className="text-xs text-muted-foreground underline" data-tip="Clear the search and filters and show the whole shelf again.">
                Clear
              </Link>
            )}
          </form>

          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr>
                <th className="p-3 text-left"></th>
                <th className="p-3 text-left">{sortHeader("Product", "name", "Put the list in name order.")}</th>
                <th className="p-3 text-left">Category</th>
                <th className="p-3 text-left">Supplier</th>
                <th className="p-3 text-left">Price</th>
                <th className="p-3 text-left">{sortHeader("Variants", "variants", "Put the list in order of how many sizes and colors each product has.")}</th>
                <th className="p-3 text-left">Design status</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/50">
                  <td className="p-3">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" width={40} height={40} className="rounded object-cover" />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{p.name}</div>
                    {p.originalName && (
                      <div className="text-xs text-muted-foreground">Supplier calls it: {p.originalName}</div>
                    )}
                    {p.edited && <span className="adm-badge">Edited by you</span>}
                    {p.is_hidden && <span className="adm-badge">Hidden from shop</span>}
                    {p.description && (
                      <div className="max-w-[340px] text-xs text-muted-foreground">{p.description.slice(0, 140)}</div>
                    )}
                  </td>
                  <td className="p-3 text-[13px]">{p.category_path.join(" › ") || "—"}</td>
                  <td className="p-3 text-[13px]">{p.supplier_name || "—"}</td>
                  <td className="whitespace-nowrap p-3">
                    {p.listing_price != null ? (
                      <>
                        <div className="font-semibold">${p.listing_price.toFixed(2)}</div>
                        <div className="text-xs text-muted-foreground">
                          your price{p.min_price != null ? ` · supplier from $${p.min_price.toFixed(2)}` : ""}
                        </div>
                      </>
                    ) : p.min_price != null ? (
                      <div>from ${p.min_price.toFixed(2)}</div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">{p.variant_count} variants</td>
                  <td className="p-3">
                    {p.design_status === "published" ? (
                      <span className="adm-badge adm-badge-green">Designed · Published</span>
                    ) : p.design_status === "designed" ? (
                      <span className="adm-badge adm-badge-amber">Designed</span>
                    ) : (
                      <span className="adm-badge">Not designed</span>
                    )}
                    {p.published_product && (
                      <div className="mt-1 text-xs">
                        Sells as{" "}
                        <Link href={`/product/${p.published_product.id}`} className="underline decoration-dotted underline-offset-4" data-tip="See the product page shoppers buy from.">
                          {p.published_product.name}
                        </Link>
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Link
                        className={primaryBtn}
                        style={{ background: "#171420", borderColor: "#171420", color: "#fff" }}
                        data-tip="Open this product in the Design Studio with it already picked, ready to design on."
                        href={`/admin/studio/new-design?catalogProduct=${p.id}&name=${encodeURIComponent(p.name)}`}
                      >
                        Design now
                      </Link>
                      <ListingEditor
                        productId={p.id}
                        name={p.name}
                        supplierName={p.originalName}
                        description={p.description}
                        price={p.listing_price}
                        categoryId={p.category_id}
                        categories={categoryOptions}
                        edited={p.edited}
                      />
                      <Link className={rowBtn} href={`/product/${p.id}`} data-tip="See this product's page the way shoppers see it.">
                        View
                      </Link>
                      <CatalogStatusToggle productId={p.id} status={p.is_hidden ? "draft" : "published"} />
                      <CatalogCollectionAssign productId={p.id} collections={collections} assigned={memberships.get(p.id) ?? []} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {result.rows.length === 0 && <div className="text-center text-sm text-muted-foreground">No products in this view.</div>}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 border-t border-border p-3">
              {page > 1 && (
                <Link href={href({ page: page - 1 })} className={rowBtn} data-tip="Go back one page in the catalog.">
                  ← Prev
                </Link>
              )}
              <span className="px-2 text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link href={href({ page: page + 1 })} className={rowBtn} data-tip="Go forward one page in the catalog.">
                  Next →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import {
  fetchAdminCategories,
  fetchJoinedCatalogPage,
} from "@/lib/admin/joined-catalog";
import { CatalogStatusToggle } from "@/components/admin/erp-actions";
import { ListingEditor, type CategoryOption } from "@/components/admin/listing-editor";
import type { CatalogSort } from "@/lib/supabase";

export const metadata: Metadata = { title: "Products — Admin" };
export const dynamic = "force-dynamic";

// Products runs on the SAME joined catalog as the shop and /admin/catalog
// (the storefront feed — supplier_catalog_products under the categories
// tree). Its rows are the front-end items with their publish state: what
// you have designed and published sells; the rest are blanks one click
// from the studio. The old 36-row `products` list is gone from this page —
// those products are still here, as the published rows of the one catalog.

type Params = {
  q?: string;
  supplierId?: string;
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

function pathLabels(
  nodes: { id: string; parent_id: string | null; name: string }[],
): CategoryOption[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const labelFor = (id: string): string => {
    const parts: string[] = [];
    let cur = byId.get(id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.name);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return parts.join(" › ");
  };
  return nodes.map((n) => ({ id: n.id, label: labelFor(n.id) }));
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const supplierId = params.supplierId || undefined;
  const design =
    params.design === "designed" || params.design === "not-designed" ? params.design : undefined;
  const sort = toCatalogSort(params.sort, params.dir);

  const sb = createServerClient();
  const [result, catNodes, suppliersRes] = await Promise.all([
    fetchJoinedCatalogPage({ search: params.q, supplierId, design, sort, page }),
    fetchAdminCategories(),
    sb.from("suppliers").select("id, slug, name").order("name"),
  ]);
  const suppliers = suppliersRes.data ?? [];
  const categoryOptions = pathLabels(catNodes);
  const totalPages = Math.ceil(result.total / result.perPage);

  const href = (over: Partial<Omit<Params, "page">> & { page?: number }) => {
    const merged: Record<string, string> = {};
    const put = (k: string, v?: string | number) => {
      if (v !== undefined && v !== "" && v !== null) merged[k] = String(v);
    };
    put("q", over.q !== undefined ? over.q : params.q);
    put("supplierId", over.supplierId !== undefined ? over.supplierId : supplierId);
    put("design", over.design !== undefined ? over.design : design);
    put("sort", over.sort !== undefined ? over.sort : params.sort);
    put("dir", over.dir !== undefined ? over.dir : params.dir);
    put("page", over.page !== undefined ? over.page : undefined);
    const qs = new URLSearchParams(merged).toString();
    return qs ? `/admin/products?${qs}` : "/admin/products";
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
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <span className="adm-badge">{result.total.toLocaleString()} products</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <form method="get" className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <input
            name="q"
            defaultValue={params.q || ""}
            placeholder="Search products…"
            className={bandInput}
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
            {suppliers.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            className={bandSelect}
            name="design"
            defaultValue={design || ""}
            data-tip="Designed means you have made a design on the blank. Published means it is live in the shop, selling."
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
          <button type="submit" className={bandBtn} data-tip="Show the list with these choices.">
            Search
          </button>
          {(params.q || supplierId || design || params.sort) && (
            <Link href="/admin/products" className="text-xs text-muted-foreground underline" data-tip="Clear the search and filters and show everything again.">
              Clear
            </Link>
          )}
          <Link
            href="/admin/studio/new-design"
            className={`${primaryBtn} ml-auto`}
            style={{ background: "#171420", borderColor: "#171420", color: "#fff" }}
            data-tip="Start a brand-new design the guided way — pick a category, then a subcategory, then the product, one step at a time."
          >
            + New Design
          </Link>
        </form>

        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr>
              <th className="p-3 text-left"></th>
              <th className="p-3 text-left">{sortHeader("Product", "name", "Put the list in name order.")}</th>
              <th className="p-3 text-left">Publish state</th>
              <th className="p-3 text-left">Price</th>
              <th className="p-3 text-left">{sortHeader("Variants", "variants", "Put the list in order of how many sizes and colors each product has.")}</th>
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
                  <div className="text-xs text-muted-foreground">
                    {p.category_path.join(" › ") || "No shelf yet"}
                    {p.supplier_name ? ` · ${p.supplier_name}` : ""}
                  </div>
                  {p.edited && <span className="adm-badge">Edited by you</span>}
                  {p.is_hidden && <span className="adm-badge">Hidden from shop</span>}
                </td>
                <td className="p-3">
                  {p.design_status === "published" ? (
                    <span className="adm-badge adm-badge-green">Published</span>
                  ) : p.design_status === "designed" ? (
                    <span className="adm-badge adm-badge-amber">Designed</span>
                  ) : (
                    <span className="adm-badge">Not designed</span>
                  )}
                  {p.published_product && p.published_product.status !== "published" && (
                    <div className="mt-1 text-xs">
                      Product is {p.published_product.status}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap p-3">
                  {p.listing_price != null ? (
                    <>
                      <div className="font-semibold">${p.listing_price.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">your price</div>
                    </>
                  ) : p.min_price != null ? (
                    <div>from ${p.min_price.toFixed(2)}</div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-3">{p.variant_count} variants</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Link
                      href={`/admin/studio/new-design?catalogProduct=${p.id}&name=${encodeURIComponent(p.name)}`}
                      className={primaryBtn}
                      style={{ background: "#171420", borderColor: "#171420", color: "#fff" }}
                      data-tip="Open this product in the Design Studio with it already picked, ready to design on."
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
                    {p.published_product && (
                      <>
                        <Link
                          href={`/product/${p.published_product.id}`}
                          className={rowBtn}
                          data-tip="See the product page shoppers buy from."
                        >
                          View live
                        </Link>
                        <CatalogStatusToggle
                          productId={p.published_product.id}
                          status={p.published_product.status}
                        />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {result.rows.length === 0 && <div className="text-center text-sm text-muted-foreground">No products found.</div>}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 border-t border-border p-3">
            {page > 1 && (
              <Link href={href({ page: page - 1 })} className={rowBtn} data-tip="Go back one page in the product list.">
                ← Prev
              </Link>
            )}
            <span className="px-2 text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link href={href({ page: page + 1 })} className={rowBtn} data-tip="Go forward one page in the product list.">
                Next →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

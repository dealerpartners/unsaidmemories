/**
 * /shop/[...slug] — category pages.
 *
 * The render source is the store's own category tree
 * (src/lib/taxonomy.ts over src/lib/taxonomy-data.ts — GENERATED
 * from the `categories` table on every deploy). A path that is not
 * a category path in the database 404s. Products come from the
 * categories' own placements via src/lib/static-catalog.ts.
 *
 * Products are server-fetched and passed as props; the client grid
 * seeds useState from them. The page and per-page come from the URL
 * (?page=, ?perPage= 25/50/100, clamped to the last page); page
 * changes fetch that page via /api/products.
 *
 * The sidebar is SCOPED to the current category (ShopApp) — the
 * current node plus its children only, never all departments.
 */

import ShopApp from "../shop-app";
import { findCategoryByPath, flattenTaxonomy } from "@/lib/taxonomy";
import { fetchProductsForStaticPath } from "@/lib/static-catalog";
import { parsePage, parsePerPage, totalPages, clampPage } from "@/lib/shop-pagination";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ShopCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug: rawSlug } = await params;
  // Route params arrive percent-encoded in this Next build (proven by
  // probe: "décor" arrives as "d%C3%A9cor", "tee-+-mug-+-cap" as
  // "tee-%2B-mug-%2B-cap"), which silently 404'd the two taxonomy
  // slugs that aren't plain ASCII. Decode before resolving.
  const slug = rawSlug.map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  const path = slug.join("/");

  // Static resolution ONLY — the tree is the routing source of truth.
  const found = slug.length ? findCategoryByPath(slug) : null;
  if (slug.length && !found) notFound();

  const sp = (await searchParams) ?? {};
  const perPage = parsePerPage(sp.perPage);
  const requestedPage = parsePage(sp.page);
  const first = slug.length
    ? await fetchProductsForStaticPath(path, perPage, (requestedPage - 1) * perPage)
    : { products: [], total: 0 };
  let total = first.total;
  let products = first.products;
  let page = clampPage(requestedPage, totalPages(total, perPage));
  if (slug.length && requestedPage > 1 && total === 0) {
    // Out-of-range page: the fetch layer reports total 0 when the
    // offset is past the data, so the true total is unknown from
    // that fetch. Probe page 1 for the true total, then clamp.
    // (A genuinely empty category probes to 0 and stays on page 1.)
    const probe = await fetchProductsForStaticPath(path, perPage, 0);
    total = probe.total;
    page = clampPage(requestedPage, totalPages(total, perPage));
    products =
      page === 1
        ? probe.products
        : (await fetchProductsForStaticPath(path, perPage, (page - 1) * perPage)).products;
  } else if (page !== requestedPage && slug.length) {
    products = (await fetchProductsForStaticPath(path, perPage, (page - 1) * perPage)).products;
  }

  return (
    <ShopApp
      key={path}
      slugs={slug}
      initialProducts={products}
      initialTotal={total}
      perPage={perPage}
      initialPage={page}
      paged
    />
  );
}

export async function generateStaticParams() {
  // Every static tree node gets a path (duplicate sibling slugs collapse
  // to one path — the same-named DB branches behind them are unioned by
  // the static→DB product mapping, so no products are lost).
  const seen = new Set<string>();
  const paths: { slug: string[] }[] = [];
  for (const f of flattenTaxonomy()) {
    const key = f.path.join("/");
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push({ slug: f.path });
  }
  return paths;
}

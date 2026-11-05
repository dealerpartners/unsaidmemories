import ShopApp from "./shop-app";
import { getCachedCategoryProducts } from "@/lib/catalog-cache";
import { parsePage, parsePerPage, totalPages, clampPage } from "@/lib/shop-pagination";

export default async function ShopPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const perPage = parsePerPage(sp.perPage);
  const requestedPage = parsePage(sp.page);
  const [first] = await Promise.all([
    getCachedCategoryProducts("", perPage, (requestedPage - 1) * perPage),
  ]);
  let total = first.total;
  let products = first.products;
  let page = clampPage(requestedPage, totalPages(total, perPage));
  if (requestedPage > 1 && total === 0) {
    // Out-of-range page: the fetch layer reports total 0 when the
    // offset is past the data, so the true total is unknown from
    // that fetch. Probe page 1 for the true total, then clamp.
    // (A genuinely empty catalog probes to 0 and stays on page 1.)
    const probe = await getCachedCategoryProducts("", perPage, 0);
    total = probe.total;
    page = clampPage(requestedPage, totalPages(total, perPage));
    products =
      page === 1
        ? probe.products
        : (await getCachedCategoryProducts("", perPage, (page - 1) * perPage)).products;
  } else if (page !== requestedPage) {
    products = (await getCachedCategoryProducts("", perPage, (page - 1) * perPage)).products;
  }
  return (
    <ShopApp
      slugs={[]}
      initialProducts={products}
      initialTotal={total}
      perPage={perPage}
      initialPage={page}
      paged
    />
  );
}

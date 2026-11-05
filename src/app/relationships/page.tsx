import ShopApp from "@/app/shop/shop-app";
import { findNodePathByName } from "@/lib/taxonomy";
import { fetchProductsForStaticPath } from "@/lib/static-catalog";

const PER_PAGE = 32;

export const metadata = { title: "Relationships — UnSaid" };

export default async function RelationshipsPage() {
  // Full chain (Collections & Occasions > Relationships) — the old
  // top-level find() missed the nested node and silently rendered the
  // shop root here instead of the Relationships category.
  const chain = findNodePathByName("Relationships");
  const slugs = chain ? chain.map((n) => n.slug) : [];
  // Static-path resolver (as /shop + /api/products): relationship
  // membership lives in product_taxonomy_links, which only that
  // resolver merges; the legacy category fetch rendered this empty.
  const { products, total } = await fetchProductsForStaticPath(slugs.join("/"), PER_PAGE, 0);
  return (
    <ShopApp
      slugs={slugs}
      initialProducts={products}
      initialTotal={total}
      perPage={PER_PAGE}
    />
  );
}

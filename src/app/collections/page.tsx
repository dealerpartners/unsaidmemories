import ShopApp from "@/app/shop/shop-app";
import { taxonomy } from "@/lib/taxonomy";
import { getCachedCategoryProducts } from "@/lib/catalog-cache";

const PER_PAGE = 32;

export const metadata = { title: "Collections — UnSaid" };

export default async function CollectionsPage() {
  // Collections are under Home & Living > Collections in the taxonomy
  const homeNode = (taxonomy as any[]).find((n: any) => n.name === "Home & Living");
  const collectionsNode = homeNode?.children.find((c: any) => c.name === "Collections");
  const slugs = collectionsNode ? [homeNode.slug, collectionsNode.slug] : [];
  const { products, total } = await getCachedCategoryProducts(slugs.join("/"), PER_PAGE, 0);
  return (
    <ShopApp
      slugs={slugs}
      initialProducts={products}
      initialTotal={total}
      perPage={PER_PAGE}
    />
  );
}

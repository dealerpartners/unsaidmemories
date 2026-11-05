import ShopApp from "@/app/shop/shop-app";
import { getCachedCategoryProducts } from "@/lib/catalog-cache";

const PER_PAGE = 32;

export const metadata = { title: "Departments — UnSaid" };

export default async function DepartmentsPage() {
  const { products, total } = await getCachedCategoryProducts("", PER_PAGE, 0);
  return (
    <ShopApp
      slugs={[]}
      initialProducts={products}
      initialTotal={total}
      perPage={PER_PAGE}
    />
  );
}

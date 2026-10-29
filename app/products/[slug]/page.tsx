import { getProducts } from '@/lib/catalog-db';
export const revalidate = 3600;
export default async function ProductPage({ params }: { params: { slug: string } }) {
  const products = await getProducts();
  const p = products.find(x => x.slug === params.slug);
  if (!p) return <h1>Product not found</h1>;
  return (<><h1>{p.name}</h1><p>{p.brand} — ${p.price}</p><p>Collections: {p.collections.join(', ')}</p><a href="/checkout">Checkout</a></>);
}

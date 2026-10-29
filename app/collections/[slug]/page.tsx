import Link from 'next/link';
import { getProducts } from '@/lib/catalog-db';
export const revalidate = 3600;
export default async function CollectionPage({ params }: { params: { slug: string } }) {
  const products = await getProducts();
  const items = products.filter(p => p.collections.includes(params.slug));
  return (<><h1>{params.slug}</h1><div className="grid">{items.map(p => (<Link key={p.slug} className="card" href={`/products/${p.slug}`}>{p.name} — ${p.price}</Link>))}</div></>);
}

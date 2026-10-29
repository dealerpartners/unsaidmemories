import Link from 'next/link';
import { getCategories, getProducts, descendantsOf } from '@/lib/catalog-db';
export const revalidate = 3600;
export default async function ShopPage({ params }: { params: { slug?: string[] } }) {
  const categories = await getCategories();
  const products = await getProducts();
  const slug = params.slug?.[params.slug.length - 1];
  const cat = categories.find((c) => c.slug === slug);
  const children = categories.filter((c) => c.parent === (slug ?? undefined) || (!slug && c.level === 1));
  const allowed = slug ? new Set(descendantsOf(categories, slug)) : new Set<string>();
  const shown = slug ? products.filter((p) => allowed.has(p.category)) : [];
  return (<><h1>{cat ? cat.name : 'Shop'}</h1>
    <div className="grid">{children.map(c => (<Link key={c.slug} className="card" href={`/shop/${c.slug}`}>{c.name}</Link>))}</div>
    <div className="grid">{shown.map(p => (<Link key={p.slug} className="card" href={`/products/${p.slug}`}><strong>{p.name}</strong><br />{p.brand} — ${p.price}</Link>))}</div>
  </>);
}

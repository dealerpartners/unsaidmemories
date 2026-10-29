import { NextResponse } from 'next/server';
import { searchAlgolia } from '@/lib/algolia';
import { getProducts } from '@/lib/catalog-db';
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') || '';
  if (q) { const hits = await searchAlgolia(q).catch(() => null); if (hits) return NextResponse.json({ source: 'algolia', hits }); }
  const products = await getProducts();
  const hits = q ? products.filter((p) => `${p.name} ${p.category} ${p.brand}`.toLowerCase().includes(q.toLowerCase())) : products;
  return NextResponse.json({ source: 'catalog', hits });
}

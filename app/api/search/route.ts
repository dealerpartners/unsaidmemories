import { NextResponse } from 'next/server';
import { searchAlgolia } from '@/lib/algolia';
import { getProducts } from '@/lib/catalog-db';
import { cleanQuery, cleanLimit } from '@/lib/search';

export const dynamic = 'force-dynamic';

// GET /api/search?q=keeper&limit=25 -> { source: 'algolia'|'catalog', hits: [] }
// Algolia is used when configured; otherwise the Supabase catalog (with seed
// fallback) is filtered in-app. Never 500s on missing keys or bad input.
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const q = cleanQuery(params.get('q'));
    const limit = cleanLimit(params.get('limit'));

    if (q) {
      const hits = await searchAlgolia(q, 'unsaid_products', limit).catch(() => null);
      if (hits) return NextResponse.json({ source: 'algolia', hits: hits.slice(0, limit) });
    }

    const products = await getProducts();
    const qLower = q.toLowerCase();
    const hits = (q
      ? products.filter((p) => `${p.name} ${p.category} ${p.brand}`.toLowerCase().includes(qLower))
      : products
    ).slice(0, limit);
    return NextResponse.json({ source: 'catalog', hits });
  } catch {
    return NextResponse.json({ source: 'catalog', hits: [] });
  }
}

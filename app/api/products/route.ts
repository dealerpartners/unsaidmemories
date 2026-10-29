import { NextRequest, NextResponse } from 'next/server';
import { getProducts, getCategories, descendantsOf } from '@/lib/catalog-db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const brand = searchParams.get('brand');
  const q = searchParams.get('q')?.toLowerCase();
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') ?? '48', 10)));

  const [products, categories] = await Promise.all([getProducts(), getCategories()]);

  let filtered = products;
  if (category) {
    const allowed = new Set(descendantsOf(categories, category));
    allowed.add(category);
    filtered = filtered.filter((p) => allowed.has(p.category));
  }
  if (brand) {
    filtered = filtered.filter((p) => p.brand.toLowerCase() === brand.toLowerCase());
  }
  if (q) {
    filtered = filtered.filter(
      (p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
    );
  }

  const total = filtered.length;
  const start = (page - 1) * perPage;
  const items = filtered.slice(start, start + perPage);

  return NextResponse.json({
    items,
    total,
    page,
    per_page: perPage,
    total_pages: Math.ceil(total / perPage),
  });
}

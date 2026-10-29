import { NextRequest, NextResponse } from 'next/server';
import { getProductDetail, getSupplierProductDetail } from '@/lib/catalog-db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const product = (await getProductDetail(params.slug)) ?? (await getSupplierProductDetail(params.slug));
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }
  return NextResponse.json(product);
}

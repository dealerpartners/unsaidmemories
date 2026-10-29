import { NextResponse } from 'next/server';
import { adapters } from '@/lib/fulfillment';
export async function POST(req: Request) {
  const body = await req.json();
  const adapter = adapters[body.supplierSlug];
  if (!adapter) return NextResponse.json({ error: 'No live adapter for this supplier' }, { status: 400 });
  const result = await adapter.createOrder(body);
  return NextResponse.json(result);
}

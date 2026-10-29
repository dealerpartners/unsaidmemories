import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getServiceClient, getPlatformTenantId } from '@/lib/supabase-server';

// Creates the ORDER RECORD first (orders + order_items), then a Stripe
// PaymentIntent. Payment first, fulfillment second: the webhook only creates
// fulfillment_orders after payment_intent.succeeded.
//
// Body: { items: [{ sku: string, quantity: number }], email?: string,
//         shipping_address?: Record<string,string>, currency?: string }
// Prices come from the DB (product_variants.price) — the client amount is
// never trusted. Without STRIPE_SECRET_KEY the order is still recorded and
// the response reports payments_configured: false so the UI degrades
// gracefully instead of crashing.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return NextResponse.json({ error: 'items required' }, { status: 400 });
  for (const it of items) {
    if (!it?.sku || !Number.isInteger(it.quantity) || it.quantity <= 0 || it.quantity > 99) {
      return NextResponse.json({ error: 'each item needs a sku and quantity 1-99' }, { status: 400 });
    }
  }

  const db = getServiceClient();
  if (!db) return NextResponse.json({ error: 'database not configured' }, { status: 503 });
  const tenantId = await getPlatformTenantId(db);
  if (!tenantId) return NextResponse.json({ error: 'platform tenant not found' }, { status: 500 });

  // Resolve SKUs to real variants; total is computed from DB prices.
  const skus = [...new Set(items.map((i: any) => String(i.sku)))];
  const { data: variants, error: vErr } = await db
    .from('product_variants')
    .select('id,tenant_id,sku,price,is_active,product_id')
    .eq('tenant_id', tenantId)
    .in('sku', skus);
  if (vErr) return NextResponse.json({ error: 'variant lookup failed' }, { status: 500 });
  const bySku = new Map((variants ?? []).map((v: any) => [v.sku, v]));
  let total = 0;
  const lines = [];
  for (const it of items) {
    const v = bySku.get(String(it.sku));
    if (!v || !v.is_active) return NextResponse.json({ error: `unknown or inactive sku: ${it.sku}` }, { status: 400 });
    const unit = Number(v.price);
    total += unit * it.quantity;
    lines.push({ variant: v, quantity: it.quantity, unit });
  }
  total = Math.round(total * 100) / 100;

  const orderId = randomUUID();
  const ship = { ...(body.shipping_address ?? {}), ...(body.email ? { email: body.email } : {}) };
  const { error: oErr } = await db.from('orders').insert({
    id: orderId, tenant_id: tenantId, status: 'pending_payment',
    total, shipping_address: ship,
  });
  if (oErr) return NextResponse.json({ error: 'order insert failed' }, { status: 500 });
  const { error: iErr } = await db.from('order_items').insert(
    lines.map((l) => ({
      order_id: orderId, tenant_id: tenantId,
      product_variant_id: l.variant.id, quantity: l.quantity, unit_price: l.unit,
    })),
  );
  if (iErr) return NextResponse.json({ error: 'order items insert failed', order_id: orderId }, { status: 500 });

  const secret = process.env.STRIPE_SECRET_KEY ?? '';
  if (!secret) {
    // Order recorded; payment can't run without Stripe keys. Graceful, not fatal.
    return NextResponse.json({ order_id: orderId, total, payments_configured: false });
  }

  const form = new URLSearchParams({
    amount: String(Math.round(total * 100)),
    currency: body.currency ?? 'usd',
    'automatic_payment_methods[enabled]': 'true',
    'metadata[order_id]': orderId,
  });
  if (body.email) form.set('receipt_email', String(body.email));
  const res = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const json: any = await res.json();
  if (!res.ok) return NextResponse.json({ error: json?.error?.message ?? 'stripe failed', order_id: orderId }, { status: res.status });
  const piId = json.id as string;
  await db.from('orders').update({ stripe_payment_intent_id: piId }).eq('id', orderId).eq('tenant_id', tenantId);
  return NextResponse.json({ order_id: orderId, total, payments_configured: true, client_secret: json.client_secret });
}

// Active sellable variants for the checkout picker (sku, product name, price).
export async function GET() {
  const db = getServiceClient();
  if (!db) return NextResponse.json({ variants: [] });
  const tenantId = await getPlatformTenantId(db);
  if (!tenantId) return NextResponse.json({ variants: [] });
  const { data } = await db
    .from('product_variants')
    .select('sku,price,size,color,product_id')
    .eq('tenant_id', tenantId).eq('is_active', true).limit(200);
  const pids = [...new Set(((data ?? []) as any[]).map((v) => v.product_id))];
  let names = new Map<string, string>();
  if (pids.length) {
    const { data: prods } = await db.from('products').select('id,name').in('id', pids);
    names = new Map(((prods ?? []) as any[]).map((p) => [p.id, p.name]));
  }
  return NextResponse.json({
    variants: ((data ?? []) as any[]).map((v) => ({
      sku: v.sku, price: Number(v.price), size: v.size, color: v.color,
      name: names.get(v.product_id) ?? v.sku,
    })),
  });
}

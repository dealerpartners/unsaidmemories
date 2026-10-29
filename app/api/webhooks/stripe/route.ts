import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { getServiceClient, getPlatformTenantId } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/email';
// Payment first, fulfillment second. Only on payment_intent.succeeded
// do we mark the order paid and create fulfillment_orders from the winning
// variant_fulfillment_route. Supplier adapters are NEVER called from here —
// fulfillment_orders are created as 'draft' and submitted later via
// /api/fulfillment (admin), so no supplier order ever precedes payment.
// Signature verification is real, not a TODO: Stripe signs
// `${timestamp}.${rawBody}` with HMAC-SHA256 using the webhook secret,
// sent as `t=<ts>,v1=<sig>` in the stripe-signature header.
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  const sig = req.headers.get('stripe-signature') ?? '';
  if (secret) {
    const ts = sig.split(',').find((p) => p.startsWith('t='))?.slice(2) ?? '';
    const v1 = sig.split(',').find((p) => p.startsWith('v1='))?.slice(3) ?? '';
    if (!ts || !v1 || Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
      return NextResponse.json({ error: 'bad signature' }, { status: 400 });
    }
    const expected = createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
    const a = Buffer.from(expected); const b = Buffer.from(v1);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'bad signature' }, { status: 400 });
    }
  }
  const event = JSON.parse(raw || '{}');
  if (event?.type !== 'payment_intent.succeeded') return NextResponse.json({ ignored: true });
  const pi = event?.data?.object ?? {};
  const piId: string | null = pi.id ?? null;
  if (!piId) return NextResponse.json({ ok: true, note: 'no payment intent id' });

  const db = getServiceClient();
  if (!db) return NextResponse.json({ ok: true, note: 'database not configured', payment_intent: piId });
  const tenantId = await getPlatformTenantId(db);
  if (!tenantId) return NextResponse.json({ ok: true, note: 'platform tenant not found', payment_intent: piId });

  // Find the order created by /api/checkout BEFORE payment.
  const { data: order } = await db.from('orders')
    .select('id,tenant_id,status,total,shipping_address')
    .eq('tenant_id', tenantId).eq('stripe_payment_intent_id', piId)
    .maybeSingle();
  if (!order) return NextResponse.json({ ok: true, note: 'no matching order', payment_intent: piId });

  let fulfillmentsCreated = 0;
  if (order.status === 'pending_payment') {
    // Idempotency: skip if fulfillment rows already exist for this order.
    const { data: existing } = await db.from('fulfillment_orders')
      .select('id').eq('tenant_id', tenantId).eq('order_id', order.id).limit(1);
    await db.from('orders').update({ status: 'paid' }).eq('id', order.id).eq('tenant_id', tenantId);

    const { data: items } = await db.from('order_items')
      .select('id,product_variant_id,quantity,unit_price')
      .eq('tenant_id', tenantId).eq('order_id', order.id);
    for (const item of (items ?? []) as any[]) {
      // Winning route: active, lowest priority number, US region preferred.
      const { data: route } = await db.from('variant_fulfillment_routes')
        .select('id,supplier_id')
        .eq('tenant_id', tenantId)
        .eq('product_variant_id', item.product_variant_id)
        .eq('is_active', true)
        .order('priority', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!route) continue; // no route yet — admin routes it later
      if (!(existing ?? []).length) {
        const { error } = await db.from('fulfillment_orders').insert({
          id: randomUUID(), tenant_id: tenantId, order_id: order.id,
          supplier_id: route.supplier_id, route_id: route.id, status: 'draft',
        });
        if (!error) fulfillmentsCreated++;
      }
    }
  }

  // Order confirmation email (existing Resend function). Email failure must
  // never fail the webhook — Stripe would retry a paid order.
  const to = (order.shipping_address as any)?.email;
  if (to && process.env.RESEND_API_KEY) {
    try {
      await sendEmail({
        to,
        subject: `Your UnSaid Memories order ${String(order.id).slice(0, 8)} is confirmed`,
        html: `<p>Thank you — your payment succeeded and your order is confirmed.</p><p>Order total: $${Number(order.total).toFixed(2)}</p><p>We'll email tracking as soon as your keepsakes ship.</p>`,
      });
    } catch { /* email is best-effort here */ }
  }

  return NextResponse.json({ ok: true, order_id: order.id, fulfillments_created: fulfillmentsCreated, payment_intent: piId });
}

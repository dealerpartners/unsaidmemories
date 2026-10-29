import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
// Payment first, fulfillment second. Only on payment_intent.succeeded
// do we call a fulfillment adapter. Never before.
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
  // Fulfillment is created by /api/fulfillment from a stored order record
  // (order_items + winning variant_fulfillment_route). The webhook alone
  // does not invent order items from the PaymentIntent payload.
  return NextResponse.json({ ok: true, fulfillment: 'queued-after-payment', payment_intent: event?.data?.object?.id ?? null });
}

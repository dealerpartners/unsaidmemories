import { NextResponse } from 'next/server';
// Creates a Stripe PaymentIntent (server only, secret key never in the browser).
// Body: { amount_cents: number, product_slug?: string, currency?: string }
// Returns { client_secret } for Stripe.js / Payment Element on the checkout page.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount_cents);
  if (!amount || amount <= 0) return NextResponse.json({ error: 'amount_cents required' }, { status: 400 });
  const secret = process.env.STRIPE_SECRET_KEY ?? '';
  if (!secret) return NextResponse.json({ error: 'STRIPE_SECRET_KEY not set' }, { status: 500 });
  const form = new URLSearchParams({
    amount: String(amount),
    currency: body.currency ?? 'usd',
    'automatic_payment_methods[enabled]': 'true',
  });
  if (body.product_slug) form.set('metadata[product_slug]', String(body.product_slug));
  const res = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const json: any = await res.json();
  if (!res.ok) return NextResponse.json({ error: json?.error?.message ?? 'stripe failed' }, { status: res.status });
  return NextResponse.json({ client_secret: json.client_secret, id: json.id });
}

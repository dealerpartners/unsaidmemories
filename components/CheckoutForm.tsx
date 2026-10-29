'use client';
import { useEffect, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

type Variant = { sku: string; name: string; price: number; size: string | null; color: string | null };

// Inner form rendered inside <Elements> once we have a client_secret.
function PayForm({ orderId, total, onDone }: { orderId: string; total: number; onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function pay() {
    if (!stripe || !elements) return;
    setBusy(true); setErr('');
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/checkout?paid=${orderId}` },
    });
    if (error) setErr(error.message ?? 'Payment failed');
    setBusy(false);
    if (!error) onDone();
  }
  return (
    <div>
      <p>Order total: <strong>${total.toFixed(2)}</strong></p>
      <PaymentElement />
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
      <button disabled={!stripe || busy} onClick={pay} style={{ marginTop: 12 }}>
        {busy ? 'Processing…' : `Pay $${total.toFixed(2)}`}
      </button>
    </div>
  );
}

export default function CheckoutForm({ publishableKey, configured }: { publishableKey: string; configured: boolean }) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState({ name: '', line1: '', city: '', state: '', postalCode: '', country: 'US' });
  const [stage, setStage] = useState<'cart' | 'pay' | 'done' | 'unavailable'>('cart');
  const [clientSecret, setClientSecret] = useState('');
  const [orderId, setOrderId] = useState('');
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState('');
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    fetch('/api/checkout').then((r) => r.json()).then((j) => setVariants(j.variants ?? [])).catch(() => {});
    const paid = new URLSearchParams(window.location.search).get('paid');
    if (paid) { setOrderId(paid); setStage('done'); }
  }, []);

  if (!configured) {
    // Graceful state: no Stripe keys on file. Nothing crashes; no payment UI.
    return (
      <div>
        <h1>Checkout</h1>
        <p><strong>Payments are not configured yet.</strong> The store owner still needs to add the Stripe keys, so checkout can't take payment right now. Your cart and the catalog are unaffected.</p>
        <p><a href="/shop">Back to the shop</a></p>
      </div>
    );
  }

  const cartSkus = Object.keys(cart).filter((s) => cart[s] > 0);
  async function startPayment() {
    setErr('');
    if (!cartSkus.length) { setErr('Pick at least one item.'); return; }
    if (!email.includes('@')) { setErr('Enter a valid email for your receipt.'); return; }
    const res = await fetch('/api/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cartSkus.map((sku) => ({ sku, quantity: cart[sku] })),
        email,
        shipping_address: { ...address, email },
      }),
    });
    const j = await res.json();
    if (!res.ok) { setErr(j.error ?? 'Could not start checkout'); return; }
    if (!j.payments_configured) { setOrderId(j.order_id); setStage('unavailable'); return; }
    setOrderId(j.order_id); setTotal(j.total); setClientSecret(j.client_secret);
    setStripePromise(loadStripe(publishableKey));
    setStage('pay');
  }

  if (stage === 'done') return (<div><h1>Thank you!</h1><p>Your payment succeeded. Order <code>{orderId.slice(0, 8)}</code> is confirmed — check your email for the receipt.</p><p><a href="/shop">Keep shopping</a></p></div>);
  if (stage === 'unavailable') return (<div><h1>Order saved</h1><p>Your order <code>{orderId.slice(0, 8)}</code> was recorded, but live payments aren't configured yet, so it can't be charged. We'll be in touch at {email}.</p></div>);
  if (stage === 'pay' && clientSecret && stripePromise) {
    return (<div><h1>Payment</h1><Elements stripe={stripePromise} options={{ clientSecret }}><PayForm orderId={orderId} total={total} onDone={() => setStage('done')} /></Elements></div>);
  }

  return (
    <div>
      <h1>Checkout</h1>
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
      <h2>1. Your items</h2>
      {variants.length === 0 && <p>Loading products…</p>}
      <ul>
        {variants.map((v) => (
          <li key={v.sku}>
            {v.name} ({v.sku}) — ${v.price.toFixed(2)}
            <input type="number" min={0} max={99} value={cart[v.sku] ?? 0} style={{ width: 56, marginLeft: 8 }}
              onChange={(e) => setCart({ ...cart, [v.sku]: Math.max(0, Math.min(99, Number(e.target.value) || 0)) })} />
          </li>
        ))}
      </ul>
      <h2>2. Shipping</h2>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ display: 'block', marginBottom: 6 }} />
      {(Object.keys(address) as (keyof typeof address)[]).map((k) => (
        <input key={k} placeholder={k} value={address[k]} onChange={(e) => setAddress({ ...address, [k]: e.target.value })} style={{ display: 'block', marginBottom: 6 }} />
      ))}
      <button onClick={startPayment} style={{ marginTop: 12 }}>Continue to payment</button>
      <p><a href="/shop">Back to the shop</a></p>
    </div>
  );
}

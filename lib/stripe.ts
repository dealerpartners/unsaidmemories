import Stripe from 'stripe';
// Stripe server SDK (default API version). Requires STRIPE_SECRET_KEY.
// Checkout webhook still verifies the signature before any fulfillment.
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

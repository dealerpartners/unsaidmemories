import Stripe from "stripe";

/**
 * Shared server-side Stripe client (sandbox or live, whichever key is in env).
 * Throws a clear error when Stripe is not configured so routes can 500
 * with an honest message instead of failing obscurely downstream.
 *
 * The fetch HTTP client is deliberate: stripe-node's default client always
 * passes its own https.Agent, which bypasses the runtime's env-proxy routing
 * (NODE_USE_ENV_PROXY) — in sandboxed egress environments that forces a
 * direct connection whose TLS gets reset (EPROTO "wrong version number" on
 * every call, verified against api.stripe.com). The fetch client rides the
 * platform fetch, which honors proxy env where present and connects directly
 * where not (e.g. Vercel), so the same code works in both.
 */
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  cached = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  return cached;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

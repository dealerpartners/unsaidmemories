"use client";

/**
 * Browser-side cart helpers. One identity model across the storefront:
 * - Signed-in customers: cart is keyed by their Supabase auth user id
 *   (orders.customer_id = auth user id, see /api/customers/me/orders).
 * - Guests: cart is keyed by a stable session id in localStorage.
 * The Storefront PDP "Add to Bag" and the /cart + /checkout pages all go
 * through these helpers so a line added anywhere is the same line at checkout.
 */

const SESSION_KEY = "unsaid_cart_session";

export function getCartSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(SESSION_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/**
 * Signed-in customer's auth user id, or null for guests.
 * A 401 means "guest" definitively. A 5xx or a network error is transient —
 * it is retried once before giving up, so a signed-in customer is never
 * silently degraded to a guest (empty) cart by one failed request.
 */
export async function fetchCurrentCustomerId(): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/customers/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        return data?.id ?? null;
      }
      if (res.status === 401 || res.status === 403) return null;
    } catch {
      // network error — fall through to the single retry
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
  }
  return null;
}

export type CartItemRow = {
  id: string;
  cart_id: string;
  product_variant_id: string | null;
  supplier_catalog_variant_id: string | null;
  design_publication_id: string | null;
  quantity: number;
  unit_price: number | null;
  created_at: string;
};

export type CartResponse = {
  cart: { id: string; status: string } | null;
  items: CartItemRow[];
};

function identityParams(customerId?: string | null): string {
  return customerId
    ? `customer_id=${encodeURIComponent(customerId)}`
    : `session_id=${encodeURIComponent(getCartSessionId())}`;
}

export async function fetchCart(customerId?: string | null): Promise<CartResponse> {
  const res = await fetch(`/api/cart?${identityParams(customerId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`cart fetch failed (${res.status})`);
  return res.json();
}

export async function addToCart(opts: {
  customerId?: string | null;
  product_variant_id?: string | null;
  supplier_catalog_variant_id?: string | null;
  supplier_catalog_product_id?: string | null;
  design_publication_id?: string | null;
  quantity?: number;
  /** Size the shopper picked — when only a product id is passed, the
   *  server resolves the variant of THIS size instead of the cheapest. */
  size?: string | null;
}): Promise<{ cart_id: string; item: CartItemRow }> {
  const res = await fetch("/api/cart/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(opts.customerId
        ? { customer_id: opts.customerId }
        : { session_id: getCartSessionId() }),
      product_variant_id: opts.product_variant_id ?? undefined,
      supplier_catalog_variant_id: opts.supplier_catalog_variant_id ?? undefined,
      supplier_catalog_product_id: opts.supplier_catalog_product_id ?? undefined,
      design_publication_id: opts.design_publication_id ?? undefined,
      quantity: opts.quantity ?? 1,
      size: opts.size ?? undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `add to cart failed (${res.status})`);
  return data;
}

export async function updateCartItemQuantity(itemId: string, quantity: number) {
  const res = await fetch(`/api/cart/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `update failed (${res.status})`);
  return data;
}

export async function removeCartItem(itemId: string) {
  const res = await fetch(`/api/cart/items/${itemId}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `remove failed (${res.status})`);
  return data;
}

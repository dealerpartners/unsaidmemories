"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { ArrowRight, CreditCard, Lock, ShoppingBag, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trackBeginCheckout } from "@/lib/analytics-events";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { MixedSupplierNotice } from "@/components/commerce/mixed-supplier-notice";
import { primaryCtaStyle } from "@/components/commerce/cta-style";
import { fetchCart } from "@/lib/commerce/cart-client";

const money = (n: number, c = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(n);

type Address = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  email: string;
  phone: string;
};

type QuotePackage = {
  index: number;
  label: string;
  item_count: number;
  methods: {
    profile_id: string | null;
    method_name: string;
    cost: number;
    currency: string;
    min_days: number | null;
    max_days: number | null;
  }[];
};

/** A method's selection key: its rate-card id, or its name for
 *  live-quoted methods that have no card. */
const methodKey = (m: { profile_id: string | null; method_name: string }) =>
  m.profile_id ?? m.method_name;

function PaymentStep({
  clientSecret,
  orderId,
  total,
}: {
  clientSecret: string;
  orderId: string;
  total: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);
    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success?order_id=${orderId}`,
      },
    });
    if (err) {
      setError(err.message || "Payment failed. Your card was not charged.");
      setPaying(false);
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      router.push(`/checkout/success?order_id=${orderId}`);
      return;
    }
    setError(`Payment status: ${paymentIntent?.status ?? "unknown"}`);
    setPaying(false);
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      <Button className="w-full" size="lg" style={primaryCtaStyle} onClick={pay} disabled={!stripe || paying}>
        <Lock className="mr-2 h-4 w-4" />
        {paying ? "Processing…" : `Pay ${money(total)}`}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Order {orderId.slice(0, 8)}… is reserved while you pay. If payment fails, no
        fulfillment starts and nothing is sent to a supplier.
      </p>
    </div>
  );
}

function loadAcceptJs(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Accept) return resolve();
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("secure payment library failed to load")));
      if ((window as any).Accept) resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = url;
    s.charset = "utf-8";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("secure payment library failed to load"));
    document.head.appendChild(s);
  });
}

/**
 * Authorize.net payment step (Accept.js). The card fields live on
 * this page, but the card data goes straight from the customer's
 * browser to Authorize.net — Accept.js returns an opaque nonce and
 * our server charges that. Card numbers never touch this app.
 */
function AnetPaymentStep({
  anet,
  total,
  placing,
  onNonce,
}: {
  anet: { api_login_id: string; public_client_key: string; accept_js_url: string };
  total: number;
  placing: boolean;
  onNonce: (nonce: { data_descriptor: string; data_value: string }) => void;
}) {
  const [cardNumber, setCardNumber] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [cardCode, setCardCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAcceptJs(anet.accept_js_url).catch(() => undefined);
  }, [anet.accept_js_url]);

  async function pay() {
    setError(null);
    const digits = cardNumber.replace(/\D/g, "");
    if (digits.length < 13 || !/^\d{1,2}$/.test(month) || !/^\d{2,4}$/.test(year) || cardCode.trim().length < 3) {
      setError("Enter the card number, expiry month and year, and the security code from the back of the card.");
      return;
    }
    setBusy(true);
    try {
      await loadAcceptJs(anet.accept_js_url);
      const Accept = (window as any).Accept;
      if (!Accept?.dispatchData) throw new Error("The secure payment library did not load. Check your connection and try again.");
      const nonce = await new Promise<{ data_descriptor: string; data_value: string }>((resolve, reject) => {
        Accept.dispatchData(
          {
            authData: { clientKey: anet.public_client_key, apiLoginID: anet.api_login_id },
            cardData: {
              cardNumber: digits,
              month: month.padStart(2, "0"),
              year: year.length === 2 ? `20${year}` : year,
              cardCode: cardCode.trim(),
              fullName: fullName.trim() || undefined,
            },
          },
          (response: any) => {
            if (response?.messages?.resultCode === "Error") {
              const text = (response.messages.message || []).map((m: any) => m.text).filter(Boolean).join(" ");
              reject(new Error(text || "The card details were not accepted. Check them and try again."));
              return;
            }
            const opaque = response?.opaqueData;
            if (!opaque?.dataDescriptor || !opaque?.dataValue) {
              reject(new Error("The payment service did not return a payment token. Try again."));
              return;
            }
            resolve({ data_descriptor: opaque.dataDescriptor, data_value: opaque.dataValue });
          }
        );
      });
      onNonce(nonce);
    } catch (e: any) {
      setError(e.message || "Payment could not be started.");
    } finally {
      setBusy(false);
    }
  }

  const fieldCls =
    "border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0";
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border bg-background">
        <div className="flex items-center gap-2 px-3">
          <Input
            id="anet-card-number"
            aria-label="Card number"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="Card number"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            className={`${fieldCls} h-12 flex-1 px-0 text-base tracking-wide`}
          />
          <CreditCard className="h-5 w-5 shrink-0 text-muted-foreground" />
        </div>
        <div className="grid grid-cols-3 divide-x border-t">
          <Input
            id="anet-month"
            aria-label="Expiry month"
            inputMode="numeric"
            autoComplete="cc-exp-month"
            placeholder="MM"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className={`${fieldCls} h-12 rounded-none px-3`}
          />
          <Input
            id="anet-year"
            aria-label="Expiry year"
            inputMode="numeric"
            autoComplete="cc-exp-year"
            placeholder="YYYY"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={`${fieldCls} h-12 rounded-none px-3`}
          />
          <Input
            id="anet-code"
            aria-label="Security code"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="CVC"
            value={cardCode}
            onChange={(e) => setCardCode(e.target.value)}
            className={`${fieldCls} h-12 rounded-none px-3`}
          />
        </div>
        <div className="border-t px-3">
          <Input
            id="anet-name"
            aria-label="Name on card"
            autoComplete="cc-name"
            placeholder="Name on card"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={`${fieldCls} h-12 px-0`}
          />
        </div>
      </div>
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      <Button className="w-full" size="lg" style={primaryCtaStyle} onClick={pay} disabled={busy || placing}>
        <Lock className="mr-2 h-4 w-4" />
        {busy || placing ? "Processing…" : `Pay ${money(total)}`}
      </Button>
    </div>
  );
}

export function CheckoutClient({ customerId, email }: { customerId: string | null; email: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cartId, setCartId] = useState<string | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [mixed, setMixed] = useState<any>(null);
  const [address, setAddress] = useState<Address>({
    name: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "US",
    email,
    phone: "",
  });
  const [quotePackages, setQuotePackages] = useState<QuotePackage[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [promo, setPromo] = useState<{
    code: string;
    name: string;
    minimum_subtotal: number;
    applied: boolean;
    savings: number;
  } | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState(0);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [gateway, setGateway] = useState<string>("stripe");
  const [anet, setAnet] = useState<{ api_login_id: string; public_client_key: string; accept_js_url: string } | null>(null);
  // Saved cards (Authorize.net profiles from the customer's portal).
  // payCardId null = pay with a new card through Accept.js as before.
  const [savedCards, setSavedCards] = useState<{ id: string; brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null; isDefault: boolean }[]>([]);
  const [payCardId, setPayCardId] = useState<string | null>(null);

  const loadQuote = useCallback(
    async (addr: Address, cartLines: any[]) => {
      if (!cartLines.length) return;
      setQuoteBusy(true);
      try {
        const res = await fetch("/api/shipping/estimates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines: cartLines.map((l) => ({
              product_variant_id: l.product_variant_id,
              supplier_catalog_variant_id: l.supplier_catalog_variant_id,
              design_publication_id: l.design_publication_id,
              quantity: l.quantity,
              label: l.label,
            })),
            country: addr.country || "US",
            region: addr.state || undefined,
            postal_code: addr.postal_code || undefined,
            subtotal:
              Math.round(
                cartLines.reduce((n: number, l: any) => n + Number(l.unit_price ?? 0) * (l.quantity || 1), 0) * 100
              ) / 100,
          }),
        });
        if (!res.ok) throw new Error("Could not quote shipping for that destination.");
        const quote = await res.json();
        setPromo(quote.promo ?? null);
        setQuotePackages(quote.packages ?? []);
        setSelections((prev) => {
          const next: Record<string, string> = { ...prev };
          for (const pkg of quote.packages ?? []) {
            const k = String(pkg.index);
            if (!next[k] || !pkg.methods.some((m: any) => methodKey(m) === next[k])) {
              if (pkg.methods[0]) next[k] = methodKey(pkg.methods[0]);
            }
          }
          return next;
        });
      } catch (e: any) {
        setError(e.message);
      } finally {
        setQuoteBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    (async () => {
      try {
        const cfg = await fetch("/api/checkout/config").then((r) => r.json());
        if (cfg.publishable_key) setPublishableKey(cfg.publishable_key);
        if (cfg.gateway) setGateway(cfg.gateway);
        if (cfg.anet) setAnet(cfg.anet);

        const cart: any = await fetchCart(customerId);
        const detailLines = cart?.detail?.lines ?? [];
        setCartId(cart?.cart?.id ?? null);
        setLines(detailLines);
        setSubtotal(cart?.detail?.subtotal ?? 0);
        setMixed(cart?.detail?.mixed_supplier ?? null);
        if (detailLines.length) {
          trackBeginCheckout(
            detailLines.map((l: any) => ({
              item_id: String(l.product_id ?? l.supplier_catalog_product_id ?? l.id ?? ""),
              item_name: l.name ?? l.title ?? l.label ?? "Item",
              price: Number(l.unit_price ?? l.price ?? 0),
              quantity: l.quantity ?? 1,
            })),
            Number(cart?.detail?.subtotal ?? 0),
          );
        }

        // Saved cards for the payment step (signed-in only) — the
        // default card starts selected; "new card" is always a choice.
        if (customerId) {
          try {
            const cardsRes = await fetch("/api/customers/me/cards", { cache: "no-store" });
            if (cardsRes.ok) {
              const { cards } = await cardsRes.json();
              if (Array.isArray(cards) && cards.length) {
                setSavedCards(cards);
                setPayCardId(cards[0].id);
              }
            }
          } catch {
            // No saved cards — the new-card form is the only path.
          }
        }

        // Prefill from the customer's saved default address (signed-in only).
        if (customerId) {
          try {
            const addrRes = await fetch("/api/customers/me/addresses", { cache: "no-store" });
            if (addrRes.ok) {
              const { addresses } = await addrRes.json();
              const first = (addresses ?? [])[0];
              if (first) {
                setAddress((a) => ({
                  ...a,
                  name: [first.first_name, first.last_name].filter(Boolean).join(" ") || a.name,
                  line1: first.line1 ?? a.line1,
                  line2: first.line2 ?? "",
                  city: first.city ?? a.city,
                  state: first.state ?? "",
                  postal_code: first.postal_code ?? a.postal_code,
                  country: (first.country_code ?? first.country ?? "US").toUpperCase(),
                  phone: first.phone ?? a.phone,
                }));
              }
            }
          } catch {
            // addresses fetch failed (non-fatal) — guest proceeds with empty fields
          }
        }
        await loadQuote(
          {
            name: "", line1: "", line2: "", city: "", state: "",
            postal_code: "", country: "US", email, phone: "",
          },
          detailLines
        );
      } catch (e: any) {
        setError(e.message || "Could not load checkout.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const rawShippingTotal = useMemo(() => {
    let total = 0;
    for (const pkg of quotePackages) {
      const chosen = pkg.methods.find((m) => methodKey(m) === selections[String(pkg.index)]) ?? pkg.methods[0];
      if (chosen) total += chosen.cost;
    }
    return Math.round(total * 100) / 100;
  }, [quotePackages, selections]);
  // The smart-cart promo zeroes the shipping charge at the threshold.
  const shippingTotal = promo?.applied ? 0 : rawShippingTotal;

  async function placeOrder(nonce?: { data_descriptor: string; data_value: string }, cardId?: string) {
    if (!cartId) return;
    if (!address.name || !address.line1 || !address.city || !address.postal_code) {
      setError("Enter your name, street address, city, and postal code so we can ship your order.");
      return;
    }
    if (!address.email) {
      setError("Enter your email so we can send your receipt and order updates.");
      return;
    }
    if (!address.phone) {
      setError("Enter your phone number in case there's a delivery question.");
      return;
    }
    setPlacing(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart_id: cartId,
          shipping_address: address,
          shipping_selections: selections,
          payment_nonce: nonce ?? undefined,
          payment_card_id: cardId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Checkout failed (${res.status})`);
      if (data.paid && data.order_id) {
        // Authorize.net approved synchronously — straight to the
        // order status page.
        router.push(`/checkout/success?order_id=${data.order_id}`);
        return;
      }
      setClientSecret(data.client_secret ?? null);
      setOrderId(data.order_id);
      setOrderTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!lines.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <ShoppingBag className="h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-semibold">Nothing to check out yet</p>
          <p className="text-sm text-muted-foreground">Your bag is empty. Add a piece from the shop first.</p>
          <Button asChild>
            <Link href="/shop">Browse the shop <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {error && (
          <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
        )}
        {mixed && <MixedSupplierNotice title={mixed.title} body={mixed.body} />}

        <Card>
          <CardHeader>
            <CardTitle>1 · Shipping address</CardTitle>
            {!customerId && (
              <p className="text-sm text-muted-foreground">
                Checking out as a guest. {""}
                <Link href="/login?next=/checkout" className="underline">
                  Sign in
                </Link>{" "}
                to save your details for next time.
              </p>
            )}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="co-name">Full name *</Label>
              <Input id="co-name" value={address.name} onChange={(e) => setAddress({ ...address, name: e.target.value })} autoComplete="name" required />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="co-line1">Street address</Label>
              <Input id="co-line1" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} autoComplete="address-line1" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="co-line2">Apartment, suite (optional)</Label>
              <Input id="co-line2" value={address.line2} onChange={(e) => setAddress({ ...address, line2: e.target.value })} autoComplete="address-line2" />
            </div>
            <div>
              <Label htmlFor="co-city">City</Label>
              <Input id="co-city" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} autoComplete="address-level2" />
            </div>
            <div>
              <Label htmlFor="co-state">State / region</Label>
              <Input id="co-state" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} autoComplete="address-level1" />
            </div>
            <div>
              <Label htmlFor="co-zip">Postal code</Label>
              <Input
                id="co-zip"
                value={address.postal_code}
                onChange={(e) => setAddress({ ...address, postal_code: e.target.value })}
                onBlur={() => loadQuote(address, lines)}
                autoComplete="postal-code"
              />
            </div>
            <div>
              <Label htmlFor="co-country">Country (2-letter)</Label>
              <Input
                id="co-country"
                value={address.country}
                maxLength={2}
                onChange={(e) => setAddress({ ...address, country: e.target.value.toUpperCase() })}
                onBlur={() => loadQuote(address, lines)}
                autoComplete="country"
              />
            </div>
            <div>
              <Label htmlFor="co-email">Email for receipt *</Label>
              <Input id="co-email" type="email" value={address.email} onChange={(e) => setAddress({ ...address, email: e.target.value })} autoComplete="email" required />
            </div>
            <div>
              <Label htmlFor="co-phone">Phone *</Label>
              <Input id="co-phone" type="tel" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} autoComplete="tel" required />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" /> 2 · Delivery method
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {quoteBusy && <Skeleton className="h-16 w-full" />}
            {!quoteBusy && quotePackages.length === 0 && (
              <p className="text-sm text-muted-foreground">No shipping methods are available for this cart yet.</p>
            )}
            {quotePackages.map((pkg) => (
              <div key={pkg.index}>
                <p className="mb-2 text-sm font-medium">
                  Package {pkg.index + 1} — {pkg.label}
                  {pkg.item_count > 1 ? ` × ${pkg.item_count}` : ""}
                </p>
                {pkg.methods.length === 0 ? (
                  <p className="text-sm text-destructive">Shipping isn't available for this item yet.</p>
                ) : (
                  <RadioGroup
                    value={selections[String(pkg.index)] ?? methodKey(pkg.methods[0])}
                    onValueChange={(v) => setSelections((s) => ({ ...s, [String(pkg.index)]: v }))}
                  >
                    {pkg.methods.map((m) => (
                      <label
                        key={methodKey(m)}
                        className="flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3"
                      >
                        <RadioGroupItem value={methodKey(m)} />
                        <span className="flex-1 text-sm">{m.method_name}</span>
                        {m.min_days != null && (
                          <span className="text-xs text-muted-foreground">{m.min_days}–{m.max_days} business days</span>
                        )}
                        <span className="text-sm font-medium">{money(m.cost, m.currency)}</span>
                      </label>
                    ))}
                  </RadioGroup>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3 · Payment</CardTitle>
          </CardHeader>
          <CardContent>
            {gateway === "authorize_net" && anet && !clientSecret && savedCards.length > 0 && (
              <div className="mb-4 space-y-2">
                {savedCards.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3"
                  >
                    <input
                      type="radio"
                      name="pay-card"
                      checked={payCardId === c.id}
                      onChange={() => setPayCardId(c.id)}
                    />
                    <span className="flex-1 text-sm">
                      {(c.brand || "Card") + (c.last4 ? ` ···· ${c.last4}` : "")}
                      {c.isDefault ? " · Default" : ""}
                    </span>
                    {c.expMonth && c.expYear ? (
                      <span className="text-xs text-muted-foreground">
                        Expires {String(c.expMonth).padStart(2, "0")}/{c.expYear}
                      </span>
                    ) : null}
                  </label>
                ))}
                <label className="flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3">
                  <input
                    type="radio"
                    name="pay-card"
                    checked={payCardId === null}
                    onChange={() => setPayCardId(null)}
                  />
                  <span className="flex-1 text-sm">Use a new card</span>
                </label>
                {payCardId && (
                  <Button
                    className="w-full"
                    size="lg"
                    style={primaryCtaStyle}
                    onClick={() => placeOrder(undefined, payCardId)}
                    disabled={placing}
                  >
                    {placing ? "Placing your order…" : `Pay — ${money(subtotal + shippingTotal)}`}
                  </Button>
                )}
              </div>
            )}
            {gateway === "authorize_net" && anet && !clientSecret && payCardId === null && (
              <AnetPaymentStep
                anet={anet}
                total={subtotal + shippingTotal}
                placing={placing}
                onNonce={(nonce) => placeOrder(nonce)}
              />
            )}
            {gateway !== "authorize_net" && !clientSecret && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Review your address and delivery choices, then continue to secure
                  card payment. Your order is created first; fulfillment only
                  starts after Stripe confirms payment.
                </p>
                <Button className="w-full" size="lg" style={primaryCtaStyle} onClick={() => placeOrder()} disabled={placing || !stripePromise}>
                  {placing ? "Preparing secure payment…" : `Continue to payment — ${money(subtotal + shippingTotal)}`}
                </Button>
              </div>
            )}
            {clientSecret && orderId && stripePromise && (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <PaymentStep clientSecret={clientSecret} orderId={orderId} total={orderTotal} />
              </Elements>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Order summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center gap-3">
              {l.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.image_url} alt="" className="h-12 w-12 shrink-0 rounded-md border object-cover" />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-md border bg-muted" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{l.label}</span>
                <span className="text-xs text-muted-foreground">
                  Qty {l.quantity}
                  {l.design_publication_id ? " · Custom design" : ""}
                </span>
              </span>
              <span className="font-medium">{money(Number(l.unit_price ?? 0) * l.quantity)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-3">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Shipping</span>
            <span>{promo?.applied ? "FREE" : money(shippingTotal)}</span>
          </div>
          {promo?.applied ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
              {promo.code} applied — you're saving {money(rawShippingTotal)} on shipping.
            </p>
          ) : promo ? (
            <p className="text-xs text-muted-foreground">
              Add {money(Math.max(0, promo.minimum_subtotal - subtotal))} more for free
              shipping with {promo.code}.
            </p>
          ) : null}
          <div className="flex justify-between border-t pt-3 text-base font-semibold">
            <span>Total</span>
            <span>{money(clientSecret ? orderTotal : subtotal + shippingTotal)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

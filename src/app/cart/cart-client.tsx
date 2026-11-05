"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MixedSupplierNotice } from "@/components/commerce/mixed-supplier-notice";
import { primaryCtaStyle } from "@/components/commerce/cta-style";
import {
  fetchCart,
  fetchCurrentCustomerId,
  updateCartItemQuantity,
  removeCartItem,
} from "@/lib/commerce/cart-client";
import { useStore } from "@/lib/store";

type DetailLine = {
  id: string;
  label: string;
  quantity: number;
  unit_price: number | null;
  image_url: string | null;
  design_publication_id: string | null;
};

type CartDetail = {
  cart: { id: string } | null;
  detail: {
    lines: DetailLine[];
    subtotal: number;
    mixed_supplier: {
      title: string;
      body: string;
      package_count: number;
      packages: { index: number; label: string }[];
    } | null;
  };
};

type Quote = {
  promo: {
    code: string;
    name: string;
    minimum_subtotal: number;
    applied: boolean;
    savings: number;
  } | null;
  packages: {
    index: number;
    label: string;
    item_count: number;
    methods: { method_name: string; cost: number; currency: string; min_days: number | null; max_days: number | null }[];
  }[];
  cheapest_total: number;
  currency: string;
};

const money = (n: number, c = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(n);

export function CartClient() {
  // The header bag badge lives in the shared store and only re-syncs
  // on shell mount / adds — quantity changes and removals here must
  // recount it, or the badge keeps showing the pre-edit count.
  const syncCartCount = useStore((s) => s.syncCartCount);
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [data, setData] = useState<CartDetail | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cid = await fetchCurrentCustomerId();
      setCustomerId(cid);
      const cart: any = await fetchCart(cid);
      setData(cart);
      const lines = (cart?.detail?.lines ?? []).map((l: any) => ({
        product_variant_id: l.product_variant_id,
        supplier_catalog_variant_id: l.supplier_catalog_variant_id,
        design_publication_id: l.design_publication_id,
        quantity: l.quantity,
        label: l.label,
      }));
      if (lines.length) {
        const res = await fetch("/api/shipping/estimates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines, country: "US", subtotal: cart?.detail?.subtotal ?? undefined }),
        });
        if (res.ok) setQuote(await res.json());
      } else {
        setQuote(null);
      }
    } catch (e: any) {
      setError(e.message || "Could not load your bag.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeQty(item: DetailLine, qty: number) {
    if (qty < 1) return;
    setBusyId(item.id);
    try {
      await updateCartItemQuantity(item.id, qty);
      await load();
      void syncCartCount();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: DetailLine) {
    setBusyId(item.id);
    try {
      await removeCartItem(item.id);
      await load();
      void syncCartCount();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const lines = data?.detail?.lines ?? [];
  if (!lines.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <ShoppingBag className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-lg font-semibold">Your bag is empty</p>
            <p className="text-sm text-muted-foreground">
              Pieces you add from the shop will appear here, ready for checkout.
            </p>
          </div>
          <Button asChild>
            <Link href="/shop" style={{ color: "#ffffff" }}>
              Browse the shop <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const subtotal = data?.detail?.subtotal ?? 0;
  const mixed = data?.detail?.mixed_supplier;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {error && (
          <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
        )}
        {mixed && <MixedSupplierNotice title={mixed.title} body={mixed.body} />}
        <Card>
          <CardHeader>
            <CardTitle>Items ({lines.reduce((n, l) => n + l.quantity, 0)})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {lines.map((l) => (
              <div key={l.id} className="flex items-center gap-4 py-4">
                {l.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.image_url}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-md border object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 shrink-0 rounded-md border bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.label}</p>
                  {l.design_publication_id ? (
                    <p className="text-sm text-muted-foreground">Custom design</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={busyId === l.id}
                    onClick={() => changeQty(l, l.quantity - 1)}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center text-sm font-medium">{l.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={busyId === l.id}
                    onClick={() => changeQty(l, l.quantity + 1)}
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="w-24 text-right font-medium">
                  {money(Number(l.unit_price ?? 0) * l.quantity)}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busyId === l.id}
                  onClick={() => remove(l)}
                  aria-label="Remove item"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{money(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Truck className="h-4 w-4" /> Shipping
            </span>
            <span className="font-medium">
              {quote?.promo?.applied
                ? "FREE"
                : quote
                  ? `from ${money(quote.cheapest_total, quote.currency)}`
                  : "Calculated at checkout"}
            </span>
          </div>
          {quote?.promo?.applied ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
              {quote.promo.code} applied — {quote.promo.name}. You're saving{" "}
              {money(quote.promo.savings, quote.currency)} on shipping.
            </p>
          ) : quote?.promo ? (
            <p className="text-xs text-muted-foreground">
              Add {money(Math.max(0, quote.promo.minimum_subtotal - subtotal), quote.currency)} more
              for free shipping with {quote.promo.code}.
            </p>
          ) : null}
          {quote?.packages.map((pkg) => (
            <p key={pkg.index} className="text-xs text-muted-foreground">
              Package {pkg.index + 1} — {pkg.label}:{" "}
              {pkg.methods.length
                ? pkg.methods
                    .map(
                      (m) =>
                        `${m.method_name} ${money(m.cost, m.currency)}${m.min_days ? ` (${m.min_days}–${m.max_days} days)` : ""}`
                    )
                    .join(" · ")
                : "shipping not available yet"}
            </p>
          ))}
          <div className="border-t pt-3">
            <Button asChild className="w-full" size="lg" style={primaryCtaStyle}>
              <Link href="/checkout">
                Proceed to checkout
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            {!customerId && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Guest checkout available — your bag is saved and ready.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

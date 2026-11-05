"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock, Package, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trackPurchase } from "@/lib/analytics-events";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export function SuccessClient() {
  const params = useSearchParams();
  const orderId = params.get("order_id");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const tries = useRef(0);

  useEffect(() => {
    if (!orderId) {
      setError("No order id in the URL.");
      return;
    }
    let stop = false;
    async function poll() {
      try {
        const res = await fetch(`/api/checkout/${orderId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Order lookup failed (${res.status})`);
        const json = await res.json();
        if (stop) return;
        setData(json);
        // Fire the purchase event once per order, only on a confirmed
        // payment — the success page polls until confirmation lands.
        if (json.order?.payment_confirmed && json.order?.id) {
          const key = `unsaid-purchase-tracked:${json.order.id}`;
          try {
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, "1");
              trackPurchase(
                String(json.order.id),
                Number(json.order.total ?? 0),
                (json.items ?? []).map((i: any) => ({
                  item_id: String(i.id),
                  item_name: i.label ?? "Item",
                  price: Number(i.unit_price ?? 0),
                  quantity: i.quantity ?? 1,
                })),
              );
            }
          } catch {
            /* storage unavailable — the ref-free guard simply skips */
          }
        }
        const status = json.order?.status;
        if (
          !json.order?.payment_confirmed &&
          status !== "payment_failed" &&
          tries.current < 40
        ) {
          tries.current += 1;
          setTimeout(poll, 3000);
        }
      } catch (e: any) {
        if (!stop) setError(e.message);
      }
    }
    poll();
    return () => {
      stop = true;
    };
  }, [orderId]);

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <p className="font-medium">We could not load this order.</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Loading your order…
        </CardContent>
      </Card>
    );
  }

  const { order, items, fulfillment } = data;
  const failed = order.status === "payment_failed";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {order.payment_confirmed ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" /> Payment confirmed
              </>
            ) : failed ? (
              <>
                <XCircle className="h-5 w-5 text-destructive" /> Payment failed
              </>
            ) : (
              <>
                <Clock className="h-5 w-5 text-amber-500" /> Confirming your payment…
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Order <span className="font-mono">{order.id}</span> ·{" "}
            {new Date(order.created_at).toLocaleString()}
          </p>
          {failed ? (
            <p>
              Stripe reported this payment as failed, so nothing was charged and
              no fulfillment was started. You can return to the shop and check
              out again with a different card.
            </p>
          ) : order.payment_confirmed ? (
            <p>
              Your payment is confirmed. Each supplier below now prepares its
              part of your order — custom designs are produced from the exact
              print file saved with your order.
            </p>
          ) : (
            <p>
              Stripe is finalizing your payment. This page updates itself —
              fulfillment starts automatically the moment payment confirms.
            </p>
          )}
          <div className="divide-y border-t">
            {(items ?? []).map((i: any) => (
              <div key={i.id} className="flex justify-between py-3">
                <span>
                  {i.label ?? "Item"} × {i.quantity}
                  {i.design_publication_id ? (
                    <span className="block text-xs text-muted-foreground">
                      Custom design · publication {String(i.design_publication_id).slice(0, 8)}…
                    </span>
                  ) : null}
                </span>
                <span className="font-medium">{money(Number(i.unit_price) * i.quantity)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Total</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span>{order.shipping_cost != null ? money(Number(order.shipping_cost)) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Method</span>
              <span className="text-right">{order.shipping_method ?? "—"}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Order total</span>
              <span>{money(Number(order.total))}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" /> Fulfillment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(fulfillment ?? []).length === 0 && (
              <p className="text-muted-foreground">
                {order.payment_confirmed
                  ? "Supplier assignments are being prepared."
                  : "Starts as soon as payment confirms."}
              </p>
            )}
            {(fulfillment ?? []).map((f: any) => (
              <div key={f.id} className="rounded-md border px-4 py-3">
                <p className="font-medium">{f.supplier_name ?? "Supplier"} shipment · {f.status}</p>
                {f.tracking_number ? (
                  <p className="text-muted-foreground">
                    Tracking:{" "}
                    {f.tracking_url ? (
                      <a className="underline" href={f.tracking_url} target="_blank" rel="noreferrer">
                        {f.tracking_number}
                      </a>
                    ) : (
                      f.tracking_number
                    )}
                  </p>
                ) : (
                  <p className="text-muted-foreground">Tracking appears here when it ships.</p>
                )}
              </div>
            ))}
            <Button asChild variant="outline" className="w-full">
              <Link href="/account#orders">
                View in your account <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

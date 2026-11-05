"use client";

import { useState } from "react";
import Link from "next/link";
import { addToCart, fetchCurrentCustomerId } from "@/lib/commerce/cart-client";
import { useStore } from "@/lib/store";

// The order card from Sunny's account mockup: order id + placed date,
// status pill, the Ordered → Made → Shipped → Delivered step tracker,
// the tracking line, and item rows with their real actions. Supplier
// identity is NEVER shown to the customer (his shipping doctrine) —
// shipment rows render carrier tracking only.
//
// Progress derives from the fulfillment record the API returns:
// orders.status for Ordered, fulfillment existence for Made, a
// shipment with tracking (or shipped_at) for Shipped, a delivered
// shipment for Delivered. No step is ever claimed from nothing.

export type AccountOrder = any;

export function fmtDay(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function allShipments(order: AccountOrder): any[] {
  return [
    ...((order?.shipments as any[]) || []),
    ...((order?.erp_shipments as any[]) || []),
  ];
}

export function isDelivered(order: AccountOrder): boolean {
  return allShipments(order).some(
    (s) => s.status === "delivered" || Boolean(s.delivered_at)
  );
}

export function orderProgress(order: AccountOrder) {
  const shipments = allShipments(order);
  const delivered = isDelivered(order);
  const shipped =
    delivered ||
    shipments.some(
      (s) => Boolean(s.tracking_number) || s.status === "shipped" || Boolean(s.shipped_at)
    );
  const fulfillments = [
    ...((order?.shipments as any[]) || []),
    ...((order?.erp_fulfillments as any[]) || []),
  ];
  const made =
    shipped ||
    fulfillments.some((f) => ["submitted", "shipped", "delivered"].includes(f.status)) ||
    (order?.erp_fulfillments ?? []).length > 0;
  const pendingPayment = order?.status === "pending_payment";
  const step = delivered ? 3 : shipped ? 2 : made ? 1 : 0;
  const state = pendingPayment
    ? { label: "Payment pending", cls: "bad", note: "" }
    : delivered
      ? {
          label: "Delivered",
          cls: "ok",
          note: `Delivered ${fmtDay(shipments.find((s) => s.delivered_at)?.delivered_at)}`,
        }
      : shipped
        ? {
            label: "Shipped",
            cls: "warn",
            note: `Shipped ${fmtDay(shipments.find((s) => s.shipped_at)?.shipped_at)}`,
          }
        : made
          ? { label: "Being made", cls: "warn", note: "Made to order — in production" }
          : { label: "Ordered", cls: "warn", note: "Order received" };
  return { step, state, shipments, delivered, shipped };
}

export function Thumb({ src, name, big }: { src?: string | null; name?: string | null; big?: boolean }) {
  return (
    <div className="ua-th" aria-hidden="true">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" />
      ) : (
        <span className="init">{(name || "U").trim().charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

export function OrderCard({
  order,
  full = false,
  onToast,
}: {
  order: AccountOrder;
  full?: boolean;
  onToast?: (msg: string) => void;
}) {
  const { step, state, shipments, delivered } = orderProgress(order);
  const [busy, setBusy] = useState(false);
  const syncCartCount = useStore((s) => s.syncCartCount);
  const trackingShipments = shipments.filter((s) => s.tracking_number);
  const steps = ["Ordered", "Made", "Shipped", "Delivered"];

  async function reorder() {
    const items = (order.items || []).filter((i: any) => i.catalog_product_id);
    if (!items.length) return;
    setBusy(true);
    try {
      const customerId = await fetchCurrentCustomerId();
      for (const i of items) {
        await addToCart({
          customerId,
          supplier_catalog_product_id: String(i.catalog_product_id),
          quantity: Number(i.quantity) || 1,
          size: i.size || null,
        });
      }
      await syncCartCount();
      onToast?.("Added to your bag");
    } catch (e: any) {
      onToast?.(e?.message || "Could not add those items — open the product to choose its options.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ua-order">
      <div className="ua-oh">
        <div>
          <span className="id">Order {order.order_number ?? String(order.id).slice(0, 8)}</span>{" "}
          <span className="ua-mut">placed {fmtDay(order.created_at)}</span>
        </div>
        <div>
          <span className={`ua-pillst ${state.cls}`}>{state.label}</span>{" "}
          {state.note && <span className="ua-mut">{state.note}</span>}
        </div>
      </div>
      <div className="ua-steps">
        {steps.map((s, i) => (
          <div
            key={s}
            className={`ua-st${i <= step ? " done" : ""}${i === step ? " now" : ""}`}
          >
            {s}
          </div>
        ))}
      </div>
      {trackingShipments.map((s, idx) => (
        <div key={s.id ?? idx} className="ua-mut" style={{ margin: "-8px 0 8px" }}>
          Tracking{" "}
          {s.tracking_url ? (
            <a href={s.tracking_url} target="_blank" rel="noreferrer">
              {s.tracking_number}
            </a>
          ) : (
            s.tracking_number
          )}
        </div>
      ))}
      {(order.items || []).map((item: any) => {
        const variant = [item.color, item.size].filter(Boolean).join(", ");
        return (
          <div className="ua-item" key={item.id}>
            <Thumb src={item.image_url} name={item.product_name} />
            <div className="nm">
              <div>{item.product_name ?? "Item"}</div>
              <div className="ua-mut">
                {[variant, item.quantity > 1 ? `Qty ${item.quantity}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <div className="ua-row">
              {delivered && item.catalog_product_id ? (
                <Link className="ua-btn ghost sm" href={`/product/${item.catalog_product_id}#reviews`}>
                  Write a review
                </Link>
              ) : trackingShipments.length ? (
                <a
                  className="ua-btn ghost sm"
                  href={trackingShipments[0].tracking_url || "#"}
                  target={trackingShipments[0].tracking_url ? "_blank" : undefined}
                  rel="noreferrer"
                >
                  Track
                </a>
              ) : null}
              {full && item.catalog_product_id && (
                <button className="ua-btn ghost sm" onClick={reorder} disabled={busy}>
                  Reorder
                </button>
              )}
              {full && !item.catalog_product_id && item.product_slug && (
                <Link className="ua-btn ghost sm" href={`/product/${item.product_slug}`}>
                  Reorder
                </Link>
              )}
              {full && (
                <Link className="ua-btn ghost sm" href="/account/help">
                  Return
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

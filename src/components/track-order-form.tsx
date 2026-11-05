"use client";

import { useState } from "react";

/**
 * TrackOrderForm — the live lookup on /track-order. Posts the order
 * reference + checkout email to /api/track-order and renders the
 * order's status and shipments. A wrong reference and a wrong email
 * produce the same gentle not-found message (no enumeration).
 */

interface TrackResult {
  found: boolean;
  order?: { reference: string; status: string; placedAt: string; total: number };
  erpStatus?: string | null;
  shipments?: {
    supplier: string;
    status: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
  }[];
  warehouseShipments?: {
    shipmentNumber: string | null;
    status: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
  }[];
}

const ORDER_STATUS: Record<string, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid — being made for you",
  fulfilled: "Fulfilled",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  payment_failed: "Payment didn’t go through",
  refunded: "Refunded",
};

const SHIPMENT_STATUS: Record<string, string> = {
  draft: "Being prepared",
  submitted: "With the maker",
  in_production: "Being made",
  shipped: "Shipped",
  delivered: "Delivered",
  failed: "There’s a problem — please contact us",
  cancelled: "Cancelled",
};

export function TrackOrderForm() {
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/track-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, email }),
      });
      const data = (await res.json().catch(() => null)) as TrackResult | { error?: string } | null;
      if (!res.ok) {
        setError(
          (data as { error?: string } | null)?.error ??
            "Something went wrong looking that up. Please try again.",
        );
      } else {
        setResult(data as TrackResult);
      }
    } catch {
      setError("Something went wrong looking that up. Please try again.");
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="brand-section-head">
        <div>
          <div className="eyebrow">ORDER LOOKUP</div>
          <h2>See where your order stands.</h2>
        </div>
        <p>
          Use the order reference from your confirmation (it looks like UNS-…) and the email
          address you used at checkout.
        </p>
      </div>

      <form className="brand-form" onSubmit={submit}>
        <div className="brand-form-row">
          <label>
            Order reference
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UNS-…"
              autoComplete="off"
              required
            />
          </label>
          <label>
            Email used at checkout
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>
        </div>
        {error && <p className="brand-form-error">{error}</p>}
        <div>
          <button className="button button-dark" type="submit" disabled={busy}>
            {busy ? "Looking…" : "Track my order"} <span aria-hidden="true">↗</span>
          </button>
        </div>
      </form>

      {result && !result.found && (
        <div className="track-result" style={{ marginTop: 26 }} role="status">
          <h3>We couldn’t find that order.</h3>
          <p>
            Check the reference on your confirmation and the email you used at checkout — they
            have to match the order exactly. If they look right and it still isn’t found, contact
            us with the reference and we’ll look from our side.
          </p>
        </div>
      )}

      {result?.found && result.order && (
        <div className="track-result" style={{ marginTop: 26 }} role="status">
          <h3>Order {result.order.reference}</h3>
          <p>
            Status: <b>{ORDER_STATUS[result.order.status] ?? result.order.status}</b>
            {" · "}Placed{" "}
            {new Date(result.order.placedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {" · "}${result.order.total.toFixed(2)}
          </p>
          {(result.shipments?.length ?? 0) > 0 || (result.warehouseShipments?.length ?? 0) > 0 ? (
            <>
              {(result.shipments ?? []).map((s, i) => (
                <div className="track-shipment" key={i}>
                  <b>
                    {s.supplier}: {SHIPMENT_STATUS[s.status] ?? s.status}
                  </b>
                  {s.trackingNumber && (
                    <p>
                      Tracking number:{" "}
                      {s.trackingUrl ? (
                        <a href={s.trackingUrl} target="_blank" rel="noreferrer">
                          {s.trackingNumber}
                        </a>
                      ) : (
                        s.trackingNumber
                      )}
                    </p>
                  )}
                </div>
              ))}
              {(result.warehouseShipments ?? []).map((s, i) => (
                <div className="track-shipment" key={`warehouse-${i}`}>
                  <b>
                    Warehouse shipment{s.shipmentNumber ? ` ${s.shipmentNumber}` : ""}:{" "}
                    {SHIPMENT_STATUS[s.status] ?? s.status}
                  </b>
                  {s.trackingNumber && (
                    <p>
                      Tracking number:{" "}
                      {s.trackingUrl ? (
                        <a href={s.trackingUrl} target="_blank" rel="noreferrer">
                          {s.trackingNumber}
                        </a>
                      ) : (
                        s.trackingNumber
                      )}
                    </p>
                  )}
                  {s.shippedAt && (
                    <p>
                      Shipped{" "}
                      {new Date(s.shippedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  )}
                </div>
              ))}
            </>
          ) : (
            <p>
              Your pieces are made to order first — once they ship, the tracking will appear here
              and in your inbox.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

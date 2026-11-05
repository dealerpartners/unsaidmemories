"use client";

import { useEffect, useState } from "react";

type Provider = "shippo" | "usps";

type ShippingConfig = {
  defaultProvider: Provider;
  shippo: { configured: boolean; testMode: boolean };
  usps: { configured: boolean; canBuyReal: boolean };
};

type LabelResult = {
  labelUrl?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  provider?: string;
  service?: string;
  rateCents?: number;
  testMode?: boolean;
  simulated?: boolean;
  labelProvider?: Provider;
};

export default function ShippingLabelModal({
  orderId,
  orderLabel,
  onClose,
  onLabelPurchased,
  existingTracking,
}: {
  orderId: string;
  orderLabel: string;
  onClose: () => void;
  onLabelPurchased?: () => void;
  // Set when the order already carries a label (from data the calling page
  // already loaded) so staff see it before deciding to buy another.
  existingTracking?: { carrier?: string | null; trackingNumber: string } | null;
}) {
  const [config, setConfig] = useState<ShippingConfig | null>(null);
  const [provider, setProvider] = useState<Provider>("shippo");
  const [weightLb, setWeightLb] = useState(2);
  const [result, setResult] = useState<LabelResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);

  // Load the admin-configured default carrier + configuration state.
  useEffect(() => {
    fetch("/api/admin/settings/shipping")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.ok) {
          setConfig(j as ShippingConfig);
          if (j.defaultProvider === "usps" || j.defaultProvider === "shippo") setProvider(j.defaultProvider);
        }
      })
      .catch(() => {});
  }, []);

  const buy = async () => {
    setError(null);
    setMessage(null);
    setResult(null);
    setBuying(true);
    try {
      // Order-screen label endpoint: buys a REAL label with the order's own
      // return address and saves the tracking to the order. A failed or
      // unavailable purchase saves nothing and returns the honest reason.
      const res = await fetch(`/api/admin/orders/${orderId}/label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider, weight_lb: weightLb,
          // Deliberate re-buy: this modal was opened on an order that
          // already carries a label (the warning banner above is showing),
          // and the endpoint's double-buy guard requires the explicit
          // replace flag. Orders without a label never send it.
          ...(existingTracking ? { replace: true } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        setResult(j.label || {});
        onLabelPurchased?.();
      } else {
        setError(j.message || j.error || "Label purchase failed.");
      }
    } catch (e: any) {
      setError(e?.message || "Label purchase failed.");
    } finally {
      setBuying(false);
    }
  };

  const shippoConfigured = config?.shippo.configured ?? true;
  const uspsReal = config?.usps.canBuyReal ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1">Buy Shipping Label</h3>
        <p className="text-sm text-muted-foreground mb-4">Order {orderLabel}</p>

        {existingTracking && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
            This order already has a label — {existingTracking.carrier || "carrier"}:{" "}
            <span className="font-mono">{existingTracking.trackingNumber}</span>. Buying again purchases a
            second label and replaces the tracking on the order.
          </p>
        )}

        {/* Carrier switcher — Shippo vs direct USPS */}
        <label className="text-xs font-semibold uppercase tracking-wider">Carrier</label>
        <div className="grid grid-cols-2 gap-2 mt-1 mb-4">
          {(["shippo", "usps"] as Provider[]).map((p) => (
            <button
              key={p}
              onClick={() => { setProvider(p); setResult(null); setError(null); setMessage(null); }}
              className={`px-3 py-2 text-sm font-medium rounded border ${
                provider === p
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {p === "shippo" ? "Shippo" : "USPS (direct)"}
            </button>
          ))}
        </div>

        {provider === "usps" && config && !uspsReal && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
            USPS API credentials are incomplete — USPS labels can&rsquo;t be purchased until the EPS payment
            account is configured in Admin → Settings → Shipping. Nothing fake will be generated instead.
          </p>
        )}
        {provider === "shippo" && config && !shippoConfigured && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
            No Shippo API key configured — set one in Admin → Settings → Shipping.
          </p>
        )}

        <label className="text-xs font-semibold uppercase tracking-wider">Package weight (lb)</label>
        <input
          type="number" min={0.1} step={0.1} value={weightLb}
          onChange={(e) => setWeightLb(Math.max(0.1, Number(e.target.value) || 0.1))}
          className="w-full mt-1 mb-4 border border-border rounded p-2 text-sm bg-background"
        />

        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
        {message && <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">{message}</p>}

        {result && (
          <div className="border border-border rounded p-3 mb-4 text-sm space-y-1">
            {result.simulated && (
              <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                SIMULATED — NOT A REAL LABEL
              </span>
            )}
            {result.testMode && !result.simulated && (
              <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded bg-brand-teal/10 text-brand-teal dark:bg-brand-teal/20 dark:text-brand-teal">
                TEST MODE — NOT A REAL LABEL
              </span>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Carrier</span><span className="font-medium">{result.provider} {result.service}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tracking</span><span className="font-mono text-xs">{result.trackingNumber}</span></div>
            {typeof result.rateCents === "number" && (
              <div className="flex justify-between"><span className="text-muted-foreground">Cost</span><span className="font-medium">${(result.rateCents / 100).toFixed(2)}</span></div>
            )}
            {result.labelUrl && (
              <a href={`/api/admin/orders/${orderId}/label-print?tracking=${encodeURIComponent(result.trackingNumber || '')}`} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-primary underline text-sm">
                Print carrier label
              </a>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded hover:bg-muted">Close</button>
          <button
            onClick={buy}
            disabled={buying}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
          >
            {buying ? "Purchasing…" : result ? "Buy again" : `Buy ${provider === "usps" ? "USPS" : "Shippo"} label`}
          </button>
        </div>
      </div>
    </div>
  );
}

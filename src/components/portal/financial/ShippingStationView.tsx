'use client';

import React, { useEffect, useState } from 'react';
import { Printer, CheckCircle2, AlertTriangle } from 'lucide-react';
import { DawgNavSection } from '@/lib/types';
import { useShippingRates } from '@/hooks/admin/useActions';
import ShippingLabelModal from '@/components/portal/ShippingLabelModal';
import { parseShipTo } from '@/lib/orders/lifecycle';

interface ShippingStationViewProps {
  onNavigateSection?: (section: DawgNavSection) => void;
}

type ReadyOrder = {
  id: string;
  order_number?: string;
  customer_name?: string | null;
  shipping_address?: string | null;
  total_amount?: number;
  fulfillment_status?: string;
};

type Rate = {
  provider: string;
  service: string;
  cents: number;
  days: number | null;
};

export const ShippingStationView: React.FC<ShippingStationViewProps> = ({ onNavigateSection }) => {
  const [orders, setOrders] = useState<ReadyOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [weight, setWeight] = useState(1.5);
  const [rates, setRates] = useState<Rate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [selectedRate, setSelectedRate] = useState(0);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const ratesMutation = useShippingRates();

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || null;

  // Load real ready-to-ship orders
  useEffect(() => {
    fetch('/api/admin/orders?limit=100')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        const rows = (j.data || j.orders || []) as any[];
        // Ready-to-ship: paid/confirmed but not yet shipped. ONLY these
        // belong on a dispatch station — the old fallback listed the
        // first 20 orders of ANY status (drafts, already-shipped) as
        // dispatch candidates when nothing was ready, which mislabels
        // orders the buy path then has to refuse.
        const ready = rows.filter((r) =>
          ['paid', 'confirmed', 'ready_to_ship', 'processing'].includes(String(r.fulfillment_status || r.status || '').toLowerCase())
        );
        setOrders(ready);
        if (ready.length) setSelectedOrderId(ready[0].id);
      })
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false));
  }, []);

  // Fetch REAL carrier rates when order or weight changes
  useEffect(() => {
    if (!selectedOrderId) {
      setRates([]);
      return;
    }
    setRatesLoading(true);
    setRatesError(null);
    ratesMutation.mutate(
      { order_id: selectedOrderId, weight_lb: weight },
      {
        onSuccess: (res: any) => {
          setRates(res?.rates || []);
          setSelectedRate(0);
          setRatesLoading(false);
        },
        onError: (e: any) => {
          setRatesError(e?.message || 'Could not load rates.');
          setRates([]);
          setRatesLoading(false);
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrderId, weight]);

  // Ship-to summary — parsed with the SAME helper the label purchase uses,
  // so the plain "street · City, ST ZIP" strings most orders carry display
  // in full (the old JSON-only parse silently blanked them). This panel is
  // order data beside the buy action — the printable label itself is the
  // carrier-issued file from the purchase flow, never drawn here.
  const shipTo = (() => {
    const parsed = parseShipTo(selectedOrder?.shipping_address ?? null, selectedOrder?.customer_name || 'Customer');
    if (parsed) {
      return { name: parsed.name, street: parsed.street1, city: parsed.city, state: parsed.state, zip: parsed.zip };
    }
    // Display-only fallback: a stored JSON address without a ZIP can't buy
    // a label (parseShipTo refuses it), but its city/state can still be
    // shown here as data — the ZIP stays blank and the panel says so.
    try {
      const a = JSON.parse(selectedOrder?.shipping_address || '{}');
      if (a && typeof a === 'object') {
        return { name: a.name || selectedOrder?.customer_name || '—', street: a.street1 || a.address1 || '', city: a.city || '', state: a.state || '', zip: '' };
      }
    } catch { /* not JSON — fall through to blanks */ }
    return { name: selectedOrder?.customer_name || '—', street: '', city: '', state: '', zip: '' };
  })();

  const currentRate = rates[selectedRate] || null;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto text-foreground bg-card min-h-full">
      <div className="border border-border bg-card p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-3">
          <div>
            <h1 className="text-2xl font-semibold uppercase tracking-tight text-foreground mt-1">
              Shipping &amp; Label Printing Station
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Real carrier rates and label purchase via Shippo or direct USPS.
            </p>
          </div>
          <button
            onClick={() => onNavigateSection?.('orders')}
            className="px-3 py-1.5 border border-border bg-card hover:bg-accent/50 font-semibold uppercase text-[13px] cursor-pointer"
          >
            Back to Orders
          </button>
        </div>

        <div className="mt-3 flex flex-col sm:flex-row items-center gap-3 text-[13px]">
          <span className="font-semibold text-foreground">DISPATCH:</span>
          {ordersLoading ? (
            <span className="text-muted-foreground">Loading orders…</span>
          ) : orders.length === 0 ? (
            <span className="text-muted-foreground">No orders ready to ship.</span>
          ) : (
            <select
              value={selectedOrderId}
              onChange={(e) => setSelectedOrderId(e.target.value)}
              className="h-8 px-2 border border-border bg-card font-semibold cursor-pointer w-full sm:w-96"
            >
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number || o.id.slice(0, 8)} — {o.customer_name || 'Customer'}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 space-y-6">
          {/* Destination — real order data */}
          <div className="border border-border bg-card p-4 space-y-2 text-[13px]">
            <div className="border-b border-border pb-2">
              <span className="font-semibold uppercase text-[10px] text-muted-foreground">Ship To</span>
            </div>
            <p className="font-semibold text-sm uppercase text-foreground">{shipTo.name}</p>
            <p className="text-foreground">
              {shipTo.street && <>{shipTo.street}<br /></>}
              {shipTo.city} {shipTo.state} {shipTo.zip}
              {!shipTo.zip && <span className="text-muted-foreground"> — no address on file</span>}
            </p>
          </div>

          {/* Weight */}
          <div className="border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2 text-[12px]">
              <span className="font-semibold uppercase text-[10px] text-muted-foreground">Package Weight</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={weight}
                onChange={(e) => setWeight(Math.max(0.1, Number(e.target.value) || 0.1))}
                className="border border-border rounded px-3 py-2 text-lg font-semibold w-28"
              />
              <span className="text-sm text-muted-foreground">lbs</span>
            </div>
          </div>

          {/* Real carrier rates */}
          <div className="border border-border bg-card p-4 space-y-3">
            <div className="border-b border-border pb-2 text-[12px]">
              <span className="font-semibold uppercase text-[10px] text-muted-foreground">Live Carrier Rates</span>
            </div>
            {ratesLoading ? (
              <p className="text-[13px] text-muted-foreground">Loading rates…</p>
            ) : ratesError ? (
              <div className="p-4 border border-amber-300 bg-amber-50 text-[13px] flex items-start gap-2">
                <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-800">Rates unavailable</p>
                  <p className="text-amber-700 mt-1">{ratesError}</p>
                  <p className="text-amber-700 mt-1">Configure a Shippo API key in Admin → Settings → Shipping.</p>
                </div>
              </div>
            ) : rates.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No rates yet — select an order with a shipping address.</p>
            ) : (
              <div className="space-y-2">
                {rates.map((r, i) => (
                  <div
                    key={`${r.provider}-${r.service}-${i}`}
                    onClick={() => setSelectedRate(i)}
                    className={`border p-3 flex items-center justify-between cursor-pointer transition-all ${
                      selectedRate === i ? 'border-foreground bg-muted/30' : 'border-border bg-background hover:bg-accent/50'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <span className="font-semibold text-[13px] uppercase text-foreground">{r.provider} {r.service}</span>
                      {r.days != null && <p className="text-[11px] text-muted-foreground">Est. {r.days} days</p>}
                    </div>
                    <p className="text-base font-semibold text-foreground">${(r.cents / 100).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => selectedOrderId && setShowLabelModal(true)}
              disabled={!selectedOrderId}
              className="w-full h-12 bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 font-semibold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-40"
            >
              <Printer className="w-4 h-4" />
              <span>Buy &amp; Print Label{currentRate ? ` ($${(currentRate.cents / 100).toFixed(2)})` : ''}</span>
            </button>
          </div>
        </div>

        {/* Right: result / confirmation */}
        <div className="lg:col-span-6 space-y-4">
          <div className="border border-border bg-card p-5 text-[13px] space-y-3">
            <p className="font-semibold uppercase text-[10px] text-muted-foreground">Label Summary</p>
            {!selectedOrder ? (
              <p className="text-muted-foreground">Select an order to begin.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Order</span><span className="font-semibold">{selectedOrder.order_number || selectedOrder.id.slice(0, 8)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Destination</span><span className="font-semibold">{shipTo.city} {shipTo.state} {shipTo.zip || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Weight</span><span className="font-semibold">{weight.toFixed(2)} lbs</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Selected rate</span><span className="font-semibold">{currentRate ? `${currentRate.provider} ${currentRate.service} — $${(currentRate.cents / 100).toFixed(2)}` : '—'}</span></div>
              </div>
            )}
            <p className="text-[12px] text-muted-foreground pt-2 border-t border-border">
              Labels are purchased through the Shippo/USPS flow with your configured API keys. Test-mode labels are always labeled as such, and a label that can&rsquo;t really be purchased is never written to an order as tracking.
            </p>
          </div>
        </div>
      </div>

      {showLabelModal && selectedOrder && (
        <ShippingLabelModal
          orderId={selectedOrder.id}
          orderLabel={selectedOrder.order_number || selectedOrder.id.slice(0, 8)}
          onClose={() => setShowLabelModal(false)}
          onLabelPurchased={() => setShowLabelModal(false)}
        />
      )}
    </div>
  );
};

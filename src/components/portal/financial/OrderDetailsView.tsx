'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Printer,
  Truck,
  Mail,
  CreditCard,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Send,
  AlertCircle,
  PackagePlus,
  ClipboardList
} from 'lucide-react';
import { DawgNavSection } from '@/lib/types';
import { useResendFulfillmentAlert, useRestockInventory, useCreatePurchaseOrder } from '@/hooks/admin/useActions';

interface OrderDetailsViewProps {
  onNavigateSection?: (section: DawgNavSection) => void;
  orderId?: string;
}

type OrderItem = {
  id: string;
  product_name?: string; name?: string;
  sku?: string; sku_id?: string;
  product_id?: string | null;
  quantity: number;
  unit_price?: number; price?: number;
  total?: number;
};

type Order = {
  id: string;
  order_number?: string;
  status?: string;
  fulfillment_status?: string;
  fulfillment_method?: string | null;
  payment_status?: string;
  total_amount?: string | number;
  subtotal?: string | number;
  customer_email?: string;
  customer_name?: string;
  customer_phone?: string | null;
  customer_id?: string | null;
  shipping_address?: string;
  carrier?: string;
  tracking_number?: string | null;
  tracking_status?: string | null;
  created_at?: string;
  payment_method?: string;
  metadata?: Record<string, any>;
  items?: OrderItem[];
  labels?: any[];
  fulfillmentEvents?: any[];
  openCases?: number;
};

type OrderCase = {
  id: string;
  order_id: string;
  subject: string;
  reason?: string | null;
  note?: string | null;
  status: string;
  resolution_note?: string | null;
  created_at?: string;
  closed_at?: string | null;
};

type TrackingInfo = {
  available: boolean;
  reason?: string;
  status?: string;
  summary?: string;
  isDelivered?: boolean;
  expectedDeliveryDate?: string | null;
  events?: { description: string; timestamp?: string | null; city?: string | null; state?: string | null }[];
  recordedStatus?: string | null;
};

// Order money is stored as TEXT in the "$25.27" format — parse it, don't
// Number() it (Number("$25.27") is NaN and rendered totals as $0.00).
const parseMoney = (v: any): number => {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const money = (v: any) => {
  if (v === null || v === undefined || v === '') return '—';
  return `$${parseMoney(v).toFixed(2)}`;
};

const fmtDate = (iso: any) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export const OrderDetailsView: React.FC<OrderDetailsViewProps> = ({ onNavigateSection, orderId: propOrderId }) => {
  const [orderId, setOrderId] = useState<string | null>(propOrderId || null);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sentNotice, setSentNotice] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // Label purchase (order-screen endpoint — real labels only)
  const [labelProvider, setLabelProvider] = useState<'shippo' | 'usps'>('shippo');
  const [labelWeight, setLabelWeight] = useState(2);
  const [labelResult, setLabelResult] = useState<any | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  // Live tracking
  const [tracking, setTracking] = useState<TrackingInfo | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  // Cases
  const [cases, setCases] = useState<OrderCase[]>([]);
  const [caseForm, setCaseForm] = useState({ subject: '', reason: 'Delivery issue', note: '' });
  const [caseMsg, setCaseMsg] = useState('');

  const resendAlert = useResendFulfillmentAlert();
  // Restock (§2.1.3f) — per-line restock into the ERP movement ledger via
  // the commerce restock action (server resolves the SKU from the line's
  // catalog product_id and says so honestly when none exists).
  const restockInventory = useRestockInventory();
  const [showRestock, setShowRestock] = useState(false);
  const [restockQtys, setRestockQtys] = useState<Record<string, number>>({});
  const [restockMsg, setRestockMsg] = useState('');
  // Create PO (§2.1.3b) — purchase order prefilled from this order's
  // lines, posted to the commerce create_po action (PO + lines in one
  // write); the PO's notes record the source order id as the linkage.
  const createPo = useCreatePurchaseOrder();
  const [showPo, setShowPo] = useState(false);
  const [poVendors, setPoVendors] = useState<{ id: string; name: string }[]>([]);
  const [poVendorId, setPoVendorId] = useState('');
  const [poLines, setPoLines] = useState<{ key: string; name: string; skuId: string | null; skuCode: string | null; qty: number; unitCost: number }[]>([]);
  const [poLoading, setPoLoading] = useState(false);
  const [poError, setPoError] = useState('');

  // Read ?id= from URL if no prop
  useEffect(() => {
    if (propOrderId) { setOrderId(propOrderId); return; }
    try {
      const id = new URLSearchParams(window.location.search).get('id');
      if (id) setOrderId(id);
      else { setLoading(false); setError('No order selected. Open an order from the Orders page.'); }
    } catch { setLoading(false); }
  }, [propOrderId]);

  const loadOrder = async (id: string) => {
    const res = await fetch(`/api/admin/orders/${id}`);
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'Order not found');
    const o: Order = j.data || j.order || j;
    setOrder(o);
    setItems(Array.isArray(o.items) ? o.items : []);
    return o;
  };

  const loadCases = async (id: string) => {
    try {
      const r = await fetch(`/api/admin/orders/${id}/cases`).then(x => x.json()).catch(() => null);
      setCases(Array.isArray(r?.data) ? r.data : []);
    } catch { /* honest empty */ }
  };

  useEffect(() => {
    if (!orderId) return;
    (async () => {
      setLoading(true); setError(null);
      try {
        await loadOrder(orderId);
        loadCases(orderId);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  const transition = async (to: string, extra: Record<string, any> = {}) => {
    if (!order) return;
    setBusy(to); setMsg('');
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, ...extra }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Transition failed');
      if (to === 'shipped') {
        setMsg(j.emailed
          ? `Marked shipped — tracking emailed to the customer.`
          : `Marked shipped. Customer email not sent${j.emailError ? `: ${j.emailError}` : ''}.`);
      } else if (to === 'delivered') setMsg('Marked delivered.');
      else if (to === 'packed') setMsg('Marked packed.');
      else setMsg('Packing started.');
      await loadOrder(order.id);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  };

  const buyLabel = async () => {
    if (!order) return;
    setBusy('label'); setLabelError(null); setLabelResult(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: labelProvider, weight_lb: labelWeight }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || j.error || 'Label purchase failed');
      setLabelResult(j.label);
      setMsg('Label purchased — tracking saved to the order.');
      await loadOrder(order.id);
    } catch (e: any) {
      setLabelError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const refreshTracking = async () => {
    if (!order) return;
    setTrackingLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/tracking`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.reason || j.error || 'Tracking lookup failed');
      setTracking(j as TrackingInfo);
      if ((j as any).fulfillmentStatus) await loadOrder(order.id);
    } catch (e: any) {
      setTracking({ available: false, reason: e.message });
    } finally {
      setTrackingLoading(false);
    }
  };

  const submitCase = async () => {
    if (!order || !caseForm.subject.trim()) { setCaseMsg('A subject is required.'); return; }
    setBusy('case'); setCaseMsg('');
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caseForm),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not open the case');
      setCaseForm({ subject: '', reason: 'Delivery issue', note: '' });
      setCaseMsg('Case opened — it also shows on the customer profile.');
      loadCases(order.id);
      loadOrder(order.id).catch(() => {});
    } catch (e: any) {
      setCaseMsg(e.message);
    } finally {
      setBusy(null);
    }
  };

  const setCaseStatus = async (c: OrderCase, status: 'open' | 'closed') => {
    if (!order) return;
    setBusy(`case-${c.id}`);
    try {
      const res = await fetch(`/api/admin/orders/cases/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Case update failed');
      loadCases(order.id);
      loadOrder(order.id).catch(() => {});
    } catch (e: any) {
      setCaseMsg(e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleSend = () => {
    if (!message.trim() || !order) return;
    resendAlert.mutate({ order_id: order.id, message }, {
      onSuccess: () => { setSentNotice(true); setTimeout(() => { setMessage(''); setSentNotice(false); }, 2500); },
      onError: (e) => setMsg(e.message),
    });
  };

  const doSlip = () => {
    if (!order) return;
    // Printable packing slip (HTML endpoint, auto-prints) — same one the
    // Orders list opens.
    window.open(`/api/admin/orders/${order.id}/packing-slip`, '_blank');
  };

  const doLabel = () => {
    // The label purchase lives in the Shipping card (provider + weight +
    // real purchase via /api/admin/orders/[id]/label).
    document.getElementById('order-label-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (loading) return <div className="p-8 text-muted-foreground">Loading order…</div>;
  if (error || !order) {
    return (
      <div className="p-8 space-y-4">
        <p className="text-destructive text-[14px]">{error || 'Order not found.'}</p>
        <button onClick={() => onNavigateSection?.('orders')} className="px-3 py-1.5 border border-border text-[13px] uppercase font-semibold flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Orders
        </button>
      </div>
    );
  }

  const orderNum = order.order_number || `#${String(order.id).slice(0, 8).toUpperCase()}`;
  const status = (order.fulfillment_status || order.status || 'pending').toUpperCase();
  const total = parseMoney(order.total_amount);
  const subtotal = parseMoney(order.subtotal) || total;
  const meta = order.metadata || {};
  const isPickup = String(order.fulfillment_method || '').toLowerCase().includes('pickup');
  const fsLower = String(order.fulfillment_status || 'pending').toLowerCase();
  const packedAt = meta.packed_at ? fmtDate(meta.packed_at) : null;
  const shippedAt = meta.shipped_at ? fmtDate(meta.shipped_at) : null;
  const deliveredAt = meta.delivered_at ? fmtDate(meta.delivered_at) : null;

  let shipAddr: any = null;
  try { shipAddr = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address) : order.shipping_address; } catch { /* keep null */ }

  const handleResendAlert = () => {
    resendAlert.mutate({ order_id: order.id }, {
      onSuccess: () => setMsg('Alert resent.'),
      onError: (e) => setMsg(e.message),
    });
  };

  const doRestockLine = (it: OrderItem) => {
    if (!it.product_id) { setRestockMsg(`"${it.product_name || it.name || 'Item'}" has no catalog product on the line — it cannot be restocked from here.`); return; }
    const qty = Math.max(0, Math.round((restockQtys[it.id] ?? Number(it.quantity)) || 0));
    if (!qty) { setRestockMsg('Enter a quantity to restock.'); return; }
    restockInventory.mutate(
      { sku_id: it.product_id, quantity: qty, reason: `order_${order.id}_restock` } as never,
      {
        onSuccess: () => setRestockMsg(`Restocked ${qty} × ${it.product_name || it.name || 'item'} — movement recorded in the inventory ledger.`),
        onError: (e) => setRestockMsg(e.message),
      },
    );
  };

  const openCreatePo = async () => {
    setShowPo(true);
    setPoError('');
    setPoLoading(true);
    try {
      const vr = await fetch('/api/admin/vendors?limit=200').then((x) => x.json()).catch(() => ({}));
      const vendors = (Array.isArray(vr?.data) ? vr.data : []).map((v: any) => ({ id: v.id, name: v.name || v.code || v.id }));
      setPoVendors(vendors);
      if (vendors.length && !poVendorId) setPoVendorId(vendors[0].id);
      // Prefill lines from the order; resolve each line's ERP SKU via the
      // PO picker's search (by product name). Lines with no ERP SKU are
      // shown unresolved and excluded — the PO lines store requires one.
      const resolved = await Promise.all(items.map(async (it) => {
        const name = it.product_name || it.name || 'Item';
        let skuId: string | null = null;
        let skuCode: string | null = null;
        let unitCost = Number(it.unit_price ?? it.price) || 0;
        try {
          const sr = await fetch(`/api/admin/purchase-orders/skus?q=${encodeURIComponent(name)}`).then((x) => x.json()).catch(() => ({}));
          const skus: any[] = Array.isArray(sr?.skus) ? sr.skus : [];
          const match = skus.find((s) => String(s.product_name || '').toLowerCase() === name.toLowerCase()) || skus[0];
          if (match) {
            skuId = match.sku_id;
            skuCode = match.sku_code;
            if (match.standard_cost != null) unitCost = Number(match.standard_cost) || unitCost;
          }
        } catch { /* unresolved line */ }
        return { key: it.id, name, skuId, skuCode, qty: Number(it.quantity) || 1, unitCost };
      }));
      setPoLines(resolved);
    } finally {
      setPoLoading(false);
    }
  };

  const submitCreatePo = () => {
    if (!poVendorId) { setPoError('Pick a vendor for the purchase order.'); return; }
    const lines = poLines.filter((l) => l.skuId && l.qty > 0);
    if (!lines.length) { setPoError('No line has a resolved SKU — a PO line needs an ERP SKU. Resolve or remove the unresolved lines.'); return; }
    setPoError('');
    createPo.mutate(
      {
        vendor_id: poVendorId,
        line_items: lines.map((l) => ({ sku_id: l.skuId as string, quantity: l.qty, unit_cost: l.unitCost, description: l.name })),
        // The order linkage: erp_purchase_orders carries no order FK, so
        // the source order is recorded in the PO's notes (and audited).
        notes: `Created from order ${order.id} (Orders → Create PO). Source order: ${order.id}`,
      } as never,
      {
        onSuccess: (res: any) => {
          setShowPo(false);
          setMsg(`Purchase order ${res?.poNumber || ''} created from this order — ${res?.lineCount ?? lines.length} line(s), status pending approval.`);
        },
        onError: (e) => setPoError(e.message),
      },
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto text-foreground bg-card min-h-full">
      {msg && (
        <div className="border border-border bg-muted/30 px-4 py-2 text-[13px]">{msg}</div>
      )}
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border border-border p-4 bg-card gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground">
            <button
              onClick={() => onNavigateSection?.('orders')}
              className="hover:underline flex items-center gap-1 text-foreground font-semibold cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>ORDERS</span>
            </button>
            <span>{'//'}</span>
            <span className="text-foreground font-semibold">{orderNum}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <h1 className="text-xl font-semibold uppercase text-foreground">Order {orderNum}</h1>
            <span className="px-2 py-0.5 border border-border bg-primary text-primary-foreground text-[11px] font-medium uppercase">
              {status}
            </span>
            {order.carrier && (
              <span className="px-2 py-0.5 border border-border bg-card text-foreground text-[11px] font-medium uppercase">
                {order.carrier}
              </span>
            )}
          </div>
          <p className="text-[11px] tabular-nums text-muted-foreground mt-1">
            PLACED: {fmtDate(order.created_at)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={doSlip}
            className="px-3 py-1.5 border border-border bg-card hover:bg-accent/50 font-semibold text-[13px] uppercase flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Packing Slip</span>
          </button>
          <button
            onClick={doLabel}
            className="px-3 py-1.5 border border-border bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-[13px] uppercase flex items-center gap-1.5 cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Shipping Label</span>
          </button>
          <button
            onClick={handleResendAlert}
            className="px-3 py-1.5 border border-border bg-card hover:bg-accent/50 font-semibold text-[13px] uppercase flex items-center gap-1.5 cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Resend Alert</span>
          </button>
        </div>
      </div>

      {/* Fulfillment lifecycle — see it, pack it, ship it, delivered */}
      <div className="border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold uppercase text-[13px] text-foreground mr-2">Fulfillment</span>
          <span className="px-2 py-0.5 border border-border bg-muted/40 text-[11px] font-semibold uppercase">{status}</span>
          {packedAt && <span className="text-[11px] text-muted-foreground tabular-nums">Packed: {packedAt}</span>}
          {shippedAt && <span className="text-[11px] text-muted-foreground tabular-nums">Shipped: {shippedAt}</span>}
          {deliveredAt && <span className="text-[11px] text-muted-foreground tabular-nums">Delivered: {deliveredAt}{meta.delivered_source === 'carrier' ? ' (carrier)' : ''}</span>}
          <span className="flex-1" />
          {(fsLower === 'pending' || fsLower === 'unfulfilled') && (
            <button disabled={busy !== null} onClick={() => transition('processing')} className="px-3 py-1.5 bg-primary text-primary-foreground text-[13px] font-semibold uppercase disabled:opacity-50 cursor-pointer">
              {busy === 'processing' ? 'Starting…' : 'Start Packing'}
            </button>
          )}
          {fsLower === 'processing' && !packedAt && (
            <button disabled={busy !== null} onClick={() => transition('packed')} className="px-3 py-1.5 bg-primary text-primary-foreground text-[13px] font-semibold uppercase disabled:opacity-50 cursor-pointer">
              {busy === 'packed' ? 'Saving…' : 'Mark Packed'}
            </button>
          )}
          {fsLower !== 'shipped' && fsLower !== 'delivered' && fsLower !== 'cancelled' && !isPickup && (
            <button disabled={busy !== null} onClick={() => transition('shipped')} className="px-3 py-1.5 border border-border bg-card text-[13px] font-semibold uppercase disabled:opacity-50 cursor-pointer">
              {busy === 'shipped' ? 'Shipping…' : 'Mark Shipped'}
            </button>
          )}
          {fsLower === 'shipped' && (
            <button disabled={busy !== null} onClick={() => { if (confirm('Mark this order as delivered?')) transition('delivered'); }} className="px-3 py-1.5 bg-primary text-primary-foreground text-[13px] font-semibold uppercase disabled:opacity-50 cursor-pointer">
              {busy === 'delivered' ? 'Saving…' : 'Mark Delivered'}
            </button>
          )}
          {isPickup && fsLower !== 'delivered' && (
            <span className="text-[11px] text-muted-foreground">Pickup order — use Handoff from the Orders list when the customer collects it.</span>
          )}
        </div>
        {!isPickup && fsLower !== 'shipped' && fsLower !== 'delivered' && !order.tracking_number && (
          <p className="text-[11px] text-muted-foreground mt-2">Mark Shipped needs a tracking number — buy the label below first, or the order must already carry one.</p>
        )}
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Line Items */}
          <div className="border border-border bg-card">
            <div className="p-3.5 border-b border-border flex items-center justify-between bg-muted/30">
              <h2 className="font-semibold uppercase text-[13px] text-foreground">
                Line Items ({items.length} Items)
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setRestockMsg(''); setShowRestock((s) => !s); }}
                  className="px-2.5 py-1 border border-border bg-card hover:bg-accent/50 text-[11px] font-semibold uppercase flex items-center gap-1 cursor-pointer"
                >
                  <PackagePlus className="w-3.5 h-3.5" /> Restock Items
                </button>
                <button
                  onClick={() => void openCreatePo()}
                  className="px-2.5 py-1 border border-border bg-card hover:bg-accent/50 text-[11px] font-semibold uppercase flex items-center gap-1 cursor-pointer"
                >
                  <ClipboardList className="w-3.5 h-3.5" /> Create PO
                </button>
              </div>
            </div>

            {/* Restock panel (§2.1.3f) — one movement per line into
                erp_inventory_movements via the commerce restock action. */}
            {showRestock && (
              <div className="border-b border-border p-3.5 space-y-2 bg-muted/20">
                <p className="text-[11px] text-muted-foreground">Restock this order&rsquo;s lines back into stock (returns to shelf, replacements). Each restock records an inventory movement for the line&rsquo;s SKU.</p>
                {items.map((it) => (
                  <div key={it.id} className="flex items-center gap-2 text-[12px]">
                    <span className="flex-1 truncate font-medium">{it.product_name || it.name || 'Item'}</span>
                    {!it.product_id ? (
                      <span className="text-muted-foreground">No catalog product on this line — cannot restock</span>
                    ) : (
                      <>
                        <input
                          type="number"
                          min={0}
                          value={restockQtys[it.id] ?? it.quantity}
                          onChange={(e) => setRestockQtys((m) => ({ ...m, [it.id]: Number(e.target.value) || 0 }))}
                          className="w-16 h-7 px-2 border border-border bg-card text-[12px] focus:outline-none"
                          aria-label={`Restock quantity for ${it.product_name || it.name || 'item'}`}
                        />
                        <button
                          onClick={() => doRestockLine(it)}
                          disabled={restockInventory.isPending}
                          className="px-2.5 py-1 bg-primary text-primary-foreground text-[11px] font-semibold uppercase disabled:opacity-50 cursor-pointer"
                        >
                          Restock
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {restockMsg && <p className="text-[12px] font-medium text-foreground">{restockMsg}</p>}
              </div>
            )}

            <div className="overflow-x-auto">
              {items.length === 0 ? (
                <p className="p-6 text-[13px] text-muted-foreground">No line items found for this order.</p>
              ) : (
              <table className="w-full text-left text-[13px] border-collapse tabular-nums">
                <thead>
                  <tr className="bg-card border-b border-border text-[11px] uppercase font-semibold text-muted-foreground">
                    <th className="p-3 border-r border-border w-10 text-center">#</th>
                    <th className="p-3 border-r border-border">Product Details</th>
                    <th className="p-3 border-r border-border text-center">Qty</th>
                    <th className="p-3 border-r border-border text-right">Unit</th>
                    <th className="p-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-[13px]">
                  {items.map((it, i) => {
                    const qty = Number(it.quantity) || 0;
                    const unit = Number(it.unit_price ?? it.price) || 0;
                    const lineTotal = Number(it.total) || qty * unit;
                    return (
                      <tr key={it.id || i} className="hover:bg-accent/50">
                        <td className="p-3 text-center border-r border-border text-muted-foreground/70">{String(i + 1).padStart(2, '0')}</td>
                        <td className="p-3 border-r border-border">
                          <p className="font-semibold font-sans text-foreground">{it.product_name || it.name || 'Item'}</p>
                          <p className="text-[10px] text-muted-foreground">SKU: {it.sku || (it.sku_id ? String(it.sku_id).slice(0, 8) : '—')}</p>
                        </td>
                        <td className="p-3 text-center border-r border-border font-semibold">{qty}</td>
                        <td className="p-3 text-right border-r border-border">{money(unit)}</td>
                        <td className="p-3 text-right font-semibold">{money(lineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
            </div>

            {/* Financial Summary */}
            <div className="border-t border-border grid grid-cols-1 md:grid-cols-2 bg-card">
              <div className="p-4 border-b md:border-b-0 md:border-r border-border space-y-2">
                <p className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">Payment</p>
                <div className="flex items-center gap-2 text-[12px]">
                  <CreditCard className="w-4 h-4 text-foreground" />
                  <span className="font-semibold text-foreground uppercase">{order.payment_status || '—'}</span>
                  {order.payment_method && <span className="text-muted-foreground">{order.payment_method}</span>}
                </div>
              </div>

              <div className="p-4 space-y-1.5 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-semibold text-foreground">{money(subtotal)}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between font-semibold text-sm text-foreground">
                  <span>TOTAL:</span>
                  <span>{money(total)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Order total as recorded at checkout (shipping &amp; tax included where charged).</p>
              </div>
            </div>
          </div>

          {/* Dispatch Note */}
          <div className="border border-border bg-card p-4 space-y-3">
            <h3 className="font-semibold uppercase text-[13px] text-foreground">Dispatch Customer Note</h3>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Type message to ${order.customer_name || order.customer_email || 'customer'}...`}
              className="w-full p-2 text-[13px] border border-border focus:outline-none resize-none tabular-nums"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground tabular-nums">{order.customer_email || ''}</span>
              <button
                onClick={handleSend}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-[13px] font-semibold uppercase flex items-center gap-1 cursor-pointer"
              >
                <Send className="w-3 h-3" />
                <span>Dispatch</span>
              </button>
            </div>
            {sentNotice && (
              <p className="text-[13px] font-semibold text-foreground tabular-nums">✓ Dispatch note logged and sent!</p>
            )}
          </div>
        </div>

        {/* Right Column (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Customer */}
          <div className="border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="font-semibold uppercase text-[13px] text-foreground">Customer</h3>
            </div>
            <div>
              <p className="text-base font-semibold text-foreground uppercase">{order.customer_name || '—'}</p>
              <p className="text-[10px] tabular-nums text-muted-foreground">{order.customer_email || ''}</p>
              {order.customer_phone && <p className="text-[10px] tabular-nums text-muted-foreground">{order.customer_phone}</p>}
            </div>
          </div>

          {/* Shipping */}
          <div className="border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="font-semibold uppercase text-[13px] text-foreground">Shipping</h3>
            </div>
            {shipAddr ? (
              <div className="p-2 border border-border bg-muted/30 text-[13px] tabular-nums">
                <p className="font-semibold text-foreground uppercase">{shipAddr.name || order.customer_name || ''}</p>
                <p>{shipAddr.street1 || ''}</p>
                <p>{[shipAddr.city, shipAddr.state, shipAddr.zip].filter(Boolean).join(', ')}</p>
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">No shipping address on file.</p>
            )}
            <div className="text-[13px] tabular-nums space-y-1">
              <p className="text-muted-foreground uppercase text-[10px]">Tracking #:</p>
              <p className="font-semibold text-foreground bg-muted/40 p-1 border border-border select-all">
                {order.tracking_number || 'Not shipped yet'}
              </p>
            </div>
            <div className="text-[13px] tabular-nums space-y-1">
              <p className="text-muted-foreground uppercase text-[10px]">Carrier status (last recorded):</p>
              <p className="font-semibold text-foreground">{order.tracking_status || '—'}</p>
            </div>
            {order.tracking_number && (
              <div className="space-y-2">
                <button
                  onClick={refreshTracking}
                  disabled={trackingLoading}
                  className="px-3 py-1.5 border border-border bg-card hover:bg-accent/50 font-semibold text-[12px] uppercase disabled:opacity-50 cursor-pointer"
                >
                  {trackingLoading ? 'Checking…' : 'Refresh Live Tracking'}
                </button>
                {tracking && !tracking.available && (
                  <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 p-2">
                    Live tracking unavailable: {tracking.reason || 'the carrier API could not be reached.'} The status above is the last recorded one — it was not changed.
                  </p>
                )}
                {tracking && tracking.available && (
                  <div className="border border-border bg-muted/30 p-2 space-y-1.5">
                    <p className="text-[12px] font-semibold text-foreground">{tracking.status}{tracking.isDelivered ? ' ✓' : ''}</p>
                    {tracking.summary && <p className="text-[12px] text-muted-foreground">{tracking.summary}</p>}
                    {tracking.expectedDeliveryDate && <p className="text-[12px] text-muted-foreground">Expected: {tracking.expectedDeliveryDate}</p>}
                    {(tracking.events || []).slice(0, 6).map((ev, i) => (
                      <p key={i} className="text-[11px] text-muted-foreground tabular-nums">
                        {ev.timestamp ? fmtDate(ev.timestamp) : ''} — {ev.description}{ev.city ? ` (${ev.city}${ev.state ? `, ${ev.state}` : ''})` : ''}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Label purchase */}
          <div id="order-label-card" className="border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="font-semibold uppercase text-[13px] text-foreground">Shipping Label</h3>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Buys a real label with this order&rsquo;s return address (the seller&rsquo;s for a seller order, the shop&rsquo;s otherwise).
              Tracking is saved to the order. Weight comes from the scale — order lines carry no weight data.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-semibold uppercase text-muted-foreground">
                Carrier
                <select value={labelProvider} onChange={(e) => setLabelProvider(e.target.value as 'shippo' | 'usps')} className="mt-1 w-full border border-border bg-background p-1.5 text-[13px] text-foreground">
                  <option value="shippo">Shippo</option>
                  <option value="usps">USPS (direct)</option>
                </select>
              </label>
              <label className="text-[11px] font-semibold uppercase text-muted-foreground">
                Weight (lb)
                <input type="number" min={0.1} step={0.1} value={labelWeight} onChange={(e) => setLabelWeight(Math.max(0.1, Number(e.target.value) || 0.1))} className="mt-1 w-full border border-border bg-background p-1.5 text-[13px] text-foreground" />
              </label>
            </div>
            {labelError && <p className="text-[12px] text-red-700 bg-red-50 border border-red-200 p-2">{labelError}</p>}
            {labelResult && (
              <div className="border border-border bg-muted/30 p-2 text-[12px] space-y-1">
                {labelResult.testMode && <p className="font-semibold text-brand-teal">TEST MODE — not a real label</p>}
                <p>Carrier: <span className="font-semibold">{labelResult.provider} {labelResult.service || ''}</span></p>
                <p>Tracking: <span className="font-mono">{labelResult.trackingNumber}</span></p>
                {typeof labelResult.rateCents === 'number' && <p>Cost: ${(labelResult.rateCents / 100).toFixed(2)}</p>}
                {labelResult.labelUrl && <a href={`/api/admin/orders/${order.id}/label-print?tracking=${encodeURIComponent(labelResult.trackingNumber)}`} target="_blank" rel="noopener noreferrer" className="underline font-semibold">Print carrier label</a>}
              </div>
            )}
            {/* Purchased labels on record — the carrier-issued label file is
                the ONLY printable label; we never draw our own. Labels whose
                provider file was never stored show the tracking as data with
                an honest note instead of a fabricated label. */}
            {(() => {
              const stored = (order.labels || []).filter((l: any) => !labelResult || l.tracking_number !== labelResult.trackingNumber);
              if (stored.length === 0) return null;
              return (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground">Labels on record</p>
                  {stored.map((l: any) => (
                    <div key={l.id} className="border border-border bg-muted/30 p-2 text-[12px] space-y-1">
                      <p>Carrier: <span className="font-semibold">{l.carrier || '—'}</span></p>
                      <p>Tracking: <span className="font-mono">{l.tracking_number}</span></p>
                      {l.postage_amount != null && <p>Cost: ${Number(l.postage_amount).toFixed(2)}</p>}
                      {l.label_uri ? (
                        <a href={`/api/admin/orders/${order.id}/label-print?tracking=${encodeURIComponent(l.tracking_number || '')}`} target="_blank" rel="noopener noreferrer" className="underline font-semibold">Print carrier label</a>
                      ) : (
                        <p className="text-muted-foreground">No label file on record for this tracking number — the carrier-issued label isn&rsquo;t stored, so there is nothing to print here.</p>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
            <button
              onClick={buyLabel}
              disabled={busy !== null}
              className="px-3 py-1.5 bg-primary text-primary-foreground font-semibold text-[13px] uppercase disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <Truck className="w-3.5 h-3.5" /> {busy === 'label' ? 'Purchasing…' : 'Buy Label'}
            </button>
          </div>

          {/* Cases */}
          <div className="border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="font-semibold uppercase text-[13px] text-foreground">Cases {cases.length > 0 ? `(${cases.filter(c => c.status === 'open').length} open)` : ''}</h3>
            </div>
            {cases.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No cases on this order.</p>
            ) : (
              <div className="space-y-2">
                {cases.map((c) => (
                  <div key={c.id} className="border border-border p-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-foreground">{c.subject}</p>
                      <span className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase ${c.status === 'open' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>{c.status}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {c.reason ? `${c.reason} · ` : ''}Opened {c.created_at ? fmtDate(c.created_at) : ''}
                      {c.closed_at ? ` · Closed ${fmtDate(c.closed_at)}` : ''}
                    </p>
                    {c.note && <p className="text-[12px] text-foreground">{c.note}</p>}
                    {c.resolution_note && <p className="text-[12px] text-muted-foreground">Resolution: {c.resolution_note}</p>}
                    <button
                      onClick={() => setCaseStatus(c, c.status === 'open' ? 'closed' : 'open')}
                      disabled={busy !== null}
                      className="text-[11px] font-semibold uppercase underline disabled:opacity-50 cursor-pointer"
                    >
                      {c.status === 'open' ? 'Close case' : 'Reopen case'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">Open a case on this order</p>
              <input
                value={caseForm.subject}
                onChange={(e) => setCaseForm({ ...caseForm, subject: e.target.value })}
                placeholder="Subject — what's the issue?"
                className="w-full p-2 text-[13px] border border-border focus:outline-none"
              />
              <select
                value={caseForm.reason}
                onChange={(e) => setCaseForm({ ...caseForm, reason: e.target.value })}
                className="w-full p-2 text-[13px] border border-border bg-background focus:outline-none"
              >
                <option>Delivery issue</option>
                <option>Damaged item</option>
                <option>Wrong item</option>
                <option>Missing item</option>
                <option>Customer complaint</option>
                <option>Other</option>
              </select>
              <textarea
                rows={2}
                value={caseForm.note}
                onChange={(e) => setCaseForm({ ...caseForm, note: e.target.value })}
                placeholder="Details (optional)"
                className="w-full p-2 text-[13px] border border-border focus:outline-none resize-none"
              />
              {caseMsg && <p className="text-[12px] text-muted-foreground">{caseMsg}</p>}
              <button
                onClick={submitCase}
                disabled={busy !== null}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-[13px] font-semibold uppercase disabled:opacity-50 cursor-pointer flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3" /> {busy === 'case' ? 'Opening…' : 'Open Case'}
              </button>
              <p className="text-[10px] text-muted-foreground">The case attaches to this order and the customer&rsquo;s profile.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create PO (§2.1.3b) — prefilled from this order's lines; posts
          to the commerce create_po action (PO + lines, vendor-validated,
          status pending_approval). The source order id is recorded in
          the PO notes as the order linkage. */}
      {showPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !createPo.isPending && setShowPo(false)}>
          <div className="w-full max-w-lg bg-card border border-border p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold uppercase tracking-tight">Create Purchase Order</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">Replenish what this order sold. Lines are prefilled from the order; the PO is created as pending approval and records this order as its source.</p>

            <label className="block mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vendor</label>
            <select
              value={poVendorId}
              onChange={(e) => setPoVendorId(e.target.value)}
              className="mt-1 w-full h-9 px-2 text-[13px] bg-card border border-border text-foreground focus:outline-none"
            >
              {poVendors.length === 0 && <option value="">No vendors on file</option>}
              {poVendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>

            <label className="block mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lines</label>
            {poLoading ? (
              <p className="mt-2 text-[13px] text-muted-foreground">Resolving SKUs…</p>
            ) : (
              <div className="mt-1 space-y-2">
                {poLines.map((l, i) => (
                  <div key={l.key} className="flex items-center gap-2 text-[12px]">
                    <span className="flex-1 truncate">
                      <span className="font-medium">{l.name}</span>
                      <span className="block text-[10px] text-muted-foreground">{l.skuId ? `SKU ${l.skuCode || l.skuId.slice(0, 8)}` : 'No ERP SKU found — this line will be excluded'}</span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={l.qty}
                      onChange={(e) => setPoLines((prev) => prev.map((x, j) => (j === i ? { ...x, qty: Math.max(0, Number(e.target.value) || 0) } : x)))}
                      className="w-16 h-8 px-2 border border-border bg-card text-[12px] focus:outline-none"
                      aria-label={`Quantity for ${l.name}`}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unitCost}
                      onChange={(e) => setPoLines((prev) => prev.map((x, j) => (j === i ? { ...x, unitCost: Math.max(0, Number(e.target.value) || 0) } : x)))}
                      className="w-24 h-8 px-2 border border-border bg-card text-[12px] focus:outline-none"
                      aria-label={`Unit cost for ${l.name}`}
                    />
                  </div>
                ))}
                {poLines.length === 0 && <p className="text-[13px] text-muted-foreground">This order has no lines to order.</p>}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground uppercase text-[11px] font-semibold">PO Total</span>
              <span className="font-semibold">${poLines.filter((l) => l.skuId).reduce((s, l) => s + l.qty * l.unitCost, 0).toFixed(2)}</span>
            </div>

            {poError && <p className="mt-3 text-[13px] font-medium text-red-600">{poError}</p>}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowPo(false)}
                disabled={createPo.isPending}
                className="flex-1 h-9 border border-border bg-card hover:bg-accent/50 text-[13px] font-semibold uppercase disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={submitCreatePo}
                disabled={createPo.isPending || poLoading}
                className="flex-1 h-9 bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-semibold uppercase disabled:opacity-50 cursor-pointer"
              >
                {createPo.isPending ? 'Creating…' : 'Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

'use client';
/* eslint-disable */
import { useEffect, useMemo, useState } from 'react';
import {
  useCreateOrder,
  usePrintPackingSlip,
  useResendFulfillmentAlert,
  useExportOrdersCsv,
  useCommerceAction,
  useCreatePurchaseOrder,
  useRestockInventory,
} from '@/hooks/admin/useActions';
import ShippingLabelModal from '@/components/portal/ShippingLabelModal';

// SLA: unfulfilled orders are due 48h after creation (tree §2.1 Order Details → SLA)
const SLA_HOURS = 48;

type OrderItem = { id: string; name: string; quantity: number; unitPrice: string; warehouses: string | null; designSnapshot?: unknown };
type Order = {
  id: string; email: string; customerId: string | null; customerName: string | null;
  status: string; paymentStatus: string; fulfillmentStatus: string; fulfillmentMethod: string | null;
  subtotal: string; totalAmount: string; shippingAddress: string | null; notes: string | null;
  trackingNumber: string | null; carrier: string | null; trackingStatus: string | null;
  createdAt: string; itemCount: number; items: OrderItem[];
  // W6 merged ledger: 'erp' = ERP ledger of truth (detail: /admin/orders/[id]),
  // 'commerce' = manual retail rows (existing commerce sub-routes),
  // 'storefront' = checkout order with no ERP twin yet.
  source?: string; orderNumber?: string | null; detailHref?: string;
};

const FILTERS = [
  { id: 'all', label: 'All Orders' },
  { id: 'unfulfilled', label: 'Unfulfilled' },
  { id: 'ready', label: 'Ready to Ship' },
  { id: 'pickup', label: 'Local Pickup' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'delivered', label: 'Delivered' },
] as const;

function matchesFilter(o: Order, f: string): boolean {
  const fs = String(o.fulfillmentStatus || '').toUpperCase();
  const isPickup = (o.fulfillmentMethod || '').toLowerCase().includes('pickup');
  switch (f) {
    // W6: ERP statuses join the same buckets — confirmed/in_production
    // are unfulfilled work, ready_to_ship is ready work.
    case 'unfulfilled': return ['PENDING', 'UNFULFILLED', 'PROCESSING', 'CONFIRMED', 'IN_PRODUCTION'].includes(fs);
    case 'ready': return fs === 'READY_TO_SHIP' || fs === 'PROCESSING' || (fs === 'PENDING' && !isPickup);
    case 'pickup': return isPickup && fs !== 'DELIVERED' && fs !== 'DISPATCHED';
    case 'shipped': return fs === 'SHIPPED';
    case 'delivered': return fs === 'DELIVERED' || fs === 'DISPATCHED';
    default: return true;
  }
}

function slaInfo(o: Order): { label: string; overdue: boolean } | null {
  const fs = String(o.fulfillmentStatus || '').toUpperCase();
  if (['SHIPPED', 'DELIVERED', 'DISPATCHED', 'CANCELLED'].includes(fs)) return null;
  if (!o.createdAt) return null;
  const dueAt = new Date(o.createdAt).getTime() + SLA_HOURS * 3600000;
  const diffH = (dueAt - Date.now()) / 3600000;
  if (diffH < 0) {
    const od = Math.floor(-diffH / 24), oh = Math.floor(-diffH % 24);
    return { label: od > 0 ? `${od}d ${oh}h overdue` : `${oh}h overdue`, overdue: true };
  }
  if (diffH < 24) return { label: `Due in ${Math.max(1, Math.floor(diffH))}h`, overdue: false };
  return { label: `Due in ${Math.floor(diffH / 24)}d`, overdue: false };
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ fulfillment_status: '', tracking_number: '', carrier: '' });
  const [msg, setMsg] = useState('');
  const [labelOrder, setLabelOrder] = useState<{ id: string; label: string } | null>(null);
  // C2 · Reroute shipment — void/reissue over the shipping stack.
  const [rerouteOrder, setRerouteOrder] = useState<{ id: string; label: string } | null>(null);
  const [rerouteForm, setRerouteForm] = useState({ street1: '', city: '', state: '', zip: '', carrier: '', service: '', reason: '' });
  const [rerouting, setRerouting] = useState(false);
  // C1 oversight: server-side search (buyer / SKU / item, seller) + facets.
  const [query, setQuery] = useState('');
  const [sellerQuery, setSellerQuery] = useState('');
  const [facet, setFacet] = useState<string>('');
  const [facetCounts, setFacetCounts] = useState<{ all: number; sla_breach: number; late: number; stuck: number } | null>(null);
  // W6 merged ledger: per-source row counts from the API, rendered in the header.
  const [sourceCounts, setSourceCounts] = useState<{ erp: number; commerce: number; storefront: number } | null>(null);

  // Quick action hooks — tree §4 order actions
  const createOrder = useCreateOrder();
  const printSlip = usePrintPackingSlip();
  const resendAlert = useResendFulfillmentAlert();
  const exportCsv = useExportOrdersCsv();
  const commerce = useCommerceAction();
  const createPo = useCreatePurchaseOrder();
  const restock = useRestockInventory();

  useEffect(() => { loadOrders(); }, []);

  async function loadOrders(overrides?: { q?: string; seller?: string; facet?: string }) {
    const params = new URLSearchParams();
    const qv = overrides?.q ?? query;
    const sv = overrides?.seller ?? sellerQuery;
    const fv = overrides?.facet ?? facet;
    if (qv.trim()) params.set('q', qv.trim());
    if (sv.trim()) params.set('seller', sv.trim());
    if (fv) params.set('facet', fv);
    const qs = params.toString();
    try {
      const res = await fetch(`/api/admin/orders${qs ? `?${qs}` : ''}`);
      const data = res.ok ? await res.json() : { orders: [] };
      setOrders(data.orders || []);
      if (data.facets) setFacetCounts(data.facets);
      if (data.sources) setSourceCounts(data.sources);
    } catch { /* keep empty, honest */ }
    setLoading(false);
  }

  const pickFacet = (f: string) => {
    setFacet(f);
    setFilter('all');
    loadOrders({ facet: f });
  };

  async function updateOrder(id: string) {
    // Persist through the admin API (the anon browser client can't write
    // commerce_orders — RLS — and silently no-opped).
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulfillment_status: editForm.fulfillment_status,
          tracking_number: editForm.tracking_number || null,
          carrier: editForm.carrier || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || 'Update failed.');
        return;
      }
      setMsg('Order updated.');
    } catch (e: any) {
      setMsg(e.message);
      return;
    }
    setEditingId(null);
    loadOrders();
  }

  const doCreatePo = () => {
    const vendorId = prompt('Vendor ID for the purchase order:');
    if (!vendorId) return;
    createPo.mutate({ vendor_id: vendorId, line_items: [] } as any, {
      onSuccess: (res: any) => { setMsg(`PO created: ${res?.poNumber || res?.poId || ''}`); },
      onError: (e) => setMsg(e.message),
    });
  };

  const doRestock = () => {
    const productId = prompt('Product ID or SKU to restock:');
    if (!productId) return;
    const qty = Number(prompt('Quantity to add:', '10') || '0');
    if (!qty) return;
    restock.mutate({ product_id: productId, quantity: qty } as any, {
      onSuccess: () => setMsg('Restocked.'),
      onError: (e) => setMsg(e.message),
    });
  };

  const doExportCsv = () => {
    // Direct download from the export API (returns CSV file)
    const url = `/api/admin/orders/export${filter !== 'all' ? `?status=${filter}` : ''}`;
    window.open(url, '_blank');
    setMsg('Export downloading.');
  };

  const doSlip = (id: string) => {
    // Open printable packing slip in new window (auto-prints)
    window.open(`/api/admin/orders/${id}/packing-slip`, '_blank');
  };

  const doPickList = () => {
    // Open printable pick list for unfulfilled orders
    window.open('/api/admin/orders/pick-list', '_blank');
  };

  const doHandoff = async (id: string) => {
    if (!confirm('Mark this pickup order as handed off to the customer?')) return;
    try {
      const res = await fetch(`/api/admin/orders/${id}/handoff`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setMsg('Pickup handed off.');
        loadOrders();
      } else {
        setMsg(data.error || 'Handoff failed.');
      }
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  // C2 · Force cancel — the governed cancel route (guards, reason, event
  // log). A shipped order asks for an explicit force confirmation.
  const doCancel = async (o: Order) => {
    const fs = (o.fulfillmentStatus || '').toLowerCase();
    const shipped = fs === 'shipped';
    if (!confirm(shipped
      ? `Order #${o.id.slice(0, 8)} has already SHIPPED. Force-cancel it anyway?`
      : `Cancel order #${o.id.slice(0, 8)}? This cannot be undone from the queue.`)) return;
    const reason = prompt('Reason for cancelling (recorded on the order):') || '';
    try {
      const res = await fetch(`/api/admin/orders/${o.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined, force: shipped }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error || 'Cancel failed.'); return; }
      setMsg(`Order #${o.id.slice(0, 8)} cancelled.${data.note ? ` ${data.note}` : ''}`);
      loadOrders();
    } catch (e: any) { setMsg(e.message); }
  };

  // C2 · Reroute shipment — the governed reroute route: the replacement
  // label is purchased first (Shippo/USPS stack); only a real label
  // supersedes the old tracking and moves the destination. A
  // not-configured carrier answers honestly and changes nothing.
  const doReroute = async () => {
    if (!rerouteOrder) return;
    const hasAddress = !!(rerouteForm.street1 || rerouteForm.city || rerouteForm.state || rerouteForm.zip);
    if (hasAddress && !(rerouteForm.street1 && rerouteForm.city && rerouteForm.state && rerouteForm.zip)) {
      setMsg('Reroute address is incomplete — street, city, state, and ZIP are all required, or clear the address to reroute by carrier/service only.');
      return;
    }
    if (!hasAddress && !rerouteForm.carrier && !rerouteForm.service) {
      setMsg('Nothing to reroute: give a new address, a carrier, or a service.');
      return;
    }
    setRerouting(true);
    try {
      const res = await fetch(`/api/admin/orders/${rerouteOrder.id}/reroute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_address: hasAddress ? { street1: rerouteForm.street1, city: rerouteForm.city, state: rerouteForm.state, zip: rerouteForm.zip } : undefined,
          carrier: rerouteForm.carrier || undefined,
          service: rerouteForm.service || undefined,
          reason: rerouteForm.reason || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.message || data.error || 'Reroute failed — the original shipment is unchanged.'); return; }
      setMsg(`Order ${rerouteOrder.label} rerouted — new ${data.label?.provider || ''} tracking ${data.label?.trackingNumber || ''}. ${data.note || ''}`);
      setRerouteOrder(null);
      loadOrders();
    } catch (e: any) { setMsg(e.message); } finally { setRerouting(false); }
  };

  // C2 · Escalate to Trust & Safety — opens an order case AND a T&S
  // investigation linked to the order (and its attributed seller).
  const doEscalate = async (o: Order) => {
    const reason = prompt(`Escalate order #${o.id.slice(0, 8)} to Trust & Safety — reason (required, recorded on the case and the investigation):`);
    if (reason == null) return;
    if (!reason.trim()) { setMsg('An escalation reason is required.'); return; }
    const typeRaw = prompt('Investigation type — counterfeit, stolen_property, ip_infringement, fraud_patterns, or safety_incidents:', 'fraud_patterns');
    if (typeRaw == null) return;
    try {
      const res = await fetch(`/api/admin/orders/${o.id}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim(), investigation_type: typeRaw.trim() || 'fraud_patterns', priority: 'high' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error || 'Escalation failed.'); return; }
      setMsg(`Order #${o.id.slice(0, 8)} escalated. ${data.note || ''}`);
      loadOrders();
    } catch (e: any) { setMsg(e.message); }
  };

  // C2 · Force refund — rides the finance spine's existing issue_refund
  // action (refunds-ledger row + balanced GL + audit, idempotent per
  // order). No duplicate refund machinery lives on this surface; the
  // processor leg executes production-side.
  const doRefund = async (o: Order) => {
    const total = Number(String(o.totalAmount || '').replace(/[^0-9.]/g, '')) || 0;
    const amtRaw = prompt(`Refund amount for order #${o.id.slice(0, 8)} (order total ${o.totalAmount || '—'}):`, total ? total.toFixed(2) : '');
    if (amtRaw == null) return;
    const amount = Number(amtRaw);
    if (!(amount > 0)) { setMsg('A positive refund amount is required.'); return; }
    const reason = prompt('Reason for the refund (recorded on the refund):', 'admin_force_refund') || 'admin_force_refund';
    try {
      const res = await fetch('/api/admin/finance/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'issue_refund', payload: { order_id: o.id, amount, reason } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) { setMsg(data.error || 'Refund failed.'); return; }
      setMsg(`Refund ${data.refundNumber || ''} issued for order #${o.id.slice(0, 8)} ($${amount.toFixed(2)}).`);
      loadOrders();
    } catch (e: any) { setMsg(e.message); }
  };

  // Create Retail Order modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', notes: '' });
  const [createItems, setCreateItems] = useState<Array<{ name: string; quantity: number; unitPrice: number }>>([]);
  const [newItem, setNewItem] = useState({ name: '', quantity: 1, unitPrice: 0 });

  const doCreateOrder = () => {
    setShowCreateModal(true);
    setCreateForm({ email: '', notes: '' });
    setCreateItems([]);
  };

  const addCreateItem = () => {
    if (!newItem.name || newItem.quantity <= 0) return;
    setCreateItems([...createItems, { ...newItem }]);
    setNewItem({ name: '', quantity: 1, unitPrice: 0 });
  };

  const submitCreateOrder = async () => {
    if (!createForm.email || createItems.length === 0) {
      setMsg('Email and at least one item are required.');
      return;
    }
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_email: createForm.email,
          notes: createForm.notes,
          line_items: createItems.map(i => ({
            name: i.name,
            quantity: i.quantity,
            unit_price: i.unitPrice,
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg('Retail order created.');
        setShowCreateModal(false);
        loadOrders();
      } else {
        setMsg(data.error || 'Failed to create order.');
      }
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const doLabel = (id: string) => {
    const o = orders.find(x => x.id === id);
    setLabelOrder({ id, label: o ? `#${o.id.slice(0, 8)}` : id.slice(0, 8) });
  };

  const doResendAlert = (id: string) => {
    resendAlert.mutate({ order_id: id }, {
      onSuccess: () => setMsg('Alert resent.'),
      onError: (e) => setMsg(e.message),
    });
  };

  const doBatchSlips = () => {
    const ids = visibleOrders.slice(0, 50).map(o => o.id);
    if (!ids.length) return;
    // SA-43: one batch print document with every visible order's slip,
    // printed on this device's printer via the print dialog.
    window.open(`/api/admin/orders/packing-slips?ids=${ids.map(encodeURIComponent).join(',')}`, '_blank');
    setMsg(`Opened batch print view: ${ids.length} packing slip${ids.length === 1 ? '' : 's'}.`);
  };

  const visibleOrders = useMemo(() => orders.filter(o => matchesFilter(o, filter)), [orders, filter]);
  const countFor = (f: string) => f === 'all' ? orders.length : orders.filter(o => matchesFilter(o, f)).length;

  if (loading) return <div className="">Loading orders...</div>;

  return (
    <div className="space-y-6 [font-family:Inter,system-ui,sans-serif]">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <span className="adm-badge">{orders.length} orders</span>
        {sourceCounts && (
          <>
            <span className="adm-badge">{sourceCounts.erp} ERP</span>
            <span className="adm-badge">{sourceCounts.commerce} manual retail</span>
            <span className="adm-badge">{sourceCounts.storefront} storefront</span>
          </>
        )}
      </div>

      {/* Quick actions — tree §4 order actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={doCreateOrder} className="rounded border border-[#171420] bg-[#171420] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#000000]">+ Create Order</button>
        <a href="/admin/orders/order-problem" data-tip="Something wrong with an order? This guide finds the order, asks what happened, and opens a support case with everything attached." className="rounded border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted">Report a problem</a>
        <button onClick={doCreatePo} className="rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Create PO</button>
        <button onClick={doRestock} className="rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Restock</button>
        <button onClick={doBatchSlips} className="rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Batch Slips</button>
        <button onClick={doExportCsv} className="rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Export CSV</button>
        <button onClick={doPickList} className="rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Pick List</button>
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      {/* Create Retail Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreateModal(false)}>
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Create Retail Order</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold">Customer Email</label>
                <input
                  value={createForm.email}
                  onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="customer@example.com"
                  className="mt-1 w-full rounded border border-border p-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Notes</label>
                <input
                  value={createForm.notes}
                  onChange={e => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="Order notes (optional)"
                  className="mt-1 w-full rounded border border-border p-2 text-sm"
                />
              </div>
              <div className="border-t pt-3">
                <label className="text-xs font-semibold">Items</label>
                {createItems.map((it, i) => (
                  <div key={i} className="mt-2 flex items-center justify-between rounded bg-muted p-2 text-sm">
                    <span>{it.quantity}× {it.name} — ${it.unitPrice.toFixed(2)}</span>
                    <button onClick={() => setCreateItems(createItems.filter((_, j) => j !== i))} className="text-red-600 text-xs">Remove</button>
                  </div>
                ))}
                <div className="mt-3 flex gap-2">
                  <input
                    value={newItem.name}
                    onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                    placeholder="Product name"
                    className="flex-1 rounded border border-border p-2 text-sm"
                  />
                  <input
                    type="number" min="1"
                    value={newItem.quantity}
                    onChange={e => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                    className="w-16 rounded border border-border p-2 text-sm"
                  />
                  <input
                    type="number" min="0" step="0.01"
                    value={newItem.unitPrice}
                    onChange={e => setNewItem({ ...newItem, unitPrice: Number(e.target.value) })}
                    placeholder="$"
                    className="w-20 rounded border border-border p-2 text-sm"
                  />
                  <button onClick={addCreateItem} className="rounded bg-muted px-3 py-2 text-xs font-semibold">Add</button>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button onClick={() => setShowCreateModal(false)} className="rounded border border-border px-4 py-2 text-sm">Cancel</button>
                <button onClick={submitCreateOrder} className="rounded border border-[#171420] bg-[#171420] px-4 py-2 text-sm font-semibold text-white hover:bg-[#000000]">Create Order</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order view filters — tree §2.1 Order Views */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${filter === f.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {f.label} <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{countFor(f.id)}</span>
          </button>
        ))}
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
      {/* C1 oversight — search (buyer / SKU / item · seller) + SLA facets.
          Facet counts come from the API over the tenant's whole population.
          The band sits above the table inside the same frame (the one
          list pattern). */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') loadOrders(); }}
          placeholder="Search buyer email/name, SKU, or item…"
          className="w-64 rounded border border-border p-1.5 text-xs"
        />
        <input
          value={sellerQuery}
          onChange={e => setSellerQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') loadOrders(); }}
          placeholder="Seller name or ID…"
          className="w-44 rounded border border-border p-1.5 text-xs"
        />
        <button onClick={() => loadOrders()} className="rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Search</button>
        {(query || sellerQuery || facet) && (
          <button onClick={() => { setQuery(''); setSellerQuery(''); setFacet(''); loadOrders({ q: '', seller: '', facet: '' }); }} className="text-xs text-muted-foreground underline">Clear</button>
        )}
        <span className="mx-1 h-4 w-px bg-border" />
        {([
          { id: '', label: 'All oversight' },
          { id: 'sla_breach', label: 'SLA breaches' },
          { id: 'late', label: 'Late' },
          { id: 'stuck', label: 'Stuck' },
        ] as const).map(f => (
          <button
            key={f.id || 'all'}
            onClick={() => pickFacet(f.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${facet === f.id ? 'bg-[#0a6400]/10 text-[#0a6400]' : 'bg-muted hover:bg-muted/70'}`}
          >
            {f.label}{facetCounts ? ` (${f.id === '' ? facetCounts.all : facetCounts[f.id as 'sla_breach' | 'late' | 'stuck']})` : ''}
          </button>
        ))}
      </div>

        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr>
              <th className="p-3 text-left">Order ID</th>
              <th className="p-3 text-left">Customer</th>
              <th className="p-3 text-left">Items</th>
              <th className="p-3 text-left">Total</th>
              <th className="p-3 text-left">Method</th>
              <th className="p-3 text-left">Payment</th>
              <th className="p-3 text-left">Fulfillment</th>
              <th className="p-3 text-left">SLA</th>
              <th className="p-3 text-left">Tracking</th>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleOrders.map(o => {
              const sla = slaInfo(o);
              return (
                <tr key={o.id} className="border-t border-border hover:bg-muted/50">
                  <td className="p-3 font-mono text-xs"><a href={o.detailHref || `/admin/order-details?id=${o.id}`} className="underline decoration-dotted underline-offset-4 hover:text-foreground" title="View order details">{o.orderNumber || o.id.slice(0, 8)}</a><div className="text-[10px] text-muted-foreground">{o.source === 'erp' ? 'ERP ledger' : o.source === 'storefront' ? 'Storefront' : o.source === 'commerce' ? 'Manual retail' : ''}</div></td>
                  <td className="p-3">
                    <div className="font-medium">{o.customerName || o.email || '—'}</div>
                  </td>
                  <td className="p-3 text-xs">
                    {o.items.length === 0 ? '—' : (
                      <div title={o.items.map(i => `${i.quantity}× ${i.name}`).join('\n')}>
                        <div className="font-medium">{o.itemCount} item{o.itemCount !== 1 ? 's' : ''}</div>
                        <div className="text-muted-foreground truncate max-w-[180px]">{o.items.map(i => i.name).join(', ')}</div>
                        {o.items.some(i => i.warehouses) && (
                          <div className="text-muted-foreground">{[...new Set(o.items.map(i => i.warehouses).filter(Boolean))].join(', ')}</div>
                        )}
                        {/* W3e/W6 read-only: frozen studio canvas JSON, for
                            observability / reprint recovery only. Suppliers
                            print from the design FILES, never this JSON. */}
                        {o.items.some(i => i.designSnapshot != null) && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[#0077c5]">Design snapshot{o.items.filter(i => i.designSnapshot != null).length > 1 ? `s (${o.items.filter(i => i.designSnapshot != null).length})` : ''} on file (read-only)</summary>
                            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-[10px] text-muted-foreground">{(() => { try { const s = JSON.stringify(o.items.find(i => i.designSnapshot != null)?.designSnapshot, null, 2) || ''; return s.length > 2000 ? s.slice(0, 2000) + '… (truncated)' : s; } catch { return 'Unrenderable snapshot.'; } })()}</pre>
                          </details>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-semibold">{o.totalAmount}</td>
                  <td className="p-3 text-xs">{o.fulfillmentMethod || '—'}</td>
                  <td className="p-3">
                    <span className={`adm-badge ${o.paymentStatus === 'paid' ? 'adm-badge-green' : 'adm-badge-amber'}`}>
                      {o.paymentStatus || o.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {editingId === o.id ? (
                      <select value={editForm.fulfillment_status} onChange={e => setEditForm({ ...editForm, fulfillment_status: e.target.value })} className="border border-border rounded p-1 text-xs">
                        <option value="pending">Pending</option>
                        <option value="processing">Processing</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    ) : (
                      <span className={`adm-badge ${o.fulfillmentStatus === 'delivered' ? 'adm-badge-green' : ''}`}>
                        {o.fulfillmentStatus}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {sla ? (
                      <span className={sla.overdue ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>{sla.label}</span>
                    ) : '—'}
                  </td>
                  <td className="p-3">
                    {editingId === o.id ? (
                      <div className="flex gap-1">
                        <input value={editForm.carrier} onChange={e => setEditForm({ ...editForm, carrier: e.target.value })} placeholder="UPS" className="border border-border rounded p-1 text-xs w-16" />
                        <input value={editForm.tracking_number} onChange={e => setEditForm({ ...editForm, tracking_number: e.target.value })} placeholder="1Z..." className="border border-border rounded p-1 text-xs w-32" />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{o.carrier ? `${o.carrier}: ${o.trackingNumber}` : '—'}</span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '—'}</td>
                  <td className="p-3">
                    {editingId === o.id ? (
                      <div className="flex gap-2">
                        <button onClick={() => updateOrder(o.id)} className="text-[#0a6400] hover:underline text-xs font-semibold">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-muted-foreground text-xs">Cancel</button>
                      </div>
                    ) : (<>
                      {/* W6: commerce sub-routes (edit/cancel/reroute/label/slip/
                          refund/handoff/escalate/alert) read commerce_orders
                          only — they must never receive an ERP or storefront
                          id. Non-commerce rows get their real detail surface
                          instead: ERP rows are worked (transition, note,
                          supplier push) on /admin/orders/[id]; storefront
                          orphans are worked from Ecommerce orders until
                          their webhook twin lands. */}
                      {o.source === 'erp' || o.source === 'storefront' ? (
                        <div className="flex flex-wrap gap-2">
                          <a href={o.detailHref || `/admin/order-details?id=${o.id}`} className="text-xs text-[#0077c5] underline" title="View order details">View</a>
                        </div>
                      ) : (
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => { setEditingId(o.id); setEditForm({ fulfillment_status: o.fulfillmentStatus || 'pending', tracking_number: o.trackingNumber || '', carrier: o.carrier || '' }); }} className="text-[#0077c5] hover:underline text-xs">Edit</button>
                        <a href={`/admin/order-details?id=${o.id}`} className="text-xs text-[#0077c5] underline" title="View order details">View</a>
                        <button onClick={() => doSlip(o.id)} className="text-xs text-[#0077c5] underline" title="Packing slip">Slip</button>
                        <button onClick={() => doLabel(o.id)} className="text-xs text-[#0077c5] underline" title="Shipping label">Label</button>
                        {!['delivered', 'cancelled'].includes((o.fulfillmentStatus || '').toLowerCase()) && (o.status || '').toLowerCase() !== 'cancelled' && (
                          <button onClick={() => { setRerouteOrder({ id: o.id, label: `#${o.id.slice(0, 8)}` }); setRerouteForm({ street1: '', city: '', state: '', zip: '', carrier: '', service: '', reason: '' }); }} className="text-xs text-[#0077c5] underline" title="Reroute shipment — void the current label and reissue to a new address or carrier (C2)">Reroute</button>
                        )}
                        <button onClick={() => doEscalate(o)} className="text-xs underline text-amber-700" title="Escalate to Trust & Safety — opens an order case + a T&S investigation (C2)">Escalate T&amp;S</button>
                        <button onClick={() => doResendAlert(o.id)} className="text-xs text-[#0077c5] underline" title="Resend alert">Alert</button>
                        {(o.fulfillmentMethod || '').toLowerCase().includes('pickup') && o.fulfillmentStatus !== 'delivered' && (
                          <button onClick={() => doHandoff(o.id)} className="text-xs underline text-[#0a6400]" title="Mark as handed off">Handoff</button>
                        )}
                        {!['delivered', 'cancelled'].includes((o.fulfillmentStatus || '').toLowerCase()) && (o.status || '').toLowerCase() !== 'cancelled' && (
                          <button onClick={() => doCancel(o)} className="text-xs underline text-red-600" title="Force cancel this order (C2)">Cancel</button>
                        )}
                        {(o.paymentStatus || '').toLowerCase() !== 'refunded' && (o.status || '').toLowerCase() !== 'refunded' && (
                          <button onClick={() => doRefund(o)} className="text-xs text-[#0077c5] underline" title="Force refund via the finance refund spine (C2)">Refund</button>
                        )}
                      </div>
                      )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        {visibleOrders.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">No orders in this view.</p>
        )}
      </div>

      {labelOrder && (
        <ShippingLabelModal
          orderId={labelOrder.id}
          orderLabel={labelOrder.label}
          onClose={() => setLabelOrder(null)}
          onLabelPurchased={loadOrders}
        />
      )}

      {rerouteOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold">Reroute shipment — order {rerouteOrder.label}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              The current label is superseded and a replacement is purchased through the configured
              carrier stack. If shipping is not configured, nothing changes. Leave the address blank
              to keep the destination and change only carrier/service.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
              <label className="col-span-2 flex flex-col gap-1">
                <span className="font-medium">New street address</span>
                <input value={rerouteForm.street1} onChange={(e) => setRerouteForm({ ...rerouteForm, street1: e.target.value })} className="border rounded p-2" placeholder="123 Main St" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium">City</span>
                <input value={rerouteForm.city} onChange={(e) => setRerouteForm({ ...rerouteForm, city: e.target.value })} className="border rounded p-2" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-medium">State</span>
                  <input value={rerouteForm.state} onChange={(e) => setRerouteForm({ ...rerouteForm, state: e.target.value })} className="border rounded p-2" placeholder="TN" maxLength={2} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-medium">ZIP</span>
                  <input value={rerouteForm.zip} onChange={(e) => setRerouteForm({ ...rerouteForm, zip: e.target.value })} className="border rounded p-2" placeholder="38141" />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="font-medium">Carrier (optional)</span>
                <input value={rerouteForm.carrier} onChange={(e) => setRerouteForm({ ...rerouteForm, carrier: e.target.value })} className="border rounded p-2" placeholder="e.g. UPS, FedEx, USPS" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium">Service (optional)</span>
                <input value={rerouteForm.service} onChange={(e) => setRerouteForm({ ...rerouteForm, service: e.target.value })} className="border rounded p-2" placeholder="e.g. Ground, Priority" />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="font-medium">Reason (recorded on the order)</span>
                <input value={rerouteForm.reason} onChange={(e) => setRerouteForm({ ...rerouteForm, reason: e.target.value })} className="border rounded p-2" placeholder="Customer moved / wrong address at checkout…" />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setRerouteOrder(null)} className="rounded border px-4 py-2 text-sm">Cancel</button>
              <button onClick={doReroute} disabled={rerouting} className="rounded border border-[#171420] bg-[#171420] px-4 py-2 text-sm font-semibold text-white hover:bg-[#000000] disabled:opacity-50">
                {rerouting ? 'Rerouting…' : 'Void & reissue label'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

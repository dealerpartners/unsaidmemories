'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShoppingBag, 
  Search, 
  Download, 
  Plus, 
  Printer, 
  Truck, 
  Store, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ChevronRight,
  Filter,
  ExternalLink,
  Barcode,
  Package,
  Layers
} from 'lucide-react';
import { DawgNavSection } from '@/lib/types';

interface OrdersViewProps {
  onNavigateSection?: (section: DawgNavSection) => void;
  onOpenOrderDetails?: (orderId: string) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({ 
  onNavigateSection,
  onOpenOrderDetails 
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'unfulfilled' | 'ready' | 'pickup' | 'shipped' | 'delivered' | 'returns'>('unfulfilled');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [mtdRevenue, setMtdRevenue] = useState<number | null>(null);
  // Real queue counts + oversight facets from GET /api/admin/orders
  // (§2.1.1 — the tiles/tabs previously rendered hardcoded numbers),
  // and the returns action count from GET /api/admin/returns facets.
  const [counts, setCounts] = useState<{ all: number; unfulfilled: number; ready: number; pickup: number; shipped: number; delivered: number } | null>(null);
  const [facets, setFacets] = useState<{ sla_breach: number; late: number; stuck: number } | null>(null);
  const [returnsActionCount, setReturnsActionCount] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Create Order modal (§2.1.4) — posts to the real POST /api/admin/orders.
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<{ email: string; notes: string; lines: { name: string; quantity: number; unit_price: number }[] }>({
    email: '', notes: '', lines: [{ name: '', quantity: 1, unit_price: 0 }],
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // MTD revenue from the dashboard KPIs API (real data, no hardcode)
  useEffect(() => {
    fetch('/api/admin/dashboard/kpis', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const v = j?.data?.mtdRevenue;
        if (typeof v === 'number') setMtdRevenue(v);
      })
      .catch(() => {});
  }, []);

  // ---- LIVE DATA ----
  // Real orders come from GET /api/admin/orders (commerce_orders, written
  // by the Stripe shop checkout + booking deposit flow). When the fetch
  // returns no rows the table shows an honest empty state — no demo orders.
  type OrderRow = {
    id: string;
    time: string;
    dateText: string;
    customer: string;
    items: string;
    bins: string;
    total: number;
    payment: string;
    method: string;
    methodType: 'pickup' | 'shipping';
    weight: string;
    urgency: string;
    due: string;
    slaState: 'breach' | 'late' | 'due_soon' | 'on_track' | null;
    sellerId: string | null;
    status: 'UNFULFILLED' | 'READY' | 'LOCAL_PICKUP' | 'SHIPPED' | 'DELIVERED';
  };
  const [realOrders, setRealOrders] = useState<OrderRow[]>([]);
  const [realOrdersLoading, setRealOrdersLoading] = useState(true);

  // Money on commerce_orders is TEXT in the "$25.27" format.
  const parseMoney = (v: unknown): number => {
    if (typeof v === 'number') return v;
    const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  const loadOrders = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/orders');
      const d = r.ok ? await r.json() : { orders: [] };
      if (d.counts) setCounts(d.counts);
      if (d.facets) setFacets({ sla_breach: d.facets.sla_breach || 0, late: d.facets.late || 0, stuck: d.facets.stuck || 0 });
      const rows: OrderRow[] = (d.orders || []).map((o: any) => {
        const createdIso = o.createdAt || null;
        let dateText = '—';
        let time = '—';
        if (createdIso) {
          const dt = new Date(createdIso);
          if (!isNaN(dt.getTime())) {
            dateText = dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            const minsAgo = Math.max(0, Math.floor((Date.now() - dt.getTime()) / 60000));
            if (minsAgo < 60) time = `${minsAgo}m ago`;
            else if (minsAgo < 1440) time = `${Math.floor(minsAgo / 60)}h ago`;
            else time = `${Math.floor(minsAgo / 1440)}d ago`;
          }
        }
        const itemsText = (o.items || []).map((it: any) => `${it.quantity}× ${it.name}`).join(', ') || (o.itemCount ? `${o.itemCount} item${o.itemCount > 1 ? 's' : ''}` : '—');
        const binsText = [...new Set((o.items || []).map((it: any) => it.warehouses).filter(Boolean))].join(', ') || '—';
        const methodRaw = String(o.fulfillmentMethod || '');
        const methodType: 'pickup' | 'shipping' = methodRaw.toLowerCase().includes('ship') ? 'shipping' : 'pickup';
        const payment = (o.paymentStatus || '').toUpperCase() === 'PAID' ? 'PAID (ONLINE)' : (o.paymentStatus || 'UNPAID').toUpperCase();
        const total = parseMoney(o.totalAmount ?? o.subtotal);
        // SLA (§2.1.2b): state + due stamp computed by the orders API
        // from the standing 48h fulfillment convention.
        const slaState = (o.slaState ?? null) as OrderRow['slaState'];
        let due = '—';
        if (o.slaDueAt) {
          const dueDt = new Date(o.slaDueAt);
          if (!isNaN(dueDt.getTime())) {
            const hrs = Math.round((dueDt.getTime() - Date.now()) / 3600000);
            due = hrs < 0
              ? `Overdue ${Math.abs(hrs)}h`
              : `Due ${dueDt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
          }
        }
        // Display bucket comes from the API (displayStatus) so the tab
        // counts and the rows can never disagree.
        const status = (['UNFULFILLED', 'READY', 'LOCAL_PICKUP', 'SHIPPED', 'DELIVERED'].includes(o.displayStatus) ? o.displayStatus : 'UNFULFILLED') as OrderRow['status'];
        return {
          id: o.id || '—',
          time,
          dateText,
          customer: o.customerName || o.email || 'Guest',
          items: itemsText,
          bins: binsText,
          total,
          payment,
          method: methodRaw === 'local_pickup' ? 'Local Pickup' : methodRaw === 'ship' ? 'Shipping' : methodRaw ? methodRaw.replace(/_/g, ' ') : (methodType === 'pickup' ? 'In-Salon Counter' : 'Shipping'),
          methodType,
          weight: '—',
          urgency: String(o.status || '').toUpperCase(),
          due,
          slaState,
          sellerId: o.sellerId ?? null,
          status,
        } as OrderRow;
      });
      setRealOrders(rows);
    } catch {
      setRealOrders([]);
    } finally {
      setRealOrdersLoading(false);
    }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  // Returns action count for the Returns tile/tab (returns API facets).
  useEffect(() => {
    fetch('/api/admin/returns')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const n = j?.facets?.action_required ?? j?.facets?.all;
        if (typeof n === 'number') setReturnsActionCount(n);
      })
      .catch(() => {});
  }, []);

  const submitCreateOrder = async () => {
    const lines = createForm.lines.filter((l) => l.name.trim() && l.quantity > 0);
    if (!createForm.email.trim()) { setCreateError('Customer email is required.'); return; }
    if (!lines.length) { setCreateError('Add at least one line item with a name and quantity.'); return; }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_email: createForm.email.trim(), notes: createForm.notes, line_items: lines }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setCreateError(j.error || 'The order could not be created.'); return; }
      setShowCreate(false);
      setCreateForm({ email: '', notes: '', lines: [{ name: '', quantity: 1, unit_price: 0 }] });
      setNotice(`Order created${j.orderId ? ` (${String(j.orderId).slice(0, 8)}…)` : ''} — it is in the queue as unpaid / unfulfilled.`);
      void loadOrders();
    } catch {
      setCreateError('The order could not be created — network error.');
    } finally {
      setCreating(false);
    }
  };

  // Flag → case (§2.4.6): a seller-attributed order flags into the
  // Trust Center (a seller_investigations case against its seller); an
  // unattributed order flags into an order case on the order itself,
  // the case system Order Details works. Either way a real case opens.
  const [flagOrderRow, setFlagOrderRow] = useState<OrderRow | null>(null);
  const [flagType, setFlagType] = useState('fraud_patterns');
  const [flagReason, setFlagReason] = useState('');
  const [flagBusy, setFlagBusy] = useState(false);

  const submitFlag = async () => {
    if (!flagOrderRow) return;
    if (!flagReason.trim()) { setNotice('Add why this order is being flagged — it goes on the case.'); return; }
    setFlagBusy(true);
    try {
      if (flagOrderRow.sellerId) {
        const res = await fetch('/api/admin/trust-safety/investigations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seller_id: flagOrderRow.sellerId,
            investigation_type: flagType,
            priority: 'medium',
            notes: `Flagged from the Orders queue. Order ${flagOrderRow.id} (${flagOrderRow.customer}): ${flagReason.trim()}`,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { setNotice(j.error || 'The trust case could not be opened.'); return; }
        setNotice(`Trust case opened for order ${flagOrderRow.id.slice(0, 8)}… — the flag is with the Trust Center.`);
      } else {
        const res = await fetch(`/api/admin/orders/${encodeURIComponent(flagOrderRow.id)}/cases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: 'Flagged from the Orders queue', reason: flagType.replace(/_/g, ' '), note: flagReason.trim() }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { setNotice(j.error || 'The order case could not be opened.'); return; }
        setNotice(`Order case opened on ${flagOrderRow.id.slice(0, 8)}… (no seller is attributed to this order, so the case rides the order itself).`);
      }
      setFlagOrderRow(null);
      setFlagReason('');
    } catch {
      setNotice('The flag could not be saved — network error.');
    } finally {
      setFlagBusy(false);
    }
  };

  const handoverOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/handoff`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(j.error || `Handoff failed for order ${orderId}.`); return; }
      setNotice(`Order ${orderId.slice(0, 8)}… handed off — marked delivered.`);
      void loadOrders();
    } catch {
      setNotice(`Handoff failed for order ${orderId} — network error.`);
    }
  };

  const orders: OrderRow[] = realOrders;
  const handleToggleSelect = (id: string) => {
    setSelectedOrders(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === orders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(orders.map(o => o.id));
    }
  };

  const filteredOrders = orders.filter((ord) => {
    if (activeTab === 'unfulfilled' && ord.status !== 'UNFULFILLED') return false;
    if (activeTab === 'ready' && ord.status !== 'READY' && ord.status !== 'LOCAL_PICKUP') return false;
    if (activeTab === 'pickup' && ord.methodType !== 'pickup') return false;
    if (activeTab === 'shipped' && ord.status !== 'SHIPPED') return false;
    if (activeTab === 'delivered' && ord.status !== 'DELIVERED') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        ord.id.toLowerCase().includes(q) ||
        ord.customer.toLowerCase().includes(q) ||
        ord.items.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto text-foreground bg-card min-h-full">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground mb-1">
            <span className="bg-primary text-primary-foreground px-1.5 py-0.5 font-semibold">OMS // LIVE QUEUE</span>
            <span>/</span>
            <span className="text-foreground font-semibold">STATION: MAIN-SALON-A</span>
          </div>
          <h1 className="text-2xl font-semibold uppercase tracking-tight text-foreground">
            Orders &amp; Fulfillment
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Manage customer retail orders, track warehouse picking queues, and coordinate shipping dispatches.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              // §2.1.5 / §2.8.2 — the real CSV export endpoint; it takes
              // the current view id and applies the same predicate the
              // tab filters by.
              const qs = activeTab !== 'all' && activeTab !== 'returns' ? `?status=${activeTab}` : '';
              window.open(`/api/admin/orders/export${qs}`, '_blank');
            }}
            className="h-9 px-3 border border-border bg-card hover:bg-accent/50 text-foreground font-semibold text-[13px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button 
            onClick={() => onNavigateSection?.('shipping')}
            className="h-9 px-3 border border-border bg-card hover:bg-accent/50 text-foreground font-semibold text-[13px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Shipping &amp; Labels</span>
          </button>
          <button
            onClick={() => {
              // SA-43: batch print document for the orders in the current
              // view — prints on this device's printer via the dialog.
              const ids = filteredOrders.slice(0, 50).map((o) => o.id);
              if (!ids.length) { alert('No orders in the current view to print slips for.'); return; }
              window.open(`/api/admin/orders/packing-slips?ids=${ids.map(encodeURIComponent).join(',')}`, '_blank');
            }}
            className="h-9 px-3 border border-border bg-card hover:bg-accent/50 text-foreground font-semibold text-[13px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Batch Slips</span>
          </button>
          <button
            onClick={() => { setCreateError(null); setShowCreate(true); }}
            className="h-9 px-4 bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 font-semibold text-[13px] uppercase tracking-wider flex items-center gap-1.5 border border-border cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Create Order</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="border border-border bg-muted/40 px-4 py-2.5 text-[13px] font-medium text-foreground flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* KPI 6-Tile Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div 
          onClick={() => setActiveTab('unfulfilled')}
          className="border border-border p-4 bg-card flex flex-col justify-between cursor-pointer hover:bg-accent/50 shadow-card"
        >
          <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>Unfulfilled</span>
            <span className="w-2 h-2 bg-black animate-pulse"></span>
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-2 tracking-tight text-foreground">{counts ? counts.unfulfilled : '—'}</p>
          <p className="text-[10px] text-foreground font-semibold tabular-nums mt-0.5">{facets && facets.sla_breach > 0 ? `${facets.sla_breach} past SLA` : 'Within SLA window'}</p>
        </div>

        <div 
          onClick={() => setActiveTab('ready')}
          className="border border-border p-4 bg-card flex flex-col justify-between cursor-pointer hover:bg-accent/50"
        >
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Ready to Ship</span>
            <Truck className="w-3.5 h-3.5 text-foreground" />
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-2 tracking-tight text-foreground">{counts ? counts.ready : '—'}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">Packed &amp; Staged</p>
        </div>

        <div 
          onClick={() => setActiveTab('pickup')}
          className="border border-border p-4 bg-card flex flex-col justify-between cursor-pointer hover:bg-accent/50"
        >
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Local Pickup</span>
            <Store className="w-3.5 h-3.5 text-foreground" />
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-2 tracking-tight text-foreground">{counts ? counts.pickup : '—'}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">Awaiting collection</p>
        </div>

        <div 
          onClick={() => setActiveTab('shipped')}
          className="border border-border p-4 bg-card flex flex-col justify-between cursor-pointer hover:bg-accent/50"
        >
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Shipped</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-foreground" />
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-2 tracking-tight text-foreground">{counts ? counts.shipped : '—'}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">{facets && facets.late > 0 ? `${facets.late} late in transit` : 'Dispatched'}</p>
        </div>

        <div 
          onClick={() => onNavigateSection?.('returns')}
          className="border border-border p-4 bg-card flex flex-col justify-between cursor-pointer hover:bg-accent/50"
        >
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Returns / Issues</span>
            <AlertTriangle className="w-3.5 h-3.5 text-foreground" />
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-2 tracking-tight text-foreground">{returnsActionCount ?? '—'}</p>
          <p className="text-[10px] text-foreground font-semibold tabular-nums mt-0.5">RMA Action Req</p>
        </div>

        <div className="border border-border p-4 bg-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>MTD Revenue</span>
            <ShoppingBag className="w-3.5 h-3.5 text-foreground" />
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-2 tracking-tight text-foreground">
            {mtdRevenue === null ? '—' : `$${mtdRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          </p>
          <p className="text-[10px] text-foreground font-semibold tabular-nums mt-0.5">Month to date</p>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="border border-border bg-card">
        {/* Navigation Tabs */}
        <div className="flex items-center overflow-x-auto border-b border-border">
          {[
            { id: 'all', label: 'All Orders', count: counts?.all },
            { id: 'unfulfilled', label: 'Unfulfilled', count: counts?.unfulfilled },
            { id: 'ready', label: 'Ready to Ship', count: counts?.ready },
            { id: 'pickup', label: 'Local Pickup', count: counts?.pickup },
            { id: 'shipped', label: 'Shipped', count: counts?.shipped },
            { id: 'delivered', label: 'Delivered', count: counts?.delivered },
            { id: 'returns', label: 'Returns / Refunds', count: returnsActionCount ?? undefined },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === 'returns') {
                  onNavigateSection?.('returns');
                } else {
                  setActiveTab(tab.id as any);
                }
              }}
              className={`px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wider border-r border-border whitespace-nowrap cursor-pointer transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-foreground hover:bg-accent/50'
              }`}
            >
              {tab.label} ({tab.count ?? '—'})
            </button>
          ))}
        </div>

        {/* Search & Filter bar */}
        <div className="p-3 bg-muted/30 border-b border-border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search order #, SKU, or customer..."
              className="w-full h-8 pl-8 pr-3 text-[13px] bg-card border border-border text-foreground placeholder-neutral-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button 
              onClick={() => onNavigateSection?.('shipping')}
              className="h-8 px-3 border border-border bg-card hover:bg-accent/50 text-foreground text-[13px] font-semibold uppercase flex items-center gap-1 cursor-pointer"
            >
              <Truck className="w-3 h-3" />
              <span>Label Station</span>
            </button>
            <button 
              onClick={() => onNavigateSection?.('purchase-orders')}
              className="h-8 px-3 border border-border bg-card hover:bg-accent/50 text-foreground text-[13px] font-semibold uppercase flex items-center gap-1 cursor-pointer"
            >
              <Package className="w-3 h-3" />
              <span>Purchase Orders</span>
            </button>
          </div>
        </div>

        {/* Batch Actions Toolbar */}
        <div className="p-2 bg-muted/40 border-b border-border flex items-center justify-between text-[13px] tabular-nums">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer font-semibold uppercase">
              <input 
                type="checkbox"
                checked={selectedOrders.length === orders.length && orders.length > 0}
                onChange={handleSelectAll}
                className="rounded-lg border-border accent-primary"
              />
              <span>{selectedOrders.length} Selected</span>
            </label>
            <span className="text-muted-foreground/70">|</span>
            <button 
              onClick={handleSelectAll}
              className="underline font-semibold uppercase text-foreground hover:opacity-70"
            >
              Select All
            </button>
            <button 
              onClick={() => setSelectedOrders([])}
              className="text-muted-foreground uppercase hover:text-foreground"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.open('/api/admin/orders/pick-list', '_blank')}
              className="px-2.5 py-1 border border-border bg-card hover:bg-accent/50 font-semibold uppercase text-[10px] cursor-pointer"
            >
              Print Pick List
            </button>
            <button 
              onClick={() => onNavigateSection?.('shipping')}
              disabled={selectedOrders.length === 0}
              className="px-2.5 py-1 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold uppercase text-[10px] disabled:opacity-40 cursor-pointer"
            >
              Batch Labels
            </button>
          </div>
        </div>

        {/* Orders Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] text-foreground border-collapse">
            <thead>
              <tr className="bg-muted/30 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-foreground">
                <th className="py-2.5 px-3 w-10 text-center border-r border-border">#</th>
                <th className="py-2.5 px-3 border-r border-border">Order # &amp; SLA</th>
                <th className="py-2.5 px-3 border-r border-border">Date &amp; Age</th>
                <th className="py-2.5 px-3 border-r border-border">Customer</th>
                <th className="py-2.5 px-3 border-r border-border">Items &amp; Bin Location</th>
                <th className="py-2.5 px-3 border-r border-border text-right">Total</th>
                <th className="py-2.5 px-3 border-r border-border">Method</th>
                <th className="py-2.5 px-3 border-r border-border text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-[12px]">
              {filteredOrders.map((ord) => {
                const isSelected = selectedOrders.includes(ord.id);
                return (
                  <tr key={ord.id} className={`hover:bg-accent/50 transition-colors ${isSelected ? 'bg-muted/30' : ''}`}>
                    <td className="py-3 px-3 text-center border-r border-border">
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(ord.id)}
                        className="rounded-lg border-border accent-primary cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3 border-r border-border">
                      <button
                        onClick={() => {
                          if (onOpenOrderDetails) {
                            onOpenOrderDetails(ord.id);
                          } else {
                            onNavigateSection?.('order-details');
                          }
                        }}
                        className="font-semibold text-foreground hover:underline text-left cursor-pointer"
                      >
                        {ord.id}
                      </button>
                      <div className="flex items-center gap-1 mt-0.5">
                        {ord.slaState ? (
                          <span className={`px-1 py-0.2 text-[9px] font-semibold uppercase ${
                            ord.slaState === 'breach' ? 'bg-red-600 text-white'
                            : ord.slaState === 'late' ? 'bg-amber-500 text-white'
                            : ord.slaState === 'due_soon' ? 'bg-amber-200 text-amber-900'
                            : 'bg-muted text-muted-foreground'
                          }`}>
                            {ord.slaState === 'breach' ? 'SLA Breach' : ord.slaState === 'late' ? 'Late' : ord.slaState === 'due_soon' ? 'Due Soon' : 'On Track'}
                          </span>
                        ) : (
                          <span className="px-1 py-0.2 bg-primary text-primary-foreground text-[9px] font-semibold uppercase">{ord.urgency}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground font-semibold">{ord.due}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 border-r border-border">
                      <p className="font-semibold text-foreground">{ord.time}</p>
                      <p className="text-[10px] text-muted-foreground">{ord.dateText}</p>
                    </td>
                    <td className="py-3 px-3 border-r border-border font-sans">
                      <p className="font-semibold text-foreground uppercase">{ord.customer}</p>
                    </td>
                    <td className="py-3 px-3 border-r border-border font-sans max-w-xs">
                      <p className="font-medium text-foreground truncate">{ord.items}</p>
                      <p className="text-[10px] tabular-nums text-muted-foreground uppercase">{ord.bins}</p>
                    </td>
                    <td className="py-3 px-3 border-r border-border text-right">
                      <p className="font-semibold text-foreground">${ord.total.toFixed(2)}</p>
                      <p className="text-[9px] font-semibold text-muted-foreground">{ord.payment}</p>
                    </td>
                    <td className="py-3 px-3 border-r border-border">
                      <p className="font-semibold text-foreground">{ord.method}</p>
                      <p className="text-[10px] text-muted-foreground">Wt: {ord.weight}</p>
                    </td>
                    <td className="py-3 px-3 border-r border-border text-center">
                      <span className={`inline-block px-2 py-0.5 border border-border text-[10px] font-semibold uppercase ${
                        ord.status === 'UNFULFILLED'
                          ? 'bg-primary text-primary-foreground'
                          : ord.status === 'READY'
                          ? 'bg-muted/40 text-foreground'
                          : 'bg-card text-foreground'
                      }`}>
                        {ord.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            if (ord.methodType === 'pickup') {
                              void handoverOrder(ord.id);
                            } else {
                              onNavigateSection?.('shipping');
                            }
                          }}
                          className="px-2 py-1 bg-primary text-primary-foreground hover:bg-primary/90 text-[10px] font-semibold uppercase transition-colors cursor-pointer"
                        >
                          {ord.methodType === 'pickup' ? 'Handover' : 'Fulfill'}
                        </button>
                        <button
                          onClick={() => { setFlagType('fraud_patterns'); setFlagReason(''); setFlagOrderRow(ord); }}
                          className="px-2 py-1 border border-border bg-card hover:bg-accent/50 text-[10px] font-semibold uppercase cursor-pointer"
                          title="Flag this order — opens a trust case (seller-attributed) or an order case"
                        >
                          Flag
                        </button>
                        <button
                          onClick={() => onNavigateSection?.('order-details')}
                          className="px-1.5 py-1 border border-border bg-card hover:bg-accent/50 text-[10px] cursor-pointer"
                          title="View Order Details"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!realOrdersLoading && filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    No orders yet. New shop and salon orders will appear here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-3 bg-muted/30 border-t border-border flex items-center justify-between text-[13px]">
          <p className="text-muted-foreground text-[12px] uppercase">
            Showing {filteredOrders.length} of {orders.length} orders
          </p>
        </div>
      </div>

      {/* Flag order (§2.4.6) — trust case or order case, per attribution */}
      {flagOrderRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !flagBusy && setFlagOrderRow(null)}>
          <div className="w-full max-w-md bg-card border border-border p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold uppercase tracking-tight">Flag Order</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Order {flagOrderRow.id.slice(0, 8)}… · {flagOrderRow.customer}.{' '}
              {flagOrderRow.sellerId
                ? 'This order is seller-attributed — the flag opens a Trust Center investigation against the seller.'
                : 'No seller is attributed to this order — the flag opens an order case on the order itself.'}
            </p>
            <label className="block mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Case type</label>
            <select
              value={flagType}
              onChange={(e) => setFlagType(e.target.value)}
              className="mt-1 w-full h-9 px-2 text-[13px] bg-card border border-border text-foreground focus:outline-none"
            >
              <option value="counterfeit">Counterfeit</option>
              <option value="stolen_property">Stolen property</option>
              <option value="ip_infringement">IP infringement</option>
              <option value="fraud_patterns">Fraud patterns</option>
              <option value="safety_incidents">Safety incidents</option>
            </select>
            <label className="block mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Why is this flagged?</label>
            <textarea
              rows={3}
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              className="mt-1 w-full p-2 text-[13px] bg-card border border-border text-foreground focus:outline-none resize-none"
              placeholder="The reason recorded on the case…"
            />
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setFlagOrderRow(null)}
                disabled={flagBusy}
                className="flex-1 h-9 border border-border bg-card hover:bg-accent/50 text-[13px] font-semibold uppercase disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitFlag()}
                disabled={flagBusy}
                className="flex-1 h-9 bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-semibold uppercase disabled:opacity-50 cursor-pointer"
              >
                {flagBusy ? 'Opening…' : 'Open Case'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Order (§2.1.4) — manual retail order via POST
          /api/admin/orders (customer find-or-create by email, order +
          line items written to commerce_orders / commerce_order_items). */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !creating && setShowCreate(false)}>
          <div className="w-full max-w-lg bg-card border border-border p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold uppercase tracking-tight">Create Retail Order</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">The order enters the queue as unpaid / unfulfilled. Payment is taken through the normal checkout or POS flow.</p>

            <label className="block mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer email</label>
            <input
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="customer@example.com"
              className="mt-1 w-full h-9 px-3 text-[13px] bg-card border border-border text-foreground focus:outline-none"
            />

            <label className="block mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Line items</label>
            <div className="mt-1 space-y-2">
              {createForm.lines.map((line, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={line.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, name: e.target.value } : l)) }))}
                    placeholder="Item name"
                    className="flex-1 h-9 px-3 text-[13px] bg-card border border-border text-foreground focus:outline-none"
                  />
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => setCreateForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, quantity: Math.max(0, Number(e.target.value) || 0) } : l)) }))}
                    className="w-16 h-9 px-2 text-[13px] bg-card border border-border text-foreground focus:outline-none"
                    aria-label="Quantity"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.unit_price}
                    onChange={(e) => setCreateForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, unit_price: Math.max(0, Number(e.target.value) || 0) } : l)) }))}
                    className="w-24 h-9 px-2 text-[13px] bg-card border border-border text-foreground focus:outline-none"
                    aria-label="Unit price"
                  />
                  {createForm.lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setCreateForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}
                      className="text-muted-foreground hover:text-foreground cursor-pointer px-1"
                      aria-label="Remove line"
                    >✕</button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCreateForm((f) => ({ ...f, lines: [...f.lines, { name: '', quantity: 1, unit_price: 0 }] }))}
                className="text-[12px] font-semibold uppercase text-foreground underline cursor-pointer"
              >
                + Add line
              </button>
            </div>

            <label className="block mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</label>
            <textarea
              rows={2}
              value={createForm.notes}
              onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
              className="mt-1 w-full p-2 text-[13px] bg-card border border-border text-foreground focus:outline-none resize-none"
            />

            <div className="mt-3 flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground uppercase text-[11px] font-semibold">Subtotal</span>
              <span className="font-semibold">${createForm.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0).toFixed(2)}</span>
            </div>

            {createError && <p className="mt-3 text-[13px] font-medium text-red-600">{createError}</p>}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowCreate(false)}
                disabled={creating}
                className="flex-1 h-9 border border-border bg-card hover:bg-accent/50 text-[13px] font-semibold uppercase disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitCreateOrder()}
                disabled={creating}
                className="flex-1 h-9 bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-semibold uppercase disabled:opacity-50 cursor-pointer"
              >
                {creating ? 'Creating…' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

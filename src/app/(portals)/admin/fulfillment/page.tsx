'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  useAdvanceFulfillment,
  useResendFulfillmentAlert,
} from '@/hooks/admin/useActions';
import {
  Package, Truck, CheckCircle2, Clock, AlertCircle, Printer,
  Mail, ExternalLink, Zap, MapPin, ShoppingBag,
} from 'lucide-react';
import type { DawgNavSection } from '@/lib/types';
import ShippingLabelModal from '@/components/portal/ShippingLabelModal';

type Order = {
  id: string;
  email: string;
  customerName: string | null;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  fulfillmentMethod: string | null;
  totalAmount: string;
  shippingAddress: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  packedAt: string | null;
  createdAt: string;
  items: { id: string; name: string; quantity: number; unitPrice: string }[];
};

const STAGES = [
  { id: 'unfulfilled', label: 'Unfulfilled', icon: Clock, color: 'text-warning' },
  { id: 'rush', label: 'Rush Queue', icon: Zap, color: 'text-destructive' },
  { id: 'ready', label: 'Ready to Ship', icon: Package, color: 'text-primary' },
  { id: 'packed', label: 'Packed & Staged', icon: CheckCircle2, color: 'text-primary' },
  { id: 'pickup', label: 'Local Pickup', icon: MapPin, color: 'text-muted-foreground' },
  { id: 'curbside', label: 'Curbside Arrived', icon: MapPin, color: 'text-muted-foreground' },
  { id: 'shipped', label: 'Shipped Today', icon: Truck, color: 'text-success' },
  { id: 'dispatched', label: 'Dispatched', icon: CheckCircle2, color: 'text-success' },
] as const;

export default function FulfillmentPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState<string>('unfulfilled');
  const [msg, setMsg] = useState('');
  const [labelOrderId, setLabelOrderId] = useState<string | null>(null);
  // Postage queue: walk the stage's orders through the single-order label
  // modal one at a time (postage is real money — no bulk buy). Closing the
  // modal advances; `purchased` counts labels actually bought along the way.
  const [labelQueue, setLabelQueue] = useState<{ ids: string[]; index: number; purchased: number } | null>(null);

  // Quick action hooks — tree §5 fulfillment actions
  const advanceStage = useAdvanceFulfillment();
  const resendAlert = useResendFulfillmentAlert();

  const doAdvance = (orderId: string) => {
    const next = prompt('Advance to stage (ready/packed/shipped/delivered):', 'ready');
    if (!next) return;
    advanceStage.mutate({ order_id: orderId, stage: next } as any, {
      onSuccess: () => { setMsg('Stage advanced.'); refresh(); },
      onError: (e) => setMsg(e.message),
    });
  };

  const doSlip = (orderId: string) => {
    // Printable packing slip (HTML endpoint, auto-prints) — the same one
    // the Orders list and order detail open. The old handler fired the
    // data action and discarded the result, so nothing ever printed.
    window.open(`/api/admin/orders/${orderId}/packing-slip`, '_blank');
  };

  const doLabel = (orderId: string) => {
    // Single-order label: cancels any postage queue walk in progress.
    setLabelQueue(null);
    setLabelOrderId(orderId);
  };

  const closeLabel = () => {
    if (labelQueue) {
      const { ids, index, purchased } = labelQueue;
      if (index + 1 < ids.length) {
        setLabelQueue({ ids, index: index + 1, purchased });
        setLabelOrderId(ids[index + 1]);
        return;
      }
      setMsg(`Postage queue complete — ${purchased} of ${ids.length} orders got a new label.`);
      setLabelQueue(null);
    }
    setLabelOrderId(null);
  };

  const handleLabelPurchased = () => {
    refresh();
    if (labelQueue) {
      setLabelQueue((q) => (q ? { ...q, purchased: q.purchased + 1 } : q));
    }
  };

  const endLabelQueue = () => {
    if (labelQueue) {
      setMsg(`Postage queue ended — ${labelQueue.purchased} label(s) purchased across ${labelQueue.ids.length} orders.`);
    }
    setLabelQueue(null);
    setLabelOrderId(null);
  };

  const doResendAlert = (orderId: string) => {
    resendAlert.mutate({ order_id: orderId }, {
      onSuccess: () => setMsg('Alert resent.'),
      onError: (e) => setMsg(e.message),
    });
  };

  const doBatchSlips = () => {
    // Open each order's printable slip (capped — browsers block mass
    // popups). The old handler announced "queued" while printing nothing.
    const ids = activeOrders.map(o => o.id);
    if (!ids.length) return;
    const cap = 20;
    ids.slice(0, cap).forEach(id => window.open(`/api/admin/orders/${id}/packing-slip`, '_blank'));
    setMsg(ids.length > cap
      ? `Opened packing slips for the first ${cap} of ${ids.length} orders — print or save each tab.`
      : `Opened packing slips for ${ids.length} order${ids.length === 1 ? '' : 's'} — print or save each tab.`);
  };

  const doPostage = () => {
    // Walk the active stage's orders through the single-order label modal.
    // Each order still gets its own carrier + weight confirmation — the old
    // batch call sent { order_ids } to a strictly single-order action and
    // could only ever 400.
    const ids = activeOrders.map(o => o.id);
    if (!ids.length) return;
    setLabelQueue({ ids, index: 0, purchased: 0 });
    setLabelOrderId(ids[0]);
  };

  const refresh = () => {
    fetch('/api/admin/orders')
      .then((r) => r.ok ? r.json() : { orders: [] })
      .then((d) => setOrders(d.orders || []))
      .catch(() => {});
  };

  useEffect(() => {
    fetch('/api/admin/orders')
      .then((r) => r.ok ? r.json() : { orders: [] })
      .then((d) => setOrders(d.orders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stageOrders = (stage: string) => {
    return orders.filter((o) => {
      const fs = String(o.fulfillmentStatus || '').toUpperCase();
      const isPickup = (o.fulfillmentMethod || '').toLowerCase().includes('pickup');
      // The order-detail "Mark packed" transition stamps metadata.packed_at
      // and deliberately keeps fulfillment_status='processing' (the commerce
      // advance-stage action is the one that writes fs='packed'). A packed
      // order therefore shows in Packed & Staged via packedAt until it ships —
      // without this, orders packed from the detail page never appeared in
      // this queue and stayed double-listed under Ready/Unfulfilled.
      const isPacked = fs === 'PACKED' || fs === 'STAGED' ||
        (Boolean(o.packedAt) && !['SHIPPED', 'DELIVERED', 'DISPATCHED', 'CANCELLED'].includes(fs));
      switch (stage) {
        case 'unfulfilled': return !isPacked && (fs === 'PENDING' || fs === 'UNFULFILLED' || fs === 'PROCESSING');
        case 'rush': return fs === 'PENDING' && (o.createdAt && (Date.now() - new Date(o.createdAt).getTime()) > 3600000);
        case 'ready': return !isPacked && (fs === 'PROCESSING' || (fs === 'PENDING' && !isPickup));
        case 'packed': return isPacked;
        case 'pickup': return isPickup && fs !== 'DELIVERED' && fs !== 'DISPATCHED';
        case 'curbside': return isPickup && (fs === 'CURBSIDE' || fs === 'READY');
        case 'shipped': return fs === 'SHIPPED';
        case 'dispatched': return fs === 'DISPATCHED' || fs === 'DELIVERED';
      }
    });
  };

  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  const viewOrder = (id: string) => { window.location.assign(`/admin/order-details?id=${id}`); };

  if (loading) return <div className="text-muted-foreground">Loading fulfillment queue…</div>;

  const activeOrders = stageOrders(activeStage);
  const queueCurrentOrder = labelQueue ? orders.find((x) => x.id === labelQueue.ids[labelQueue.index]) : undefined;

  return (
    <div className="flex flex-col w-full bg-background text-foreground min-h-full">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 sm:px-6 pt-4 pb-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Package className="size-6" /> Fulfillment Queue
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={doBatchSlips} className="rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Batch Slips</button>
            <button onClick={doPostage} className="rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Postage Labels</button>
          </div>
        </div>
        {msg && <p className="text-[13px] text-muted-foreground mb-2">{msg}</p>}
        {labelQueue && (
          <div className="flex items-center gap-3 mb-2">
            <p className="text-[13px] font-medium text-foreground">
              Postage queue: order {labelQueue.index + 1} of {labelQueue.ids.length}
              {queueCurrentOrder?.trackingNumber ? ' — this order already has a label' : ''}
              {' '}— close the label window to move to the next order.
            </p>
            <button onClick={endLabelQueue} className="rounded border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted">End queue</button>
          </div>
        )}
        {/* Stage tabs */}
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar -mb-px">
          {STAGES.map((stage) => {
            const Icon = stage.icon;
            const count = stageOrders(stage.id).length;
            const active = activeStage === stage.id;
            return (
              <button
                key={stage.id}
                onClick={() => setActiveStage(stage.id)}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer',
                  active ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                <Icon className={cn('size-4', active ? stage.color : '')} />
                {stage.label}
                {count > 0 && (
                  <span className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                    active ? 'bg-brand-teal/10 text-brand-teal' : 'bg-muted text-muted-foreground',
                  )}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Queue body */}
      <div className="flex-1 overflow-y-auto sm:">
        {activeOrders.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="size-10 mx-auto text-muted-foreground/30" />
            <p className="text-[14px] font-medium text-foreground mt-3">No orders in this queue</p>
            <p className="text-[13px] text-muted-foreground mt-1">All caught up — check another stage.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeOrders.map((order) => {
              const total = parseFloat(String(order.totalAmount || '0').replace(/[^0-9.]/g, '')) || 0;
              const age = order.createdAt ? Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 3600000) : 0;
              const isRush = age > 24;
              return (
                <div key={order.id} className="border border-border bg-card rounded-lg hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: order info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-bold text-foreground">#{order.id.slice(0, 8).toUpperCase()}</span>
                        {isRush && (
                          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                            <Zap className="size-2.5" /> Rush
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">{age}h ago</span>
                      </div>
                      <p className="text-[13px] text-foreground">{order.customerName || order.email}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        {order.items.length} item{order.items.length !== 1 ? 's' : ''}: {order.items.map(it => `${it.quantity}× ${it.name}`).join(', ').slice(0, 80)}
                      </p>
                      {order.shippingAddress && (
                        <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                          <MapPin className="size-3" /> {order.shippingAddress.slice(0, 60)}
                        </p>
                      )}
                      {order.trackingNumber && (
                        <p className="text-[11px] text-success mt-1 flex items-center gap-1">
                          <Truck className="size-3" /> {order.carrier || 'USPS'}: {order.trackingNumber}
                        </p>
                      )}
                    </div>

                    {/* Right: total + actions */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-[15px] font-bold tabular-nums">${total.toFixed(2)}</span>
                      <span className={cn(
                        'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded',
                        order.fulfillmentStatus === 'shipped' ? 'bg-success/10 text-success' :
                        order.fulfillmentStatus === 'delivered' ? 'bg-success/10 text-success' :
                        'bg-warning/10 text-warning',
                      )}>
                        {order.fulfillmentStatus || 'pending'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => viewOrder(order.id)}
                          className="p-1.5 border border-border rounded hover:bg-muted cursor-pointer"
                          title="View details"
                        >
                          <ExternalLink className="size-3" />
                        </button>
                        <button
                          onClick={() => doAdvance(order.id)}
                          className="p-1.5 border border-border rounded hover:bg-muted cursor-pointer"
                          title="Advance fulfillment stage"
                        >
                          <CheckCircle2 className="size-3" />
                        </button>
                        <button
                          onClick={() => doResendAlert(order.id)}
                          className="p-1.5 border border-border rounded hover:bg-muted cursor-pointer"
                          title="Resend alert"
                        >
                          <Mail className="size-3" />
                        </button>
                        <button
                          onClick={() => doSlip(order.id)}
                          className="p-1.5 border border-border rounded hover:bg-muted cursor-pointer"
                          title="Packing slip"
                        >
                          <Printer className="size-3" />
                        </button>
                        <button
                          onClick={() => doLabel(order.id)}
                          className="p-1.5 border border-border rounded hover:bg-muted cursor-pointer"
                          title="Shipping label"
                        >
                          <Truck className="size-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {labelOrderId && (
        <ShippingLabelModal
          key={labelOrderId}
          orderId={labelOrderId}
          orderLabel={`#${labelOrderId.slice(0, 8)}`}
          onClose={closeLabel}
          onLabelPurchased={handleLabelPurchased}
          existingTracking={(() => {
            const o = orders.find((x) => x.id === labelOrderId);
            return o?.trackingNumber ? { carrier: o.carrier, trackingNumber: o.trackingNumber } : null;
          })()}
        />
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Truck, Copy, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

type Item = { sku: string | null; name: string; quantity: number; unitPrice: string; cost: number | null };
type SO = {
  id: string; order_id: string; supplier_id: string; supplier_name: string | null; order_url: string | null;
  site_url: string | null; status: string; items: Item[]; ship_to: string | null; customer_email: string | null;
  supplier_order_ref: string | null; tracking_number: string | null; carrier: string | null; created_at: string;
};

const TABS = [
  { id: 'to_order', label: 'To order' },
  { id: 'ordered', label: 'Ordered' },
  { id: 'shipped', label: 'Shipped' },
] as const;

export default function SupplierOrdersPage() {
  const [tab, setTab] = useState<string>('to_order');
  const [rows, setRows] = useState<SO[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/supplier-orders?status=${tab}`);
    if (!r.ok) { setMsg((await r.json().catch(() => ({}))).error || 'Could not load'); return; }
    const j = await r.json();
    setRows(j.rows); setCounts(j.counts);
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: string, extra: object = {}) {
    setMsg('');
    const r = await fetch('/api/admin/supplier-orders', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action, ...extra }),
    });
    const j = await r.json();
    if (!r.ok) setMsg(j.error || 'Failed'); else load();
  }
  async function pushTo(id: string, url: string, label: string) {
    setMsg('');
    const r = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ supplierOrderId: id }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || `${label} failed`); return; }
    if (j.synced === false) setMsg(j.reason || 'Nothing to sync yet'); else setMsg(`${label} done`);
    load();
  }
  const f = (id: string, k: string) => fields[`${id}:${k}`] || '';
  const setF = (id: string, k: string, v: string) => setFields((s) => ({ ...s, [`${id}:${k}`]: v }));

  return (
    <div className="sm: space-y-4">
      <div className="flex items-center gap-2">
        <Truck className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Supplier Orders</h1>
      </div>
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-3 py-1.5 rounded-lg text-sm border', tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-card')}>
            {t.label} <span className="opacity-70">({counts[t.id] || 0})</span>
          </button>
        ))}
      </div>
      {msg && <div className="text-sm text-destructive">{msg}</div>}
      {rows.length === 0 && <div className="text-sm text-muted-foreground py-8">Nothing here.</div>}
      {rows.map((o) => (
        <div key={o.id} className="rounded-lg border bg-card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold">{o.supplier_name || o.supplier_id}</div>
              <div className="text-xs text-muted-foreground">Order {o.order_id} · {new Date(o.created_at).toLocaleString()}</div>
            </div>
            {(o.order_url || o.site_url) && (
              <a href={(o.order_url || o.site_url)!} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border hover:bg-muted">
                Open {o.supplier_name || 'supplier'} <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className="text-left text-xs text-muted-foreground"><th>SKU</th><th>Product</th><th>Qty</th><th>Cost</th></tr></thead>
            <tbody>
              {o.items.map((i, n) => (
                <tr key={n} className="border-t"><td className="py-1 pr-3 font-mono text-xs">{i.sku || '—'}</td>
                  <td className="pr-3">{i.name}</td><td>{i.quantity}</td><td>{i.cost != null ? `$${i.cost.toFixed(2)}` : '—'}</td></tr>
              ))}
            </tbody>
          </table></div>
          <div className="flex items-start justify-between gap-3 text-sm">
            <div><span className="text-muted-foreground">Ship to: </span>{o.ship_to || 'Pickup / not provided'}</div>
            {o.ship_to && (
              <button onClick={() => navigator.clipboard.writeText(o.ship_to!)} className="inline-flex items-center gap-1 text-xs px-2 py-1 border rounded-lg">
                <Copy className="size-3" /> Copy address
              </button>
            )}
          </div>
          {o.status === 'to_order' && (
            <div className="flex flex-wrap gap-2">
              {o.supplier_id === 'cj-dropshipping' && (
                <button onClick={() => pushTo(o.id, '/api/admin/suppliers/cj/push-order', 'CJ push')} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm">Push to CJ automatically</button>
              )}
              {o.supplier_id === 'koleimports' && (
                <button onClick={() => pushTo(o.id, '/api/admin/suppliers/kole/push-order', 'Kole push')} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm">Push to Kole automatically</button>
              )}
              <input placeholder="Supplier order number" value={f(o.id, 'ref')} onChange={(e) => setF(o.id, 'ref', e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background" />
              <button onClick={() => act(o.id, 'mark_ordered', { supplier_order_ref: f(o.id, 'ref') })} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm">Mark ordered</button>
              <button onClick={() => confirm('Cancel this supplier order?') && act(o.id, 'cancel')} className="px-3 py-1.5 rounded-lg border text-sm">Cancel</button>
            </div>
          )}
          {o.status === 'ordered' && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground">Supplier ref {o.supplier_order_ref}</span>
              <input placeholder="Carrier (UPS, USPS…)" value={f(o.id, 'carrier')} onChange={(e) => setF(o.id, 'carrier', e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background" />
              <input placeholder="Tracking number" value={f(o.id, 'trk')} onChange={(e) => setF(o.id, 'trk', e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background" />
              <button onClick={() => act(o.id, 'mark_shipped', { tracking_number: f(o.id, 'trk'), carrier: f(o.id, 'carrier') })} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm">Mark shipped &amp; email customer</button>
              {o.supplier_id === 'cj-dropshipping' && (
                <button onClick={() => pushTo(o.id, '/api/admin/suppliers/cj/sync-tracking', 'CJ tracking sync')} className="px-3 py-1.5 rounded-lg border text-sm">Sync tracking from CJ</button>
              )}
            </div>
          )}
          {o.status === 'shipped' && (
            <div className="text-sm text-muted-foreground">{o.carrier || 'Carrier'} · {o.tracking_number}</div>
          )}
        </div>
      ))}
    </div>
  );
}

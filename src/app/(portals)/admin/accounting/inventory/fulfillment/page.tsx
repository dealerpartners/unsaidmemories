'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Send } from 'lucide-react';

// /admin/accounting/inventory/fulfillment — Dropship / Supplier
// Fulfillment (owner's dropship_supplier_fulfillment.html): the
// Option A queue. Supplier drafts from the checkout flow sit ready
// to send, grouped by supplier; dispatch runs the EXISTING push
// endpoint and shows its real result (supplier order id or the
// named refusal). Orders without a draft show their true state.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Fulfillment = {
  id: string; supplierId: string; supplierName: string | null; supplierSlug: string | null;
  status: string; cost: number | null; externalId: string | null;
  trackingNumber: string | null; trackingUrl: string | null; items: number;
};
type QueueOrder = {
  erpOrderId: string; orderNumber: string; erpStatus: string; total: number;
  customer: string | null; orderDate: string; lines: number; firstProduct: string | null;
  state: string; fulfillments: Fulfillment[];
};
type Summary = { readyToSend: number; needsAttention: number; withSupplier: number; noDraft: number };

const stateChip = (state: string) => {
  const cls = state === 'Ready to send' ? 'bg-amber-100 text-amber-900'
    : state === 'Needs attention' ? 'bg-red-100 text-red-900'
    : state === 'With supplier' || state === 'Shipped' ? 'bg-sky-100 text-sky-900'
    : state === 'Delivered' ? 'bg-emerald-100 text-emerald-900'
    : 'bg-muted text-foreground';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cls}`}>{state}</span>;
};

export default function InventoryFulfillmentPage() {
  const [queue, setQueue] = useState<QueueOrder[]>([]);
  const [groups, setGroups] = useState<{ supplier: string; drafts: number; orders: number }[]>([]);
  const [summary, setSummary] = useState<Summary>({ readyToSend: 0, needsAttention: 0, withSupplier: 0, noDraft: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/inventory-fulfillment', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => { setQueue(d.queue || []); setGroups(d.supplierGroups || []); setSummary(d.summary); })
      .catch(() => setError('Fulfillment queue could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const push = async (order: QueueOrder, action: 'push' | 'confirm' | 'sync', fulfillmentOrderId?: string) => {
    setBusy(`${order.erpOrderId}:${action}:${fulfillmentOrderId || ''}`); setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/admin/erp/orders/${order.erpOrderId}/push`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(fulfillmentOrderId ? { fulfillmentOrderId } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || j?.result?.error || 'Dispatch failed');
      const groupsOut: any[] = j.groups || j.result?.groups || [];
      const sent = groupsOut.filter((g) => g.ok).map((g) => `${g.supplier}${g.externalId ? ` #${g.externalId}` : ''} (${g.status || 'sent'})`);
      const failed = groupsOut.filter((g) => !g.ok).map((g) => `${g.supplier}: ${g.error || 'failed'}`);
      const parts = [
        j.message,
        sent.length ? `Sent — ${sent.join('; ')}` : null,
        failed.length ? `Refused — ${failed.join('; ')}` : null,
        j.trackingNumber ? `Tracking ${j.trackingNumber}` : null,
      ].filter(Boolean);
      if (failed.length && !sent.length) setError(`${order.orderNumber}: ${parts.join(' ')}`);
      else setNotice(`${order.orderNumber}: ${parts.join(' ') || 'Done.'}`);
      load();
    } catch (e: any) { setError(e?.message || 'Dispatch failed'); } finally { setBusy(null); }
  };

  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';
  const statCls = 'border border-border rounded-xl bg-card px-4 py-3';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Dropship / Supplier Fulfillment</h1>
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className={statCls}><div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ready to send</div><div className="text-2xl font-semibold tabular-nums mt-1">{summary.readyToSend}</div></div>
          <div className={statCls}><div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Needs attention</div><div className="text-2xl font-semibold tabular-nums mt-1">{summary.needsAttention}</div></div>
          <div className={statCls}><div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">With supplier</div><div className="text-2xl font-semibold tabular-nums mt-1">{summary.withSupplier}</div></div>
          <div className={statCls}><div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">No draft yet</div><div className="text-2xl font-semibold tabular-nums mt-1">{summary.noDraft}</div></div>
        </div>

        {groups.length > 0 && (
          <div className="border border-border rounded-xl bg-card p-4 mb-5">
            <div className="font-semibold text-[14px] mb-2">Drafts waiting, by supplier</div>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <span key={g.supplier} className="rounded-full border border-border px-3 py-1 text-[12.5px]">
                  {g.supplier}: {g.drafts} draft(s) across {g.orders} order(s)
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Order</th>
              <th className={thCls}>Items</th>
              <th className={thCls}>Queue State</th>
              <th className={thCls}>Supplier Drafts</th>
              <th className={`${thCls} text-right`}>Supplier Cost</th>
              <th className={thCls}>Tracking</th>
              <th className="p-3 text-center">Dispatch</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">Loading the queue…</td></tr>
              ) : queue.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">
                  No orders exist yet. Paid orders with supplier-routed lines will appear here with their drafts.
                </td></tr>
              ) : queue.map((o) => {
                const cost = o.fulfillments.reduce((s, f) => s + (f.cost || 0), 0);
                const hasSubmittedPrintful = o.fulfillments.some((f) => f.status === 'submitted' && f.supplierSlug === 'printful');
                return (
                  <tr key={o.erpOrderId} className="hover:bg-accent/50 align-top">
                    <td className="p-3 border-r border-border">
                      <div className="font-medium">{o.orderNumber}</div>
                      <div className="text-[11px] text-muted-foreground">{o.customer || ''} · {fmt(o.total)}</div>
                    </td>
                    <td className="p-3 border-r border-border">
                      <div>{o.firstProduct || '—'}</div>
                      {o.lines > 1 && <div className="text-[11px] text-muted-foreground">+ {o.lines - 1} more line(s)</div>}
                    </td>
                    <td className="p-3 border-r border-border">{stateChip(o.state)}</td>
                    <td className="p-3 border-r border-border">
                      {o.fulfillments.length === 0 ? (
                        <span className="text-muted-foreground">None — push creates the supplier draft</span>
                      ) : o.fulfillments.map((f) => (
                        <div key={f.id} className="text-[12.5px]">
                          {f.supplierName || 'Supplier'} · {f.status.replace(/_/g, ' ')} · {f.items} item(s)
                          {f.externalId ? ` · #${f.externalId}` : ''}
                        </div>
                      ))}
                    </td>
                    <td className="p-3 border-r border-border text-right tabular-nums">{o.fulfillments.length ? fmt(cost) : '—'}</td>
                    <td className="p-3 border-r border-border tabular-nums">
                      {o.fulfillments.map((f) => f.trackingNumber ? (
                        <div key={f.id}>{f.trackingUrl ? <a href={f.trackingUrl} target="_blank" rel="noreferrer" className="underline">{f.trackingNumber}</a> : f.trackingNumber}</div>
                      ) : null)}
                      {o.fulfillments.every((f) => !f.trackingNumber) && '—'}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <button type="button" disabled={busy?.startsWith(o.erpOrderId)} onClick={() => push(o, 'push')}
                        data-tip="Sends this order's lines to their suppliers now (creates the draft first if none exists) and shows the supplier's real answer"
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#7258e8] text-white text-[12.5px] font-medium disabled:opacity-50">
                        <Send className="size-3.5" /> {busy === `${o.erpOrderId}:push:` ? 'Sending…' : 'Send to Supplier'}
                      </button>
                      {hasSubmittedPrintful && o.fulfillments.filter((f) => f.status === 'submitted' && f.supplierSlug === 'printful').map((f) => (
                        <div key={f.id} className="mt-1.5 flex gap-2 justify-center">
                          <button type="button" disabled={busy?.startsWith(o.erpOrderId)} onClick={() => push(o, 'confirm', f.id)}
                            data-tip="Confirms this draft with Printful so production starts and the card is charged"
                            className="text-[12px] underline disabled:opacity-50">Confirm with Printful</button>
                          <button type="button" disabled={busy?.startsWith(o.erpOrderId)} onClick={() => push(o, 'sync', f.id)}
                            data-tip="Pulls the latest status and tracking for this Printful order"
                            className="text-[12px] underline disabled:opacity-50">Sync Tracking</button>
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useState } from 'react';

// /admin/accounting/inventory/returns — Returns / RMA register
// (owner's returns.html) over the real ERP returns storage
// (erp_return_authorizations + lines). Approve / Receive / Complete
// run through the existing ERP returns endpoint; receiving restocks
// sellable lines automatically there.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Rma = {
  id: string; rmaNumber: string; orderId: string; orderNumber: string | null;
  customer: string | null; reason: string | null; status: string; statusLabel: string;
  requestedAt: string; approvedAt: string | null; receivedAt: string | null; completedAt: string | null;
  productName: string | null; sku: string | null; qtyRequested: number; refundTotal: number; dispositions: string | null;
};
type Summary = { pendingReview: number; approved: number; received: number; completed: number; total: number };

const statusChip = (status: string, label: string) => {
  const cls = status === 'completed' ? 'bg-emerald-100 text-emerald-900'
    : status === 'pending_review' ? 'bg-amber-100 text-amber-900'
    : status === 'rejected' || status === 'cancelled' ? 'bg-red-100 text-red-900'
    : 'bg-muted text-foreground';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cls}`}>{label}</span>;
};

export default function InventoryReturnsPage() {
  const [rmas, setRmas] = useState<Rma[]>([]);
  const [summary, setSummary] = useState<Summary>({ pendingReview: 0, approved: 0, received: 0, completed: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/inventory-returns', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => { setRmas(d.rmas || []); setSummary(d.summary); })
      .catch(() => setError('Returns could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (rma: Rma, action: 'approve' | 'receive' | 'complete') => {
    setBusy(`${rma.id}:${action}`); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/erp/returns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rmaId: rma.id, action }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Action failed');
      setNotice(`${rma.rmaNumber}: ${action === 'approve' ? 'approved' : action === 'receive' ? 'marked received — sellable lines were restocked' : 'completed'}.`);
      load();
    } catch (e: any) { setError(e?.message || 'Action failed'); } finally { setBusy(null); }
  };

  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';
  const statCls = 'border border-border rounded-xl bg-card px-4 py-3';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Returns / RMA</h1>
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className={statCls}><div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pending review</div><div className="text-2xl font-semibold tabular-nums mt-1">{summary.pendingReview}</div></div>
          <div className={statCls}><div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Awaiting package</div><div className="text-2xl font-semibold tabular-nums mt-1">{summary.approved}</div></div>
          <div className={statCls}><div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Received</div><div className="text-2xl font-semibold tabular-nums mt-1">{summary.received}</div></div>
          <div className={statCls}><div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Completed (all time)</div><div className="text-2xl font-semibold tabular-nums mt-1">{summary.completed}</div></div>
        </div>

        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>RMA #</th>
              <th className={thCls}>Order Source</th>
              <th className={thCls}>Customer</th>
              <th className={thCls}>Product / SKU</th>
              <th className={`${thCls} text-right`}>Qty</th>
              <th className={thCls}>Reason</th>
              <th className={thCls}>Status</th>
              <th className={thCls}>Disposition</th>
              <th className={`${thCls} text-right`}>Refund Lines</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={10} className="text-center text-muted-foreground">Loading returns…</td></tr>
              ) : rmas.length === 0 ? (
                <tr><td colSpan={10} className="text-center text-muted-foreground">
                  No return authorizations exist yet. A return opened from an order appears here with its review stage.
                </td></tr>
              ) : rmas.map((r) => (
                <tr key={r.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-medium">{r.rmaNumber}</td>
                  <td className="p-3 border-r border-border tabular-nums">{r.orderNumber || '—'}</td>
                  <td className="p-3 border-r border-border">{r.customer || '—'}</td>
                  <td className="p-3 border-r border-border"><div className="font-medium">{r.productName || 'Item'}</div><div className="text-[11px] text-muted-foreground">{r.sku || ''}</div></td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{r.qtyRequested}</td>
                  <td className="p-3 border-r border-border capitalize">{(r.reason || '—').replace(/_/g, ' ')}</td>
                  <td className="p-3 border-r border-border">{statusChip(r.status, r.statusLabel)}</td>
                  <td className="p-3 border-r border-border capitalize">{r.dispositions ? r.dispositions.replace(/_/g, ' ') : 'Pending inspection'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{r.refundTotal > 0 ? fmt(r.refundTotal) : '—'}</td>
                  <td className="p-3 text-center whitespace-nowrap">
                    {r.status === 'pending_review' && (
                      <button type="button" disabled={busy === `${r.id}:approve`} onClick={() => act(r, 'approve')} data-tip="Approves this return and tells the customer to send the item back"
                        className="text-[12px] underline disabled:opacity-50">Approve</button>
                    )}
                    {r.status === 'approved' && (
                      <button type="button" disabled={busy === `${r.id}:receive`} onClick={() => act(r, 'receive')} data-tip="Marks the package received and restocks the sellable lines"
                        className="text-[12px] underline disabled:opacity-50">Mark Received</button>
                    )}
                    {r.status === 'received' && (
                      <button type="button" disabled={busy === `${r.id}:complete`} onClick={() => act(r, 'complete')} data-tip="Closes this return as completed"
                        className="text-[12px] underline disabled:opacity-50">Complete</button>
                    )}
                    {(r.status === 'completed' || r.status === 'rejected' || r.status === 'cancelled') && <span className="text-muted-foreground text-[12px]">Closed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

// /admin/accounting/inventory/counts — Stock Counts (owner's
// stock_counts.html): count batches with progress and variance from
// the real count lines, and a working schedule form.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type CountLine = { id: string; sku: string | null; productName: string | null; expected: number | null; counted: number | null; varianceQty: number | null; varianceValue: number | null };
type Session = {
  id: string; countNumber: string | null; countType: string | null; status: string;
  scheduledFor: string | null; startedAt: string | null; postedAt: string | null;
  warehouseName: string | null; locationName: string | null;
  totalLines: number; countedLines: number; progress: number;
  varianceUnits: number; varianceValue: number; lines: CountLine[];
};
type Warehouse = { id: string; name: string; code: string | null };

const stateLabel = (s: string) => ({
  draft: 'Scheduled', counting: 'In progress', submitted: 'Submitted for review', review: 'In review',
  approved: 'Approved', posted: 'Posted & reconciled', cancelled: 'Cancelled',
}[s] || s);

export default function InventoryCountsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ warehouse_id: '', count_type: 'cycle', scheduled_for: '' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/inventory-counts', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => { setSessions(d.sessions || []); setWarehouses(d.warehouses || []); })
      .catch(() => setError('Stock counts could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const schedule = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.warehouse_id) { setError('Choose the warehouse to count.'); return; }
    setBusy('create'); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/inventory-counts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouse_id: form.warehouse_id, count_type: form.count_type, scheduled_for: form.scheduled_for || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Schedule failed');
      setNotice('Count scheduled as a draft batch. Its lines are generated when the count starts in the warehouse.');
      setShowForm(false); setForm({ warehouse_id: '', count_type: 'cycle', scheduled_for: '' });
      load();
    } catch (e: any) { setError(e?.message || 'Schedule failed'); } finally { setBusy(null); }
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Stock Counts</h1>
        </div>
        <button type="button" onClick={() => setShowForm((s) => !s)} data-tip="Schedules a new stock count batch for a warehouse"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium">
          <Plus className="size-4" /> Schedule Cycle Count
        </button>
      </div>

      {showForm && (
        <form onSubmit={schedule} className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-3">Schedule a Count</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className={labelCls}>Warehouse</label>
              <select value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })} className={inputCls} required>
                <option value="">— Choose a warehouse —</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></div>
            <div><label className={labelCls}>Count type</label>
              <select value={form.count_type} onChange={(e) => setForm({ ...form, count_type: e.target.value })} className={inputCls}>
                <option value="cycle">Cycle count</option>
                <option value="full">Full inventory</option>
                <option value="spot">Spot check</option>
              </select></div>
            <div><label className={labelCls}>Scheduled for</label>
              <input type="date" value={form.scheduled_for} onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })} className={inputCls} /></div>
          </div>
          <button type="submit" disabled={busy === 'create'} data-tip="Saves this count batch as a draft; it appears in the table below"
            className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
            {busy === 'create' ? 'Scheduling…' : 'Schedule Count'}
          </button>
        </form>
      )}

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Count Batch #</th>
              <th className={thCls}>Facility / Zone</th>
              <th className={thCls}>Count Type</th>
              <th className={thCls}>Target Scope</th>
              <th className={`${thCls} text-right`}>Progress</th>
              <th className={`${thCls} text-right`}>Variance ($ / Units)</th>
              <th className={thCls}>Reconciliation State</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">Loading count batches…</td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">
                  No count batches yet. Schedule the first cycle count and its expected-vs-counted lines will be tracked here, with variance in units and dollars.
                </td></tr>
              ) : sessions.map((s) => (
                <tr key={s.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border">
                    <div className="font-medium">{s.countNumber || 'Count batch'}</div>
                    <div className="text-[11px] text-muted-foreground">{s.scheduledFor ? `Scheduled ${s.scheduledFor}` : ''}</div>
                    {expanded === s.id && (
                      <div className="text-[12px] mt-1">
                        {s.lines.length === 0 ? 'No count lines yet — lines are generated when counting starts.'
                          : s.lines.map((l) => `${l.productName || l.sku || 'Item'}: expected ${l.expected ?? '—'}, counted ${l.counted ?? '—'}${l.varianceQty != null ? `, variance ${l.varianceQty}` : ''}`).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td className="p-3 border-r border-border">{s.warehouseName || '—'}</td>
                  <td className="p-3 border-r border-border capitalize">{s.countType || 'cycle'}</td>
                  <td className="p-3 border-r border-border">{s.locationName || 'Full warehouse'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{s.totalLines > 0 ? `${Math.round(s.progress * 100)}% (${s.countedLines}/${s.totalLines})` : '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(s.varianceValue)} / {s.varianceUnits} u</td>
                  <td className="p-3 border-r border-border">{stateLabel(s.status)}</td>
                  <td className="p-3 text-center">
                    <button type="button" onClick={() => setExpanded(expanded === s.id ? null : s.id)} data-tip="Shows or hides this batch's count lines"
                      className="text-[12px] underline">{expanded === s.id ? 'Hide Lines' : 'Review Sheet'}</button>
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

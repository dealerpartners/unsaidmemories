'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

// /admin/accounting/inventory/warehouses — Warehouses & Locations
// (owner's warehouses_locations.html): the facility tree with stock
// rollups, and bin-level stock with threshold states.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Warehouse = {
  id: string; code: string; name: string; type: string | null; city: string | null; state: string | null;
  country: string | null; isActive: boolean; zones: number; locations: number; units: number; stockValue: number;
  zoneList: { id: string; code: string; name: string; zone_type: string | null }[];
};
type Bin = { id: string; bin: string | null; warehouseName: string | null; sku: string | null; productName: string | null; onHand: number; reserved: number; available: number; threshold: string };

export default function InventoryWarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', warehouse_type: 'fulfillment', city: '', state: '' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/inventory-warehouses', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => { setWarehouses(d.warehouses || []); setBins(d.bins || []); })
      .catch(() => setError('Warehouses could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const addWarehouse = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.code.trim() || !form.name.trim()) { setError('Code and name are required.'); return; }
    setBusy('create'); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/inventory-warehouses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Create failed');
      setNotice(`${form.name} added. Give it bin locations in the ERP before receiving stock into it.`);
      setShowForm(false); setForm({ code: '', name: '', warehouse_type: 'fulfillment', city: '', state: '' });
      load();
    } catch (e: any) { setError(e?.message || 'Create failed'); } finally { setBusy(null); }
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Warehouses &amp; Locations</h1>
        </div>
        <button type="button" onClick={() => setShowForm((s) => !s)} data-tip="Adds a new warehouse or facility record"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium">
          <Plus className="size-4" /> Add Warehouse / Facility
        </button>
      </div>

      {showForm && (
        <form onSubmit={addWarehouse} className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-3">New Warehouse</div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div><label className={labelCls}>Code</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputCls} required placeholder="MEM-01" /></div>
            <div><label className={labelCls}>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Type</label>
              <select value={form.warehouse_type} onChange={(e) => setForm({ ...form, warehouse_type: e.target.value })} className={inputCls}>
                <option value="fulfillment">Fulfillment</option>
                <option value="distribution">Distribution center</option>
                <option value="showroom">Showroom / store</option>
                <option value="dropship">Dropship supplier hub</option>
              </select></div>
            <div><label className={labelCls}>City</label><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>State</label><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className={inputCls} /></div>
          </div>
          <button type="submit" disabled={busy === 'create'} data-tip="Saves this warehouse; it appears in the facility list below"
            className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
            {busy === 'create' ? 'Adding…' : 'Add Warehouse'}
          </button>
        </form>
      )}

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? (
            <p className="text-[13px] text-muted-foreground">Loading facilities…</p>
          ) : warehouses.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No warehouses exist yet. Add the first facility to start holding stock.</p>
          ) : warehouses.map((w) => (
            <div key={w.id} className="border border-border rounded-xl bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-[15px]">{w.name}</div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${w.isActive ? 'bg-emerald-100 text-emerald-900' : 'bg-muted text-foreground'}`}>{w.isActive ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="text-[12.5px] text-muted-foreground mt-0.5">
                {w.code} · {w.type || 'warehouse'}{w.city ? ` · ${w.city}${w.state ? `, ${w.state}` : ''}` : ''}
              </div>
              <dl className="mt-3 space-y-1.5 text-[13px]">
                <div className="flex justify-between"><dt className="text-muted-foreground">Zones / bin locations</dt><dd className="font-medium tabular-nums">{w.zones} / {w.locations}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Units on hand</dt><dd className="font-medium tabular-nums">{w.units}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Stock value</dt><dd className="font-medium tabular-nums">{fmt(w.stockValue)}</dd></div>
              </dl>
              {w.zoneList.length > 0 && (
                <div className="text-[12px] text-muted-foreground mt-2">Zones: {w.zoneList.map((z) => `${z.name} (${z.code})`).join(' · ')}</div>
              )}
            </div>
          ))}
        </div>

        <h2 className="font-display text-lg font-semibold mt-8 mb-3">Bin-Level Stock</h2>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Bin / Sub-Location</th>
              <th className={thCls}>Facility Node</th>
              <th className={thCls}>Item Name &amp; SKU</th>
              <th className={`${thCls} text-right`}>On-Hand Qty</th>
              <th className={`${thCls} text-right`}>Reserved</th>
              <th className={`${thCls} text-right`}>Available</th>
              <th className="p-3">Threshold Status</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">Loading bin stock…</td></tr>
              ) : bins.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">
                  No stock sits in any bin yet. Received stock will appear here at the bin it was received into.
                </td></tr>
              ) : bins.map((b) => (
                <tr key={b.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-medium">{b.bin || 'No bin assigned'}</td>
                  <td className="p-3 border-r border-border">{b.warehouseName || '—'}</td>
                  <td className="p-3 border-r border-border"><div className="font-medium">{b.productName || 'Item'}</div><div className="text-[11px] text-muted-foreground">{b.sku || ''}</div></td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{b.onHand}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{b.reserved}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{b.available}</td>
                  <td className="p-3">{b.threshold}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

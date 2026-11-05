'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Download, RefreshCw } from 'lucide-react';

// /admin/accounting/catalog/collections — Product Catalog Collections
// (owner's product_catalog_collections.html): collections as views
// over the one catalog, with live SKU counts, month-to-date GMV from
// paid orders, margin rollup, channel scope and sync health.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

type Collection = {
  id: string; name: string; slug: string; engineType: string; isActive: boolean;
  startsOn: string | null; endsOn: string | null; products: number; skuCount: number;
  mtdGmv: number; marginRollup: number | null; channels: string | null;
  listings: number; syncHealth: string; members: string | null;
};

export default function CatalogCollectionsPage() {
  const [rows, setRows] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: 'manual' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/catalog-collections', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => setRows(Array.isArray(d.collections) ? d.collections : []))
      .catch(() => setError('Collections could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((c) => [c.name, c.slug, c.engineType].join(' ').toLowerCase().includes(q));
  }, [rows, search]);

  const sync = async () => {
    setBusy('sync'); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/catalog-collections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh' }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Sync failed');
      setNotice(`Collection figures recomputed from live orders at ${new Date(j.computedAt).toLocaleTimeString()}.`);
      load();
    } catch (e: any) { setError(e?.message || 'Sync failed'); } finally { setBusy(null); }
  };

  const addCollection = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.name.trim()) { setError('Collection name is required.'); return; }
    setBusy('create'); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/catalog-collections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), type: form.type }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Create failed');
      setNotice(`${form.name.trim()} created. Add products to it from the catalog to give it members.`);
      setShowForm(false); setForm({ name: '', type: 'manual' });
      load();
    } catch (e: any) { setError(e?.message || 'Create failed'); } finally { setBusy(null); }
  };

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Collection', 'Slug', 'Engine Type', 'Products', 'SKUs', 'MTD GMV', 'Margin Rollup', 'Channels', 'Sync Health'];
    const lines = shown.map((c) => [c.name, c.slug, c.engineType, c.products, c.skuCount, c.mtdGmv.toFixed(2), c.marginRollup != null ? pct(c.marginRollup) : '', c.channels || 'Store only', c.syncHealth].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'collections.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Product Catalog Collections</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search collections…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-56" type="text" />
          <button type="button" onClick={sync} disabled={busy === 'sync'} data-tip="Recomputes SKU counts, GMV and margins from live orders right now"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium disabled:opacity-50">
            <RefreshCw className="size-4" /> Sync Collections
          </button>
          <button type="button" onClick={exportCsv} data-tip="Downloads the collections shown as a CSV taxonomy file"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium">
            <Download className="size-4" /> Export Taxonomy
          </button>
          <button type="button" onClick={() => setShowForm((s) => !s)} data-tip="Creates a new collection; products are assigned to it from the catalog"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium">
            <Plus className="size-4" /> New Collection
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={addCollection} className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-3">New Collection</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className={labelCls}>Collection name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Engine type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputCls}>
                <option value="manual">Manual set</option>
                <option value="smart">Smart / rule-based</option>
                <option value="seasonal">Seasonal line</option>
              </select></div>
          </div>
          <button type="submit" disabled={busy === 'create'} data-tip="Saves this collection; it appears in the table below"
            className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
            {busy === 'create' ? 'Creating…' : 'Create Collection'}
          </button>
        </form>
      )}

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Collection &amp; Taxonomy Details</th>
              <th className={thCls}>Engine Type</th>
              <th className={`${thCls} text-right`}>SKU Count</th>
              <th className={`${thCls} text-right`}>MTD GMV</th>
              <th className={`${thCls} text-right`}>Margin Rollup</th>
              <th className={thCls}>Omnichannel Scope</th>
              <th className={thCls}>Sync Health</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">Loading collections…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">
                  {rows.length === 0
                    ? 'No collections yet. A collection appears here when one is created — storefront collection pages are views over these records.'
                    : 'No collections match this search.'}
                </td></tr>
              ) : shown.map((c) => (
                <tr key={c.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      /{c.slug} · {c.products} product(s){c.startsOn || c.endsOn ? ` · ${c.startsOn || '…'} → ${c.endsOn || '…'}` : ''}{c.isActive ? '' : ' · inactive'}
                    </div>
                    {expanded === c.id && (
                      <div className="text-[12px] mt-1">{c.members ? `Members: ${c.members}` : 'No member products assigned yet.'}</div>
                    )}
                  </td>
                  <td className="p-3 border-r border-border capitalize">{c.engineType}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{c.skuCount}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums font-semibold">{fmt(c.mtdGmv)}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{c.marginRollup != null ? pct(c.marginRollup) : <span className="text-muted-foreground">no route costs</span>}</td>
                  <td className="p-3 border-r border-border">{c.channels || <span className="text-muted-foreground">Store only</span>}</td>
                  <td className="p-3 border-r border-border">{c.syncHealth}</td>
                  <td className="p-3 text-center">
                    <button type="button" onClick={() => setExpanded(expanded === c.id ? null : c.id)} data-tip="Shows or hides the products assigned to this collection"
                      className="text-[12px] underline">{expanded === c.id ? 'Hide SKUs' : 'View SKUs'}</button>
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

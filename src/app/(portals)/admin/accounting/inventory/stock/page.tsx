'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';

// /admin/accounting/inventory/stock — Stock on Hand (owner's
// stock_on_hand.html): balances by SKU and location with reserved,
// ATP, floor, FIFO cost and asset value. Adjust and Count write real
// movements through the existing ERP inventory endpoint.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type StockRow = {
  id: string; skuId: string; warehouseId: string | null; sku: string | null; barcode: string | null;
  productName: string | null; category: string | null; warehouseName: string | null; warehouseCode: string | null;
  location: string | null; onHand: number; reserved: number; allocated: number; atp: number;
  minFloor: number | null; unitCost: number | null; assetValue: number | null; health: string; lastCountedAt: string | null;
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'in', label: 'In Stock' },
  { key: 'low', label: 'Low Stock' },
  { key: 'reserved', label: 'Reserved' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const healthChip = (h: string) => {
  if (h === 'Out of stock') return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900">Out of stock</span>;
  if (h === 'Low stock') return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Low stock</span>;
  if (h === 'Reserved') return <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900">Reserved</span>;
  return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">In stock</span>;
};

export default function InventoryStockPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/inventory-stock', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => setRows(d.stock || []))
      .catch(() => setError('Stock could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    let out = rows;
    if (tab === 'in') out = out.filter((r) => r.health === 'In stock' || r.health === 'Reserved');
    if (tab === 'low') out = out.filter((r) => r.health === 'Low stock' || r.health === 'Out of stock');
    if (tab === 'reserved') out = out.filter((r) => r.reserved > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) => [r.sku || '', r.barcode || '', r.productName || '', r.category || '', r.warehouseName || ''].join(' ').toLowerCase().includes(q));
    }
    return out;
  }, [rows, tab, search]);

  const move = async (row: StockRow, action: 'adjust' | 'count') => {
    const label = action === 'count' ? `Counted quantity for ${row.sku || row.productName} (absolute on-hand):` : `Adjustment for ${row.sku || row.productName} (signed quantity, e.g. -2 for damage):`;
    const raw = window.prompt(label, action === 'count' ? String(row.onHand) : '');
    if (raw === null || raw.trim() === '') return;
    const qty = Number(raw);
    if (!Number.isFinite(qty)) { setError('Enter a numeric quantity.'); return; }
    const reason = window.prompt('Reason for this movement (recorded in the movement log):', action === 'count' ? 'Stock count' : 'Manual adjustment') || undefined;
    setBusy(row.id); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/erp/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, skuId: row.skuId, warehouseId: row.warehouseId || undefined, quantity: qty, reason }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Movement failed');
      setNotice(`${action === 'count' ? 'Count' : 'Adjustment'} recorded for ${row.sku || row.productName} — on hand is now ${j.onHand ?? 'updated'}.`);
      load();
    } catch (e: any) { setError(e?.message || 'Movement failed'); } finally { setBusy(null); }
  };

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['SKU', 'Barcode', 'Item', 'Category', 'Warehouse', 'Location', 'On Hand', 'Reserved', 'ATP', 'Min Floor', 'Unit Cost', 'Asset Value', 'Health'];
    const lines = shown.map((r) => [r.sku || '', r.barcode || '', r.productName || '', r.category || '', r.warehouseName || '', r.location || '', r.onHand, r.reserved, r.atp, r.minFloor ?? '', r.unitCost ?? '', r.assetValue ?? '', r.health].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'stock-on-hand.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };

  const totalValue = rows.reduce((s, r) => s + (r.assetValue || 0), 0);
  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Stock on Hand</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU, item, warehouse…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-60" type="text" />
          <button type="button" onClick={exportCsv} data-tip="Downloads the stock currently shown as a CSV file"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium">
            <Download className="size-4" /> Stock Export (CSV)
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`h-8 px-3 rounded-full border text-[12.5px] font-medium ${tab === t.key ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'border-border bg-card text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>SKU &amp; Barcode</th>
              <th className={thCls}>Item Name</th>
              <th className={thCls}>Category</th>
              <th className={thCls}>Location Breakdown</th>
              <th className={`${thCls} text-right`}>On Hand</th>
              <th className={`${thCls} text-right`}>Reserved</th>
              <th className={`${thCls} text-right`}>ATP</th>
              <th className={`${thCls} text-right`}>Min Floor</th>
              <th className={`${thCls} text-right`}>FIFO Cost</th>
              <th className={`${thCls} text-right`}>Asset Value</th>
              <th className={thCls}>Health</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={12} className="text-center text-muted-foreground">Loading stock…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={12} className="text-center text-muted-foreground">
                  {rows.length === 0
                    ? 'No stock balances yet. Stock appears here when items are received into a warehouse in the ERP — print-on-demand designs carry no warehouse stock until they are stocked.'
                    : 'No stock matches this view.'}
                </td></tr>
              ) : shown.map((r) => (
                <tr key={r.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border"><div className="font-medium tabular-nums">{r.sku || '—'}</div><div className="text-[11px] text-muted-foreground tabular-nums">{r.barcode || ''}</div></td>
                  <td className="p-3 border-r border-border font-medium">{r.productName || 'Item'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{r.category || '—'}</td>
                  <td className="p-3 border-r border-border"><div>{r.warehouseName || '—'}</div><div className="text-[11px] text-muted-foreground">{r.location || 'No bin assigned'}</div></td>
                  <td className="p-3 border-r border-border text-right tabular-nums font-semibold">{r.onHand}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{r.reserved}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{r.atp}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{r.minFloor ?? '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{r.unitCost != null ? fmt(r.unitCost) : '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{r.assetValue != null ? fmt(r.assetValue) : '—'}</td>
                  <td className="p-3 border-r border-border">{healthChip(r.health)}</td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <button type="button" disabled={busy === r.id} onClick={() => move(r, 'count')} data-tip="Records a physical count for this SKU — sets on-hand to the counted quantity and logs the difference"
                      className="text-[12px] underline mr-3 disabled:opacity-50">Count</button>
                    <button type="button" disabled={busy === r.id} onClick={() => move(r, 'adjust')} data-tip="Adjusts stock up or down (damage, shrinkage, found stock) with a written movement record"
                      className="text-[12px] underline disabled:opacity-50">Adjust</button>
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

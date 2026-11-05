'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { StatementNav, fmt, thCls } from '../_shared';

// /admin/accounting/reports/margin-matrix — SKU & Variant Margin
// Matrix (owner's sku_variant_margin_matrix.html): per-variant
// economics for everything actually sold. Gross retail is real
// (order lines); landed COGS appears only when inventory cost
// layers exist for the variant, and fulfillment only when a
// fulfillment route carries a cost snapshot — otherwise the
// matrix prints '—' instead of inventing a cost.

type Row = {
  variantId: string; identity: string; product: string; category: string;
  units: number; grossRetail: number;
  landedCogs: number | null; landedCogsUnit: number | null;
  fulfillment: number | null; fulfillmentUnit: number | null;
  platform: number | null; returnDrag: number | null;
  netMargin: number | null; marginPct: number | null; status: string;
};
type Data = { rows: Row[]; portfolio: { variantsSold: number; units: number; grossRetail: number; variantsWithCost: number; weightedMarginPct: number | null } };

const FILTERS = [
  { key: 'all', label: 'All Variants' },
  { key: 'loss', label: 'Negative Margin Only' },
  { key: 'nocost', label: 'Missing Cost Data' },
] as const;

const statusChip = (s: string) => {
  const cls = s === 'Loss' ? 'bg-red-100 text-red-900'
    : s === 'No cost data' ? 'bg-muted text-foreground'
    : s === 'Thin' ? 'bg-amber-100 text-amber-900'
    : 'bg-emerald-100 text-emerald-900';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{s}</span>;
};

export default function MarginMatrixPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/admin/accounting/margin-matrix', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then(setData)
      .catch(() => setError('The margin matrix could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => {
    let rows = data?.rows || [];
    if (filter === 'loss') rows = rows.filter((r) => r.netMargin != null && r.netMargin < 0);
    if (filter === 'nocost') rows = rows.filter((r) => r.netMargin == null);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => [r.identity, r.product, r.category].join(' ').toLowerCase().includes(q));
    }
    return rows;
  }, [data, filter, search]);

  const dash = <span className="text-muted-foreground">—</span>;
  const perUnit = (total: number | null, unit: number | null, units: number) =>
    total == null ? dash : <>{fmt(total)}<div className="text-[11px] font-normal text-muted-foreground">{fmt(unit || 0)} / unit</div></>;

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">SKU &amp; Variant Margin Matrix</h1>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU, product, category…"
          className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
      </div>
      <StatementNav active="/admin/accounting/reports/margin-matrix" />

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}
        {loading && !data ? <div className="text-muted-foreground text-sm">Loading the margin matrix…</div> : null}
        {data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Variants Sold</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{data.portfolio.variantsSold}</div>
                <div className="text-[12px] text-muted-foreground">{data.portfolio.units} unit(s) on captured orders</div>
              </div>
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gross Retail</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{fmt(data.portfolio.grossRetail)}</div>
                <div className="text-[12px] text-muted-foreground">sum of sold order lines</div>
              </div>
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Variants With Cost Data</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{data.portfolio.variantsWithCost} of {data.portfolio.variantsSold}</div>
                <div className="text-[12px] text-muted-foreground">cost layers received in ERP inventory</div>
              </div>
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Weighted Contribution Margin</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{data.portfolio.weightedMarginPct != null ? `${data.portfolio.weightedMarginPct.toFixed(1)}%` : '—'}</div>
                <div className="text-[12px] text-muted-foreground">over variants with cost data only</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              {FILTERS.map((f) => (
                <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                  className={`h-8 px-3 rounded-full border text-[12.5px] font-medium ${filter === f.key ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'border-border bg-card text-foreground'}`}>
                  {f.label}
                </button>
              ))}
            </div>

            <div className="border border-border rounded-xl overflow-x-auto bg-card mt-4">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead><tr className={thCls}>
                  <th className="p-3 border-r border-border">Variant &amp; SKU Identity</th>
                  <th className="p-3 border-r border-border">Category</th>
                  <th className="p-3 border-r border-border text-right">Units</th>
                  <th className="p-3 border-r border-border text-right">Gross Retail</th>
                  <th className="p-3 border-r border-border text-right">Landed COGS</th>
                  <th className="p-3 border-r border-border text-right">Fulfillment / 3PL</th>
                  <th className="p-3 border-r border-border text-right">Platform</th>
                  <th className="p-3 border-r border-border text-right">Return Drag</th>
                  <th className="p-3 border-r border-border text-right">Net Margin ($)</th>
                  <th className="p-3 border-r border-border text-right">Net Margin (%)</th>
                  <th className="p-3">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {shown.length === 0 ? (
                    <tr><td colSpan={11} className="p-3 text-center text-muted-foreground">
                      {(data.rows.length === 0)
                        ? 'No variants have sold yet. Rows appear here from captured order lines.'
                        : 'No variants match this view.'}
                    </td></tr>
                  ) : shown.map((r) => (
                    <tr key={r.variantId} className="hover:bg-accent/50">
                      <td className="p-3 border-r border-border">
                        <div className="font-medium">{r.identity}</div>
                        <div className="text-[11px] text-muted-foreground">{r.product}</div>
                      </td>
                      <td className="p-3 border-r border-border">{r.category}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{r.units}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{fmt(r.grossRetail)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{perUnit(r.landedCogs, r.landedCogsUnit, r.units)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{perUnit(r.fulfillment, r.fulfillmentUnit, r.units)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{r.platform == null ? dash : fmt(r.platform)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{r.returnDrag == null ? dash : fmt(r.returnDrag)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums font-medium">{r.netMargin == null ? dash : fmt(r.netMargin)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{r.marginPct == null ? dash : `${r.marginPct.toFixed(1)}%`}</td>
                      <td className="p-3">{statusChip(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>

            <div className="rounded-lg border border-border bg-card px-4 py-3 text-[13px] mt-4">
              <span className="font-semibold">Reading this matrix: </span>
              Landed COGS is the quantity-weighted average unit cost of the variant&apos;s inventory cost layers
              (ERP Inventory). Fulfillment is the active fulfillment route&apos;s cost snapshot per unit.
              Platform fees and per-variant return drag have no source records yet, so they show — rather than a
              guessed number. A variant without cost layers shows — for margin: receive its stock into ERP
              inventory (which writes the cost layers) and its true margin appears here.
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

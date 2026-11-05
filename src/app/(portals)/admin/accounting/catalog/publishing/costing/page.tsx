'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// /admin/accounting/catalog/publishing/costing — Supplier Cost
// Rollup. The header button keeps the owner's "BOM Cost Rollup"
// label; the view is titled as what it is: no materials bill of
// materials exists in this data, so this rolls up the supplier cost
// stack of record per design — the average catalog price snapshot
// (the exact cost + margin math of the publishing page) plus the
// captured per-variant base costs from supplier_product_costs where
// the studio has harvested them. Read-only.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

type Captured = {
  minBaseCost: number; avgBaseCost: number; variantCount: number;
  anyInStock: boolean; lastCheckedAt: string | null;
};
type CostRow = {
  id: string; name: string; status: string;
  supplierName: string | null; catalogName: string | null;
  retail: number | null; supplierCost: number | null;
  snapshotVariantCount: number; snapshotMin: number | null; snapshotMax: number | null;
  margin: number | null; marginDollars: number | null;
  captured: Captured | null;
};
type Totals = {
  designs: number; withCost: number; totalRetail: number;
  totalSupplierCost: number; totalMarginDollars: number; margin: number | null;
};

export default function CostRollupPage() {
  const [rows, setRows] = useState<CostRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/accounting/catalog-publishing/costing', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setRows(d.designs || []);
        setTotals(d.totals || null);
      })
      .catch(() => setError('The cost rollup could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <Link href="/admin/accounting/catalog/publishing"
        data-tip="Back to Product Design & Publishing"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground w-fit">
        <ArrowLeft size={14} /> Product Design &amp; Publishing
      </Link>

      <div className="border-b border-border mt-3 pb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Supplier Cost Rollup</h1>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mt-4">{error}</div>}

      <div className="border border-border rounded-xl overflow-x-auto bg-card mt-6">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr className={headRow}>
            <th className={thCls}>Design</th>
            <th className={thCls}>Supplier</th>
            <th className={`${thCls} text-right`}>Retail</th>
            <th className={`${thCls} text-right`}>Supplier Cost</th>
            <th className={`${thCls} text-right`}>Margin $</th>
            <th className={`${thCls} text-right`}>Margin %</th>
            <th className={thCls}>Snapshot Range</th>
            <th className="p-3">Captured Base Costs</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={8} className="text-center text-muted-foreground">Loading the rollup…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-muted-foreground">No designs in the studio yet, so there is nothing to roll up.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="hover:bg-accent/50">
                <td className="p-3 border-r border-border">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground capitalize">{r.status.replace(/_/g, ' ')}</div>
                </td>
                <td className="p-3 border-r border-border">
                  <div>{r.supplierName || '—'}</div>
                  <div className="text-[11px] text-muted-foreground">{r.catalogName || ''}</div>
                </td>
                <td className="p-3 border-r border-border text-right tabular-nums">{r.retail != null ? fmt(r.retail) : '—'}</td>
                <td className="p-3 border-r border-border text-right tabular-nums">
                  {r.supplierCost != null ? fmt(r.supplierCost) : <span className="text-muted-foreground">not snapshotted</span>}
                </td>
                <td className="p-3 border-r border-border text-right tabular-nums">{r.marginDollars != null ? fmt(r.marginDollars) : '—'}</td>
                <td className="p-3 border-r border-border text-right tabular-nums">{r.margin != null ? pct(r.margin) : '—'}</td>
                <td className="p-3 border-r border-border tabular-nums">
                  {r.snapshotVariantCount > 0 && r.snapshotMin != null && r.snapshotMax != null
                    ? <>{fmt(r.snapshotMin)} – {fmt(r.snapshotMax)}<span className="text-muted-foreground"> · {r.snapshotVariantCount} variant(s)</span></>
                    : <span className="text-muted-foreground">No snapshots</span>}
                </td>
                <td className="p-3 tabular-nums">
                  {r.captured
                    ? <>from {fmt(r.captured.minBaseCost)}<span className="text-muted-foreground"> · avg {fmt(r.captured.avgBaseCost)} · {r.captured.variantCount} variant(s){r.captured.anyInStock ? '' : ' · none in stock'}</span></>
                    : <span className="text-muted-foreground">Not captured yet</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {totals && !loading && rows.length > 0 && (
        <p className="text-[12.5px] text-muted-foreground mt-3">
          Totals across the {totals.withCost} design(s) with both a retail price and a snapshotted supplier cost:
          retail {fmt(totals.totalRetail)} · supplier cost {fmt(totals.totalSupplierCost)} ·
          margin {fmt(totals.totalMarginDollars)}{totals.margin != null ? <> ({pct(totals.margin)})</> : null}.
          Where a supplier has not snapshotted prices, the cost and margin are honestly left blank rather than estimated.
        </p>
      )}
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

// /admin/accounting/catalog/items — Catalog & Item Records (owner's
// catalog_item_records.html): every sellable variant with its SKU &
// barcode, category, stock position, unit cost, retail, margin and
// inventory GL account code — all read live. The canonical print
// items and the supplier catalog summary sit below the item records.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

type Item = {
  variantId: string; sku: string | null; barcode: string | null; variantTitle: string | null;
  productId: string; productName: string; category: string | null;
  onHand: number; reserved: number; unitCost: number | null; retail: number | null;
  margin: number | null; glCode: string | null; status: string;
};
type Canonical = { id: string; sku_slug: string; name: string; category: string | null; suppliers: number; placements: number };
type SupplierSummary = { name: string; slug: string | null; products: number; variants: number };

export default function CatalogItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [canonical, setCanonical] = useState<Canonical[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/catalog-items', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setItems(Array.isArray(d.items) ? d.items : []);
        setCanonical(Array.isArray(d.canonical) ? d.canonical : []);
        setSuppliers(Array.isArray(d.suppliers) ? d.suppliers : []);
      })
      .catch(() => setError('Catalog items could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => [i.sku || '', i.barcode || '', i.productName, i.variantTitle || '', i.category || ''].join(' ').toLowerCase().includes(q));
  }, [items, search]);

  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Catalog &amp; Item Records</h1>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU, barcode, item…"
          className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>SKU &amp; Barcode</th>
              <th className={thCls}>Item Name &amp; Variant</th>
              <th className={thCls}>Category</th>
              <th className={`${thCls} text-right`}>On Hand / Rsvd</th>
              <th className={`${thCls} text-right`}>Unit Cost</th>
              <th className={`${thCls} text-right`}>Retail</th>
              <th className={`${thCls} text-right`}>Margin</th>
              <th className={thCls}>GL Account Code</th>
              <th className="p-3">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={9} className="text-center text-muted-foreground">Loading item records…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-muted-foreground">
                  {items.length === 0
                    ? 'No item records yet. Items appear here when products with variants are created in the catalog.'
                    : 'No items match this search.'}
                </td></tr>
              ) : shown.map((i) => (
                <tr key={i.variantId} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border">
                    <div className="font-medium tabular-nums">{i.sku || '—'}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">{i.barcode || 'No barcode'}</div>
                  </td>
                  <td className="p-3 border-r border-border">
                    <div className="font-medium">{i.productName}</div>
                    <div className="text-[11px] text-muted-foreground">{i.variantTitle || 'Standard variant'}</div>
                  </td>
                  <td className="p-3 border-r border-border text-muted-foreground">{i.category || '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{i.onHand} / {i.reserved}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{i.unitCost != null ? fmt(i.unitCost) : '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{i.retail != null ? fmt(i.retail) : '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{i.margin != null ? pct(i.margin) : <span className="text-muted-foreground">no cost yet</span>}</td>
                  <td className="p-3 border-r border-border tabular-nums">{i.glCode || <span className="text-muted-foreground">Unmapped</span>}</td>
                  <td className="p-3 capitalize">{i.status}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <h2 className="font-display text-lg font-semibold mt-8 mb-1">Canonical Print Items</h2>
        <p className="text-[13px] text-muted-foreground mb-3">
          The normalized print catalog the design studio publishes against, with each item&apos;s supplier print-spec coverage.
        </p>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Canonical Item</th>
              <th className={thCls}>Category</th>
              <th className={`${thCls} text-right`}>Suppliers With Print Specs</th>
              <th className="p-3 text-right">Placements</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {canonical.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-muted-foreground">No canonical items are defined yet.</td></tr>
              ) : canonical.map((c) => (
                <tr key={c.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border"><div className="font-medium">{c.name}</div><div className="text-[11px] text-muted-foreground">{c.sku_slug}</div></td>
                  <td className="p-3 border-r border-border text-muted-foreground">{c.category || '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{c.suppliers}</td>
                  <td className="p-3 text-right tabular-nums">{c.placements}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <h2 className="font-display text-lg font-semibold mt-8 mb-1">Supplier Catalog</h2>
        <p className="text-[13px] text-muted-foreground mb-3">
          Raw supplier listings are the material designs publish from — they are not sold raw.
        </p>
        <div className="flex flex-wrap gap-2">
          {suppliers.map((s) => (
            <span key={s.name} className="rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px]">
              <span className="font-medium">{s.name}</span> · {s.products.toLocaleString()} listings · {s.variants.toLocaleString()} variants
            </span>
          ))}
          {suppliers.length === 0 && <span className="text-[13px] text-muted-foreground">No suppliers are connected yet.</span>}
        </div>
      </div>
    </div>
  );
}

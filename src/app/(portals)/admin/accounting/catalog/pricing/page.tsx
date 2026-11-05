'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

// /admin/accounting/catalog/pricing — Pricing, Bundles & Units
// (owner's pricing_bundles_units.html): commercial price books with
// their channel lines, product bundles with their components, the
// unit-of-measure position stated honestly (no conversion rules
// exist in the catalog data), and a margin guard that works from
// real variant prices and route costs.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

type Book = { id: string; code: string; title: string; method: string | null; qualifying_terms: string | null; catalog_scope: string | null; is_active: boolean; lines: number; channels: string | null };
type PriceLine = { id: string; priceBookId: string; sku: string | null; channel: string | null; basePrice: number | null; overridePrice: number | null; productName: string | null };
type Bundle = { id: string; name: string; slug: string; status: string | null; description: string | null; components: number; component_detail: string | null };
type GuardVariant = { variantId: string; sku: string | null; productName: string; price: number | null; cost: number | null };
type ProductOpt = { id: string; name: string };

export default function CatalogPricingPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [priceLines, setPriceLines] = useState<PriceLine[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [guardVariants, setGuardVariants] = useState<GuardVariant[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bookForm, setBookForm] = useState({ code: '', title: '', method: '', qualifying_terms: '', catalog_scope: '' });
  const [showBookForm, setShowBookForm] = useState(false);
  const [lineFor, setLineFor] = useState<string | null>(null);
  const [lineForm, setLineForm] = useState({ sku: '', channel: '', base_price: '', override_price: '', catalog_product_id: '' });
  const [bundleForm, setBundleForm] = useState({ name: '', description: '' });
  const [showBundleForm, setShowBundleForm] = useState(false);
  const [compFor, setCompFor] = useState<string | null>(null);
  const [compForm, setCompForm] = useState({ catalog_item_id: '', quantity: '1' });
  const [guardSku, setGuardSku] = useState('');
  const [floor, setFloor] = useState('20');

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/catalog-pricing', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setBooks(d.books || []); setPriceLines(d.priceLines || []); setBundles(d.bundles || []);
        setGuardVariants(d.guardVariants || []); setProducts(d.products || []);
      })
      .catch(() => setError('Pricing could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const post = async (payload: Record<string, unknown>, okMsg: string, key: string) => {
    setBusy(key); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/catalog-pricing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Save failed');
      setNotice(okMsg);
      load();
      return true;
    } catch (e: any) { setError(e?.message || 'Save failed'); return false; } finally { setBusy(null); }
  };

  const guardPick = useMemo(() => guardVariants.find((g) => g.variantId === guardSku) || null, [guardVariants, guardSku]);
  const guardMargin = guardPick && guardPick.price && guardPick.cost != null && guardPick.price > 0
    ? (guardPick.price - guardPick.cost) / guardPick.price : null;
  const floorNum = Number(floor) / 100;

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Pricing, Bundles &amp; Units</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowBundleForm((s) => !s)} data-tip="Creates a new product bundle; add its component items afterwards"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium">
            <Plus className="size-4" /> New Bundle
          </button>
          <button type="button" onClick={() => setShowBookForm((s) => !s)} data-tip="Creates a new commercial price book; add priced lines to it afterwards"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium">
            <Plus className="size-4" /> New Price Book
          </button>
        </div>
      </div>

      {showBookForm && (
        <form onSubmit={async (e) => { e.preventDefault(); if (await post({ action: 'create_book', ...bookForm }, `Price book ${bookForm.code} created.`, 'book')) { setShowBookForm(false); setBookForm({ code: '', title: '', method: '', qualifying_terms: '', catalog_scope: '' }); } }}
          className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-3">New Price Book</div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div><label className={labelCls}>Code</label><input value={bookForm.code} onChange={(e) => setBookForm({ ...bookForm, code: e.target.value })} className={inputCls} required placeholder="WHOLESALE-26" /></div>
            <div><label className={labelCls}>Title</label><input value={bookForm.title} onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Pricing method / delta</label><input value={bookForm.method} onChange={(e) => setBookForm({ ...bookForm, method: e.target.value })} className={inputCls} placeholder="MSRP − 20%" /></div>
            <div><label className={labelCls}>Qualifying terms</label><input value={bookForm.qualifying_terms} onChange={(e) => setBookForm({ ...bookForm, qualifying_terms: e.target.value })} className={inputCls} placeholder="Net 30, min 12 units" /></div>
            <div><label className={labelCls}>Catalog scope</label><input value={bookForm.catalog_scope} onChange={(e) => setBookForm({ ...bookForm, catalog_scope: e.target.value })} className={inputCls} placeholder="All collections" /></div>
          </div>
          <button type="submit" disabled={busy === 'book'} data-tip="Saves this price book; it appears in the table below"
            className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
            {busy === 'book' ? 'Creating…' : 'Create Price Book'}
          </button>
        </form>
      )}

      {showBundleForm && (
        <form onSubmit={async (e) => { e.preventDefault(); if (await post({ action: 'create_bundle', ...bundleForm }, `Bundle “${bundleForm.name}” created as a draft.`, 'bundle')) { setShowBundleForm(false); setBundleForm({ name: '', description: '' }); } }}
          className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-3">New Bundle</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className={labelCls}>Bundle name</label><input value={bundleForm.name} onChange={(e) => setBundleForm({ ...bundleForm, name: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Description</label><input value={bundleForm.description} onChange={(e) => setBundleForm({ ...bundleForm, description: e.target.value })} className={inputCls} /></div>
          </div>
          <button type="submit" disabled={busy === 'bundle'} data-tip="Saves this bundle as a draft; add component items from the bundles table"
            className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
            {busy === 'bundle' ? 'Creating…' : 'Create Bundle'}
          </button>
        </form>
      )}

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}

        <h2 className="font-display text-lg font-semibold mb-3">Commercial Contract Price Books</h2>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Price Book Code &amp; Title</th>
              <th className={thCls}>Pricing Method / Delta</th>
              <th className={thCls}>Qualifying Terms</th>
              <th className={thCls}>Catalog Scope</th>
              <th className={thCls}>Bound Accounts / Channels</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">Loading price books…</td></tr>
              ) : books.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">
                  No price books yet. The store sells at standard catalog prices until a contract price book is created with New Price Book.
                </td></tr>
              ) : books.map((b) => (
                <tr key={b.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border"><div className="font-medium">{b.code}</div><div className="text-[11px] text-muted-foreground">{b.title}{b.is_active ? '' : ' · inactive'}</div></td>
                  <td className="p-3 border-r border-border">{b.method || '—'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{b.qualifying_terms || '—'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{b.catalog_scope || '—'}</td>
                  <td className="p-3 border-r border-border">{b.channels || <span className="text-muted-foreground">None bound</span>}<div className="text-[11px] text-muted-foreground">{b.lines} priced line(s)</div></td>
                  <td className="p-3 text-center">
                    <button type="button" onClick={() => setLineFor(lineFor === b.id ? null : b.id)} data-tip="Adds a priced SKU line to this price book"
                      className="text-[12px] underline">Add Line</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        {lineFor && (
          <form onSubmit={async (e) => { e.preventDefault(); if (await post({ action: 'add_line', price_book_id: lineFor, ...lineForm, catalog_product_id: lineForm.catalog_product_id || null }, 'Price line added to the book.', 'line')) { setLineFor(null); setLineForm({ sku: '', channel: '', base_price: '', override_price: '', catalog_product_id: '' }); } }}
            className="border border-border rounded-xl bg-card p-4 mt-3">
            <div className="font-semibold text-[14px] mb-3">Add Priced Line</div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div><label className={labelCls}>Product (optional)</label>
                <select value={lineForm.catalog_product_id} onChange={(e) => setLineForm({ ...lineForm, catalog_product_id: e.target.value })} className={inputCls}>
                  <option value="">— Any / by SKU —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
              <div><label className={labelCls}>SKU</label><input value={lineForm.sku} onChange={(e) => setLineForm({ ...lineForm, sku: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls}>Channel</label><input value={lineForm.channel} onChange={(e) => setLineForm({ ...lineForm, channel: e.target.value })} className={inputCls} placeholder="faire-wholesale" /></div>
              <div><label className={labelCls}>Base price</label><input type="number" step="0.01" min="0" value={lineForm.base_price} onChange={(e) => setLineForm({ ...lineForm, base_price: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls}>Override price</label><input type="number" step="0.01" min="0" value={lineForm.override_price} onChange={(e) => setLineForm({ ...lineForm, override_price: e.target.value })} className={inputCls} /></div>
            </div>
            <button type="submit" disabled={busy === 'line'} data-tip="Saves this priced line into the price book"
              className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
              {busy === 'line' ? 'Adding…' : 'Add Line'}
            </button>
            {priceLines.filter((l) => l.priceBookId === lineFor).length > 0 && (
              <div className="text-[12.5px] mt-3 text-muted-foreground">
                Existing lines: {priceLines.filter((l) => l.priceBookId === lineFor).map((l) => `${l.productName || l.sku || 'SKU'}${l.channel ? ` @ ${l.channel}` : ''} — ${l.overridePrice != null ? fmt(l.overridePrice) : l.basePrice != null ? fmt(l.basePrice) : '—'}`).join(' · ')}
              </div>
            )}
          </form>
        )}

        <h2 className="font-display text-lg font-semibold mt-8 mb-3">Product Bundles &amp; Virtual Assembly Studio</h2>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Bundle</th>
              <th className={thCls}>Status</th>
              <th className={thCls}>Components</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {bundles.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-muted-foreground">
                  No bundles yet. Create one with New Bundle, then add the items it assembles from.
                </td></tr>
              ) : bundles.map((b) => (
                <tr key={b.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border"><div className="font-medium">{b.name}</div><div className="text-[11px] text-muted-foreground">{b.description || ''}</div></td>
                  <td className="p-3 border-r border-border capitalize">{b.status || 'draft'}</td>
                  <td className="p-3 border-r border-border">{b.components} item(s)<div className="text-[11px] text-muted-foreground">{b.component_detail || ''}</div></td>
                  <td className="p-3 text-center">
                    <button type="button" onClick={() => setCompFor(compFor === b.id ? null : b.id)} data-tip="Adds a component item to this bundle"
                      className="text-[12px] underline">Add Component</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        {compFor && (
          <form onSubmit={async (e) => { e.preventDefault(); if (await post({ action: 'add_component', bundle_id: compFor, catalog_item_id: compForm.catalog_item_id, quantity: Number(compForm.quantity) || 1 }, 'Component added to the bundle.', 'comp')) { setCompFor(null); setCompForm({ catalog_item_id: '', quantity: '1' }); } }}
            className="border border-border rounded-xl bg-card p-4 mt-3">
            <div className="font-semibold text-[14px] mb-3">Add Bundle Component</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><label className={labelCls}>Component product</label>
                <select value={compForm.catalog_item_id} onChange={(e) => setCompForm({ ...compForm, catalog_item_id: e.target.value })} className={inputCls} required>
                  <option value="">— Choose a product —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
              <div><label className={labelCls}>Quantity per bundle</label>
                <input type="number" min="1" value={compForm.quantity} onChange={(e) => setCompForm({ ...compForm, quantity: e.target.value })} className={inputCls} /></div>
            </div>
            <button type="submit" disabled={busy === 'comp'} data-tip="Saves this component into the bundle"
              className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
              {busy === 'comp' ? 'Adding…' : 'Add Component'}
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-8">
          <div className="border border-border rounded-xl bg-card p-4">
            <h2 className="font-display text-lg font-semibold mb-2">Unit of Measure (UOM) Conversion Matrix</h2>
            <p className="text-[13px] text-muted-foreground">
              Every catalog variant currently transacts as <span className="font-medium text-foreground">Each</span> — one piece per unit.
              No case, pack or pallet conversion rules exist in the catalog data, so no conversion matrix is shown:
              inventing ratios would misprice orders. When a supplier sells in cases, its conversion belongs on that
              item&apos;s record and will appear here.
            </p>
          </div>
          <div className="border border-border rounded-xl bg-card p-4">
            <h2 className="font-display text-lg font-semibold mb-3">Margin Guard Simulator</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><label className={labelCls}>Variant</label>
                <select value={guardSku} onChange={(e) => setGuardSku(e.target.value)} className={inputCls}>
                  <option value="">— Choose a variant —</option>
                  {guardVariants.map((g) => <option key={g.variantId} value={g.variantId}>{g.productName}{g.sku ? ` · ${g.sku}` : ''}</option>)}
                </select></div>
              <div><label className={labelCls}>Floor threshold (%)</label>
                <input type="number" min="0" max="99" value={floor} onChange={(e) => setFloor(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Result</label>
                <div className="h-9 flex items-center text-[13px]">
                  {!guardPick ? 'Pick a variant to test its margin.'
                    : guardPick.cost == null ? 'No route cost is recorded for this variant yet, so its margin cannot be guarded.'
                    : guardMargin == null ? '—'
                    : guardMargin >= floorNum
                      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">Passes · {pct(guardMargin)} margin</span>
                      : <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900">Below floor · {pct(guardMargin)} margin</span>}
                </div></div>
            </div>
            {guardPick && (
              <p className="text-[12.5px] text-muted-foreground mt-2">
                Standard item MSRP {guardPick.price != null ? fmt(guardPick.price) : '—'} · Base COGS cost {guardPick.cost != null ? fmt(guardPick.cost) : '—'} (winning fulfillment route).
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

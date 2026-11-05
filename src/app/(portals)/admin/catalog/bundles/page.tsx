'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Package, Globe } from 'lucide-react';

type Bundle = {
  id: string; name: string; slug: string; description: string | null;
  status: string; component_count: number; price_rollup: number;
  stock_rollup: number | null; created_at: string; updated_at: string;
};
type Component = {
  id: string; catalog_item_id: string; sku_id: string | null; quantity: number;
  item_name: string; item_active: boolean; sku_code: string | null;
  unit_price: number | null; stock_on_hand: number; bundles_supported: number;
};
type IntlPrice = { currency: string; price_list_code: string; price: number; catalog_item_id: string };
type Variant = {
  id: string; name: string; is_active: boolean; product_name: string;
  skus: { sku_id: string; sku: string; catalog_item_id: string }[];
  international: { countries: string[]; localized_title: string | null; localized_description: string | null };
  intl_prices: IntlPrice[];
};

const inputCls = 'rounded-lg border px-2 py-1.5 text-[13px] w-full';
const btn = 'rounded-lg border px-2 py-1 text-[12px] font-medium hover:bg-muted';

// G3 · Bundle definitions + variant-group management. The APIs
// (/api/admin/catalog/bundles, .../variants) were built first; this is
// their face. Bundles are a DEFINITION layer (rollups computed at read:
// price = Σ qty × retail price; stock = complete bundles the components
// can make) — nothing here makes a bundle purchasable on the storefront.
// Variants manage the international layer merged into each variant's
// attributes (countries, localized copy) + per-currency prices.
export default function CatalogBundlesPage() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [selected, setSelected] = useState<Bundle | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createForm, setCreateForm] = useState({ name: '', description: '', status: 'draft' });
  const [itemQuery, setItemQuery] = useState('');
  const [itemHits, setItemHits] = useState<{ id: string; name: string }[]>([]);
  const [addQty, setAddQty] = useState('1');

  const [variantQuery, setVariantQuery] = useState('');
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantsLoaded, setVariantsLoaded] = useState(false);

  const loadBundles = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/catalog/bundles', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setBundles(j.bundles || []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/admin/catalog/bundles/${id}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setSelected(j.bundle);
      setComponents(j.components || []);
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => { loadBundles(); }, [loadBundles]);

  const post = async (url: string, method: string, body?: Record<string, unknown>) => {
    const r = await fetch(url, {
      method, headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  };

  const createBundle = async () => {
    setError(null); setNotice(null);
    try {
      const j = await post('/api/admin/catalog/bundles', 'POST', {
        name: createForm.name, description: createForm.description || null, status: createForm.status,
      });
      setCreateForm({ name: '', description: '', status: 'draft' });
      setNotice(`Bundle "${j.bundle?.name ?? createForm.name}" created`);
      await loadBundles();
      if (j.bundle?.id) await loadDetail(j.bundle.id);
    } catch (e: any) { setError(e.message); }
  };

  const searchItems = async () => {
    try {
      const r = await fetch(`/api/admin/catalog/gtin?q=${encodeURIComponent(itemQuery)}&filter=all&limit=20`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setItemHits((j.items || []).map((i: any) => ({ id: String(i.id), name: String(i.name) })));
    } catch (e: any) { setError(e.message); }
  };

  const addComponent = async (itemId: string) => {
    if (!selected) return;
    setError(null);
    try {
      await post(`/api/admin/catalog/bundles/${selected.id}`, 'POST', {
        catalog_item_id: itemId, quantity: Math.max(1, Math.trunc(Number(addQty)) || 1),
      });
      await loadDetail(selected.id);
      await loadBundles();
    } catch (e: any) { setError(e.message); }
  };

  const searchVariants = async () => {
    try {
      const r = await fetch(`/api/admin/catalog/variants?q=${encodeURIComponent(variantQuery)}&limit=50`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setVariants(j.variants || []);
      setVariantsLoaded(true);
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="space-y-6 [font-family:Inter,system-ui,sans-serif]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Package className="size-6" /> Bundles &amp; Variant Groups
        </h1>
      </div>

      {error && <div className="text-[13px] text-red-600">{error}</div>}
      {notice && <div className="text-[13px] text-muted-foreground">{notice}</div>}

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border"><h2 className="text-[14px] font-semibold">Bundle definitions</h2></div>
        {loading ? <p className="px-5 py-6 text-[13px] text-muted-foreground">Loading…</p>
          : bundles.length === 0 ? <p className="px-5 py-6 text-[13px] text-muted-foreground">No bundles defined yet. Create the first one below.</p>
          : (
            <div className="adm-table-wrap"><table className="adm-table">
              <thead className="border-b border-border bg-muted/40"><tr>
                <th className="px-5 py-3 font-medium text-muted-foreground">Bundle</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Components</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Price rollup</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Complete bundles in stock</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {bundles.map((b) => (
                  <tr key={b.id} className={selected?.id === b.id ? 'bg-muted/40' : ''}>
                    <td className="px-5 py-3"><span className="font-medium">{b.name}</span><span className="block text-[12px] text-muted-foreground font-mono">{b.slug}</span></td>
                    <td className="px-5 py-3"><span className="adm-badge capitalize">{b.status}</span></td>
                    <td className="px-5 py-3">{b.component_count}</td>
                    <td className="px-5 py-3">${Number(b.price_rollup ?? 0).toFixed(2)}</td>
                    <td className="px-5 py-3">{b.stock_rollup === null ? '—' : b.stock_rollup}</td>
                    <td className="px-5 py-3"><button className={btn} onClick={() => loadDetail(b.id)}>{selected?.id === b.id ? 'Open' : 'Manage'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        <div className="border-t border-border px-5 py-4">
          <h3 className="text-[13px] font-semibold mb-2">Define a bundle</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-[12px] text-muted-foreground">Name<input className={inputCls} value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} /></label>
            <label className="text-[12px] text-muted-foreground">Description<input className={inputCls} value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} /></label>
            <label className="text-[12px] text-muted-foreground">Status
              <select className={inputCls} value={createForm.status} onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}>
                <option value="draft">draft</option><option value="active">active</option><option value="archived">archived</option>
              </select>
            </label>
          </div>
          <button onClick={createBundle} disabled={!createForm.name.trim()} className="mt-3 rounded-lg border border-[#171420] bg-[#171420] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#000000] disabled:opacity-50" style={{ background: "#171420", borderColor: "#171420", color: "#fff" }}>Create bundle</button>
        </div>
      </section>

      {selected && (
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">{selected.name} — components</h2>
            <div className="flex items-center gap-2">
              <select value={selected.status} className="rounded-lg border px-2 py-1 text-[12px]"
                onChange={async (e) => { try { await post(`/api/admin/catalog/bundles/${selected.id}`, 'PATCH', { status: e.target.value }); await loadDetail(selected.id); await loadBundles(); } catch (err: any) { setError(err.message); } }}>
                <option value="draft">draft</option><option value="active">active</option><option value="archived">archived</option>
              </select>
              <button className={`${btn} text-red-600`} onClick={async () => {
                if (!window.confirm(`Delete bundle "${selected.name}" and its component lines?`)) return;
                try { await post(`/api/admin/catalog/bundles/${selected.id}`, 'DELETE'); setSelected(null); setComponents([]); await loadBundles(); }
                catch (err: any) { setError(err.message); }
              }}>Delete bundle</button>
            </div>
          </div>
          {components.length === 0 ? <p className="px-5 py-6 text-[13px] text-muted-foreground">No components yet — add catalog items below.</p>
          : (
            <div className="adm-table-wrap"><table className="adm-table">
              <thead className="border-b border-border bg-muted/40"><tr>
                <th className="px-5 py-3 font-medium text-muted-foreground">Item</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">SKU</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Qty per bundle</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Unit price</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">On hand</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {components.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-3 font-medium">{c.item_name}{!c.item_active && <span className="text-muted-foreground"> (inactive)</span>}</td>
                    <td className="px-5 py-3 font-mono text-[12px]">{c.sku_code ?? '—'}</td>
                    <td className="px-5 py-3">
                      <input type="number" min={1} defaultValue={c.quantity} className="w-20 rounded-lg border px-2 py-1 text-[13px]"
                        onBlur={async (e) => {
                          const q = Math.max(1, Math.trunc(Number(e.target.value)) || 1);
                          if (q === c.quantity) return;
                          try { await post(`/api/admin/catalog/bundles/${selected.id}`, 'PATCH', { action: 'set_component_qty', component_id: c.id, quantity: q }); await loadDetail(selected.id); await loadBundles(); }
                          catch (err: any) { setError(err.message); }
                        }} />
                    </td>
                    <td className="px-5 py-3">{c.unit_price === null ? '—' : `$${Number(c.unit_price).toFixed(2)}`}</td>
                    <td className="px-5 py-3">{c.stock_on_hand}</td>
                    <td className="px-5 py-3">
                      <button className={`${btn} text-red-600`} onClick={async () => {
                        try { await post(`/api/admin/catalog/bundles/${selected.id}?component_id=${c.id}`, 'DELETE'); await loadDetail(selected.id); await loadBundles(); }
                        catch (err: any) { setError(err.message); }
                      }}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          <div className="border-t border-border px-5 py-4">
            <h3 className="text-[13px] font-semibold mb-2">Add a component</h3>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[12px] text-muted-foreground">Search catalog items
                <input className={`${inputCls} w-64`} value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} placeholder="item name…" />
              </label>
              <button className={btn} onClick={searchItems}>Search</button>
              <label className="text-[12px] text-muted-foreground">Qty
                <input type="number" min={1} className="w-20 rounded-lg border px-2 py-1.5 text-[13px]" value={addQty} onChange={(e) => setAddQty(e.target.value)} />
              </label>
            </div>
            {itemHits.length > 0 && (
              <ul className="mt-2 divide-y divide-border border border-border rounded-lg">
                {itemHits.map((h) => (
                  <li key={h.id} className="flex items-center justify-between px-3 py-2 text-[13px]">
                    <span>{h.name}</span>
                    <button className={btn} onClick={() => addComponent(h.id)}>Add</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground" />
          <h2 className="text-[14px] font-semibold">Variant groups — international layer</h2>
        </div>
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-end gap-2">
          <label className="text-[12px] text-muted-foreground">Search variants
            <input className={`${inputCls} w-64`} value={variantQuery} onChange={(e) => setVariantQuery(e.target.value)} placeholder="variant or product name…" />
          </label>
          <button className={btn} onClick={searchVariants}>Search</button>
        </div>
        {!variantsLoaded ? <p className="px-5 py-6 text-[13px] text-muted-foreground">Search to load variants — each carries its international countries, localized copy, and per-currency prices.</p>
          : variants.length === 0 ? <p className="px-5 py-6 text-[13px] text-muted-foreground">No variants match that search.</p>
          : (
            <div className="divide-y divide-border">
              {variants.map((v) => (
                <VariantRow key={v.id} v={v} post={post} onError={setError} onSaved={() => searchVariants()} />
              ))}
            </div>
          )}
      </section>
    </div>
  );
}

function VariantRow({ v, post, onError, onSaved }: {
  v: Variant;
  post: (url: string, method: string, body?: Record<string, unknown>) => Promise<any>;
  onError: (m: string | null) => void;
  onSaved: () => void;
}) {
  const [countries, setCountries] = useState(v.international.countries.join(', '));
  const [title, setTitle] = useState(v.international.localized_title ?? '');
  const [desc, setDesc] = useState(v.international.localized_description ?? '');
  const [currency, setCurrency] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const saveIntl = async () => {
    setBusy(true); onError(null);
    try {
      await post('/api/admin/catalog/variants', 'PATCH', {
        variant_id: v.id,
        international: {
          countries: countries.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
          localized_title: title || null,
          localized_description: desc || null,
        },
      });
      onSaved();
    } catch (e: any) { onError(e.message); } finally { setBusy(false); }
  };

  const savePrice = async () => {
    setBusy(true); onError(null);
    try {
      await post('/api/admin/catalog/variants', 'POST', {
        action: 'set_price', variant_id: v.id, currency: currency.toUpperCase(), price: Number(price),
      });
      setCurrency(''); setPrice('');
      onSaved();
    } catch (e: any) { onError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="px-5 py-4">
      <p className="text-[13px]"><span className="font-medium">{v.product_name}</span> · {v.name}
        {!v.is_active && <span className="text-muted-foreground"> (inactive)</span>}
        <span className="text-muted-foreground"> · SKUs: {v.skus.length ? v.skus.map((s) => s.sku).join(', ') : 'none'}</span>
      </p>
      {v.intl_prices.length > 0 && (
        <p className="text-[12px] text-muted-foreground mt-1">
          International prices: {v.intl_prices.map((p) => `${p.currency} ${Number(p.price).toFixed(2)}`).join(' · ')}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 mt-3">
        <label className="text-[12px] text-muted-foreground">Countries (ISO codes, comma-separated)
          <input className={inputCls} value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="CA, GB, AU" /></label>
        <label className="text-[12px] text-muted-foreground">Localized title
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="text-[12px] text-muted-foreground">Localized description
          <input className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap items-end gap-2 mt-3">
        <button className={btn} disabled={busy} onClick={saveIntl}>Save international layer</button>
        <label className="text-[12px] text-muted-foreground">Currency
          <input className="w-20 rounded-lg border px-2 py-1 text-[13px] uppercase" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="EUR" /></label>
        <label className="text-[12px] text-muted-foreground">Price
          <input className="w-24 rounded-lg border px-2 py-1 text-[13px]" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" /></label>
        <button className={btn} disabled={busy || !currency || !price} onClick={savePrice}>Set price</button>
      </div>
    </div>
  );
}

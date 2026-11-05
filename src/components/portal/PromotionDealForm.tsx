'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, X, CheckCircle2, AlertCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Promotion generator — ONE implementation, every door (Sunny 2026-10-13):
// product/catalog workflow (inline in the product editor + product rows),
// category rows, the inventory Promotions tab, the Settings → Coupons &
// Deals tab, and /admin/promotions all render this same form over the
// same store (commerce_promotions + commerce_promotion_targets +
// commerce_coupons via /api/admin/promotions).
//
// Model: a PROMOTION is the discount rule. A code is how a customer
// claims it — or it applies automatically. Scope is a SET of targets:
// products and/or taxonomy nodes at any level (a node covers its whole
// subtree at the register). No targets = whole cart. Only the three
// price mechanics the register honors are offered: percent off, fixed
// amount off, set sale price.
// ---------------------------------------------------------------------------

export type DealTarget = { kind: 'product' | 'taxonomy'; id: string; label: string | null };

type TaxNode = { id: string; name: string; slug: string | null; parentId: string | null };

const inputCls = 'w-full border border-border rounded-lg p-2 mt-1 bg-white text-sm';
const labelCls = 'text-xs font-bold uppercase text-muted-foreground';

function slugCode(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
}

// ---------------------------------------------------------------------------
// TargetPicker — multi-select products (search) + taxonomy nodes (tree
// search). Selected targets render as removable chips.
// ---------------------------------------------------------------------------

export function TargetPicker({
  value,
  onChange,
}: {
  value: DealTarget[];
  onChange: (targets: DealTarget[]) => void;
}) {
  const [taxonomy, setTaxonomy] = useState<TaxNode[]>([]);
  const [taxQuery, setTaxQuery] = useState('');
  const [prodQuery, setProdQuery] = useState('');
  const [prodResults, setProdResults] = useState<Array<{ id: string; name: string }>>([]);
  const [prodBusy, setProdBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/admin/promotions/targets', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { taxonomy: [] }))
      .then((j) => setTaxonomy(Array.isArray(j.taxonomy) ? j.taxonomy : []))
      .catch(() => setTaxonomy([]));
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!prodQuery.trim()) { setProdResults([]); return; }
    debounce.current = setTimeout(async () => {
      setProdBusy(true);
      try {
        const r = await fetch(`/api/admin/promotions/targets?q=${encodeURIComponent(prodQuery.trim())}`, { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        setProdResults(Array.isArray(j.products) ? j.products : []);
      } catch { setProdResults([]); } finally { setProdBusy(false); }
    }, 300);
  }, [prodQuery]);

  const pathOf = useMemo(() => {
    const byId = new Map(taxonomy.map((n) => [n.id, n]));
    return (n: TaxNode): string => {
      const parts = [n.name];
      let cur = n.parentId ? byId.get(n.parentId) : undefined;
      let guard = 0;
      while (cur && guard++ < 8) { parts.unshift(cur.name); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
      return parts.join(' › ');
    };
  }, [taxonomy]);

  const has = (kind: DealTarget['kind'], id: string) => value.some((t) => t.kind === kind && t.id === id);
  const add = (t: DealTarget) => { if (!has(t.kind, t.id)) onChange([...value, t]); };
  const remove = (t: DealTarget) => onChange(value.filter((x) => !(x.kind === t.kind && x.id === t.id)));

  const taxMatches = useMemo(() => {
    const q = taxQuery.trim().toLowerCase();
    const list = q ? taxonomy.filter((n) => n.name.toLowerCase().includes(q) || pathOf(n).toLowerCase().includes(q)) : taxonomy;
    return list.slice(0, 60);
  }, [taxonomy, taxQuery, pathOf]);

  return (
    <div className="space-y-3">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <span key={`${t.kind}:${t.id}`} className="inline-flex items-center gap-1 rounded-full bg-muted border border-border px-2.5 py-1 text-xs font-medium">
              <span className="text-muted-foreground uppercase text-[10px]">{t.kind === 'product' ? 'Product' : 'Category'}</span>
              {t.label || t.id}
              <button type="button" onClick={() => remove(t)} className="text-muted-foreground hover:text-foreground cursor-pointer"><X className="size-3" /></button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No targets selected — this promotion applies to the <span className="font-semibold text-foreground">whole cart</span>. Add products or categories below to scope it.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Add a product</label>
          <div className="relative mt-1">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={prodQuery} onChange={(e) => setProdQuery(e.target.value)} placeholder="Search the catalog…" className="w-full border border-border rounded-lg py-2 pl-8 pr-2 bg-white text-sm" />
          </div>
          {(prodBusy || prodResults.length > 0) && (
            <div className="border border-border rounded-lg mt-1 max-h-44 overflow-y-auto bg-white">
              {prodBusy && <p className="p-2 text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" /> Searching…</p>}
              {prodResults.map((p) => (
                <button key={p.id} type="button" disabled={has('product', p.id)} onClick={() => add({ kind: 'product', id: p.id, label: p.name })} className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-40 cursor-pointer">
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className={labelCls}>Add a category / subcategory</label>
          <div className="relative mt-1">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={taxQuery} onChange={(e) => setTaxQuery(e.target.value)} placeholder="Search categories…" className="w-full border border-border rounded-lg py-2 pl-8 pr-2 bg-white text-sm" />
          </div>
          <div className="border border-border rounded-lg mt-1 max-h-44 overflow-y-auto bg-white">
            {taxMatches.map((n) => (
              <button key={n.id} type="button" disabled={has('taxonomy', n.id)} onClick={() => add({ kind: 'taxonomy', id: n.id, label: n.name })} className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-40 cursor-pointer">
                {pathOf(n)}
              </button>
            ))}
            {taxMatches.length === 0 && <p className="p-2 text-xs text-muted-foreground">No categories match.</p>}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">A category target covers every product under that node, subcategories included.</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromotionDealForm — the create form. Posts the promotion, then (for a
// code claim) the coupon code that claims it.
// ---------------------------------------------------------------------------

export function PromotionDealForm({
  presetTargets,
  heading,
  onCreated,
}: {
  presetTargets?: DealTarget[];
  heading?: string;
  onCreated?: (promotion: any) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [type, setType] = useState('percent_off');
  const [value, setValue] = useState('');
  const [claim, setClaim] = useState<'code' | 'automatic'>('code');
  const [couponCode, setCouponCode] = useState('');
  const [minimum, setMinimum] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [targets, setTargets] = useState<DealTarget[]>(presetTargets ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (presetTargets) setTargets(presetTargets); }, [presetTargets]);

  const effectiveCode = codeTouched ? code : slugCode(name);
  const effectiveCoupon = couponCode || effectiveCode;

  const submit = async () => {
    if (!name.trim()) { setErr('Name is required.'); return; }
    if (!effectiveCode) { setErr('A promotion code is required (it defaults from the name).'); return; }
    if (value === '' || Number(value) < 0) { setErr('Value is required.'); return; }
    if (claim === 'code' && !effectiveCoupon) { setErr('A claim code is required for a code-claimed promotion.'); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch('/api/admin/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: effectiveCode,
          name: name.trim(),
          promotion_type: type,
          value: Number(value),
          minimum_subtotal: minimum === '' ? null : Number(minimum),
          maximum_discount: maxDiscount === '' ? null : Number(maxDiscount),
          start_at: startAt || null,
          end_at: endAt || null,
          usage_limit: usageLimit === '' ? null : Number(usageLimit),
          active: true,
          is_automatic: claim === 'automatic',
          targets,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Create failed (${res.status})`);
      const promotion = j.promotion;
      if (claim === 'code') {
        const cres = await fetch('/api/admin/coupons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: effectiveCoupon,
            promotion_id: promotion?.id,
            status: 'active',
            valid_from: startAt || null,
            valid_to: endAt || null,
            usage_limit: usageLimit === '' ? null : Number(usageLimit),
          }),
        });
        const cj = await cres.json().catch(() => ({}));
        if (!cres.ok) throw new Error(`Promotion created, but the claim code failed: ${cj.error || cres.status}`);
      }
      setMsg(claim === 'automatic'
        ? `Promotion "${name.trim()}" is live and applies automatically at the register.`
        : `Promotion "${name.trim()}" is live — customers claim it with code ${effectiveCoupon}.`);
      setName(''); setCode(''); setCodeTouched(false); setValue(''); setCouponCode('');
      setMinimum(''); setMaxDiscount(''); setUsageLimit(''); setStartAt(''); setEndAt('');
      if (!presetTargets) setTargets([]);
      onCreated?.(promotion);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {heading && <h3 className="text-[15px] font-semibold text-foreground">{heading}</h3>}
      {msg && <p className="flex items-center gap-2 text-[13px] text-foreground bg-success/5 border border-success/30 rounded-lg px-3 py-2"><CheckCircle2 className="size-4 text-success" /> {msg}</p>}
      {err && <p className="flex items-center gap-2 text-[13px] text-destructive bg-destructive/5 border border-destructive/30 rounded-lg px-3 py-2"><AlertCircle className="size-4" /> {err}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Deal name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fall Treat Sale" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Promotion code</label>
          <input value={effectiveCode} onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeTouched(true); }} placeholder="FALL-TREATS" className={inputCls + ' font-mono'} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Discount</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            <option value="percent_off">Percent off</option>
            <option value="amount_off">Fixed amount off</option>
            <option value="set_price">Set sale price</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>{type === 'percent_off' ? 'Percent (%) *' : type === 'set_price' ? 'Sale price ($) *' : 'Amount off ($) *'}</label>
          <input type="number" step="0.01" min="0" value={value} onChange={(e) => setValue(e.target.value)} className={inputCls} placeholder={type === 'percent_off' ? '15' : '9.99'} />
        </div>
        <div>
          <label className={labelCls}>How customers claim it</label>
          <select value={claim} onChange={(e) => setClaim(e.target.value as 'code' | 'automatic')} className={inputCls}>
            <option value="code">With a code</option>
            <option value="automatic">Automatic (no code)</option>
          </select>
        </div>
      </div>

      {claim === 'code' && (
        <div>
          <label className={labelCls}>Claim code (coupon / promo code — same thing)</label>
          <input value={effectiveCoupon} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} className={inputCls + ' font-mono'} placeholder={effectiveCode || 'FALL-TREATS'} />
        </div>
      )}

      <div>
        <label className={labelCls}>Scope — what the deal applies to</label>
        <div className="mt-2"><TargetPicker value={targets} onChange={setTargets} /></div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className={labelCls}>Min. eligible subtotal ($)</label>
          <input type="number" step="0.01" min="0" value={minimum} onChange={(e) => setMinimum(e.target.value)} className={inputCls} placeholder="optional" />
        </div>
        <div>
          <label className={labelCls}>Max. discount ($)</label>
          <input type="number" step="0.01" min="0" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} className={inputCls} placeholder="optional" />
        </div>
        <div>
          <label className={labelCls}>Usage limit</label>
          <input type="number" min="0" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} className={inputCls} placeholder="optional" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Starts</label>
            <input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Ends</label>
            <input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button onClick={submit} disabled={busy || !name.trim() || value === ''} className="inline-flex items-center gap-2 px-5 py-2 bg-ink text-white rounded-lg text-sm font-semibold hover:bg-ink/90 disabled:opacity-50 cursor-pointer">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Publish Deal
        </button>
      </div>
    </div>
  );
}

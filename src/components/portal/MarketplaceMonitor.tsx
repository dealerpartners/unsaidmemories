'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Loader2, AlertTriangle, RefreshCw, Zap, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PartnerQuickActions } from '@/components/portal/PartnerQuickActions';

// This monitor's own partner taxonomy (the values its search API
// returns) — not the quick-actions panel's tab ids, which are a
// different set ('groomers' | 'vets' | ...). The types used to be
// imported from PartnerQuickActions, which never exported them.
type PartnerType = 'seller' | 'groomer' | 'pharmacy' | 'vet';
type PartnerSubject = {
  partnerType: PartnerType;
  partnerId: string;
  partnerName: string;
  partnerStatus: string | null;
  listing?: { id: string; title: string; status: string; suppressionReason: string | null };
};

// ---------------------------------------------------------------------------
// MarketplaceMonitor — the §2.4 directive's marketplace leg, inside the
// one commerce place (Products & Inventory). Every seller feed lands
// here: seller_listings monitored with seller / SKU / product search,
// listing-level suspend (suppression) one click from the row, decisions
// through the ONE listings writer, trust-center cases through the ONE
// investigations writer, and the partner-type quick-action modal
// (seller / groomer / pharmacy / vet) over each type's own admin API.
// ---------------------------------------------------------------------------

type MRow = {
  id: string;
  seller_id: string;
  seller_name: string | null;
  product_id: string | null;
  product_name: string | null;
  sku: string;
  title: string;
  brand: string | null;
  price: number | null;
  stock: number | null;
  status: string;
  suppression_reason: string | null;
  health_score: number | null;
  media_count: number;
  image: string | null;
  created_at: string;
  updated_at: string;
};

type MData = {
  counts: { instore: number; dropship: number; marketplace: number };
  rows: MRow[];
  total: number;
  byStatus: Record<string, number>;
  suppressedCount: number;
};

type PartnerHit = { id: string; name: string; status: string | null; partner_type: PartnerType; sub: string | null };

const money = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);
const PAGE_SIZE = 50;

export function MarketplaceMonitor() {
  const [q, setQ] = useState('');
  const [seller, setSeller] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<MData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [subject, setSubject] = useState<PartnerSubject | null>(null);

  // Partner launcher
  const [pType, setPType] = useState<PartnerType>('seller');
  const [pQ, setPQ] = useState('');
  const [pHits, setPHits] = useState<PartnerHit[] | null>(null);
  const [pBusy, setPBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab: 'marketplace', q, page: String(page) });
      if (seller) params.set('seller', seller);
      if (status) params.set('status', status);
      const r = await fetch(`/api/admin/inventory?${params.toString()}`, { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.error) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j as MData);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Marketplace feed could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [q, seller, status, page]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function searchPartners() {
    setPBusy(true);
    try {
      const r = await fetch(`/api/admin/inventory?tab=partners&type=${pType}&q=${encodeURIComponent(pQ)}`, { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.error) throw new Error(j?.error || `HTTP ${r.status}`);
      setPHits((j.partners || []) as PartnerHit[]);
    } catch {
      setPHits([]);
    } finally {
      setPBusy(false);
    }
  }

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex w-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Search by seller, SKU, or product"
            className="h-9 w-72 max-w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0); }}
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
          aria-label="Filter by listing status"
        >
          <option value="">All statuses</option>
          {['pending_review', 'draft', 'approved', 'rejected'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {seller && (
          <button
            onClick={() => setSeller('')}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted"
          >
            Seller filter on — clear
          </button>
        )}
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {data && (
          <span className="text-xs text-muted-foreground">
            {data.counts.marketplace.toLocaleString()} listings monitored
            {data.byStatus.pending_review ? ` · ${data.byStatus.pending_review} awaiting review` : ''}
            {` · ${data.suppressedCount} suppressed`}
          </span>
        )}
      </div>

      <p className="px-4 pt-2 text-xs text-muted-foreground">
        Every seller feed lands here. Open a row's quick actions to approve, reject, or suspend (suppress) the
        listing, or flag the seller to the trust center. Buyer search lives on Orders, where the buyer is the row.
      </p>

      {/* Partner quick-action launcher — §2.4 (vii) */}
      <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><Zap className="size-3.5" /> Partner quick actions</span>
        <select value={pType} onChange={(e) => setPType(e.target.value as PartnerType)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" aria-label="Partner type">
          <option value="seller">Sellers</option>
          <option value="groomer">3rd-party groomers</option>
          <option value="pharmacy">Pharmacy</option>
          <option value="vet">Vets</option>
        </select>
        <div className="relative">
          <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
          <input value={pQ} onChange={(e) => setPQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') searchPartners(); }} placeholder="Partner name" className="h-8 w-52 max-w-full rounded-lg border border-border bg-background pl-7 pr-2 text-xs" />
        </div>
        <button onClick={searchPartners} disabled={pBusy} className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40">
          {pBusy ? 'Searching…' : 'Find partner'}
        </button>
        {pHits && (
          <div className="flex w-full flex-wrap gap-1.5 pt-1">
            {pHits.length === 0 && <span className="text-xs text-muted-foreground">No partners match.</span>}
            {pHits.map((h) => (
              <button
                key={h.id}
                onClick={() => setSubject({ partnerType: h.partner_type, partnerId: h.id, partnerName: h.name, partnerStatus: h.status })}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
              >
                {h.name} <span className="text-muted-foreground">· {h.status || '—'}{h.sub ? ` · ${h.sub}` : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4" /> {error}
          <button onClick={load} className="ml-auto inline-flex items-center gap-1 rounded border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted">
            <RefreshCw className="size-3.5" /> Retry
          </button>
        </p>
      )}

      <div className={cn('overflow-x-auto p-4 transition-opacity', loading ? 'opacity-70' : 'opacity-100')}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 pr-3">Listing</th><th className="pr-3">Seller</th><th className="pr-3">SKU</th>
              <th className="pr-3">Price</th><th className="pr-3">Stock</th><th className="pr-3">Status</th>
              <th className="pr-3">Media</th><th className="pr-3">Health</th><th />
            </tr>
          </thead>
          <tbody>
            {(data?.rows || []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-3">
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt={r.title} className="size-11 rounded-lg border border-border object-cover" loading="lazy" />
                    ) : (
                      <span className="flex size-11 items-center justify-center rounded-lg border border-border bg-muted">
                        <Package className="size-5 text-muted-foreground" />
                      </span>
                    )}
                    <div>
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground">{r.product_name || r.brand || ''}</div>
                      {r.suppression_reason && <div className="text-xs text-destructive">Suppressed: {r.suppression_reason}</div>}
                    </div>
                  </div>
                </td>
                <td className="pr-3">{r.seller_name || '—'}</td>
                <td className="pr-3 font-mono text-xs">{r.sku}</td>
                <td className="pr-3">{money(r.price)}</td>
                <td className="pr-3">{r.stock ?? '—'}</td>
                <td className="pr-3">{r.status}</td>
                <td className="pr-3">{r.media_count}</td>
                <td className="pr-3">{r.health_score == null ? '—' : Math.round(r.health_score)}</td>
                <td>
                  <button
                    className="whitespace-nowrap text-xs font-semibold underline"
                    onClick={() => setSubject({
                      partnerType: 'seller',
                      partnerId: r.seller_id,
                      partnerName: r.seller_name || 'Seller',
                      partnerStatus: null,
                      listing: { id: r.id, title: r.title, status: r.status, suppressionReason: r.suppression_reason },
                    })}
                  >
                    Quick actions
                  </button>
                </td>
              </tr>
            ))}
            {data && data.rows.length === 0 && (
              <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">No seller listings match. Every listing a seller submits lands here the moment it is submitted.</td></tr>
            )}
          </tbody>
        </table>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{total === 0 ? 'No listings' : `${total.toLocaleString()} listings`}</span>
          <div className="flex items-center gap-2">
            <button disabled={page === 0 || loading} onClick={() => setPage(page - 1)} className="rounded border border-border px-3 py-1 disabled:opacity-40">Prev</button>
            <span className="text-muted-foreground">Page {page + 1} of {pageCount.toLocaleString()}</span>
            <button disabled={loading || page + 1 >= pageCount} onClick={() => setPage(page + 1)} className="rounded border border-border px-3 py-1 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>

      {subject && (
        <PartnerQuickActions
          open
          onClose={() => setSubject(null)}
        />
      )}
    </div>
  );
}

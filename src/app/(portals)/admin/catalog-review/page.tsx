'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, LibraryBig, ChevronLeft, ChevronRight, Check, X, EyeOff, Eye } from 'lucide-react';

type Item = {
  id: string;
  name: string;
  slug: string | null;
  brand: string | null;
  price: number | null;
  status: string | null;
  sellerId: string | null;
  seller: string | null;
  active: boolean;
  issues?: string[];
  complete?: boolean;
};

const PAGE = 50;

const CATEGORIES = [
  'Policy violation',
  'IP complaint',
  'Safety recall',
  'Restricted product',
  'Counterfeit flag',
];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending_review: { label: 'Pending review', cls: 'adm-badge adm-badge-amber' },
  approved: { label: 'Approved', cls: 'adm-badge adm-badge-green' },
  rejected: { label: 'Rejected', cls: 'adm-badge adm-badge-red' },
  suppressed: { label: 'Suppressed', cls: 'bg-red-200 text-red-900 dark:bg-red-950/50 dark:text-red-200' },
};

const money = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const FILTERS: { key: string; label: string; countKey: string }[] = [
  { key: '', label: 'All items', countKey: '' },
  { key: 'pending_review', label: 'Pending review', countKey: 'pending_review' },
  { key: 'approved', label: 'Approved', countKey: 'approved' },
  { key: 'rejected', label: 'Rejected', countKey: 'rejected' },
  { key: 'suppressed', label: 'Suppressed', countKey: 'suppressed' },
  { key: 'none', label: 'No review state', countKey: 'none' },
];

export default function CatalogReviewPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [formFor, setFormFor] = useState<{ id: string; action: 'reject' | 'suppress' } | null>(null);
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ q: debounced, page: String(page) });
    if (statusFilter) qs.set('status', statusFilter);
    fetch(`/api/admin/catalog-review?${qs}`)
      .then(r => r.json())
      .then(d => {
        setItems(Array.isArray(d.rows) ? d.rows : []);
        setTotal(typeof d.total === 'number' ? d.total : 0);
        setByStatus(d.byStatus && typeof d.byStatus === 'object' ? d.byStatus : {});
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [debounced, page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const decide = async (item: Item, action: 'approve' | 'reject' | 'suppress' | 'unsuppress') => {
    setMsg(null);
    setBusy(item.id);
    try {
      const r = await fetch('/api/admin/catalog-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          itemId: item.id,
          reason: action === 'reject' || action === 'suppress' ? reason.trim() : undefined,
          category: action === 'suppress' ? category : undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(d.error || 'The action could not be completed.');
        return;
      }
      setFormFor(null);
      setReason('');
      load();
    } catch {
      setMsg('Network error — the action was not recorded.');
    } finally {
      setBusy(null);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const grandTotal = FILTERS.reduce((n, f) => n + (f.countKey ? (byStatus[f.countKey] || 0) : 0), 0);

  const statusPill = (i: Item) => {
    if (!i.status) return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground">No review state</span>;
    const m = STATUS_META[i.status] || { label: i.status, cls: 'bg-muted text-muted-foreground' };
    return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.cls}`}>{m.label}</span>;
  };

  const actionsFor = (i: Item) => {
    const st = i.status;
    const btn = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-50 cursor-pointer';
    return (
      <div className="flex items-center justify-end gap-1.5 flex-wrap">
        {(st === null || st === 'pending_review' || st === 'rejected') && (
          <button onClick={() => decide(i, 'approve')} disabled={busy === i.id} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
            <Check className="size-3.5" /> Approve
          </button>
        )}
        {(st === null || st === 'pending_review' || st === 'approved') && (
          <button
            onClick={() => { setFormFor({ id: i.id, action: 'reject' }); setReason(''); }}
            disabled={busy === i.id}
            className={`${btn} border border-red-300 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40`}
          >
            <X className="size-3.5" /> Reject
          </button>
        )}
        {(st === null || st === 'pending_review' || st === 'approved') && (
          <button
            onClick={() => { setFormFor({ id: i.id, action: 'suppress' }); setReason(''); setCategory(CATEGORIES[0]); }}
            disabled={busy === i.id}
            className={`${btn} border border-border text-foreground hover:bg-muted`}
          >
            <EyeOff className="size-3.5" /> Suppress
          </button>
        )}
        {st === 'suppressed' && (
          <button onClick={() => decide(i, 'unsuppress')} disabled={busy === i.id} className={`${btn} border border-border text-foreground hover:bg-muted`}>
            <Eye className="size-3.5" /> Lift suppression
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <LibraryBig className="size-6" /> Catalog Review
          </h1>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search name, slug, brand…"
            className="bg-transparent outline-none text-[13px] w-56"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map(f => {
          const n = f.countKey ? (byStatus[f.countKey] || 0) : grandTotal;
          const activeChip = statusFilter === f.key;
          return (
            <button
              key={f.key || 'all'}
              onClick={() => { setStatusFilter(f.key); setPage(0); }}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border cursor-pointer ${activeChip ? 'bg-brand-teal/10 text-brand-teal border-brand-teal/40' : 'bg-card border-border text-muted-foreground hover:bg-muted'}`}
            >
              {f.label} ({n.toLocaleString()})
            </button>
          );
        })}
      </div>

      {msg && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-[13px] text-red-800 dark:text-red-200">
          {msg}
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <LibraryBig className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No catalog items found</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            {debounced || statusFilter ? 'Try a different search or filter.' : 'The catalog is empty.'}
          </p>
        </div>
      ) : (
        <>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="adm-table-wrap"><table className="adm-table">
              <thead>
                <tr>
                  <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Product</th>
                  <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Seller</th>
                  <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Brand</th>
                  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Price</th>
                  <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Review state</th>
                  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} className="border-t border-border hover:bg-muted/50 align-top">
                    <td className="p-3">
                      <div className="font-medium">{i.name}</div>
                      <div className="text-muted-foreground font-mono text-[12px]">{i.slug || '—'}</div>
                      {i.complete === false && i.issues && i.issues.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {i.issues.map(x => (
                            <span key={x} className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">{x}</span>
                          ))}
                        </div>
                      ) : i.complete ? (
                        <div className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Complete — title, description, price, category, GTIN, image</div>
                      ) : null}
                      {formFor?.id === i.id && (
                        <div className="mt-2 bg-card border border-border rounded-lg p-3 space-y-2 max-w-md">
                          {formFor.action === 'suppress' && (
                            <select
                              value={category}
                              onChange={e => setCategory(e.target.value)}
                              className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-[13px]"
                            >
                              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          )}
                          <input
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder={formFor.action === 'reject' ? 'Reason (required — the seller sees it)' : 'Detail (optional — recorded with the cause)'}
                            className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-[13px] outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => decide(i, formFor.action)}
                              disabled={busy === i.id || (formFor.action === 'reject' && !reason.trim())}
                              className="px-3 py-1.5 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[12px] font-semibold disabled:opacity-50 cursor-pointer"
                            >
                              {busy === i.id ? 'Recording…' : formFor.action === 'reject' ? 'Record rejection' : 'Record suppression'}
                            </button>
                            <button
                              onClick={() => setFormFor(null)}
                              className="px-3 py-1.5 border border-border rounded-lg text-[12px] font-semibold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{i.seller || 'House catalog'}</td>
                    <td className="p-3 text-muted-foreground">{i.brand || '—'}</td>
                    <td className="p-3 text-right text-muted-foreground">{money(i.price)}</td>
                    <td className="p-3">{statusPill(i)}{!i.active && <span className="ml-1 text-[11px] text-muted-foreground">(inactive)</span>}</td>
                    <td className="p-3">{actionsFor(i)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
          <div className="flex items-center justify-between text-[13px] text-muted-foreground">
            <span>
              Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 border border-border rounded-lg text-[12px] font-semibold hover:bg-muted disabled:opacity-40 cursor-pointer inline-flex items-center gap-1"
              >
                <ChevronLeft className="size-4" /> Prev
              </button>
              <span>Page {page + 1} of {pages.toLocaleString()}</span>
              <button
                onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
                disabled={page >= pages - 1}
                className="px-3 py-1.5 border border-border rounded-lg text-[12px] font-semibold hover:bg-muted disabled:opacity-40 cursor-pointer inline-flex items-center gap-1"
              >
                Next <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Search, Check, X, Store, EyeOff, Eye, ImageIcon, FileText, Tag, Gauge } from 'lucide-react';

type Listing = {
  id: string;
  sellerId: string;
  name: string;
  seller: string;
  productId: string | null;
  productName: string | null;
  sku: string;
  description: string | null;
  brand: string | null;
  price: number | null;
  stock: number | null;
  status: string;
  suppressionReason: string | null;
  healthScore: number | null;
  categoryId: string | null;
  mediaCount: number;
  submittedAt: string | null;
};

const CATEGORIES = [
  'Policy violation',
  'IP complaint',
  'Safety recall',
  'Restricted product',
  'Counterfeit flag',
];

const STATUS_STYLES: Record<string, string> = {
  pending_review: 'adm-badge adm-badge-amber',
  draft: 'bg-muted text-muted-foreground',
  approved: 'adm-badge adm-badge-green',
  rejected: 'adm-badge adm-badge-red',
};

const money = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [formFor, setFormFor] = useState<{ id: string; action: 'reject' | 'suppress' } | null>(null);
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);

  const load = () => {
    fetch('/api/admin/listings')
      .then(r => r.json())
      .then(d => {
        setListings(Array.isArray(d.rows) ? d.rows : []);
        setNote(typeof d.note === 'string' ? d.note : null);
      })
      .catch(() => setNote('Could not reach the listings service — showing an empty queue.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const decide = async (listing: Listing, action: 'approve' | 'reject' | 'suppress' | 'unsuppress') => {
    setActionMsg(null);
    setBusyId(listing.id);
    try {
      const r = await fetch('/api/admin/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          listingId: listing.id,
          reason: action === 'reject' || action === 'suppress' ? reason.trim() : undefined,
          category: action === 'suppress' ? category : undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setActionMsg(d.error || 'The action could not be completed.');
        return;
      }
      const upd = d.listing || {};
      setListings(ls => ls.map(l => l.id === listing.id ? {
        ...l,
        status: typeof upd.status === 'string' ? upd.status : l.status,
        suppressionReason: 'suppression_reason' in upd ? (upd.suppression_reason || null) : l.suppressionReason,
      } : l));
      setFormFor(null);
      setReason('');
    } catch {
      setActionMsg('Network error — the action was not recorded.');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = listings.filter(l => {
    const s = search.toLowerCase();
    const matchesSearch = !s || l.name.toLowerCase().includes(s) || l.seller.toLowerCase().includes(s) || (l.sku || '').toLowerCase().includes(s);
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'suppressed' ? Boolean(l.suppressionReason) : l.status === statusFilter);
    return matchesSearch && matchesStatus;
  });

  const counts = listings.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});
  const suppressedCount = listings.filter(l => l.suppressionReason).length;

  const checks = (l: Listing) => (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1 flex-wrap">
      <span className="inline-flex items-center gap-1">
        <ImageIcon className="size-3" /> {l.mediaCount > 0 ? `${l.mediaCount} photo${l.mediaCount === 1 ? '' : 's'}` : 'No photos'}
      </span>
      <span className="inline-flex items-center gap-1">
        <FileText className="size-3" /> {l.description ? 'Description present' : 'No description'}
      </span>
      <span className="inline-flex items-center gap-1">
        <Tag className="size-3" /> {l.categoryId ? 'Category set' : 'No category'}
      </span>
      <span className="inline-flex items-center gap-1">
        <Gauge className="size-3" /> {l.healthScore !== null ? `Health ${l.healthScore}` : 'Health not scored'}
      </span>
    </div>
  );

  return (
    <div className="space-y-6 [font-family:Inter,system-ui,sans-serif]">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Store className="size-6" /> Seller Listings — Catalog Review
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search listings…"
              className="bg-transparent outline-none text-[13px] w-48"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-[13px]"
          >
            <option value="all">All ({listings.length})</option>
            {Object.keys(counts).map(s => (
              <option key={s} value={s}>{s} ({counts[s]})</option>
            ))}
            <option value="suppressed">suppressed ({suppressedCount})</option>
          </select>
        </div>
      </div>

      {note && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-[13px] text-amber-800 dark:text-amber-200">
          {note}
        </div>
      )}

      {actionMsg && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-[13px] text-red-800 dark:text-red-200">
          {actionMsg}
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Store className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No listings in the review queue</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            {listings.length === 0
              ? 'Seller-submitted listings appear here the moment they are submitted.'
              : 'No listings match the current filter.'}
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Listing</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Seller</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Price</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Submitted</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => {
                const inQueue = l.status === 'pending_review' || l.status === 'draft';
                const busy = busyId === l.id;
                return (
                  <tr key={l.id} className="border-t border-border hover:bg-muted/50 align-top">
                    <td className="p-3">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-[12px] text-muted-foreground">
                        SKU {l.sku || '—'}{l.productName ? ` · Product: ${l.productName}` : ''}{l.brand ? ` · ${l.brand}` : ''}
                      </div>
                      {checks(l)}
                      {l.suppressionReason && (
                        <div className="text-[12px] text-red-700 dark:text-red-300 mt-1">
                          Suppressed — {l.suppressionReason}
                        </div>
                      )}
                      {formFor?.id === l.id && (
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
                              onClick={() => decide(l, formFor.action)}
                              disabled={busy || (formFor.action === 'reject' && !reason.trim())}
                              className="px-3 py-1.5 border border-[#171420] bg-[#171420] text-white hover:bg-[#000000] rounded-lg text-[12px] font-semibold disabled:opacity-50 cursor-pointer"
                              style={{ background: "#171420", borderColor: "#171420", color: "#fff" }}
                            >
                              {busy ? 'Recording…' : formFor.action === 'reject' ? 'Record rejection' : 'Record suppression'}
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
                    <td className="p-3 text-muted-foreground">{l.seller}</td>
                    <td className="p-3 text-right text-muted-foreground">{money(l.price)}</td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[l.status] || 'bg-muted text-muted-foreground'}`}>
                        {l.status}
                      </span>
                      {l.suppressionReason && (
                        <span className="inline-block ml-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-200 text-red-900 dark:bg-red-950/50 dark:text-red-200">
                          suppressed
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{when(l.submittedAt)}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {inQueue && (
                        <>
                          <button
                            onClick={() => decide(l, 'approve')}
                            disabled={busy}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#171420] text-white rounded-lg text-[12px] font-semibold hover:bg-[#000000] disabled:opacity-50 cursor-pointer mr-2"
                            style={{ background: "#171420", color: "#fff" }}
                          >
                            <Check className="size-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => { setFormFor({ id: l.id, action: 'reject' }); setReason(''); }}
                            disabled={busy}
                            className="inline-flex items-center gap-1 px-3 py-1.5 border border-red-300 text-red-700 dark:text-red-300 rounded-lg text-[12px] font-semibold hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 cursor-pointer mr-2"
                          >
                            <X className="size-3.5" /> Reject
                          </button>
                        </>
                      )}
                      {!l.suppressionReason ? (
                        <button
                          onClick={() => { setFormFor({ id: l.id, action: 'suppress' }); setReason(''); setCategory(CATEGORIES[0]); }}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-[12px] font-semibold hover:bg-muted disabled:opacity-50 cursor-pointer"
                        >
                          <EyeOff className="size-3.5" /> Suppress
                        </button>
                      ) : (
                        <button
                          onClick={() => decide(l, 'unsuppress')}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-[12px] font-semibold hover:bg-muted disabled:opacity-50 cursor-pointer"
                        >
                          <Eye className="size-3.5" /> Lift suppression
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

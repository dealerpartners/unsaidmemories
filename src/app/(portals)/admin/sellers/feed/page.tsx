'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Package, Users } from 'lucide-react';

type FeedItem = {
  id: string;
  seller_id: string;
  sku: string | null;
  product_name: string | null;
  status: string;
  created_at: string;
  seller_name: string | null;
  seller_type: string | null;
  seller_status: string | null;
};

type Counts = { all: number; pending: number; approved: number; rejected: number; suspended: number };

type BuyerOrder = {
  id: string;
  email: string | null;
  customer_email: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  status: string | null;
  fulfillmentStatus: string | null;
  totalAmount: number | null;
  createdAt: string | null;
  item_count: number;
};

const FEED_STATUSES = ['all', 'pending', 'approved', 'rejected', 'suspended'] as const;

const statusBadge = (s: string) => {
  const styles: Record<string, string> = {
    pending: 'adm-badge adm-badge-amber',
    approved: 'adm-badge adm-badge-green',
    rejected: 'adm-badge',
    suspended: 'adm-badge adm-badge-red',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${styles[s] || styles.pending}`}>
      {s}
    </span>
  );
};

export default function SellerFeedPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'feed' | 'buyers'>('feed');

  // ---- Feed items ----
  const [items, setItems] = useState<FeedItem[]>([]);
  const [counts, setCounts] = useState<Counts>({ all: 0, pending: 0, approved: 0, rejected: 0, suspended: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [actingId, setActingId] = useState<string | null>(null);

  const loadFeed = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (status !== 'all') params.set('status', status);
    fetch(`/api/admin/sellers/feed?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setItems(Array.isArray(d.rows) ? d.rows : []);
        if (d.counts) setCounts(d.counts);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadFeed();
  };

  const setItemStatus = async (id: string, next: string) => {
    if (!window.confirm(`Set this feed item to "${next}"?`)) return;
    setActingId(id);
    try {
      const r = await fetch('/api/admin/sellers/feed', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: next }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Action failed');
      loadFeed();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActingId(null);
    }
  };

  // ---- Buyer lookup ----
  const [buyerQ, setBuyerQ] = useState('');
  const [buyerOrders, setBuyerOrders] = useState<BuyerOrder[]>([]);
  const [buyerLoading, setBuyerLoading] = useState(false);
  const [buyerSearched, setBuyerSearched] = useState(false);

  const searchBuyers = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerQ.trim()) return;
    setBuyerLoading(true);
    setBuyerSearched(true);
    fetch(`/api/admin/orders?q=${encodeURIComponent(buyerQ.trim())}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setBuyerOrders(Array.isArray(d.orders) ? d.orders : []))
      .catch(() => setBuyerOrders([]))
      .finally(() => setBuyerLoading(false));
  };

  return (
    <div className="space-y-6">
      <button onClick={() => router.push('/admin/sellers')}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground cursor-pointer">
        <ArrowLeft className="size-4" /> Back to sellers
      </button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Package className="size-6" /> Seller Feed
        </h1>
      </div>

      <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-card w-fit">
        {(
          [
            { id: 'feed', label: 'Feed Items', icon: Package },
            { id: 'buyers', label: 'Buyer Lookup', icon: Users },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 cursor-pointer ${ tab === t.id ? 'bg-brand-teal/10 text-brand-teal' : 'text-muted-foreground hover:text-foreground' }`}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'feed' ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <form onSubmit={onSearch} className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search seller, SKU, product name…"
                className="w-full border border-border rounded-lg pl-9 pr-3 py-2 text-[13px] bg-card"
              />
            </form>
            <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-card">
              {FEED_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium capitalize cursor-pointer ${ status === s ? 'bg-brand-teal/10 text-brand-teal' : 'text-muted-foreground hover:text-foreground' }`}
                >
                  {s}
                  {s !== 'all' && counts[s as keyof Counts] > 0 ? ` (${counts[s as keyof Counts]})` : ''}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-muted-foreground text-[13px]">Loading feed…</div>
          ) : items.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Package className="size-10 mx-auto text-muted-foreground/40" />
              <p className="text-[14px] font-medium text-foreground mt-3">No feed items</p>
              <p className="text-[13px] text-muted-foreground mt-1">
                {search || status !== 'all'
                  ? 'Try a different search or status filter.'
                  : 'Seller feed submissions will appear here for review.'}
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead>
                  <tr>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Product</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">SKU</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Seller</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Submitted</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t border-border hover:bg-muted/50">
                      <td className="p-3 font-medium">{it.product_name || '—'}</td>
                      <td className="p-3 text-muted-foreground font-mono text-[12px]">{it.sku || '—'}</td>
                      <td className="p-3">
                        <div className="font-medium">{it.seller_name || it.seller_id.slice(0, 8)}</div>
                        {it.seller_type && (
                          <div className="text-[11px] text-muted-foreground capitalize">{it.seller_type.replace(/_/g, ' ')}</div>
                        )}
                      </td>
                      <td className="p-3">{statusBadge(it.status)}</td>
                      <td className="p-3 text-muted-foreground text-[12px]">
                        {it.created_at ? new Date(it.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1.5">
                          {it.status !== 'approved' && (
                            <button
                              disabled={actingId === it.id}
                              onClick={() => setItemStatus(it.id, 'approved')}
                              className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-semibold hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                            >
                              Approve
                            </button>
                          )}
                          {it.status !== 'rejected' && (
                            <button
                              disabled={actingId === it.id}
                              onClick={() => setItemStatus(it.id, 'rejected')}
                              className="px-2.5 py-1 border border-border rounded text-[11px] font-semibold hover:bg-muted cursor-pointer disabled:opacity-50"
                            >
                              Reject
                            </button>
                          )}
                          {it.status !== 'suspended' && (
                            <button
                              disabled={actingId === it.id}
                              onClick={() => setItemStatus(it.id, 'suspended')}
                              className="px-2.5 py-1 bg-red-600 text-white rounded text-[11px] font-semibold hover:bg-red-700 cursor-pointer disabled:opacity-50"
                            >
                              Suspend
                            </button>
                          )}
                          {it.status !== 'pending' && (
                            <button
                              disabled={actingId === it.id}
                              onClick={() => setItemStatus(it.id, 'pending')}
                              className="px-2.5 py-1 border border-border rounded text-[11px] font-semibold hover:bg-muted cursor-pointer disabled:opacity-50"
                            >
                              Re-queue
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </>
      ) : (
        <>
          <form onSubmit={searchBuyers} className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={buyerQ}
              onChange={(e) => setBuyerQ(e.target.value)}
              placeholder="Search buyers by name or email…"
              className="w-full border border-border rounded-lg pl-9 pr-3 py-2 text-[13px] bg-card"
            />
          </form>

          {buyerLoading ? (
            <div className="text-muted-foreground text-[13px]">Searching…</div>
          ) : !buyerSearched ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Users className="size-10 mx-auto text-muted-foreground/40" />
              <p className="text-[14px] font-medium text-foreground mt-3">Buyer lookup</p>
              <p className="text-[13px] text-muted-foreground mt-1">
                Enter a buyer name or email to find their orders.
              </p>
            </div>
          ) : buyerOrders.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Users className="size-10 mx-auto text-muted-foreground/40" />
              <p className="text-[14px] font-medium text-foreground mt-3">No buyers found</p>
              <p className="text-[13px] text-muted-foreground mt-1">Try a different name or email.</p>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead>
                  <tr>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Buyer</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Email</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Order</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {buyerOrders.map((o) => (
                    <tr key={o.id} className="border-t border-border hover:bg-muted/50">
                      <td className="p-3 font-medium">
                        {[o.customer_first_name, o.customer_last_name].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="p-3 text-muted-foreground">{o.email || o.customer_email || '—'}</td>
                      <td className="p-3 font-mono text-[12px]">{o.id.slice(0, 8)}…</td>
                      <td className="p-3 text-muted-foreground capitalize">{o.fulfillmentStatus || o.status || '—'}</td>
                      <td className="p-3 text-right">
                        {o.totalAmount != null ? `$${Number(o.totalAmount).toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

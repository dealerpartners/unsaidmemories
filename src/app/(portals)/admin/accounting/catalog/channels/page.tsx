'use client';

import React, { useCallback, useEffect, useState } from 'react';

// /admin/accounting/catalog/channels — Online Sales Channels
// (owner's online_sales_channels_.html). The store's own channel is
// live with real numbers. External channels render as NOT CONNECTED
// until a real channel record or listing exists for them — this page
// is where they will light up as they are wired.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Dtc = { publishedProducts: number; variants: number; paidOrders: number; gmvAll: number; gmvMtd: number; lastOrderAt: string | null; netAvailable: number };
type External = { key: string; name: string; connected: boolean; listings: number };
type MatrixRow = { id: string; productName: string | null; sku: string | null; channelName: string | null; basePrice: number | null; published: boolean; syncStatus: string | null; lastSyncedAt: string | null };

export default function CatalogChannelsPage() {
  const [dtc, setDtc] = useState<Dtc | null>(null);
  const [externals, setExternals] = useState<External[]>([]);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/catalog-channels', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => { setDtc(d.dtc || null); setExternals(d.externals || []); setMatrix(d.matrix || []); })
      .catch(() => setError('Channels could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Online Sales Channels</h1>
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}

        <h2 className="font-display text-lg font-semibold mb-3">Active Commerce Connections</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="border border-border rounded-xl bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-[15px]">Your Store (DTC)</div>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">Live</span>
            </div>
            {loading || !dtc ? (
              <p className="text-[13px] text-muted-foreground mt-2">Loading store figures…</p>
            ) : (
              <dl className="mt-3 space-y-1.5 text-[13px]">
                <div className="flex justify-between"><dt className="text-muted-foreground">Published products</dt><dd className="font-medium tabular-nums">{dtc.publishedProducts} ({dtc.variants} variants)</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Paid orders</dt><dd className="font-medium tabular-nums">{dtc.paidOrders}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">GMV this month</dt><dd className="font-medium tabular-nums">{fmt(dtc.gmvMtd)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">GMV all-time</dt><dd className="font-medium tabular-nums">{fmt(dtc.gmvAll)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Last order</dt><dd className="font-medium">{dtc.lastOrderAt ? new Date(dtc.lastOrderAt).toLocaleDateString() : '—'}</dd></div>
              </dl>
            )}
          </div>
          {externals.map((x) => (
            <div key={x.key} className="border border-border rounded-xl bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-[15px]">{x.name}</div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${x.connected ? 'bg-emerald-100 text-emerald-900' : 'bg-muted text-foreground'}`}>
                  {x.connected ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <p className="text-[13px] text-muted-foreground mt-2">
                {x.connected
                  ? `${x.listings} SKU listing(s) on this channel.`
                  : 'No integration is configured for this channel and no SKUs have been sent to it. When it is connected in Integrations, its listings and sync state will appear here.'}
              </p>
            </div>
          ))}
        </div>

        <h2 className="font-display text-lg font-semibold mt-8 mb-3">Channel SKU Syndication &amp; Pricing Matrix</h2>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>SKU / Item Identity</th>
              <th className={`${thCls} text-right`}>Base Catalog MSRP</th>
              <th className={thCls}>Channel</th>
              <th className={`${thCls} text-right`}>Net Available</th>
              <th className={thCls}>Channel State</th>
              <th className="p-3">Last Sync</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">Loading channel listings…</td></tr>
              ) : matrix.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">
                  No SKUs are syndicated to an outside channel yet. Every item currently sells only through your own store; listings will appear here the moment a channel is connected and SKUs are sent to it.
                </td></tr>
              ) : matrix.map((m) => (
                <tr key={m.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border"><div className="font-medium">{m.productName || 'Item'}</div><div className="text-[11px] text-muted-foreground">{m.sku || ''}</div></td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{m.basePrice != null ? fmt(m.basePrice) : '—'}</td>
                  <td className="p-3 border-r border-border">{m.channelName || '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{dtc ? dtc.netAvailable : '—'}</td>
                  <td className="p-3 border-r border-border">{m.published ? (m.syncStatus || 'Published') : 'Unpublished'}</td>
                  <td className="p-3">{m.lastSyncedAt ? new Date(m.lastSyncedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <div className="border border-border rounded-xl bg-card p-4 mt-4">
          <h2 className="font-display text-lg font-semibold mb-2">Inventory Safety Buffer</h2>
          <p className="text-[13px] text-muted-foreground">
            Net available across all warehouses right now: <span className="font-medium text-foreground tabular-nums">{dtc ? dtc.netAvailable : '…'} unit(s)</span> (on hand minus reserved and allocated).
            No per-channel buffer rule is stored yet — when a channel is connected, its safety buffer will be set here and deducted from the available figure that channel sees.
          </p>
        </div>
      </div>
    </div>
  );
}

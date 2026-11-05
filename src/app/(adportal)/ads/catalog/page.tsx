"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [feeds, setFeeds] = useState<any[]>([]);
  const load = () => { fetch("/api/ads/catalog-feeds").then((r) => (r.ok ? r.json() : { feeds: [] })).then((d) => setFeeds(d.feeds ?? [])).catch(() => {}); };
  useEffect(load, []);
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Catalogs</h1>
          <p className="mt-1 text-sm text-neutral-500">Manage product data for catalog ads — feeds, manual entry, Shopify sync.</p>
        </div>
        <Link href="/ads/catalog/feed" className="flex h-9 items-center gap-2 rounded-lg bg-[#f2eafe] px-4 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc]">Import Feed</Link>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Catalog feed</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last synced</th>
            </tr>
          </thead>
          <tbody>
            {feeds.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-sm text-neutral-500">No catalog feeds yet — import one to begin.</td></tr>}
            {feeds.map((f) => (
              <tr key={f.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{f.name}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{f.source}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{f.item_count != null ? Number(f.item_count).toLocaleString("en-US") : "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{f.status}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{f.last_sync_at ? new Date(f.last_sync_at).toLocaleDateString("en-US") : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-neutral-600">The store's own sellable products — the ones catalog ads draw from — are under <Link href="/ads/catalog/products" className="font-medium text-neutral-900 underline">Products</Link>.</p>
    </div>
  );
}

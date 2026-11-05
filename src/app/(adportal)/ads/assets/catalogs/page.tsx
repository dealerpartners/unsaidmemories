"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [feeds, setFeeds] = useState<any[]>([]);
  useEffect(() => { fetch("/api/ads/catalog-feeds").then((r) => (r.ok ? r.json() : { feeds: [] })).then((d) => setFeeds(d.feeds ?? [])).catch(() => {}); }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Catalog Assets</h1>
        <p className="mt-1 text-sm text-neutral-500">Your catalog feeds — the same records as the Catalog section.</p>
      </div>
      <div className="space-y-3">
        {feeds.length === 0 && <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">No catalog feeds yet. <Link href="/ads/catalog/feed" className="font-medium text-neutral-900 underline">Import one</Link>.</div>}
        {feeds.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-5">
            <div><p className="text-sm font-semibold text-neutral-900">{f.name}</p><p className="text-xs text-neutral-500">{f.source} · {f.status}</p></div>
            <span className="text-sm text-neutral-600">{f.item_count != null ? `${Number(f.item_count).toLocaleString("en-US")} items` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

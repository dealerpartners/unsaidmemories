"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [total, setTotal] = useState<number | null>(null);
  const [feeds, setFeeds] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/products?perPage=1").then((r) => (r.ok ? r.json() : null)).then((d) => setTotal(d?.total ?? 0)).catch(() => {});
    fetch("/api/ads/catalog-feeds").then((r) => (r.ok ? r.json() : { feeds: [] })).then((d) => setFeeds(d.feeds ?? [])).catch(() => {});
  }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Storefront Catalog</h1>
        <p className="mt-1 text-sm text-neutral-500">Your own store's catalog, as catalog ads see it.</p>
      </div>
      <div className="max-w-2xl space-y-3 rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>The storefront catalog holds <span className="font-medium text-neutral-900">{total == null ? "…" : total.toLocaleString("en-US")} products</span> — those products are the source for catalog ads; they aren't copied into a separate ads catalog. Browse them under <Link href="/ads/catalog/products" className="font-medium text-neutral-900 underline">Products</Link>.</p>
        <p>External sources (feed URLs, Shopify) are registered as <Link href="/ads/catalog/feed" className="font-medium text-neutral-900 underline">catalog feeds</Link> — you have {feeds.length}.</p>
      </div>
    </div>
  );
}

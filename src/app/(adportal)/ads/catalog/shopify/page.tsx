"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [feeds, setFeeds] = useState<any[]>([]);
  const load = () => { fetch("/api/ads/catalog-feeds").then((r) => (r.ok ? r.json() : { feeds: [] })).then((d) => setFeeds(d.feeds ?? [])).catch(() => {}); };
  useEffect(load, []);

  const [name, setName] = useState("");
  const [extra, setExtra] = useState("");
  const [note, setNote] = useState("");
  const submit = () => {
    setNote("");
    fetch("/api/ads/catalog-feeds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), source: "shopify", settings: { store_domain: extra.trim() } }) })
      .then(async (r) => { if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.error ?? "create_failed"); } setNote("Feed created as a draft — it appears in the feed list."); setName(""); setExtra(""); load(); })
      .catch((e) => setNote(`Couldn't create the feed (${e.message}).`));
  };
  const inputCls = "h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none";
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Shopify Sync</h1>
        <p className="mt-1 text-sm text-neutral-500">Register a Shopify store as a catalog source. The feed is stored as a draft against the store domain.</p>
      </div>
      <div className="mb-6 max-w-2xl rounded-xl border border-neutral-100 bg-white p-6">
        <div className="grid grid-cols-1 gap-4">
          <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Feed name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Holiday collection" className={inputCls} /></div>
          <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Store domain</label><input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="your-store.myshopify.com" className={inputCls} /></div>
        </div>
        {note && <p className="mt-3 text-sm text-neutral-600">{note}</p>}
        <div className="mt-4"><button onClick={submit} disabled={!name.trim()} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-40">Create feed</button></div>
      </div>
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">Your feeds</h2>
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
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [lib, setLib] = useState<any[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] }))
      .then((d) => setLib(d.creatives ?? [])).catch(() => {});
  }, []);
  const hits = lib.filter((c) => (c.name + " " + (c.campaign_name ?? "") + " " + (c.headline ?? "")).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Search</h1>
        <p className="mt-1 text-sm text-neutral-500">Search your creative library by name, campaign or headline.</p>
      </div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creatives…" className="mb-6 h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none" />
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Creative</th>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {hits.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-sm text-neutral-500">{q ? "No creatives match that search." : "No creatives yet."}</td></tr>
            )}
            {hits.map((c) => (
              <tr key={c.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/creatives/library/${c.id}`} className="font-medium text-neutral-900 hover:underline">{c.name}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{c.campaign_name ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

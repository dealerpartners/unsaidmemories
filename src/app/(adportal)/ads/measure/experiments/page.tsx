"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [cid, setCid] = useState("");
  const [splits, setSplits] = useState<any[] | null>(null);
  useEffect(() => {
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : { campaigns: [] })).then((d) => setCampaigns(d.campaigns ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!cid) { setSplits(null); return; }
    fetch(`/api/ads/splits?campaign_id=${cid}`).then((r) => (r.ok ? r.json() : { splits: [] })).then((d) => setSplits(d.splits ?? [])).catch(() => setSplits([]));
  }, [cid]);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Experiments</h1>
        <p className="mt-1 text-sm text-neutral-500">Split experiments recorded for a campaign — variant weights and the delivery each variant's creative actually got.</p>
      </div>
      <select value={cid} onChange={(e) => setCid(e.target.value)} className="mb-4 h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none">
        <option value="">Choose a campaign…</option>
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {cid && splits !== null && (
        splits.length === 0 ? (
          <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">No experiment is recorded for this campaign. Experiments aren't created from the portal — the records here are read from the experiment store.</div>
        ) : (
          <div className="rounded-xl border border-neutral-100 bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
                  <th className="px-4 py-3">Variant</th>
                  <th className="px-4 py-3">Creative</th>
                  <th className="px-4 py-3">Weight</th>
                  <th className="px-4 py-3">Impressions</th>
                  <th className="px-4 py-3">Clicks</th>
                  <th className="px-4 py-3">CTR</th>
                </tr>
              </thead>
              <tbody>
                {splits.map((s) => (
                  <tr key={s.id} className="border-b border-neutral-50">
                    <td className="px-4 py-3 text-sm font-medium text-neutral-900">{s.variant}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{s.creative_headline ?? s.creative_id}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{s.weight}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{Number(s.impressions).toLocaleString("en-US")}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{Number(s.clicks).toLocaleString("en-US")}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700">{s.impressions > 0 ? `${((s.clicks / s.impressions) * 100).toFixed(2)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      <p className="mt-4 text-sm"><Link href="/ads/analytics/experiments" className="font-medium text-neutral-900 underline">The Analytics section's experiment view</Link></p>
    </div>
  );
}

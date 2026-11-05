"use client";

import { useEffect, useState } from "react";

const compact = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(Math.round(n)));
export default function Page() {

  const [t, setT] = useState<{ impressions: number; clicks: number; spend: number; reach: number } | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setT(d.totals); setRows(d.byCampaign ?? []); } }).catch(() => {});
  }, []);
  const totals = t ?? { impressions: 0, clicks: 0, spend: 0, reach: 0 };
  const leads = rows.reduce((a, r) => a + Number(r.leads ?? 0), 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Video &amp; Audio Insights</h1>
          <p className="mt-1 text-sm text-neutral-500">Media-format engagement — as far as this system records it.</p>
        </div>
      </div>
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-neutral-100 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Impressions (30d)</p>
          <p className="mt-2 text-xl font-bold text-neutral-900">{compact(totals.impressions)}</p>
        </div>
        <div className="rounded-xl border border-neutral-100 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Clicks (30d)</p>
          <p className="mt-2 text-xl font-bold text-neutral-900">{compact(totals.clicks)}</p>
        </div>
        <div className="rounded-xl border border-neutral-100 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">CTR (30d)</p>
          <p className="mt-2 text-xl font-bold text-neutral-900">{totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) + "%" : "—"}</p>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There is no playback event source in this system — video views, completion rates, audio streams and SVI aren't measured, so those numbers don't exist to report.</p>
        <p className="mt-2">The exposure figures above (impressions, clicks, CTR from the delivery ledger) are real.</p>
      </div>
    </div>
  );
}

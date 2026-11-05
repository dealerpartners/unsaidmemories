"use client";

import { useEffect, useState } from "react";
import { MetricCard } from "@/components/ads/ui";

const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtN = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");

export default function Page() {
  const [days, setDays] = useState(30);
  const [t, setT] = useState<any>(null);
  useEffect(() => {
    fetch(`/api/ads/analytics?days=${days}`).then((r) => (r.ok ? r.json() : null))
      .then((d) => setT(d?.totals ?? null)).catch(() => {});
  }, [days]);
  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Date Range</h1>
          <p className="mt-1 text-sm text-neutral-500">Delivery totals for a window — pick the window and the numbers follow.</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last 365 days</option>
        </select>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <MetricCard label="Impressions" value={t ? fmtN(t.impressions) : "—"} />
        <MetricCard label="Clicks" value={t ? fmtN(t.clicks) : "—"} />
        <MetricCard label="Spend" value={t ? money(t.spend) : "—"} />
        <MetricCard label="Reach" value={t ? fmtN(t.reach) : "—"} />
      </div>
    </div>
  );
}

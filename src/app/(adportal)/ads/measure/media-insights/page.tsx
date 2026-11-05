"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MetricCard } from "@/components/ads/ui";
const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtN = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");

export default function Page() {

  const [ana, setAna] = useState<any>(null);
  useEffect(() => { fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null)).then(setAna).catch(() => {}); }, []);
  const rows: any[] = ana?.byCampaign ?? [];
  const withImps = rows.filter((c) => c.impressions > 0);
  const topCtr = [...withImps].sort((a, b) => b.clicks / b.impressions - a.clicks / a.impressions)[0];
  const topSpend = [...rows].sort((a, b) => b.spend - a.spend)[0];
  const insights: string[] = [];
  if (topCtr) insights.push(`Highest CTR: ${topCtr.name} at ${((topCtr.clicks / topCtr.impressions) * 100).toFixed(2)}% over ${fmtN(topCtr.impressions)} impressions.`);
  if (topSpend) insights.push(`Most spend: ${topSpend.name} at ${money(topSpend.spend)} in the last 30 days.`);
  if (ana?.totals) insights.push(`${fmtN(ana.totals.leads ?? 0)} leads captured against ${fmtN(ana.totals.clicks)} clicks — a ${(ana.totals.clicks > 0 ? ((ana.totals.leads ?? 0) / ana.totals.clicks) * 100 : 0).toFixed(1)}% click-to-lead rate.`);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Media Insights</h1>
        <p className="mt-1 text-sm text-neutral-500">What the last 30 days of delivery actually say — computed from the ledger, refreshed when the data moves.</p>
      </div>
      <div className="space-y-3">
        {insights.length === 0 && <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">No delivery in the window to draw insights from.</div>}
        {insights.map((s, i) => (
          <div key={i} className="rounded-xl border border-neutral-100 bg-white p-5 text-sm text-neutral-700">{s}</div>
        ))}
      </div>
    </div>
  );
}

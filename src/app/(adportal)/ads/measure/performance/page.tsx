"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MetricCard } from "@/components/ads/ui";
const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtN = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");

export default function Page() {

  const [ana, setAna] = useState<any>(null);
  useEffect(() => { fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null)).then(setAna).catch(() => {}); }, []);
  const t = ana?.totals;
  const rows: any[] = ana?.byPlacement ?? [];
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Performance</h1>
        <p className="mt-1 text-sm text-neutral-500">Delivery performance by placement, last 30 days.</p>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="CTR" value={t ? `${((t.ctr ?? 0) * 100).toFixed(2)}%` : "—"} delta="overall" deltaType="neutral" />
        <MetricCard label="Cost per lead" value={t && t.cpa ? money(t.cpa) : "—"} delta={t && t.cpa ? "per captured lead" : "no leads captured"} deltaType="neutral" />
        <MetricCard label="Reach" value={t ? fmtN(t.reach) : "—"} delta="last 30 days" deltaType="neutral" />
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400"><th className="px-4 py-3">Placement</th><th className="px-4 py-3">Impressions</th><th className="px-4 py-3">Clicks</th><th className="px-4 py-3">CTR</th><th className="px-4 py-3">Spend</th></tr></thead>
          <tbody>
            {rows.map((bp) => (
              <tr key={bp.placement} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{bp.placement}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{fmtN(bp.impressions)}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{fmtN(bp.clicks)}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{bp.impressions > 0 ? `${((bp.clicks / bp.impressions) * 100).toFixed(2)}%` : "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{money(bp.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

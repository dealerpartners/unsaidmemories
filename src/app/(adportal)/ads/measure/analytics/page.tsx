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
  const rows: any[] = ana?.byCampaign ?? [];
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Analytics</h1>
        <p className="mt-1 text-sm text-neutral-500">The last 30 days of delivery — the same ledger the Analytics section reads.</p>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <MetricCard label="Spend" value={t ? money(t.spend) : "—"} delta="last 30 days" deltaType="neutral" />
        <MetricCard label="Impressions" value={t ? fmtN(t.impressions) : "—"} delta="last 30 days" deltaType="neutral" />
        <MetricCard label="Clicks" value={t ? fmtN(t.clicks) : "—"} delta="last 30 days" deltaType="neutral" />
        <MetricCard label="Leads" value={t ? fmtN(t.leads ?? 0) : "—"} delta="captured leads" deltaType="neutral" />
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400"><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Impressions</th><th className="px-4 py-3">Clicks</th><th className="px-4 py-3">Spend</th><th className="px-4 py-3">Leads</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/campaigns/${c.id}`} className="font-medium text-neutral-900 hover:underline">{c.name}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{fmtN(c.impressions)}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{fmtN(c.clicks)}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{money(c.spend)}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{fmtN(c.leads ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

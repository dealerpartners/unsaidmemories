"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtN = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");

export default function Page() {

  const [ana, setAna] = useState<any>(null);
  useEffect(() => {
    fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null)).then(setAna).catch(() => {});
  }, []);
  const t = ana?.totals;
  const rows: any[] = ana?.byCampaign ?? [];
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">CTR</h1>
        <p className="mt-1 text-sm text-neutral-500">Click-through rate for the last 30 days — clicks over impressions, overall and per campaign.</p>
      </div>
      <div className="mb-6 rounded-xl border border-neutral-100 bg-white p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Overall CTR</p>
        <p className="mt-1 text-3xl font-bold text-neutral-900">{t ? `${((t.ctr ?? 0) * 100).toFixed(2)}%` : "—"}</p>
        <p className="mt-1 text-sm text-neutral-500">{t ? `${fmtN(t.clicks)} clicks on ${fmtN(t.impressions)} impressions` : ""}</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Impressions</th>
              <th className="px-4 py-3">Clicks</th>
              <th className="px-4 py-3">CTR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/campaigns/${c.id}`} className="font-medium text-neutral-900 hover:underline">{c.name}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{fmtN(c.impressions)}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{fmtN(c.clicks)}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{c.impressions > 0 ? `${((c.clicks / c.impressions) * 100).toFixed(2)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

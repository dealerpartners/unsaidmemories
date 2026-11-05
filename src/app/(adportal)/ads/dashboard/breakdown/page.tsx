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
  const rows: any[] = ana?.byPlacement ?? [];
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Breakdown</h1>
        <p className="mt-1 text-sm text-neutral-500">Delivery broken down by placement — the one breakdown the delivery ledger records.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Placement</th>
              <th className="px-4 py-3">Impressions</th>
              <th className="px-4 py-3">Clicks</th>
              <th className="px-4 py-3">Spend</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-sm text-neutral-500">No delivery recorded in the last 30 days.</td></tr>}
            {rows.map((bp) => (
              <tr key={bp.placement} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{bp.placement}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{fmtN(bp.impressions)}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{fmtN(bp.clicks)}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{money(bp.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-neutral-400">Breakdowns by age, gender, region or device aren't collected — placement and campaign are the recorded cuts.</p>
    </div>
  );
}

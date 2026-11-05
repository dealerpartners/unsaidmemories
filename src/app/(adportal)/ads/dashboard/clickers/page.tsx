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
  const rows: any[] = [...(ana?.byCampaign ?? [])].sort((a, b) => b.clicks - a.clicks);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Clickers</h1>
        <p className="mt-1 text-sm text-neutral-500">Clicks per campaign, last 30 days.</p>
      </div>
      <div className="mb-6 rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Delivery records clicks, not unique people — a "clicker" here is one recorded click, and the same person clicking twice counts twice. Unique-clicker tracking isn't part of this system.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Clicks</th>
              <th className="px-4 py-3">Impressions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/campaigns/${c.id}`} className="font-medium text-neutral-900 hover:underline">{c.name}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{fmtN(c.clicks)}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{fmtN(c.impressions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtN = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");

export default function Page() {

  const [campaigns, setCampaigns] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((d) => setCampaigns(d.campaigns ?? [])).catch(() => {});
  }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">All Campaigns</h1>
        <p className="mt-1 text-sm text-neutral-500">Every campaign on this account.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Budget</th>
              <th className="px-4 py-3">Spend to date</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-sm text-neutral-500">No campaigns yet.</td></tr>}
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/campaigns/${c.id}`} className="font-medium text-neutral-900 hover:underline">{c.name}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{c.status}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{c.lifetime_budget_cents && Number(c.lifetime_budget_cents) > 0 ? `${money(Number(c.lifetime_budget_cents) / 100)} total` : c.daily_budget_cents ? `${money(Number(c.daily_budget_cents) / 100)}/day` : "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{money(Number(c.lifetime_spend_cents ?? 0) / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [campaigns, setCampaigns] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((d) => setCampaigns(d.campaigns ?? [])).catch(() => {});
  }, []);
  const byStatus = new Map<string, number>();
  for (const c of campaigns) byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Campaign Count</h1>
        <p className="mt-1 text-sm text-neutral-500">How many campaigns this account has, by status.</p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-5">
          <span className="text-sm font-semibold text-neutral-900">Total</span>
          <span className="text-sm text-neutral-600">{campaigns.length}</span>
        </div>
        {[...byStatus.entries()].map(([k, n]) => (
          <div key={k} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-5">
            <span className="text-sm font-medium capitalize text-neutral-900">{k}</span>
            <span className="text-sm text-neutral-600">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

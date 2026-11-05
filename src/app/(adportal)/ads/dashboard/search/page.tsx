"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((d) => setCampaigns(d.campaigns ?? [])).catch(() => {});
  }, []);
  const hits = campaigns.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Search</h1>
        <p className="mt-1 text-sm text-neutral-500">Find a campaign by name.</p>
      </div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns…" className="mb-6 h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none" />
      <div className="space-y-2">
        {hits.length === 0 && <p className="text-sm text-neutral-500">{q ? "No campaigns match." : "No campaigns yet."}</p>}
        {hits.map((c) => (
          <Link key={c.id} href={`/ads/campaigns/${c.id}`} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-4 hover:bg-neutral-50">
            <span className="text-sm font-medium text-neutral-900">{c.name}</span>
            <span className="text-xs text-neutral-500">{c.status}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

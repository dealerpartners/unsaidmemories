"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((d) => setCampaigns(d.campaigns ?? [])).catch(() => {});
  }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Actions</h1>
        <p className="mt-1 text-sm text-neutral-500">The actions available on each campaign — each opens the campaign's own action page.</p>
      </div>
      <div className="space-y-2">
        {campaigns.length === 0 && <p className="text-sm text-neutral-500">No campaigns yet.</p>}
        {campaigns.map((c) => (
          <div key={c.id} className="rounded-xl border border-neutral-100 bg-white p-4">
            <p className="text-sm font-medium text-neutral-900">{c.name} <span className="ml-2 text-xs font-normal text-neutral-500">{c.status}</span></p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Link href={`/ads/campaigns/${c.id}`} className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-200">Open</Link>
              <Link href={`/ads/campaigns/${c.id}/edit`} className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-200">Edit</Link>
              {c.status === "active" && <Link href={`/ads/campaigns/${c.id}/pause`} className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-200">Pause</Link>}
              {(c.status === "paused" || c.status === "approved") && <Link href={`/ads/campaigns/${c.id}/resume`} className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-200">Resume</Link>}
              <Link href={`/ads/campaigns/${c.id}/duplicate`} className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-200">Duplicate</Link>
              <Link href={`/ads/campaigns/${c.id}/delete`} className="rounded-full bg-red-50 px-3 py-1.5 font-medium text-red-600 hover:bg-red-100">Delete</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

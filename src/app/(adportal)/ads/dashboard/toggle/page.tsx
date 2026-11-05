"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const load = () => {
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((d) => setCampaigns(d.campaigns ?? [])).catch(() => {});
  };
  useEffect(load, []);
  const flip = (c: any) => {
    const call = c.status === "active"
      ? fetch(`/api/ads/campaigns/${c.id}/pause`, { method: "POST" })
      : (c.status === "paused" || c.status === "approved")
        ? fetch(`/api/ads/campaigns/${c.id}/launch`, { method: "POST" })
        : Promise.resolve(null);
    Promise.resolve(call).then(() => load()).catch(() => load());
  };
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Campaign Toggles</h1>
        <p className="mt-1 text-sm text-neutral-500">Switch campaigns on and off. On = active; off = paused. Drafts and ended campaigns can't be toggled from here — drafts launch from their campaign page.</p>
      </div>
      <div className="space-y-2">
        {campaigns.length === 0 && <p className="text-sm text-neutral-500">No campaigns yet.</p>}
        {campaigns.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-4">
            <div>
              <Link href={`/ads/campaigns/${c.id}`} className="text-sm font-medium text-neutral-900 hover:underline">{c.name}</Link>
              <p className="text-xs text-neutral-500">{c.status}</p>
            </div>
            <button onClick={() => flip(c)} disabled={!(c.status === "active" || c.status === "paused" || c.status === "approved")} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-30 ${c.status === "active" ? "bg-emerald-500" : "bg-neutral-200"}`}>
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${c.status === "active" ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

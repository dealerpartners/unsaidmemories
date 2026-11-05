"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const P = { id };

  const [g, setG] = useState<any>(null);
  const [creatives, setCreatives] = useState<any[]>([]);
  const [campaign, setCampaign] = useState<any>(null);
  useEffect(() => {
    fetch(`/api/ads/groups/${P.id}`).then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.group) return;
        setG(d.group); setCreatives(d.creatives ?? []);
        return fetch(`/api/ads/campaigns/${d.group.campaign_id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      })
      .then((c) => { if (c) setCampaign(c.campaign ?? c); }).catch(() => {});
  }, [P.id]);
  const formats = new Map<string, number>();
  for (const c of creatives) {
    const f = c.width && c.height ? `${c.width}×${c.height}` : c.asset_url ? "No size recorded" : "No asset";
    formats.set(f, (formats.get(f) ?? 0) + 1);
  }
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">{g ? <><Link href="/ads/campaigns/groups" className="hover:underline">Groups</Link> · <Link href={`/ads/campaigns/groups/${g.id}`} className="hover:underline">{g.name}</Link></> : "Group"}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">Cross-Format</h1>
        <p className="mt-1 text-sm text-neutral-500">The formats this group's creatives come in, from the creative records themselves.</p>
      </div>
      <div className="space-y-3">
        {!g ? <p className="text-sm text-neutral-500">Loading…</p> : formats.size === 0 ? (
          <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">This group has no creatives yet.</div>
        ) : [...formats.entries()].map(([f, n]) => (
          <div key={f} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-5">
            <span className="text-sm font-medium text-neutral-900">{f}</span>
            <span className="text-sm text-neutral-600">{n} creative{n === 1 ? "" : "s"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

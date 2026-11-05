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
  const approved = creatives.filter((c) => c.status === "approved").length;
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">{g ? <><Link href="/ads/campaigns/groups" className="hover:underline">Groups</Link> · <Link href={`/ads/campaigns/groups/${g.id}`} className="hover:underline">{g.name}</Link></> : "Group"}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">Group Delivery</h1>
        <p className="mt-1 text-sm text-neutral-500">Delivery runs at the campaign level — a group delivers when its parent campaign is active and its creatives are approved.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm">
        {!g ? <p className="text-neutral-500">Loading…</p> : (
          <div className="space-y-2">
            <div className="flex justify-between"><span className="text-neutral-500">Parent campaign status</span><span className="font-medium text-neutral-900">{g.campaign_status}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Group status</span><span className="font-medium text-neutral-900">{g.status}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Creatives in group</span><span className="font-medium text-neutral-900">{creatives.length}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Approved creatives</span><span className="font-medium text-neutral-900">{approved}</span></div>
            <p className="pt-2 text-xs text-neutral-400">Delivery reporting is recorded per campaign and per placement, not per group — see the campaign's analytics.</p>
          </div>
        )}
      </div>
    </div>
  );
}

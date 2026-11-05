"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

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
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">{g ? <><Link href="/ads/campaigns/groups" className="hover:underline">Groups</Link> · <Link href={`/ads/campaigns/groups/${g.id}`} className="hover:underline">{g.name}</Link></> : "Group"}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">Group Budget</h1>
        <p className="mt-1 text-sm text-neutral-500">Groups carry no budget of their own — the budget lives on the parent campaign and the group inherits it.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm">
        {!g ? <p className="text-neutral-500">Loading…</p> : (
          <div className="space-y-2">
            <div className="flex justify-between"><span className="text-neutral-500">Parent campaign</span><Link href={`/ads/campaigns/${g.campaign_id}`} className="font-medium text-neutral-900 hover:underline">{g.campaign_name}</Link></div>
            <div className="flex justify-between"><span className="text-neutral-500">Daily budget</span><span className="font-medium text-neutral-900">{campaign?.daily_budget_cents ? `${money(Number(campaign.daily_budget_cents) / 100)}/day` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Lifetime budget</span><span className="font-medium text-neutral-900">{campaign?.lifetime_budget_cents ? money(Number(campaign.lifetime_budget_cents) / 100) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Spend to date</span><span className="font-medium text-neutral-900">{campaign ? money(Number(campaign.lifetime_spend_cents ?? 0) / 100) : "—"}</span></div>
            <p className="pt-2 text-xs text-neutral-400">To change the budget, edit the parent campaign — there is no group-level budget to set.</p>
          </div>
        )}
      </div>
    </div>
  );
}

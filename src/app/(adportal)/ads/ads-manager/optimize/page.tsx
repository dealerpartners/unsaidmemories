"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [byCampaign, setByCampaign] = useState<any[]>([]);
  const [creatives, setCreatives] = useState<any[]>([]);
  const [tab, setTab] = useState(0);
  useEffect(() => {
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : { campaigns: [] })).then((d) => setCampaigns(d.campaigns ?? [])).catch(() => {});
    fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null)).then((d) => setByCampaign(d?.byCampaign ?? [])).catch(() => {});
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] })).then((d) => setCreatives(d.creatives ?? [])).catch(() => {});
  }, []);
  const perf = new Map(byCampaign.map((c: any) => [String(c.id), c]));
  const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const recs: Record<string, string[]> = { budget: [], delivery: [], audience: [], creative: [] };
  for (const c of campaigns) {
    const a = perf.get(String(c.id));
    if (c.status === "active" && !(a?.impressions > 0)) recs.delivery.push(`${c.name} is active but recorded no delivery in the last 30 days — check that its creatives are approved and its group is active.`);
    if (c.status === "paused" && Number(c.lifetime_budget_cents ?? 0) > Number(c.lifetime_spend_cents ?? 0)) recs.budget.push(`${c.name} is paused with ${money((Number(c.lifetime_budget_cents ?? 0) - Number(c.lifetime_spend_cents ?? 0)) / 100)} of lifetime budget unspent.`);
    if (c.status === "active" && a && a.impressions > 0 && a.clicks === 0) recs.creative.push(`${c.name} delivered ${Number(a.impressions).toLocaleString("en-US")} impressions with no clicks — the creative or its call to action is the first thing to look at.`);
  }
  const pending = creatives.filter((x) => x.status === "pending_review" || x.status === "in_review");
  if (pending.length) recs.creative.push(`${pending.length} creative${pending.length === 1 ? " is" : "s are"} waiting in review — nothing runs until they're approved.`);
  const TABS = ["Budget", "Delivery", "Audience", "Creative"];
  const keys = ["budget", "delivery", "audience", "creative"];
  const current = recs[keys[tab]];
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Optimize</h1>
        <p className="mt-1 text-sm text-neutral-500">Recommendations computed from your real campaigns, delivery and creatives — refreshed from the records, not a static list.</p>
      </div>
      <div className="mb-4 flex gap-2">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} className={`rounded-full px-4 py-2 text-sm font-medium ${tab === i ? "bg-[#f2eafe] text-[#6942c2]" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}>{t} ({recs[keys[i]].length})</button>
        ))}
      </div>
      <div className="space-y-2">
        {tab === 2 && <p className="text-sm text-neutral-500">No audience recommendations — audience-level delivery isn't recorded, so there's nothing honest to recommend from.</p>}
        {tab !== 2 && current.length === 0 && <p className="text-sm text-neutral-500">Nothing under {TABS[tab]} right now — your campaigns don't show the conditions this tab watches for.</p>}
        {tab !== 2 && current.map((r, i) => (
          <div key={i} className="rounded-xl border border-neutral-100 bg-white p-4 text-sm text-neutral-700">{r}</div>
        ))}
      </div>
    </div>
  );
}

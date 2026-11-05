"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { usePublishRailConfig } from "@/components/ads/rail-context";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  usePublishRailConfig({ campaignId: id });
  const [campaign, setCampaign] = useState<{ name: string; tier_code: string; status: string } | null>(null);
  const [name, setName] = useState("");
  const [dailyBudget, setDailyBudget] = useState("");
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`/api/ads/campaigns/${id}`)
      .then(async (r) => { if (r.status === 404) { setMissing(true); throw new Error("nf"); } if (!r.ok) throw new Error("x"); return r.json(); })
      .then((d) => { setCampaign(d.campaign); setName(d.campaign.name ?? ""); setDailyBudget(String(Math.round((d.campaign.daily_budget_cents ?? 0) / 100))); })
      .catch(() => {});
  }, [id]);

  const save = () => {
    setNote("");
    fetch(`/api/ads/campaigns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), daily_budget_cents: Math.max(0, Math.round(Number(dailyBudget || 0) * 100)) }) })
      .then(async (r) => { if (!r.ok) throw new Error("save"); setNote("Saved."); })
      .catch(() => setNote("Save failed — the campaign may be locked in its current status."));
  };

  if (missing) return (<div><div className="mb-6"><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Edit Campaign</h1><p className="mt-1 text-sm text-neutral-500">Campaign not found — it may belong to another advertiser account.</p></div></div>);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Edit Campaign</h1>
          <p className="mt-1 text-sm text-neutral-500">Modify campaign settings, budget, and targeting.</p>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Campaign name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={campaign ? "" : "Loading…"} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Tier</label>
            <select className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none" value={campaign?.tier_code ?? ""} disabled>
              <option value={campaign?.tier_code ?? ""}>{campaign?.tier_code ?? "—"}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Daily budget</label>
            <input value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} type="number" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Delivery type</label>
            <select className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none" disabled>
              <option>Standard</option>
            </select>
          </div>
        </div>
        {note && <div className="mt-4 text-right text-sm text-neutral-500">{note}</div>}
        <div className="mt-6 flex justify-end gap-3">
          <button className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700">Cancel</button>
          <button onClick={save} className="rounded-lg bg-[#f2eafe] px-4 py-2 text-sm font-medium text-[#6942c2]">Save</button>
        </div>
      </div>
    </div>
  );
}

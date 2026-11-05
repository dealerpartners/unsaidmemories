"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((d) => { const list = d.campaigns ?? []; setCampaigns(list); if (list[0]) setCampaignId(list[0].id); })
      .catch(() => {});
  }, []);

  const create = () => {
    setNote("");
    if (!campaignId) { setNote("Pick a campaign first."); return; }
    if (!name.trim()) { setNote("Give the ad group a name."); return; }
    setSaving(true);
    fetch(`/api/ads/campaigns/${campaignId}/groups`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "create_failed"); return d; })
      .then((d) => { router.push(d.group?.id ? `/ads/campaigns/groups/${d.group.id}` : "/ads/campaigns/groups"); })
      .catch((e) => { setNote("Couldn't create the ad group: " + String(e?.message || "unknown error")); setSaving(false); });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Create Ad Group</h1>
          <p className="mt-1 text-sm text-neutral-500">Add a distribution group under a campaign.</p>
        </div>
      </div>
      {note && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{note}</div>}
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-neutral-700 mb-1">Campaign</label>
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none">
              {campaigns.length === 0 && <option value="">No campaigns yet</option>}
              {campaigns.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-neutral-700 mb-1">Ad group name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Audio — Broad Audience" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Budget</label>
            <input defaultValue="50" type="number" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Optimization goal</label>
            <select className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none">
              <option>Clicks</option><option>Conversions</option><option>Impressions</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700">Cancel</button>
          <button onClick={create} disabled={saving} className="rounded-lg bg-[#f2eafe] px-4 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-50">Create</button>
        </div>
      </div>
    </div>
  );
}

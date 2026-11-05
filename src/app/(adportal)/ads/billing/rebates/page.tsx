"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ads/ui";

const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Page() {
  const [rebates, setRebates] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("percent_off");
  const [value, setValue] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [note, setNote] = useState("");
  const load = () => {
    fetch("/api/ads/rebates").then((r) => (r.ok ? r.json() : null)).then((d) => setRebates(d?.rebates ?? [])).catch(() => {});
  };
  useEffect(() => {
    load();
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : null)).then((d) => setCampaigns(d?.campaigns ?? [])).catch(() => {});
  }, []);
  const create = () => {
    setNote("");
    const body: Record<string, unknown> = { name: name.trim(), rebate_type: kind };
    if (kind === "percent_off") body.percent = Number(value) || 0; else body.amount = Number(value) || 0;
    if (campaignId) body.campaign_v2_id = campaignId;
    fetch("/api/ads/rebates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => { if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).error) || "create_failed"); setName(""); setValue(""); setNote("Rebate created."); load(); })
      .catch((e) => setNote("Couldn't create: " + String(e?.message || "unknown error")));
  };
  const inputCls = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none";
  return (
    <div>
      <PageHeader title="Rebates" description="Rebate offers attached to your account or a campaign." />
      <div className="mb-6 space-y-3">
        {rebates.length === 0 && <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">No rebates yet.</div>}
        {rebates.map((r) => (
          <div key={r.id} className="rounded-xl border border-neutral-100 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-900">{r.name}</p>
              <span className="text-sm text-neutral-600">{r.amount != null ? money(r.amount) : r.percent != null ? `${r.percent}% off` : "—"}</span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">{r.rebate_type} · {r.status}{r.campaign_name ? ` · ${r.campaign_name}` : " · account-wide"}{r.ends_at ? ` · ends ${new Date(r.ends_at).toLocaleDateString("en-US")}` : ""}</p>
            {r.conditions && <p className="mt-2 text-sm text-neutral-600">{typeof r.conditions === "string" ? r.conditions : JSON.stringify(r.conditions)}</p>}
          </div>
        ))}
      </div>
      <div className="max-w-2xl space-y-5 rounded-xl border border-neutral-100 bg-white p-6">
        <h3 className="text-sm font-semibold text-neutral-900">New rebate</h3>
        {note && <p className="text-sm text-neutral-600">{note}</p>}
        <div><label className="mb-1 block text-sm font-medium text-neutral-700">Name</label><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></div>
        <div className="flex gap-4">
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-neutral-700">Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
              <option value="percent_off">Percent off</option>
              <option value="fixed_amount">Fixed amount</option>
            </select>
          </div>
          <div className="flex-1"><label className="mb-1 block text-sm font-medium text-neutral-700">{kind === "percent_off" ? "Percent" : "Amount ($)"}</label><input value={value} onChange={(e) => setValue(e.target.value)} type="number" className={inputCls} /></div>
        </div>
        <div><label className="mb-1 block text-sm font-medium text-neutral-700">Campaign (optional)</label>
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={inputCls}>
            <option value="">Account-wide</option>
            {campaigns.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </div>
        <div className="flex justify-end">
          <button onClick={create} disabled={!name.trim()} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-50">Create rebate</button>
        </div>
      </div>
    </div>
  );
}

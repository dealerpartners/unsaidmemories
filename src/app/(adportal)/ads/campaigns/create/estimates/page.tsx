"use client";

import { CreateStepShell, stepInputCls } from "@/components/ads/create-step";
import { useEffect, useState } from "react";
import { EstimatePanel } from "@/components/ads/ui";

export default function Page() {
  const [placements, setPlacements] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [budget, setBudget] = useState("100");
  const [days, setDays] = useState("30");
  const [est, setEst] = useState<any>(null);
  const [note, setNote] = useState("");
  useEffect(() => { fetch("/api/ads/placements").then((r) => (r.ok ? r.json() : null)).then((x) => setPlacements(x?.placements ?? (Array.isArray(x) ? x : []))).catch(() => {}); }, []);
  const toggle = (k: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(k)) { n.delete(k); } else { n.add(k); } return n; });
  const run = () => {
    setNote("");
    fetch("/api/ads/estimates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget: Number(budget) || 0, days: Math.min(92, Math.max(1, Number(days) || 30)), placement_keys: [...picked] }) })
      .then(async (r) => { const x = await r.json().catch(() => null); if (!r.ok || !x?.estimate) throw new Error(x?.error ?? "estimate_failed"); setEst(x.estimate); })
      .catch(() => setNote("Couldn't produce an estimate."));
  };
  const fmt = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");
  return (
    <CreateStepShell title="Estimates" description="What a budget buys on the current rate card, before you commit to a campaign.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Budget ($)</label><input type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} className={stepInputCls} /></div>
          <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Days (1–92)</label><input type="number" min="1" max="92" value={days} onChange={(e) => setDays(e.target.value)} className={stepInputCls} /></div>
        </div>
        <div className="mb-4 flex flex-wrap gap-4">
          {placements.map((p) => (
            <label key={p.key} className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" checked={picked.has(p.key)} onChange={() => toggle(p.key)} className="h-4 w-4 rounded border-neutral-300" />{p.name}</label>
          ))}
        </div>
        {note && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{note}</div>}
        <button onClick={run} className="mb-4 rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2]">Estimate</button>
        {est && <EstimatePanel estimates={[
          { label: "Estimated impressions", value: `${fmt(est.impressions?.low)}–${fmt(est.impressions?.high)}` },
          { label: "Estimated clicks", value: fmt(est.clicks) },
          { label: "Basis", value: est.basis === "inventory_forecasts" ? "Inventory forecasts" : "Open inventory" },
        ]} deliveryLikelihood={est.delivery_likelihood} />}
      </div>
    </CreateStepShell>
  );
}

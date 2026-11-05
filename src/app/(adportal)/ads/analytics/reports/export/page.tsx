"use client";

import { useState } from "react";

export default function Page() {
  const [days, setDays] = useState(30);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const run = () => {
    setNote("");
    setBusy(true);
    fetch(`/api/ads/analytics?days=${days}`).then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) throw new Error("analytics_unavailable");
        const t = d.totals;
        const head = ["Scope", "Impressions", "Clicks", "Spend", "Reach", "Leads"];
        const totalLeads = (d.byCampaign ?? []).reduce((a: number, c: any) => a + Number(c.leads ?? 0), 0);
        const lines = [
          ["TOTAL", t.impressions, t.clicks, t.spend, t.reach, totalLeads],
          ...(d.byCampaign ?? []).map((c: any) => [c.name, c.impressions, c.clicks, c.spend, c.reach, c.leads]),
        ].map((row: unknown[]) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([head.join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `ads-export-${days}d.csv`; a.click();
        URL.revokeObjectURL(url);
        setNote(`Exported totals + ${(d.byCampaign ?? []).length} campaigns, last ${days} days.`);
      })
      .catch(() => setNote("Export failed — analytics are unavailable right now."))
      .finally(() => setBusy(false));
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Export</h1>
        <p className="mt-1 text-sm text-neutral-500">Download delivery totals and per-campaign rows as CSV.</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="space-y-5 rounded-xl border border-neutral-100 bg-white p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-700">Window</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 365 days</option>
          </select>
        </div>
        <div className="flex justify-end">
          <button onClick={run} disabled={busy} className="h-10 rounded-lg bg-[#f2eafe] px-6 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc] disabled:opacity-50">Download CSV</button>
        </div>
      </div>
    </div>
  );
}

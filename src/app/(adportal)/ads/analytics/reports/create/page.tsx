"use client";

import { useState } from "react";

export default function Page() {
  const [name, setName] = useState("Campaign performance");
  const [days, setDays] = useState(30);
  const [breakdown, setBreakdown] = useState("campaign");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const generate = () => {
    setNote("");
    setBusy(true);
    fetch(`/api/ads/analytics?days=${days}`).then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) throw new Error("analytics_unavailable");
        let head: string[]; let lines: string[];
        if (breakdown === "placement") {
          head = ["Placement", "Impressions", "Clicks", "Spend"];
          lines = (d.byPlacement ?? []).map((pl: any) => [pl.placement, pl.impressions, pl.clicks, pl.spend].map((v: unknown) => `"${String(v).replace(/"/g, '""')}"`).join(","));
        } else {
          head = ["Campaign", "Status", "Impressions", "Clicks", "Spend", "Reach", "Leads"];
          lines = (d.byCampaign ?? []).map((c: any) => [c.name, c.status, c.impressions, c.clicks, c.spend, c.reach, c.leads].map((v: unknown) => `"${String(v).replace(/"/g, '""')}"`).join(","));
        }
        const blob = new Blob([head.join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (name.trim() || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-") + `-${days}d.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setNote(`Report generated: ${lines.length} rows, last ${days} days.`);
      })
      .catch(() => setNote("Couldn't generate the report — analytics are unavailable right now."))
      .finally(() => setBusy(false));
  };

  const inputCls = "h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none";
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Create Report</h1>
        <p className="mt-1 text-sm text-neutral-500">Generate a downloadable report from the live delivery ledger.</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="space-y-5 rounded-xl border border-neutral-100 bg-white p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-700">Report name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-700">Window</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputCls}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 365 days</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-700">Breakdown</label>
          <select value={breakdown} onChange={(e) => setBreakdown(e.target.value)} className={inputCls}>
            <option value="campaign">By campaign</option>
            <option value="placement">By placement</option>
          </select>
        </div>
        <div className="flex justify-end">
          <button onClick={generate} disabled={busy} className="h-10 rounded-lg bg-[#f2eafe] px-6 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc] disabled:opacity-50">Generate CSV</button>
        </div>
      </div>
    </div>
  );
}

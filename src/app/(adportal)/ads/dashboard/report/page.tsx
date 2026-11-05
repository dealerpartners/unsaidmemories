"use client";

import { useEffect, useState } from "react";

const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtN = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");

export default function Page() {
  const [ana, setAna] = useState<any>(null);
  useEffect(() => {
    fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null)).then(setAna).catch(() => {});
  }, []);
  const t = ana?.totals;
  const download = () => {
    if (!ana) return;
    const lines = [
      "Dashboard report — last 30 days",
      `Impressions,${t.impressions}`,
      `Clicks,${t.clicks}`,
      `Spend,${t.spend}`,
      `Reach,${t.reach}`,
      "",
      "Campaign,Impressions,Clicks,Spend",
      ...(ana.byCampaign ?? []).map((c: any) => [c.name, c.impressions, c.clicks, c.spend].join(",")),
      "",
      "Placement,Impressions,Clicks,Spend",
      ...(ana.byPlacement ?? []).map((p: any) => [p.placement, p.impressions, p.clicks, p.spend].join(",")),
    ];
    const a2 = document.createElement("a");
    a2.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a2.download = "dashboard-report-30d.csv";
    a2.click();
    URL.revokeObjectURL(a2.href);
  };
  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Report</h1>
          <p className="mt-1 text-sm text-neutral-500">The last 30 days, in one place.</p>
        </div>
        <button onClick={download} disabled={!ana} className="rounded-lg bg-[#f2eafe] px-4 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-40">Download CSV</button>
      </div>
      {!t ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-4 rounded-xl border border-neutral-100 bg-white p-6 text-sm">
          <div className="flex justify-between"><span className="text-neutral-500">Impressions</span><span className="font-medium text-neutral-900">{fmtN(t.impressions)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Clicks</span><span className="font-medium text-neutral-900">{fmtN(t.clicks)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">CTR</span><span className="font-medium text-neutral-900">{((t.ctr ?? 0) * 100).toFixed(2)}%</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Spend</span><span className="font-medium text-neutral-900">{money(t.spend)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Reach</span><span className="font-medium text-neutral-900">{fmtN(t.reach)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Leads captured</span><span className="font-medium text-neutral-900">{fmtN(t.leads ?? 0)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Campaigns with delivery</span><span className="font-medium text-neutral-900">{(ana.byCampaign ?? []).filter((c: any) => c.impressions > 0).length}</span></div>
        </div>
      )}
    </div>
  );
}

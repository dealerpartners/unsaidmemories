"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MetricCard } from "@/components/ads/ui";
const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtN = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");

export default function Page() {

  const [ana, setAna] = useState<any>(null);
  useEffect(() => { fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null)).then(setAna).catch(() => {}); }, []);
  const download = () => {
    if (!ana) return;
    const lines = ["Campaign,Impressions,Clicks,Spend,Leads", ...(ana.byCampaign ?? []).map((c: any) => [c.name, c.impressions, c.clicks, c.spend, c.leads ?? 0].join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = "measure-report-30d.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Reports</h1>
        <p className="mt-1 text-sm text-neutral-500">The measurement report — last 30 days, downloadable.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>{ana ? `${(ana.byCampaign ?? []).length} campaigns with delivery records in the window.` : "Loading…"}</p>
        <button onClick={download} disabled={!ana} className="mt-4 rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-40">Download CSV</button>
        <p className="mt-3 text-xs text-neutral-400">Scheduled and emailed reports don't exist in this system — the report is generated from the live ledger when you download it.</p>
      </div>
    </div>
  );
}

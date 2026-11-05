"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
const nameOf = (l: any) => [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email || "Unnamed lead";

export default function Page() {

  const [leads, setLeads] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/leads").then((r) => (r.ok ? r.json() : { leads: [] })).then((d) => setLeads(d.leads ?? [])).catch(() => {});
  }, []);
  const download = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["Name,Email,Phone,Source,Status,Campaign,Captured", ...leads.map((l) => [nameOf(l), l.email ?? "", l.phone ?? "", l.source ?? "", l.status ?? "", l.campaign_name ?? "", l.created_at ?? ""].map(esc).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "leads.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Export Leads</h1>
        <p className="mt-1 text-sm text-neutral-500">Download the captured leads as CSV.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>{leads.length} lead{leads.length === 1 ? "" : "s"} on record. The export carries name, email, phone, source, status, campaign and capture date — the fields the lead records hold.</p>
        <button onClick={download} disabled={leads.length === 0} className="mt-4 rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-40">Download CSV</button>
      </div>
    </div>
  );
}

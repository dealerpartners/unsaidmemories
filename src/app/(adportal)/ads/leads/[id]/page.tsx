"use client";

import Link from "next/link";
import { use } from "react";
import { useEffect, useState } from "react";
const nameOf = (l: any) => [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email || "Unnamed lead";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lead, setLead] = useState<any>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    fetch("/api/ads/leads").then((r) => (r.ok ? r.json() : { leads: [] }))
      .then((d) => { setLead((d.leads ?? []).find((l: any) => String(l.id) === String(id)) ?? null); setDone(true); }).catch(() => setDone(true));
  }, [id]);
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400"><Link href="/ads/leads" className="hover:underline">Leads</Link></p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">{lead ? nameOf(lead) : done ? "Lead not found" : "Loading…"}</h1>
      </div>
      {lead && (
        <div className="max-w-2xl space-y-2 rounded-xl border border-neutral-100 bg-white p-6 text-sm">
          <div className="flex justify-between"><span className="text-neutral-500">Email</span><span className="font-medium text-neutral-900">{lead.email ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Phone</span><span className="font-medium text-neutral-900">{lead.phone ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Source</span><span className="font-medium text-neutral-900">{lead.source ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Status</span><span className="font-medium text-neutral-900">{lead.status ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Campaign</span><span className="font-medium text-neutral-900">{lead.campaign_name ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Captured</span><span className="font-medium text-neutral-900">{lead.created_at ? new Date(lead.created_at).toLocaleString("en-US") : "—"}</span></div>
          {lead.email && <p className="pt-3"><a href={`mailto:${lead.email}`} className="font-medium text-neutral-900 underline">Email this lead</a></p>}
        </div>
      )}
    </div>
  );
}

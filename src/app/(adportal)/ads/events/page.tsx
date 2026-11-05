"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [t, setT] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null)).then((d) => setT(d?.totals ?? null)).catch(() => {});
    fetch("/api/ads/leads").then((r) => (r.ok ? r.json() : { leads: [] })).then((d) => setLeads(d.leads ?? [])).catch(() => {});
  }, []);
  const fmt = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");
  const bySource = new Map<string, number>();
  for (const l of leads) bySource.set(l.source ?? "unknown", (bySource.get(l.source ?? "unknown") ?? 0) + 1);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Events</h1>
        <p className="mt-1 text-sm text-neutral-500">What this system records: delivery events per campaign, and lead captures with their sources.</p>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-100 bg-white p-5"><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Impressions (30d)</p><p className="mt-1 text-2xl font-bold text-neutral-900">{t ? fmt(t.impressions) : "—"}</p></div>
        <div className="rounded-xl border border-neutral-100 bg-white p-5"><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Clicks (30d)</p><p className="mt-1 text-2xl font-bold text-neutral-900">{t ? fmt(t.clicks) : "—"}</p></div>
        <div className="rounded-xl border border-neutral-100 bg-white p-5"><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Lead captures</p><p className="mt-1 text-2xl font-bold text-neutral-900">{leads.length}</p></div>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Delivery events are recorded through the platform's event endpoint as impressions and clicks against campaigns and creatives — those are the only two event types. Lead captures arrive with a source label; the sources on record:</p>
        <div className="mt-3 space-y-1.5">
          {[...bySource.entries()].map(([s, n]) => (
            <div key={s} className="flex justify-between"><span className="text-neutral-500">{s}</span><span className="font-medium text-neutral-900">{n}</span></div>
          ))}
          {bySource.size === 0 && <p className="text-neutral-500">No captures yet.</p>}
        </div>
        <p className="mt-4"><Link href="/ads/events/data-sources" className="font-medium text-neutral-900 underline">Data sources</Link></p>
      </div>
    </div>
  );
}

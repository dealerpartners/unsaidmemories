"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MetricCard } from "@/components/ads/ui";

export default function Page() {
  const [auds, setAuds] = useState<any[]>([]);
  useEffect(() => { fetch("/api/ads/audiences").then((r) => (r.ok ? r.json() : { audiences: [] })).then((d) => setAuds(d.audiences ?? [])).catch(() => {}); }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Audience Measurement</h1>
        <p className="mt-1 text-sm text-neutral-500">The audiences measurement can speak about: the saved targeting sets.</p>
      </div>
      <div className="space-y-3">
        {auds.length === 0 && <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">No saved audiences yet.</div>}
        {auds.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-5">
            <Link href={`/ads/audiences/${a.id}`} className="text-sm font-semibold text-neutral-900 hover:underline">{a.name}</Link>
            <span className="text-sm text-neutral-600">{a.reach != null ? `${Number(a.reach).toLocaleString("en-US")} recorded reach` : "no reach recorded"}</span>
          </div>
        ))}
        <p className="text-xs text-neutral-400">Delivery isn't broken down by audience — measurement is per campaign and per placement, so audience-level performance isn't a number this system has.</p>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MetricCard } from "@/components/ads/ui";

export default function Page() {

  const [auds, setAuds] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/audiences").then((r) => (r.ok ? r.json() : { audiences: [] }))
      .then((d) => setAuds(d.audiences ?? [])).catch(() => {});
  }, []);
  const withReach = auds.filter((a) => a.reach != null);
  const totalReach = withReach.reduce((s, a) => s + Number(a.reach), 0);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Insights</h1>
        <p className="mt-1 text-sm text-neutral-500">What your saved audiences look like in aggregate — computed from the audience records themselves.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Saved audiences" value={String(auds.length)} delta="on this account" deltaType="neutral" />
        <MetricCard label="Combined recorded reach" value={withReach.length ? totalReach.toLocaleString("en-US") : "—"} delta={withReach.length ? `summed over ${withReach.length} audiences with reach recorded` : "no reach recorded yet"} deltaType="neutral" />
        <MetricCard label="With demographic facets" value={String(auds.filter((a) => a.targeting?.age_range || a.targeting?.gender).length)} delta="age or gender set" deltaType="neutral" />
      </div>
      <p className="mt-4 text-xs text-neutral-400">Population-level audience insights (who listens, by artist or behavior) aren't collected by this system — see Artist Affinity and Music Behavior for what exists.</p>
    </div>
  );
}

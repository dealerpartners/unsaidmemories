"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [auds, setAuds] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/audiences").then((r) => (r.ok ? r.json() : { audiences: [] }))
      .then((d) => setAuds(d.audiences ?? [])).catch(() => {});
  }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Demographics</h1>
        <p className="mt-1 text-sm text-neutral-500">Which of your audiences carry demographic facets.</p>
      </div>
      <div className="space-y-3">
        {[
          ["Age range", auds.filter((a) => a.targeting?.age_range).length],
          ["Gender", auds.filter((a) => a.targeting?.gender).length],
          ["Locations", auds.filter((a) => (a.targeting?.locations ?? []).length).length],
          ["Languages", auds.filter((a) => (a.targeting?.languages ?? []).length).length],
          ["Devices", auds.filter((a) => (a.targeting?.devices ?? []).length).length],
        ].map(([k, n]) => (
          <div key={k as string} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-5">
            <span className="text-sm font-medium text-neutral-900">{k}</span>
            <span className="text-sm text-neutral-600">{n} of {auds.length} audiences</span>
          </div>
        ))}
        <p className="text-xs text-neutral-400">Demographic breakdowns of the listening population itself (who actually heard your ads, by age and gender) aren't collected — the analytics audience pages say the same. What's above is the targeting your saved audiences carry.</p>
      </div>
    </div>
  );
}

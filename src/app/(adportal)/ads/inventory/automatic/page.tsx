"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [inv, setInv] = useState<any>(null);
  useEffect(() => { fetch("/api/ads/inventory").then((r) => (r.ok ? r.json() : null)).then(setInv).catch(() => {}); }, []);
  const tiers: any[] = inv?.tiers ?? [];
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Automatic Allocation</h1>
        <p className="mt-1 text-sm text-neutral-500">How inventory allocates itself: by tier priority on the active rate card.</p>
      </div>
      <div className="space-y-3">
        {tiers.map((t) => (
          <div key={t.code} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-5">
            <div><p className="text-sm font-semibold text-neutral-900">{t.name}</p><p className="text-xs text-neutral-500">Priority {t.priority} · up to {t.max_ads_per_page ?? "—"} ads per page</p></div>
            <span className="text-sm text-neutral-600">{t.frequency_cap_daily != null ? `${t.frequency_cap_daily}/day frequency cap` : ""}</span>
          </div>
        ))}
        <p className="text-xs text-neutral-400">Allocation isn't hand-tuned per placement here — the serving layer works down the tier priorities and per-page caps above. Those are rate-card records, edited with the rate card, not from this page.</p>
      </div>
    </div>
  );
}

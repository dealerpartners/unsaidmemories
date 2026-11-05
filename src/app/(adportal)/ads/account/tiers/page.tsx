"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MetricCard } from "@/components/ads/ui";
const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

export default function Page() {
  const [t, setT] = useState<any>(null);
  useEffect(() => {
    fetch("/api/ads/tiers").then((r) => (r.ok ? r.json() : null)).then(setT).catch(() => {});
  }, []);

  if (!t) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Account Tiers</h1><p className="mt-1 text-sm text-neutral-500">Loading…</p></div>;
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Account Tiers</h1>
        <p className="mt-1 text-sm text-neutral-500">Your tier follows your lifetime spend — it moves on its own as spend accumulates.</p>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Current tier" value={t.current?.name ?? t.current?.label ?? "—"} delta="based on lifetime spend" deltaType="neutral" />
        <MetricCard label="Lifetime spend" value={money(t.lifetime_spend)} delta="across all campaigns" deltaType="neutral" />
        <MetricCard label="Next tier" value={t.next?.name ?? t.next?.label ?? "Top tier"} delta={t.next ? `${money(t.next.spend_threshold)} threshold` : "nothing above this one"} deltaType="neutral" />
      </div>
      {t.next && (
        <div className="mb-6 rounded-xl border border-neutral-100 bg-white p-6">
          <div className="flex items-center justify-between text-sm"><span className="font-medium text-neutral-900">Progress to {t.next.name ?? t.next.label}</span><span className="text-neutral-500">{Math.round((t.progress_to_next ?? 0) * 100)}%</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-neutral-900" style={{ width: `${Math.round((t.progress_to_next ?? 0) * 100)}%` }} /></div>
        </div>
      )}
      <div className="space-y-3">
        {(t.tiers ?? []).map((tier: any) => (
          <div key={tier.id ?? tier.name} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-5">
            <div>
              <p className="text-sm font-semibold text-neutral-900">{tier.name ?? tier.label}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{(tier.benefits ?? tier.features ?? []).join(" · ")}</p>
            </div>
            <span className="text-sm text-neutral-600">{money(tier.spend_threshold)}+ lifetime spend</span>
          </div>
        ))}
      </div>
    </div>
  );
}

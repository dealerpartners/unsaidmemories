"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, MetricCard } from "@/components/ads/ui";

const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

export default function Page() {
  const [t, setT] = useState<any>(null);
  useEffect(() => {
    fetch("/api/ads/tiers").then((r) => (r.ok ? r.json() : null)).then(setT).catch(() => {});
  }, []);
  return (
    <div>
      <PageHeader title="Account Tier" description="Your tier follows lifetime spend — the same record as under Account." />
      {!t ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard label="Current tier" value={t.current?.name ?? t.current?.label ?? "—"} />
            <MetricCard label="Lifetime spend" value={money(t.lifetime_spend)} />
            <MetricCard label="Next tier" value={t.next?.name ?? t.next?.label ?? "Top tier"} />
          </div>
          {t.next && (
            <div className="rounded-xl border border-neutral-100 bg-white p-6">
              <div className="flex items-center justify-between text-sm"><span className="font-medium text-neutral-900">Progress to {t.next.name ?? t.next.label}</span><span className="text-neutral-500">{Math.round((t.progress_to_next ?? 0) * 100)}%</span></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-neutral-900" style={{ width: `${Math.round((t.progress_to_next ?? 0) * 100)}%` }} /></div>
            </div>
          )}
          <p className="mt-4 text-sm"><Link href="/ads/account/tiers" className="font-medium text-neutral-900 underline">Full tier details</Link></p>
        </>
      )}
    </div>
  );
}

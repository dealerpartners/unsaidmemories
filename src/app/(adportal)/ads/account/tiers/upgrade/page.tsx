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

  if (!t) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Upgrade</h1><p className="mt-1 text-sm text-neutral-500">Loading…</p></div>;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Upgrade</h1>
        <p className="mt-1 text-sm text-neutral-500">How the next tier is reached.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        {t.next ? (
          <>
            <p>Tiers aren't bought or requested — yours is <span className="font-medium text-neutral-900">{t.current?.name ?? t.current?.label}</span> today, and it becomes <span className="font-medium text-neutral-900">{t.next.name ?? t.next.label}</span> automatically when lifetime spend reaches {money(t.next.spend_threshold)}. You're at {money(t.lifetime_spend)}, so {money(Math.max(0, Number(t.next.spend_threshold) - Number(t.lifetime_spend)))} of spend remains.</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-neutral-900" style={{ width: `${Math.round((t.progress_to_next ?? 0) * 100)}%` }} /></div>
            <p className="mt-4"><Link href="/ads/campaigns" className="font-medium text-neutral-900 underline">Go to campaigns</Link></p>
          </>
        ) : (
          <p>You're on the top tier ({t.current?.name ?? t.current?.label ?? "—"}) — there's nothing above it to upgrade to.</p>
        )}
      </div>
    </div>
  );
}

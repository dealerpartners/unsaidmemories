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

  if (!t) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Tier Status</h1><p className="mt-1 text-sm text-neutral-500">Loading…</p></div>;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Tier Status</h1>
        <p className="mt-1 text-sm text-neutral-500">Your standing right now.</p>
      </div>
      <div className="space-y-4 rounded-xl border border-neutral-100 bg-white p-6 text-sm">
        <div className="flex justify-between"><span className="text-neutral-500">Current tier</span><span className="font-medium text-neutral-900">{t.current?.name ?? t.current?.label ?? "—"}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Lifetime spend</span><span className="font-medium text-neutral-900">{money(t.lifetime_spend)}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Next tier</span><span className="font-medium text-neutral-900">{t.next?.name ?? t.next?.label ?? "— (top tier)"}</span></div>
        {t.next && <div className="flex justify-between"><span className="text-neutral-500">Spend still needed</span><span className="font-medium text-neutral-900">{money(Math.max(0, Number(t.next.spend_threshold) - Number(t.lifetime_spend)))}</span></div>}
        {t.stored_tier_label && <div className="flex justify-between"><span className="text-neutral-500">Tier label on the account record</span><span className="font-medium text-neutral-900">{t.stored_tier_label}</span></div>}
      </div>
    </div>
  );
}

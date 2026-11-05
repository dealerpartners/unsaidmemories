"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, MetricCard } from "@/components/ads/ui";

const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Page() {
  const [rebates, setRebates] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/rebates").then((r) => (r.ok ? r.json() : null)).then((d) => setRebates(d?.rebates ?? [])).catch(() => {});
  }, []);
  const active = rebates.filter((r) => r.status === "active");
  const fixedTotal = active.filter((r) => r.amount != null).reduce((s, r) => s + Number(r.amount), 0);
  return (
    <div>
      <PageHeader title="Credits, Rebates & Promotions" description="Ad credits, rebate offers, and promotional balances on your account." />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Active offers" value={String(active.length)} />
        <MetricCard label="Fixed-amount value active" value={money(fixedTotal)} />
        <MetricCard label="Percent offers active" value={String(active.filter((r) => r.percent != null).length)} />
      </div>
      <div className="space-y-3">
        {rebates.length === 0 && (
          <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">No credits or rebates on this account. The welcome-credit style offers that used to be listed here were sample data — real offers appear when they're issued to your account.</div>
        )}
        {rebates.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-5">
            <div>
              <p className="text-sm font-semibold text-neutral-900">{r.name}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{r.rebate_type} · {r.status}{r.campaign_name ? ` · ${r.campaign_name}` : ""}{r.ends_at ? ` · expires ${new Date(r.ends_at).toLocaleDateString("en-US")}` : ""}</p>
            </div>
            <span className="text-sm font-medium text-neutral-900">{r.amount != null ? money(r.amount) : r.percent != null ? `${r.percent}%` : "—"}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm"><Link href="/ads/billing/rebates" className="font-medium text-neutral-900 underline">Manage rebates</Link></p>
    </div>
  );
}

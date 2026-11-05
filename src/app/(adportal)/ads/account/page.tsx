"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MetricCard } from "@/components/ads/ui";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/ads/account").then((r) => (r.ok ? r.json() : Promise.reject(new Error("x"))))
      .then(setData).catch(() => setFailed(true));
  }, []);
  const adv = data?.advertiser;
  const counts: Record<string, number> = data?.campaigns ?? {};
  const total = Object.values(counts).reduce((a: number, b: number) => a + b, 0);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Account</h1>
        <p className="mt-1 text-sm text-neutral-500">Your advertiser account, as it stands.</p>
      </div>
      {failed && <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">Account unavailable right now.</div>}
      {data && !adv && <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">No advertiser account exists for this sign-in yet — it is created when you start your first campaign.</div>}
      {adv && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <MetricCard label="Campaigns" value={String(total)} delta="all time" deltaType="neutral" />
            <MetricCard label="Active" value={String(counts.active ?? 0)} delta="running now" deltaType="neutral" />
            <MetricCard label="In review / preflight" value={String((counts.preflight ?? 0) + (counts.pending_review ?? 0))} delta="awaiting checks" deltaType="neutral" />
            <MetricCard label="Account status" value={adv.status} delta={adv.is_system ? "system account" : "standard account"} deltaType="neutral" />
          </div>
          <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Advertiser</p><p className="mt-1 font-medium text-neutral-900">{adv.display_name ?? "—"}</p></div>
              <div><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Account ID</p><p className="mt-1 text-neutral-700">{adv.id}</p></div>
              {Object.entries(counts).map(([k, v]) => (
                <div key={k}><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Campaigns · {k}</p><p className="mt-1 text-neutral-700">{v}</p></div>
              ))}
            </div>
            <div className="mt-5 flex gap-3">
              <Link href="/ads/account/profile" className="rounded-lg bg-[#f2eafe] px-4 py-2 text-sm font-medium text-[#6942c2]">Edit profile</Link>
              <Link href="/ads/account/settings" className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700">Account settings</Link>
              <Link href="/ads/account/tiers" className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700">Tier status</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

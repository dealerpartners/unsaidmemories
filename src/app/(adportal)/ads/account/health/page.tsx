"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MetricCard } from "@/components/ads/ui";

export default function Page() {
  const [acct, setAcct] = useState<any>(null);
  const [creatives, setCreatives] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/account").then((r) => (r.ok ? r.json() : null)).then(setAcct).catch(() => {});
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] })).then((d) => setCreatives(d.creatives ?? [])).catch(() => {});
  }, []);
  const counts: Record<string, number> = acct?.campaigns ?? {};
  const rejectedCreatives = creatives.filter((c) => c.status === "rejected");
  const pendingCreatives = creatives.filter((c) => c.status === "pending_review" || c.status === "in_review");
  const issues: string[] = [];
  if (acct?.advertiser && acct.advertiser.status !== "active") issues.push(`Advertiser account status is "${acct.advertiser.status}" — not active.`);
  if ((counts.rejected ?? 0) > 0) issues.push(`${counts.rejected} campaign(s) were rejected.`);
  if ((counts.ended ?? 0) > 0) issues.push(`${counts.ended} campaign(s) have ended.`);
  if (rejectedCreatives.length) issues.push(`${rejectedCreatives.length} creative(s) were rejected in review.`);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Account Health</h1>
        <p className="mt-1 text-sm text-neutral-500">Computed from your live account, campaigns and creative reviews — nothing here is a sample.</p>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <MetricCard label="Account status" value={acct?.advertiser?.status ?? "—"} delta="advertiser record" deltaType="neutral" />
        <MetricCard label="Active campaigns" value={String(counts.active ?? 0)} delta="running now" deltaType="neutral" />
        <MetricCard label="Creatives in review" value={String(pendingCreatives.length)} delta="awaiting a decision" deltaType="neutral" />
        <MetricCard label="Creatives rejected" value={String(rejectedCreatives.length)} delta="need rework" deltaType="neutral" />
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <h3 className="mb-3 text-sm font-semibold text-neutral-900">What needs attention</h3>
        {issues.length === 0 ? (
          <p className="text-sm text-neutral-600">Nothing outstanding — no rejected campaigns or creatives, and the account record is in good standing.</p>
        ) : (
          <ul className="space-y-2 text-sm text-neutral-600">
            {issues.map((i) => (<li key={i}>• {i}</li>))}
          </ul>
        )}
        {rejectedCreatives.length > 0 && (
          <div className="mt-4 space-y-1">
            {rejectedCreatives.map((c) => (
              <p key={c.id} className="text-sm"><Link href={`/ads/creatives/library/${c.id}`} className="font-medium text-neutral-900 hover:underline">{c.name}</Link> <span className="text-neutral-400">· {c.campaign_name ?? ""}</span></p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

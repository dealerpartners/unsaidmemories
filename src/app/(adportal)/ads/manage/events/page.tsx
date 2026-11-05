"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [t, setT] = useState<any>(null);
  useEffect(() => { fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null)).then((d) => setT(d?.totals ?? null)).catch(() => {}); }, []);
  const fmt = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Events</h1>
        <p className="mt-1 text-sm text-neutral-500">The event record this account produces — managed under Events; the counts here are live.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-100 bg-white p-5"><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Impressions (30d)</p><p className="mt-1 text-2xl font-bold text-neutral-900">{t ? fmt(t.impressions) : "—"}</p></div>
        <div className="rounded-xl border border-neutral-100 bg-white p-5"><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Clicks (30d)</p><p className="mt-1 text-2xl font-bold text-neutral-900">{t ? fmt(t.clicks) : "—"}</p></div>
        <div className="rounded-xl border border-neutral-100 bg-white p-5"><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Leads</p><p className="mt-1 text-2xl font-bold text-neutral-900">{t ? fmt(t.leads ?? 0) : "—"}</p></div>
      </div>
      <p className="mt-4 text-sm"><Link href="/ads/events" className="font-medium text-neutral-900 underline">Open the Events section</Link></p>
    </div>
  );
}

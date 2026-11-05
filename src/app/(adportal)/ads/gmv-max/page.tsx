"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">GMV Max</h1>
        <p className="mt-1 text-sm text-neutral-500">Campaigns optimized for gross merchandise value.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>GMV Max needs a commerce feed — orders and revenue attributed to campaigns — and none is connected to this account, so there are no GMV figures, order values or conversion rates to show. Delivery is measured in impressions, clicks and captured leads; see the <Link href="/ads/dashboard" className="font-medium text-neutral-900 underline">Dashboard</Link>.</p>
      </div>
    </div>
  );
}

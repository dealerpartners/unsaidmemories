"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Planning</h1>
        <p className="mt-1 text-sm text-neutral-500">Plan upcoming campaigns.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Planning here is the estimates engine and the inventory forecast — what a budget buys, and what inventory is coming. <Link href="/ads/campaigns/create/estimates" className="font-medium text-neutral-900 underline">Estimates</Link> · <Link href="/ads/inventory/performance" className="font-medium text-neutral-900 underline">Inventory forecast</Link>. There is no separate planning calendar or media-plan store.</p>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Ads Plans & Subscriptions</h1>
        <p className="mt-1 text-sm text-neutral-500">Flat-rate ad plans, media plans, and subscriptions.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There are no flat-rate plans or subscriptions in this system — advertising here is spend-based: you pay for delivery as it happens, and your account's standing is its <Link href="/ads/account/tiers" className="font-medium text-neutral-900 underline">tier</Link>, which follows lifetime spend. The plan cards that used to appear on this page were sample data.</p>
      </div>
    </div>
  );
}

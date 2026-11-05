"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Event Partners</h1>
        <p className="mt-1 text-sm text-neutral-500">Partners connected to event data.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>No event-data partners are connected — event records stay inside this platform's ledger and lead store. Programmatic partners (a different thing: they serve ads) are listed under <Link href="/ads/exchange/partners" className="font-medium text-neutral-900 underline">Exchange Partners</Link>.</p>
      </div>
    </div>
  );
}

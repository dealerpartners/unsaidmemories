"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Integrations</h1>
        <p className="mt-1 text-sm text-neutral-500">Connections for this ad account.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Integrations for the site — payment, suppliers, email and the rest — are managed in the platform's Connections & Keys surface, not inside the ads portal; nothing ads-specific is connected separately. Programmatic partners live under <Link href="/ads/exchange/partners" className="font-medium text-neutral-900 underline">Exchange Partners</Link>.</p>
      </div>
    </div>
  );
}

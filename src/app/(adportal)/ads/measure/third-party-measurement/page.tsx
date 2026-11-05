"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Third-Party Measurement</h1>
        <p className="mt-1 text-sm text-neutral-500">External verification and measurement partners.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>No third-party measurement partner is connected — there are no verification tags, brand-lift studies or external panels feeding this account. Measurement is the platform's own delivery ledger, shown on the <Link href="/ads/measure/analytics" className="font-medium text-neutral-900 underline">Analytics page</Link>.</p>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Negative Keywords</h1>
        <p className="mt-1 text-sm text-neutral-500">Terms your ads should never match.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There is no keyword matching in this system, so there is nothing to negate. Exclusion works through audience controls and brand-safety blocked topics — see <Link href="/ads/account/audience-controls" className="font-medium text-neutral-900 underline">Audience Controls</Link> and <Link href="/ads/settings/brand-safety" className="font-medium text-neutral-900 underline">Brand Safety</Link>.</p>
      </div>
    </div>
  );
}

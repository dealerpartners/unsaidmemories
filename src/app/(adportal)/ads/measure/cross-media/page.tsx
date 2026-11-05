"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Cross-Media Measurement</h1>
        <p className="mt-1 text-sm text-neutral-500">Performance across channels.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>This system measures its own delivery only — impressions, clicks and leads on this platform's placements. Other channels (search, social, email) aren't ingested, so a cross-media view would have nothing real to combine. The <Link href="/ads/measure/performance" className="font-medium text-neutral-900 underline">Performance page</Link> shows everything that is measured.</p>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Integrations</h1>
        <p className="mt-1 text-sm text-neutral-500">Connected tools for this ad account.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Ad-account integrations aren't configured inside the ads portal — connections and API keys for the whole site live in the platform's <Link href="/ads/integrations" className="font-medium text-neutral-900 underline">Integrations</Link> area. Nothing ads-specific is connected separately.</p>
      </div>
    </div>
  );
}

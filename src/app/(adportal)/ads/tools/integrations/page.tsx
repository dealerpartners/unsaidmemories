"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Integrations</h1>
        <p className="mt-1 text-sm text-neutral-500">Tools connected to this account.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Ads integrations are the platform's connections, managed in <Link href="/ads/integrations" className="font-medium text-neutral-900 underline">Integrations</Link>; programmatic partners are under <Link href="/ads/exchange/partners" className="font-medium text-neutral-900 underline">Exchange Partners</Link>. Nothing separate is connected at the tools level.</p>
      </div>
    </div>
  );
}

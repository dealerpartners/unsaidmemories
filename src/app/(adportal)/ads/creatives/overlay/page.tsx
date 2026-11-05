"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Overlay</h1>
          <p className="mt-1 text-sm text-neutral-500">Manage overlay creative assets.</p>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Overlays, stickers and branded frames aren't a stored asset type in this system — there's no overlay library behind this page. Creative assets live in the <a className="font-medium text-neutral-900 underline" href="/ads/creatives/library">Creative Library</a>.</p>
      </div>
    </div>
  );
}

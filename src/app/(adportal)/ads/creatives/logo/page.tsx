"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Logo</h1>
          <p className="mt-1 text-sm text-neutral-500">Manage logo creative assets.</p>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There's no separate logo asset type in this system — brand logos live in the <a className="font-medium text-neutral-900 underline" href="/ads/creatives/library">Creative Library</a> as image creatives, alongside everything else. Nothing is stored under a logo category, so there's nothing logo-specific to list here.</p>
      </div>
    </div>
  );
}

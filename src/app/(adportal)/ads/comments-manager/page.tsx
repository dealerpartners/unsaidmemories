"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Comments Manager</h1>
        <p className="mt-1 text-sm text-neutral-500">Moderate ad comments, filter by sentiment, and respond.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There are no ad comments to moderate — no comment store exists behind this page, and the sample comments, sentiment filters and reply box that used to be here were decoration. Creative review (the moderation that does exist) is under <Link href="/ads/settings/customer-review" className="font-medium text-neutral-900 underline">Customer Review</Link>.</p>
      </div>
    </div>
  );
}

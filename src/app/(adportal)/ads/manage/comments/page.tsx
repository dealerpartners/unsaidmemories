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
        <p>Ad comments aren't stored in this system — there is no comment record on campaigns or creatives, no sentiment data and no reply channel here. The moderation that does exist is creative review (approve/reject before a creative can run), under <Link href="/ads/settings/customer-review" className="font-medium text-neutral-900 underline">Customer Review</Link>.</p>
      </div>
    </div>
  );
}

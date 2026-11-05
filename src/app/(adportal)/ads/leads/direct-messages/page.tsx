"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Direct Messages</h1>
        <p className="mt-1 text-sm text-neutral-500">Leads that arrive as direct messages.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Message conversations aren't stored in the ads lead system — a person who messages you about an ad becomes a lead here only when a capture records them, with the source marked on the lead. There is no message thread view to show; the <Link href="/ads/leads/inbox" className="font-medium text-neutral-900 underline">Lead Inbox</Link> is the list that exists.</p>
      </div>
    </div>
  );
}

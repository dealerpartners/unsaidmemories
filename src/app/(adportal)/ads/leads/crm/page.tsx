"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">CRM Sync</h1>
        <p className="mt-1 text-sm text-neutral-500">Where captured leads go next.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Leads captured by ads land in the ad platform's lead records — that's the list under <Link href="/ads/leads" className="font-medium text-neutral-900 underline">Leads Center</Link>. There is no automatic sync from those records into the Contacts CRM, and no sync job to configure here; the export under <Link href="/ads/leads/export" className="font-medium text-neutral-900 underline">Export</Link> is the bridge that exists. (This page previously showed a connected-CRM state that wasn't real.)</p>
      </div>
    </div>
  );
}

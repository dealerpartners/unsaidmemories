"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Reports</h1>
          <p className="mt-1 text-sm text-neutral-500">Create distributable performance reports from the real delivery data.</p>
        </div>
        <Link
          href="/ads/analytics/reports/create"
          className="flex h-9 items-center gap-2 rounded-lg bg-[#f2eafe] px-4 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          Create Report
        </Link>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There are no saved or scheduled reports — this system doesn't keep a report library. Reports are generated on demand from the live delivery ledger:</p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li><Link href="/ads/analytics/reports/create" className="font-medium text-neutral-900 underline">Create Report</Link> — pick a window and breakdown, download the CSV.</li>
          <li><Link href="/ads/analytics/reports/export" className="font-medium text-neutral-900 underline">Export</Link> — a quick totals + per-campaign export.</li>
          <li><Link href="/ads/analytics/reports/schedule" className="font-medium text-neutral-900 underline">Schedule</Link> — what scheduling would need (not available yet).</li>
        </ul>
      </div>
    </div>
  );
}

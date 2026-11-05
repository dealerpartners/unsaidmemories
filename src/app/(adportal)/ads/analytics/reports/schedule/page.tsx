"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Schedule Reports</h1>
        <p className="mt-1 text-sm text-neutral-500">Recurring report delivery.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Scheduled reports aren't available in this system — there's no scheduler or report store behind this page, and a schedule saved here would never run.</p>
        <p className="mt-2">For now, reports are generated on demand from the live data: <Link href="/ads/analytics/reports/create" className="font-medium text-neutral-900 underline">Create Report</Link> or <Link href="/ads/analytics/reports/export" className="font-medium text-neutral-900 underline">Export</Link>.</p>
      </div>
    </div>
  );
}

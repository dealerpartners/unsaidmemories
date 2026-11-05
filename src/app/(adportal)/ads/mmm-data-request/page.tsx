"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">MMM Data Request</h1>
        <p className="mt-1 text-sm text-neutral-500">Request the data package for media-mix modeling.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There is no MMM program or request queue in this system — the sample requests that used to be listed here weren't real. The underlying delivery data (by campaign and placement) is exportable from <Link href="/ads/measure/reports" className="font-medium text-neutral-900 underline">Measure → Reports</Link>.</p>
      </div>
    </div>
  );
}

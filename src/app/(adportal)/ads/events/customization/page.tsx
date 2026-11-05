"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Event Customization</h1>
        <p className="mt-1 text-sm text-neutral-500">Custom event types and parameters.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Event types aren't customizable in this system: delivery records impressions and clicks, and lead captures carry the fields on the lead record. There are no custom events, parameters or conversions to define — the <Link href="/ads/measure/metrics-glossary" className="font-medium text-neutral-900 underline">metrics glossary</Link> lists exactly what is measured.</p>
      </div>
    </div>
  );
}

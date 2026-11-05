"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Templates</h1>
          <p className="mt-1 text-sm text-neutral-500">AI creative templates.</p>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There are no AI templates stored in this system. The working AI tool is the <a className="font-medium text-neutral-900 underline" href="/ads/creatives/ai/script">Script &amp; Copy Generator</a>, which writes headline/body/CTA variants from a brief.</p>
      </div>
    </div>
  );
}

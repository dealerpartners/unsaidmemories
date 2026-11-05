"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Attribution</h1>
        <p className="mt-1 text-sm text-neutral-500">How results get credited to ads.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Attribution in this system is simple and stated plainly: delivery events (impressions, clicks) are recorded per campaign, and a lead is credited to the campaign that captured it. There is no multi-touch or view-through attribution model, and conversion events beyond lead capture aren't recorded — so there are no attribution windows or models to configure here.</p>
      </div>
    </div>
  );
}

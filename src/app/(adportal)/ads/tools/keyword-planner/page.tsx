"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Keyword Planner</h1>
        <p className="mt-1 text-sm text-neutral-500">Research keywords for campaigns.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Keywords aren't a targeting dimension in this system — campaigns target by placement, tier and audience facets (locations, languages, devices, age, gender). There is no keyword inventory to plan against, so no planner is offered rather than invented volumes.</p>
      </div>
    </div>
  );
}

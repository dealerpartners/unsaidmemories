"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Tags</h1>
          <p className="mt-1 text-sm text-neutral-500">Organize creatives with tags.</p>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Creatives have no tags in this system — there's no tags column on a creative, so there's nothing to organize here. Creatives are organized by campaign and ad group, which is how the library lists them.</p>
      </div>
    </div>
  );
}

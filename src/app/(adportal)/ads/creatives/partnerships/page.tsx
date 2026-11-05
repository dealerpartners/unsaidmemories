"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Creator Partnerships</h1>
          <p className="mt-1 text-sm text-neutral-500">Collaborate with creators and production partners.</p>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>No creator or production partners are connected to this account, and there's no partner store in this system — the partner list that used to sit here was sample data. When partnerships are built, real partners and their campaigns will appear here.</p>
      </div>
    </div>
  );
}

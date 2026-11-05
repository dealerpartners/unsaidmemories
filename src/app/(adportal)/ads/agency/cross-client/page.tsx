"use client";

import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Cross-Client View</h1>
        <p className="mt-1 text-sm text-neutral-500">Performance across all client accounts.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>There is one client account under this login, so a cross-client roll-up would just be the account itself. Its numbers are on the <Link href="/ads/dashboard" className="font-medium text-neutral-900 underline">Dashboard</Link>.</p>
      </div>
    </div>
  );
}

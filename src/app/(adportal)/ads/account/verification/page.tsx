"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [v, setV] = useState<any>(null);
  useEffect(() => {
    fetch("/api/ads/verification").then((r) => (r.ok ? r.json() : null)).then(setV).catch(() => {});
  }, []);

  if (!v) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Verification</h1><p className="mt-1 text-sm text-neutral-500">Loading…</p></div>;
  const latest = v.latest;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Verification</h1>
        <p className="mt-1 text-sm text-neutral-500">Business verification for this ad account.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        {v.verified ? (
          <p>Your business is <span className="font-medium text-neutral-900">verified</span>. That status is on the account record and applies across the ad account.</p>
        ) : latest ? (
          <p>Your latest application is <span className="font-medium text-neutral-900">{latest.status}</span> (filed {new Date(latest.created_at).toLocaleDateString("en-US")}). <Link href="/ads/account/verification/status" className="font-medium text-neutral-900 underline">See the application</Link>{latest.status === "rejected" ? <> — you can <Link href="/ads/account/verification/start" className="font-medium text-neutral-900 underline">file a new one</Link>.</> : "."}</p>
        ) : (
          <p>Not verified yet, and no application on file. <Link href="/ads/account/verification/start" className="font-medium text-neutral-900 underline">Start verification</Link> — it takes a business name and a website.</p>
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ads/ui";

export default function Page() {
  const [v, setV] = useState<any>(null);
  useEffect(() => {
    fetch("/api/ads/verification").then((r) => (r.ok ? r.json() : null)).then(setV).catch(() => {});
  }, []);
  const latest = v?.latest;
  return (
    <div>
      <PageHeader title="Verification" description="Business verification for this ad account — the same record as under Account." />
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        {!v ? (
          <p>Loading…</p>
        ) : v.verified ? (
          <p>Your business is <span className="font-medium text-neutral-900">verified</span>.</p>
        ) : latest ? (
          <p>Latest application: <span className="font-medium text-neutral-900">{latest.status}</span>, filed {new Date(latest.created_at).toLocaleDateString("en-US")}. <Link href="/ads/account/verification/status" className="font-medium text-neutral-900 underline">See details</Link></p>
        ) : (
          <p>Not verified yet, and no application on file. <Link href="/ads/account/verification/start" className="font-medium text-neutral-900 underline">Start verification</Link></p>
        )}
      </div>
    </div>
  );
}

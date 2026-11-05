"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [v, setV] = useState<any>(null);
  useEffect(() => {
    fetch("/api/ads/verification").then((r) => (r.ok ? r.json() : null)).then(setV).catch(() => {});
  }, []);

  if (!v) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Verification Status</h1><p className="mt-1 text-sm text-neutral-500">Loading…</p></div>;
  const latest = v.latest;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Verification Status</h1>
        <p className="mt-1 text-sm text-neutral-500">The state of your verification.</p>
      </div>
      <div className="space-y-4 rounded-xl border border-neutral-100 bg-white p-6 text-sm">
        <div className="flex justify-between"><span className="text-neutral-500">Account verified</span><span className="font-medium text-neutral-900">{v.verified ? "Yes" : "No"}</span></div>
        {latest ? (
          <>
            <div className="flex justify-between"><span className="text-neutral-500">Latest application</span><span className="font-medium text-neutral-900">{latest.status}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Type</span><span className="font-medium text-neutral-900">{latest.kind}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Filed</span><span className="font-medium text-neutral-900">{new Date(latest.created_at).toLocaleString("en-US")}</span></div>
            {latest.reviewed_at && <div className="flex justify-between"><span className="text-neutral-500">Reviewed</span><span className="font-medium text-neutral-900">{new Date(latest.reviewed_at).toLocaleString("en-US")}</span></div>}
            {latest.notes && <div><span className="text-neutral-500">Notes</span><p className="mt-1 text-neutral-700">{latest.notes}</p></div>}
          </>
        ) : (
          <p className="text-neutral-600">No application on file. <Link href="/ads/account/verification/start" className="font-medium text-neutral-900 underline">Start one</Link>.</p>
        )}
      </div>
    </div>
  );
}

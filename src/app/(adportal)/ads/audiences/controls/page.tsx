"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [ctl, setCtl] = useState<any>(null);
  useEffect(() => {
    fetch("/api/ads/settings?kind=audience_controls").then((r) => (r.ok ? r.json() : null))
      .then((d) => setCtl(d?.settings ?? {})).catch(() => {});
  }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Controls</h1>
        <p className="mt-1 text-sm text-neutral-500">The audience controls currently in force on this account.</p>
      </div>
      <div className="space-y-3">
        {[
          ["Exclude existing customers", ctl?.exclude_customers],
          ["Exclude app users", ctl?.exclude_app_users],
          ["Age restriction: 18+", ctl?.age_18_plus],
        ].map(([k, v]) => (
          <div key={k as string} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-5">
            <span className="text-sm font-medium text-neutral-900">{k}</span>
            <span className="text-sm text-neutral-600">{ctl === null ? "…" : v ? "On" : "Off"}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm"><Link href="/ads/account/audience-controls" className="font-medium text-neutral-900 underline">Edit in Audience Controls</Link></p>
    </div>
  );
}

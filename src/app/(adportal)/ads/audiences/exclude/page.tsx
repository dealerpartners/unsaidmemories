"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [ctl, setCtl] = useState<any>(null);
  useEffect(() => {
    fetch("/api/ads/settings?kind=audience_controls").then((r) => (r.ok ? r.json() : null))
      .then((d) => setCtl(d?.settings ?? {})).catch(() => {});
  }, []);
  const listCount = ctl ? String(ctl.exclusion_list ?? "").split(/\n+/).map((x: string) => x.trim()).filter(Boolean).length : 0;
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Exclude</h1>
        <p className="mt-1 text-sm text-neutral-500">Who your ads stay away from, account-wide.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Exclusions aren't a property of a single audience — they're an account-level control. Right now yours are: existing customers <span className="font-medium text-neutral-900">{ctl?.exclude_customers ? "excluded" : "not excluded"}</span>, app users <span className="font-medium text-neutral-900">{ctl?.exclude_app_users ? "excluded" : "not excluded"}</span>, age restriction 18+ <span className="font-medium text-neutral-900">{ctl?.age_18_plus ? "on" : "off"}</span>, and <span className="font-medium text-neutral-900">{listCount}</span> entries on your custom exclusion list.</p>
        <p className="mt-3"><Link href="/ads/account/audience-controls" className="font-medium text-neutral-900 underline">Change them in Audience Controls</Link></p>
      </div>
    </div>
  );
}

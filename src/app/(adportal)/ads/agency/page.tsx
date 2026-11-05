"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [acct, setAcct] = useState<any>(null);
  useEffect(() => { fetch("/api/ads/account").then((r) => (r.ok ? r.json() : null)).then(setAcct).catch(() => {}); }, []);
  const adv = acct?.advertiser;
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Agency</h1>
        <p className="mt-1 text-sm text-neutral-500">The ad account this login runs — its standing and its doors.</p>
      </div>
      <div className="max-w-2xl space-y-2 rounded-xl border border-neutral-100 bg-white p-6 text-sm">
        {!adv ? <p className="text-neutral-500">Loading…</p> : (
          <>
            <div className="flex justify-between"><span className="text-neutral-500">Account</span><span className="font-medium text-neutral-900">{adv.display_name}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Status</span><span className="font-medium text-neutral-900">{adv.status}</span></div>
            {Object.entries(acct.campaigns ?? {}).map(([k, n]) => (
            <div key={k} className="flex justify-between"><span className="capitalize text-neutral-500">{k}</span><span className="font-medium text-neutral-900">{String(n)}</span></div>
          ))}
          </>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href="/ads/agency/clients" className="rounded-full bg-neutral-100 px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-200">Clients</Link>
        <Link href="/ads/agency/team" className="rounded-full bg-neutral-100 px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-200">Team</Link>
        <Link href="/ads/agency/billing" className="rounded-full bg-neutral-100 px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-200">Billing</Link>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [acct, setAcct] = useState<any>(null);
  useEffect(() => { fetch("/api/ads/account").then((r) => (r.ok ? r.json() : null)).then(setAcct).catch(() => {}); }, []);
  const adv = acct?.advertiser;
  const mine = adv && String(adv.id) === String(id);
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400"><Link href="/ads/agency/clients" className="hover:underline">Clients</Link></p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">{!acct ? "Loading…" : mine ? adv.display_name : "Not a client of this login"}</h1>
      </div>
      {mine && (
        <div className="max-w-2xl space-y-2 rounded-xl border border-neutral-100 bg-white p-6 text-sm">
          <div className="flex justify-between"><span className="text-neutral-500">Status</span><span className="font-medium text-neutral-900">{adv.status}</span></div>
          {Object.entries(acct.campaigns ?? {}).map(([k, n]) => (
            <div key={k} className="flex justify-between"><span className="capitalize text-neutral-500">{k}</span><span className="font-medium text-neutral-900">{String(n)}</span></div>
          ))}
          <p className="pt-3"><Link href="/ads/campaigns" className="font-medium text-neutral-900 underline">Open the account's campaigns</Link></p>
        </div>
      )}
      {acct && !mine && <p className="text-sm text-neutral-600">This login manages a single ad account, and it isn't the one in this URL.</p>}
    </div>
  );
}

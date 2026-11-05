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
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Clients</h1>
        <p className="mt-1 text-sm text-neutral-500">The client accounts this login manages.</p>
      </div>
      <div className="space-y-3">
        {adv && (
          <Link href={`/ads/agency/clients/${adv.id}`} className="block rounded-xl border border-neutral-100 bg-white p-5 hover:bg-neutral-50">
            <p className="text-sm font-semibold text-neutral-900">{adv.display_name}</p>
            <p className="text-xs text-neutral-500">{adv.status} · {Object.values(acct.campaigns ?? {}).reduce((a: number, n: any) => a + Number(n), 0)} campaigns</p>
          </Link>
        )}
        <p className="text-xs text-neutral-400">This login manages one ad account — multi-client agency books (many advertiser accounts under one login) aren't a feature of this platform, so the client list is the account itself rather than an invented roster.</p>
      </div>
    </div>
  );
}

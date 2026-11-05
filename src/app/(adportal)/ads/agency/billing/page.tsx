"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [tx, setTx] = useState<any>(null);
  useEffect(() => { fetch("/api/ads/billing/transactions").then((r) => (r.ok ? r.json() : null)).then(setTx).catch(() => {}); }, []);
  const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
  const t = tx?.totals;
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Agency Billing</h1>
        <p className="mt-1 text-sm text-neutral-500">The account's billing standing — the same ledger as the Billing section.</p>
      </div>
      <div className="max-w-2xl space-y-2 rounded-xl border border-neutral-100 bg-white p-6 text-sm">
        {!t ? <p className="text-neutral-500">Loading…</p> : (
          <>
            <div className="flex justify-between"><span className="text-neutral-500">Spent</span><span className="font-medium text-neutral-900">{money(t.spent)}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Billed</span><span className="font-medium text-neutral-900">{money(t.billed)}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Unbilled</span><span className="font-medium text-neutral-900">{money(t.unbilled)}</span></div>
            <p className="pt-3"><Link href="/ads/billing" className="font-medium text-neutral-900 underline">Open Billing</Link></p>
          </>
        )}
      </div>
    </div>
  );
}

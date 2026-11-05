"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [partners, setPartners] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/programmatic").then((r) => (r.ok ? r.json() : null))
      .then((d) => { setPartners(d?.partners ?? []); setDeals(d?.deals ?? []); }).catch(() => {});
  }, []);
  const byStatus = new Map<string, number>();
  for (const d of deals) byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Reconciliation</h1>
        <p className="mt-1 text-sm text-neutral-500">Deal records by status — what would need to reconcile.</p>
      </div>
      <div className="max-w-2xl space-y-3">
        {deals.length === 0 && <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">No deals on record — nothing to reconcile.</div>}
        {[...byStatus.entries()].map(([k, n]) => (
          <div key={k} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-5"><span className="text-sm font-medium text-neutral-900">{k}</span><span className="text-sm text-neutral-600">{n} deal{n === 1 ? "" : "s"}</span></div>
        ))}
        <p className="text-sm text-neutral-600">Money reconciliation for ad delivery runs through the <Link href="/ads/billing/transactions" className="font-medium text-neutral-900 underline">billing ledger</Link> — charges and settlements are recorded there, not in the exchange.</p>
      </div>
    </div>
  );
}

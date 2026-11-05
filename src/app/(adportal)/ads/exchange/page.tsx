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
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Exchange</h1>
        <p className="mt-1 text-sm text-neutral-500">Programmatic partners and deals — the exchange records this platform actually holds.</p>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-100 bg-white p-5"><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Partners</p><p className="mt-1 text-2xl font-bold text-neutral-900">{partners.length}</p></div>
        <div className="rounded-xl border border-neutral-100 bg-white p-5"><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Deals</p><p className="mt-1 text-2xl font-bold text-neutral-900">{deals.length}</p></div>
        <div className="rounded-xl border border-neutral-100 bg-white p-5"><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Active partners</p><p className="mt-1 text-2xl font-bold text-neutral-900">{partners.filter((p) => p.status === "active").length}</p></div>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/ads/exchange/partners" className="rounded-full bg-neutral-100 px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-200">Partners</Link>
        <Link href="/ads/exchange/pmp" className="rounded-full bg-neutral-100 px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-200">Private marketplace</Link>
        <Link href="/ads/exchange/open-auction" className="rounded-full bg-neutral-100 px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-200">Open auction</Link>
        <Link href="/ads/exchange/reconciliation" className="rounded-full bg-neutral-100 px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-200">Reconciliation</Link>
      </div>
    </div>
  );
}

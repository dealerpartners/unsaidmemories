"use client";

import { useEffect, useState } from "react";

const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Page() {
  const [totals, setTotals] = useState<any>(null);
  const [methods, setMethods] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/billing/transactions").then((r) => (r.ok ? r.json() : null)).then((d) => setTotals(d?.totals ?? null)).catch(() => {});
    fetch("/api/ads/billing/payment-methods").then((r) => (r.ok ? r.json() : null)).then((d) => setMethods(d?.payment_methods ?? [])).catch(() => {});
  }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Billing Support</h1>
        <p className="mt-1 text-sm text-neutral-500">Help with charges, payment methods and invoices.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>For a billing question, contact support through the Help Center and include the references below — they're your live billing state, and they're what support will ask for:</p>
        <div className="mt-4 space-y-2">
          <div className="flex justify-between"><span className="text-neutral-500">Unbilled spend</span><span className="font-medium text-neutral-900">{totals ? money(totals.unbilled) : "—"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Billed so far</span><span className="font-medium text-neutral-900">{totals ? money(totals.billed) : "—"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Payment methods on file</span><span className="font-medium text-neutral-900">{methods.length}</span></div>
        </div>
        <p className="mt-4">Failed charges and their provider references are on the <a className="font-medium text-neutral-900 underline" href="/ads/billing/transactions">Transactions</a> page — quote the transaction ID when you write in.</p>
      </div>
    </div>
  );
}

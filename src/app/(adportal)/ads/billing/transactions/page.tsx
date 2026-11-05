"use client";

import { useEffect, useState } from "react";
import { PageHeader, MetricCard } from "@/components/ads/ui";

const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Page() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/ads/billing/transactions").then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  }, []);
  const txns: any[] = data?.transactions ?? [];
  const totals = data?.totals;
  return (
    <div>
      <PageHeader title="Transactions" description="Full transaction history for your account." />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Total spend" value={totals ? money(totals.spent) : "—"} />
        <MetricCard label="Billed" value={totals ? money(totals.billed) : "—"} />
        <MetricCard label="Unbilled" value={totals ? money(totals.unbilled) : "—"} />
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Transaction</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {txns.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-sm text-neutral-500">No transactions yet — billing runs record them here.</td></tr>
            )}
            {txns.map((t) => (
              <tr key={t.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{String(t.id).slice(0, 8)}</td>
                <td className="px-4 py-3 text-sm capitalize text-neutral-700">{t.type}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{t.campaign_name ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{money(t.amount)} {t.currency ?? ""}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{t.status}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{new Date(t.created_at).toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

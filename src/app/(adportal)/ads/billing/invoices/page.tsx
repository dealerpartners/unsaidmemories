"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ads/ui";

const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Page() {
  const [txns, setTxns] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/billing/transactions").then((r) => (r.ok ? r.json() : null))
      .then((d) => setTxns((d?.transactions ?? []).filter((t: any) => t.type === "charge"))).catch(() => {});
  }, []);
  return (
    <div>
      <PageHeader title="Invoices" description="An invoice here is a settled charge — one is recorded each time billing runs against a campaign." />
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {txns.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-sm text-neutral-500">No charges yet — invoices appear when billing settles campaign spend.</td></tr>
            )}
            {txns.map((t) => (
              <tr key={t.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/billing/invoices/${t.id}`} className="font-medium text-neutral-900 hover:underline">Charge {String(t.id).slice(0, 8)}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{t.campaign_name ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{new Date(t.created_at).toLocaleDateString("en-US")}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{money(t.amount)}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
  const shown = deals.filter((d) => /pmp|private/i.test(d.deal_type ?? ""));
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Private Marketplace</h1>
        <p className="mt-1 text-sm text-neutral-500">Invitation-only deals — the PMP records on this account.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400"><th className="px-4 py-3">Partner</th><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Floor price</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Runs</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-sm text-neutral-500">No private-marketplace deals are on record.</td></tr>}
            {shown.map((d) => (
              <tr key={d.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{d.partner_name}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{d.campaign_name}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{d.deal_type}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{d.floor_price != null ? `$${Number(d.floor_price).toLocaleString("en-US")}` : "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{d.status}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{d.starts_at ? new Date(d.starts_at).toLocaleDateString("en-US") : "—"}{d.ends_at ? ` → ${new Date(d.ends_at).toLocaleDateString("en-US")}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

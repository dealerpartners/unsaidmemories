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
  const shown = partners.filter((p) => /vast/i.test(p.protocol ?? ""));
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">VAST</h1>
        <p className="mt-1 text-sm text-neutral-500">Partners integrated over VAST (the video ad serving standard).</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400"><th className="px-4 py-3">Partner</th><th className="px-4 py-3">Protocol</th><th className="px-4 py-3">Endpoint</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Revenue share</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-sm text-neutral-500">No partner on record runs VAST.</td></tr>}
            {shown.map((p) => (
              <tr key={p.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{p.name}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{p.protocol ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{p.endpoint ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{p.status}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{p.revenue_share != null ? `${p.revenue_share}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

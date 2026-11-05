"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [inv, setInv] = useState<any>(null);
  useEffect(() => { fetch("/api/ads/inventory").then((r) => (r.ok ? r.json() : null)).then(setInv).catch(() => {}); }, []);
  const placements: any[] = inv?.placements ?? [];
  const shown = placements;
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Placements & Inventory</h1>
        <p className="mt-1 text-sm text-neutral-500">The active rate card's placements and what each tier pays on them.</p>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-100 bg-white p-5"><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Rate card</p><p className="mt-1 text-lg font-bold text-neutral-900">{inv?.rate_card?.name ?? "—"}</p></div>
        <div className="rounded-xl border border-neutral-100 bg-white p-5"><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Placements</p><p className="mt-1 text-2xl font-bold text-neutral-900">{placements.length}</p></div>
        <div className="rounded-xl border border-neutral-100 bg-white p-5"><p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Tiers</p><p className="mt-1 text-2xl font-bold text-neutral-900">{(inv?.tiers ?? []).length}</p></div>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400"><th className="px-4 py-3">Placement</th><th className="px-4 py-3">Max per page</th><th className="px-4 py-3">Rates (CPM by tier)</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-sm text-neutral-500">No placements on the active rate card.</td></tr>}
            {shown.map((p) => (
              <tr key={p.code} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{p.name}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{p.max_per_page ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{Object.entries(p.rates ?? {}).map(([t2, c]) => `${t2}: $${(Number(c) / 100).toFixed(2)}`).join(" · ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [inv, setInv] = useState<any>(null);
  useEffect(() => { fetch("/api/ads/inventory").then((r) => (r.ok ? r.json() : null)).then(setInv).catch(() => {}); }, []);
  const shown: any[] = (inv?.placements ?? []).filter((p: any) => /feed/i.test(`${p.code} ${p.name}`));
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Top Feed Inventory</h1>
        <p className="mt-1 text-sm text-neutral-500">The feed placements — the top-of-feed inventory and its rates.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400"><th className="px-4 py-3">Placement</th><th className="px-4 py-3">Max per page</th><th className="px-4 py-3">Rates (CPM by tier)</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-sm text-neutral-500">No feed placements are in the catalog.</td></tr>}
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

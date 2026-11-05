"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [inv, setInv] = useState<any>(null);
  useEffect(() => { fetch("/api/ads/inventory").then((r) => (r.ok ? r.json() : null)).then(setInv).catch(() => {}); }, []);
  const [q, setQ] = useState("");
  const shown: any[] = (inv?.placements ?? []).filter((p: any) => `${p.code} ${p.name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Search Inventory</h1>
        <p className="mt-1 text-sm text-neutral-500">Find a placement by name or code.</p>
      </div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search placements…" className="mb-4 h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none" />
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400"><th className="px-4 py-3">Placement</th><th className="px-4 py-3">Max per page</th><th className="px-4 py-3">Rates (CPM by tier)</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-sm text-neutral-500">No placements match.</td></tr>}
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

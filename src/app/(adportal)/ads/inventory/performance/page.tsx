"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [fc, setFc] = useState<any>(null);
  useEffect(() => { fetch("/api/ads/forecasts").then((r) => (r.ok ? r.json() : null)).then(setFc).catch(() => {}); }, []);
  const rows: any[] = fc?.placements ?? [];
  const fmt = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Inventory Performance</h1>
        <p className="mt-1 text-sm text-neutral-500">The next 14 days of inventory: projected, booked, and still available, per placement.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400"><th className="px-4 py-3">Placement</th><th className="px-4 py-3">Projected</th><th className="px-4 py-3">Booked</th><th className="px-4 py-3">Available</th><th className="px-4 py-3">Floor CPM</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-sm text-neutral-500">No forecast data.</td></tr>}
            {rows.map((p) => (
              <tr key={p.key} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{p.name}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{p.has_forecast ? fmt(p.projected) : "No forecast"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{fmt(p.booked)}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{fmt(p.available)}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">${(Number(p.cpm_cents ?? 0) / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

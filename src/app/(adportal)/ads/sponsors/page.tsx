"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { fetch("/api/ads/sponsors").then((r) => (r.ok ? r.json() : { sponsors: [] })).then((d) => setRows(d.sponsors ?? [])).catch(() => {}); }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Sponsor Campaigns</h1>
        <p className="mt-1 text-sm text-neutral-500">Campaigns carrying a sponsor — the sponsor records on this account.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400"><th className="px-4 py-3">Sponsor</th><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Disclosure</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Runs</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-sm text-neutral-500">No sponsor campaigns on record.</td></tr>}
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{s.sponsor_name}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{s.campaign_name ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{s.disclosure ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{s.status}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{s.starts_at ? new Date(s.starts_at).toLocaleDateString("en-US") : "—"}{s.ends_at ? ` → ${new Date(s.ends_at).toLocaleDateString("en-US")}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

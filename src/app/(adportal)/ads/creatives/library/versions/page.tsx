"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [lib, setLib] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] }))
      .then((d) => setLib(d.creatives ?? [])).catch(() => {});
  }, []);

  const sorted = [...lib].sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Versions</h1>
        <p className="mt-1 text-sm text-neutral-500">Creative version history.</p>
      </div>
      <div className="mb-6 rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Creatives don't keep a version history in this system — editing a creative updates it in place, so the only version signal is when it last changed. Most recently changed creatives:</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Creative</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last changed</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/creatives/library/${c.id}`} className="font-medium text-neutral-900 hover:underline">{c.name}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{c.status}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{c.updated_at ? new Date(c.updated_at).toLocaleString("en-US") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

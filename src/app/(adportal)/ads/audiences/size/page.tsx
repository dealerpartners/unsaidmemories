"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [auds, setAuds] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/audiences").then((r) => (r.ok ? r.json() : { audiences: [] }))
      .then((d) => setAuds(d.audiences ?? [])).catch(() => {});
  }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Size</h1>
        <p className="mt-1 text-sm text-neutral-500">Your audiences by their recorded size and reach.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Audience</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Reach</th>
            </tr>
          </thead>
          <tbody>
            {auds.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-sm text-neutral-500">No audiences yet.</td></tr>}
            {[...auds].sort((x, y) => (y.size ?? 0) - (x.size ?? 0)).map((a) => (
              <tr key={a.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/audiences/${a.id}`} className="font-medium text-neutral-900 hover:underline">{a.name}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{a.size != null ? Number(a.size).toLocaleString("en-US") : "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{a.reach != null ? Number(a.reach).toLocaleString("en-US") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-neutral-400">A dash means no size was recorded for that audience — sizes aren't estimated for saved audiences in this system.</p>
    </div>
  );
}

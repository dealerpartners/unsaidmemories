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
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Age</h1>
        <p className="mt-1 text-sm text-neutral-500">Audiences grouped by the age range they target.</p>
      </div>
      <div className="space-y-4">
        {(() => {
          const groups = new Map<string, any[]>();
          for (const a of auds) {
            for (const k of (a.targeting?.age_range ? [a.targeting.age_range] : [])) {
              if (!groups.has(k)) groups.set(k, []);
              groups.get(k)!.push(a);
            }
          }
          if (groups.size === 0) return <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">No saved audience targets an age range yet.</div>;
          return [...groups.entries()].map(([k, items]) => (
            <div key={k} className="rounded-xl border border-neutral-100 bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-900">{k}</h3>
                <span className="text-xs text-neutral-500">{items.length} audience{items.length === 1 ? "" : "s"}</span>
              </div>
              <ul className="mt-3 space-y-1">
                {items.map((a) => (
                  <li key={a.id} className="text-sm text-neutral-600"><Link href={`/ads/audiences/${a.id}`} className="hover:underline">{a.name}</Link></li>
                ))}
              </ul>
            </div>
          ));
        })()}
      </div>
    </div>
  );
}

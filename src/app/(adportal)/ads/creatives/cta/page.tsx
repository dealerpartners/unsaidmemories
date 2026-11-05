"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [lib, setLib] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] }))
      .then((d) => setLib(d.creatives ?? [])).catch(() => {});
  }, []);

  const groups = new Map<string, any[]>();
  for (const c of lib) {
    const k = (c.cta ?? "").trim() || "(none)";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">CTA</h1>
        <p className="mt-1 text-sm text-neutral-500">Creatives grouped by their call-to-action.</p>
      </div>
      <div className="space-y-4">
        {[...groups.entries()].map(([k, items]) => (
          <div key={k} className="rounded-xl border border-neutral-100 bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900">{k}</h3>
              <span className="text-xs text-neutral-500">{items.length} creative{items.length === 1 ? "" : "s"}</span>
            </div>
            <ul className="mt-3 space-y-1">
              {items.map((c) => (
                <li key={c.id} className="text-sm text-neutral-600"><Link href={`/ads/creatives/library/${c.id}`} className="hover:underline">{c.name}</Link> <span className="text-neutral-400">· {c.status}</span></li>
              ))}
            </ul>
          </div>
        ))}
        {lib.length === 0 && <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">No creatives yet.</div>}
      </div>
    </div>
  );
}

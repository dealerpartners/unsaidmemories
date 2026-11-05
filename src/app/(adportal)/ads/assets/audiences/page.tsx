"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [auds, setAuds] = useState<any[]>([]);
  useEffect(() => { fetch("/api/ads/audiences").then((r) => (r.ok ? r.json() : { audiences: [] })).then((d) => setAuds(d.audiences ?? [])).catch(() => {}); }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Audience Assets</h1>
        <p className="mt-1 text-sm text-neutral-500">Your saved audiences — the same records as the Audiences section, kept here with your other assets.</p>
      </div>
      <div className="space-y-3">
        {auds.length === 0 && <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">No audiences yet. <Link href="/ads/assets/audiences/create" className="font-medium text-neutral-900 underline">Create one</Link>.</div>}
        {auds.map((a) => (
          <div key={a.id} className="rounded-xl border border-neutral-100 bg-white p-5">
            <Link href={`/ads/assets/audiences/${a.id}`} className="text-sm font-semibold text-neutral-900 hover:underline">{a.name}</Link>
            <p className="mt-1 text-sm text-neutral-600">{[a.targeting?.locations?.join(", "), a.targeting?.languages?.join(", "), a.targeting?.age_range, a.targeting?.gender, a.targeting?.devices?.join(", ")].filter(Boolean).join(" · ") || "No facets set"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [a, setA] = useState<any>(null);
  useEffect(() => { fetch(`/api/ads/audiences/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => setA(d?.audience ?? d)).catch(() => {}); }, [id]);
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400"><Link href="/ads/assets/audiences" className="hover:underline">Audience Assets</Link></p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">{a ? a.name : "Loading…"}</h1>
      </div>
      {a && (
        <div className="max-w-2xl space-y-2 rounded-xl border border-neutral-100 bg-white p-6 text-sm">
          <div className="flex justify-between"><span className="text-neutral-500">Locations</span><span className="font-medium text-neutral-900">{a.targeting?.locations?.join(", ") || "—"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Languages</span><span className="font-medium text-neutral-900">{a.targeting?.languages?.join(", ") || "—"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Devices</span><span className="font-medium text-neutral-900">{a.targeting?.devices?.join(", ") || "—"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Age range</span><span className="font-medium text-neutral-900">{a.targeting?.age_range ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Gender</span><span className="font-medium text-neutral-900">{a.targeting?.gender ?? "—"}</span></div>
          <p className="pt-3"><Link href={`/ads/audiences/${a.id}/edit`} className="font-medium text-neutral-900 underline">Edit in the Audiences section</Link></p>
        </div>
      )}
    </div>
  );
}

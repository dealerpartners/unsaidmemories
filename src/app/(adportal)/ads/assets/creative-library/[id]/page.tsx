"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [c, setC] = useState<any>(null);
  useEffect(() => { fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] })).then((d) => setC((d.creatives ?? []).find((x: any) => String(x.id) === String(id)) ?? null)).catch(() => {}); }, [id]);
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400"><Link href="/ads/assets/creative-library" className="hover:underline">Creative Library</Link></p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">{c ? c.name : "Loading…"}</h1>
      </div>
      {c && (
        <div className="max-w-2xl space-y-2 rounded-xl border border-neutral-100 bg-white p-6 text-sm">
          <div className="flex justify-between"><span className="text-neutral-500">Status</span><span className="font-medium text-neutral-900">{c.status}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Campaign</span><span className="font-medium text-neutral-900">{c.campaign_name ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Headline</span><span className="font-medium text-neutral-900">{c.headline ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Destination</span><span className="font-medium text-neutral-900">{c.click_url ?? "—"}</span></div>
          <p className="pt-3"><Link href={`/ads/creatives/library/${c.id}`} className="font-medium text-neutral-900 underline">Edit in the Creatives section</Link></p>
        </div>
      )}
    </div>
  );
}

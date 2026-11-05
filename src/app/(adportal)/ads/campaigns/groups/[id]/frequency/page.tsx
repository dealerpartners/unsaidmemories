"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [g, setG] = useState<any>(null);
  useEffect(() => {
    fetch(`/api/ads/groups/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => setG(d?.group ?? null)).catch(() => {});
  }, [id]);
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">{g ? <><Link href="/ads/campaigns/groups" className="hover:underline">Groups</Link> · <Link href={`/ads/campaigns/groups/${g.id}`} className="hover:underline">{g.name}</Link></> : "Group"}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">Group Frequency</h1>
        <p className="mt-1 text-sm text-neutral-500">How often the same person hears this group's ads.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Frequency isn't tracked at any level of this system — delivery records impressions per campaign and placement, not per person — so there is no frequency setting for a group and no frequency number to show. Nothing is configured here rather than a cap that couldn't be enforced.</p>
      </div>
    </div>
  );
}

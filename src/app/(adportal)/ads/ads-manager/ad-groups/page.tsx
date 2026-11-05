"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [groups, setGroups] = useState<any[]>([]);
  useEffect(() => { fetch("/api/ads/groups").then((r) => (r.ok ? r.json() : { groups: [] })).then((d) => setGroups(d.groups ?? [])).catch(() => {}); }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Ad Groups</h1>
        <p className="mt-1 text-sm text-neutral-500">Creative groups inside campaigns — a group's creatives serve only while the group and its campaign are active.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400"><th className="px-4 py-3">Group</th><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Creatives</th></tr></thead>
          <tbody>
            {groups.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-sm text-neutral-500">No groups yet.</td></tr>}
            {groups.map((g) => (
              <tr key={g.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/campaigns/groups/${g.id}`} className="font-medium text-neutral-900 hover:underline">{g.name}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{g.campaign_name ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{g.status}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{g.creative_count ?? g.creatives?.length ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

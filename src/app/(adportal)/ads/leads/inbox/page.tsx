"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
const nameOf = (l: any) => [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email || "Unnamed lead";

export default function Page() {

  const [leads, setLeads] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/leads").then((r) => (r.ok ? r.json() : { leads: [] })).then((d) => setLeads(d.leads ?? [])).catch(() => {});
  }, []);
  const shown = leads;
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Lead Inbox</h1>
        <p className="mt-1 text-sm text-neutral-500">The newest captures first — the inbox view of the same lead records.</p>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Captured</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-sm text-neutral-500">No leads captured yet.</td></tr>}
            {shown.map((l) => (
              <tr key={l.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/leads/${l.id}`} className="font-medium text-neutral-900 hover:underline">{nameOf(l)}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{l.email ?? l.phone ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{l.source ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{l.campaign_name ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{l.status ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{l.created_at ? new Date(l.created_at).toLocaleDateString("en-US") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

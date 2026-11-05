"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const nameOf = (l: any) => [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email || "Unnamed lead";
export default function Page() {

  const [leads, setLeads] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/leads").then((r) => (r.ok ? r.json() : { leads: [] })).then((d) => setLeads(d.leads ?? [])).catch(() => {});
  }, []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Messaging</h1>
        <p className="mt-1 text-sm text-neutral-500">Reach a lead through the contact details they gave.</p>
      </div>
      <div className="space-y-2">
        {leads.length === 0 && <p className="text-sm text-neutral-500">No leads captured yet.</p>}
        {leads.map((l) => (
          <div key={l.id} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-4">
            <div>
              <p className="text-sm font-medium text-neutral-900">{nameOf(l)}</p>
              <p className="text-xs text-neutral-500">{l.source ?? ""} · {l.status ?? ""}</p>
            </div>
            <div className="flex gap-2 text-xs">
              {l.email && <a href={`mailto:${l.email}`} className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-200">Email</a>}
              {l.phone && <a href={`tel:${l.phone}`} className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-200">Call</a>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-neutral-400">There's no in-portal message thread — contact runs through the email address or phone number the lead provided.</p>
    </div>
  );
}

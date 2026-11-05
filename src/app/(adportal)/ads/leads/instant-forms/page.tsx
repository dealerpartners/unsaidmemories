"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [leads, setLeads] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/leads").then((r) => (r.ok ? r.json() : { leads: [] })).then((d) => setLeads(d.leads ?? [])).catch(() => {});
  }, []);
  const forms = leads.filter((l) => /form/i.test(l.source ?? ""));
  const bySource = new Map<string, number>();
  for (const l of forms) bySource.set(l.source, (bySource.get(l.source) ?? 0) + 1);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Instant Forms</h1>
        <p className="mt-1 text-sm text-neutral-500">Lead forms attached to ads, and what they have captured.</p>
      </div>
      <div className="max-w-2xl space-y-4">
        <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
          <p>Captured leads from form sources: <span className="font-medium text-neutral-900">{forms.length}</span>.</p>
          {[...bySource.entries()].map(([s, n]) => (
            <div key={s} className="mt-2 flex justify-between"><span className="text-neutral-500">{s}</span><span className="font-medium text-neutral-900">{n}</span></div>
          ))}
          <p className="mt-4">One thing to know: the capture endpoint behind lead forms is live, but no form trigger is wired into the current (v2) campaign builder — attaching a lead form to a new campaign is a product decision that hasn't been built yet, so this page reports captures rather than offering a form builder that wouldn't connect to anything.</p>
          <p className="mt-3"><Link href="/ads/leads" className="font-medium text-neutral-900 underline">See the captured leads</Link></p>
        </div>
      </div>
    </div>
  );
}

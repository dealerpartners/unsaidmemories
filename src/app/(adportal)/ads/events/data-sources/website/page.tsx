"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [leads, setLeads] = useState<any[]>([]);
  useEffect(() => { fetch("/api/ads/leads").then((r) => (r.ok ? r.json() : { leads: [] })).then((d) => setLeads(d.leads ?? [])).catch(() => {}); }, []);
  const mine = leads.filter((l) => /web|site/i.test(l.source ?? ""));
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Website Source</h1>
        <p className="mt-1 text-sm text-neutral-500">Lead captures that arrive from the website.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Captures on record from this source: <span className="font-medium text-neutral-900">{mine.length}</span>.</p>
        <p className="mt-3">Website submissions are recorded as leads with the source marked at capture. The forms themselves are part of the website, not configured in the ads portal.</p>
        <p className="mt-3"><Link href="/ads/leads" className="font-medium text-neutral-900 underline">See them in the Leads Center</Link></p>
      </div>
    </div>
  );
}

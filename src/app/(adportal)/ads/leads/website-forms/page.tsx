"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {

  const [leads, setLeads] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/leads").then((r) => (r.ok ? r.json() : { leads: [] })).then((d) => setLeads(d.leads ?? [])).catch(() => {});
  }, []);
  const web = leads.filter((l) => /web|site|form/i.test(l.source ?? ""));
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Website Forms</h1>
        <p className="mt-1 text-sm text-neutral-500">Leads captured from forms on the website.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p><span className="font-medium text-neutral-900">{web.length}</span> lead{web.length === 1 ? "" : "s"} carry a website/form source. Website form submissions are recorded as leads with their source marked; the forms themselves are managed with the website's content, not from the ads portal.</p>
        <p className="mt-3"><Link href="/ads/leads/filter" className="font-medium text-neutral-900 underline">Filter the lead list by source</Link></p>
      </div>
    </div>
  );
}

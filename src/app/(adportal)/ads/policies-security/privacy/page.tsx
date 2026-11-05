"use client";

import Link from "next/link";
import { useEffect, useState } from "react";


export default function Page() {
  const [leads, setLeads] = useState<any[]>([]);
  useEffect(() => { fetch("/api/ads/leads").then((r) => (r.ok ? r.json() : { leads: [] })).then((d) => setLeads(d.leads ?? [])).catch(() => {}); }, []);
  const sources = new Set(leads.map((l) => l.source).filter(Boolean));
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Privacy & Data Policies</h1>
        <p className="mt-1 text-sm text-neutral-500">What data this system collects for ads, and what it doesn't.</p>
      </div>
      <div className="max-w-3xl space-y-3 rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>Delivery data is aggregates: impressions, clicks and spend per campaign and per placement. The system does not record per-person exposure, build audience profiles from delivery, or collect demographic breakdowns of listeners.</p>
        <p>Lead captures are the personal data ads produce — name, email and phone as given on the form — stored on the lead record with its source ({sources.size} source{sources.size === 1 ? "" : "s"} on record, {leads.length} leads). They are visible under <Link href="/ads/leads" className="font-medium text-neutral-900 underline">Leads Center</Link> and exportable from there.</p>
        <p>Data retention periods aren't configurable settings in this system — the consent-rate and retention controls that used to be shown on this page weren't connected to anything, so they've been replaced by the facts above.</p>
      </div>
    </div>
  );
}

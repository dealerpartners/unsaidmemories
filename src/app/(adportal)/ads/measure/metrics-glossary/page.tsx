"use client";

import { useState } from "react";
import { PageHeader, FormField } from "@/components/ads/ui";

const metrics = [
  { term: "CPM", definition: "Cost per thousand impressions. Calculated as (total spend / impressions) × 1,000." },
  { term: "CPC", definition: "Cost per click. Total spend divided by total clicks." },
  { term: "CPA", definition: "Cost per acquisition/action. Total spend divided by conversions." },
  { term: "CTR", definition: "Click-through rate. Clicks divided by impressions, expressed as a percentage." },
  { term: "ROAS", definition: "Return on ad spend. Revenue generated divided by ad spend." },
  { term: "GMV", definition: "Gross merchandise value. Total value of merchandise sold through ads." },
  { term: "SVI", definition: "Synchronized Visual Impressions. Impressions where audio and visual components are displayed together." },
  { term: "Reach", definition: "The number of unique users who saw your ad at least once." },
  { term: "Frequency", definition: "The average number of times each user sees your ad." },
  { term: "Viewability", definition: "Percentage of impressions that were viewable (met IAB standard)." },
  { term: "VTR", definition: "View-through rate. Video views divided by impressions." },
  { term: "Engagement Rate", definition: "Interactions (likes, comments, shares, clicks) divided by impressions." },
];

export default function MetricsGlossaryPage() {
  const [search, setSearch] = useState("");
  const filtered = search ? metrics.filter(m => m.term.toLowerCase().includes(search.toLowerCase()) || m.definition.toLowerCase().includes(search.toLowerCase())) : metrics;

  return (
    <div>
      <PageHeader title="Metrics Glossary" description="Searchable definitions for all advertising metrics." />
      <div className="mb-4">
        <FormField label="Search metrics">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. CPM, ROAS…" className="w-full max-w-md rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none" />
        </FormField>
      </div>
      <div className="space-y-3">
        {filtered.map((m) => (
          <div key={m.term} className="rounded-xl border border-neutral-100 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">{m.term}</h3>
            <p className="mt-1 text-sm text-neutral-500">{m.definition}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { PageHeader, FilterBar, DataTable } from "@/components/ads/ui";

const metrics = [
  { id: "m1", metric: "Impressions", category: "Delivery", definition: "The number of times your ad was displayed to users" },
  { id: "m2", metric: "Reach", category: "Delivery", definition: "The number of unique users who saw your ad" },
  { id: "m3", metric: "Frequency", category: "Delivery", definition: "Average number of times each user saw your ad (Impressions ÷ Reach)" },
  { id: "m4", metric: "Clicks", category: "Engagement", definition: "The number of times users clicked on your ad" },
  { id: "m5", metric: "CTR", category: "Engagement", definition: "Click-through rate — Clicks ÷ Impressions × 100" },
  { id: "m6", metric: "Video Views", category: "Engagement", definition: "Number of times your video ad was viewed (various thresholds: 2s, 25%, 50%, 100%)" },
  { id: "m7", metric: "CPM", category: "Cost", definition: "Cost per thousand impressions — Total Spend ÷ Impressions × 1000" },
  { id: "m8", metric: "CPC", category: "Cost", definition: "Cost per click — Total Spend ÷ Clicks" },
  { id: "m9", metric: "CPA", category: "Cost", definition: "Cost per acquisition — Total Spend ÷ Conversions" },
  { id: "m10", metric: "ROAS", category: "Conversion", definition: "Return on ad spend — Revenue ÷ Total Spend" },
  { id: "m11", metric: "Conversion Rate", category: "Conversion", definition: "Conversions ÷ Clicks × 100" },
  { id: "m12", metric: "SVI", category: "Audio", definition: "Stream Volume Index — relative streaming activity driven by your ads" },
  { id: "m13", metric: "Audio Completion Rate", category: "Audio", definition: "Percentage of audio ads listened to completion" },
  { id: "m14", metric: "Brand Lift", category: "Brand", definition: "Measured increase in brand awareness, consideration, or favorability" },
  { id: "m15", metric: "Ad Recall", category: "Brand", definition: "Percentage of users who remember seeing your ad" },
];

const columns = [
  { key: "metric", label: "Metric" },
  { key: "category", label: "Category" },
  { key: "definition", label: "Definition" },
];

export default function MetricsGlossaryPage() {
  const [search, setSearch] = useState("");
  const filtered = metrics.filter((m) =>
    m.metric.toLowerCase().includes(search.toLowerCase()) ||
    m.definition.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Metrics Glossary"
        description="Definitions and calculations for all advertising metrics."
        breadcrumbs={[{ label: "Analytics", href: "/ads/analytics" }, { label: "Metrics Glossary" }]}
      />
      <FilterBar searchPlaceholder="Search metrics…" onSearch={setSearch} filters={[{ label: "Category", options: ["Delivery", "Engagement", "Cost", "Conversion", "Audio", "Brand"] }]} />
      <DataTable columns={columns} data={filtered} />
    </div>
  );
}

"use client";

import { PageHeader, MetricCard } from "@/components/ads/ui";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="Third-Party Measurement"
        description="External verification vendors — viewability, brand safety, attention."
        breadcrumbs={[{ label: "Analytics", href: "/ads/analytics" }, { label: "Third-Party" }]}
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Active Vendors" value="0" />
        <MetricCard label="Avg. Viewability" value="—" />
        <MetricCard label="Brand Safety Score" value="—" />
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>No third-party measurement vendors are connected to this account. No viewability, fraud, or brand-safety feeds exist here, so there are no vendor rows or scores to show.</p>
        <p className="mt-2">When a vendor is connected, it will appear here with its real sync state and metrics.</p>
      </div>
    </div>
  );
}

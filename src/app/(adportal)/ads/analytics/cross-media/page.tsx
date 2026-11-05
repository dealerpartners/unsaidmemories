"use client";

import { useEffect, useState } from "react";
import { PageHeader, TabBar, MetricCard, DataTable } from "@/components/ads/ui";

const compact = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(Math.round(n)));
const money = (n: number) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

export default function Page() {
  const [tab, setTab] = useState(0);
  const [t, setT] = useState<{ impressions: number; clicks: number; spend: number; reach: number } | null>(null);
  useEffect(() => {
    fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setT(d.totals); }).catch(() => {});
  }, []);
  const totals = t ?? { impressions: 0, clicks: 0, spend: 0, reach: 0 };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Cross-Media Measurement"
        description="Reach and frequency across channels — this system is one channel; its real figures are below."
        breadcrumbs={[{ label: "Analytics", href: "/ads/analytics" }, { label: "Cross-Media" }]}
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <MetricCard label="Reach (this platform)" value={compact(totals.reach)} />
        <MetricCard label="Impressions" value={compact(totals.impressions)} />
        <MetricCard label="Clicks" value={compact(totals.clicks)} />
        <MetricCard label="Spend" value={money(totals.spend)} />
      </div>
      <TabBar tabs={["Channel Comparison", "Overlap Analysis", "Reach Curves"]} active={tab} onChange={setTab} />
      {tab === 0 && (
        <DataTable
          columns={[
            { key: "name", label: "Channel", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
            { key: "impressions", label: "Impressions" },
            { key: "clicks", label: "Clicks" },
            { key: "spend", label: "Spend" },
          ]}
          data={[{ id: "platform", name: "This platform (Ad Center)", impressions: compact(totals.impressions), clicks: compact(totals.clicks), spend: money(totals.spend) }]}
        />
      )}
      {tab === 1 && (
        <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
          <h3 className="text-sm font-semibold text-neutral-900 mb-2">Channel Overlap</h3>
          <p>Overlap needs at least two channels. No external channel (search, social, TV, other networks) is connected to this system, so there is no second audience to de-duplicate against — the figures on the Comparison tab are this platform alone, not a cross-media total.</p>
        </div>
      )}
      {tab === 2 && (
        <div className="rounded-xl border border-neutral-100 bg-white p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-2">Reach Curves</h3>
          <p className="text-sm text-neutral-500">Reach curves model marginal reach per dollar across channels. With a single connected channel there is no curve to draw; this platform's reach and spend are on the Comparison tab.</p>
        </div>
      )}
    </div>
  );
}

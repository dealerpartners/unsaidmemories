"use client";

import { useEffect, useState } from "react";
import { PageHeader, CardGrid, MetricCard } from "@/components/ads/ui";

export default function AdsManagerPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  useEffect(() => {
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : null)).then((d) => setCampaigns(d?.campaigns ?? [])).catch(() => {});
    fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null)).then((d) => setTotals(d?.totals ?? null)).catch(() => {});
  }, []);
  const fmtN = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");
  const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Ads Manager"
        description="Launch campaigns, manage resources, monitor data, and optimize performance."
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Campaigns" value={String(campaigns.filter((c) => c.status === "active").length)} delta={`of ${campaigns.length} total`} deltaType="neutral" />
        <MetricCard label="Total Spend" value={totals ? money(totals.spend) : "—"} delta="last 30 days" deltaType="neutral" />
        <MetricCard label="Impressions" value={totals ? fmtN(totals.impressions) : "—"} delta="last 30 days" deltaType="neutral" />
        <MetricCard label="Avg. CPM" value={totals && totals.impressions > 0 ? `$${((totals.spend / totals.impressions) * 1000).toFixed(2)}` : "—"} delta="derived from spend and impressions" deltaType="neutral" />
      </div>

      <h2 className="mb-4 text-lg font-semibold text-neutral-900">Quick Actions</h2>
      <CardGrid
        cards={[
          { label: "Campaigns", description: "View, create, and manage all your advertising campaigns", href: "/ads/ads-manager/campaigns" },
          { label: "Ad Groups", description: "Organize your ads by audience, placement, and targeting", href: "/ads/ads-manager/ad-groups" },
          { label: "Ads", description: "Manage individual ad creatives and their configurations", href: "/ads/ads-manager/ads" },
          { label: "Monitor", description: "Track delivery health, spend pacing, and performance alerts", href: "/ads/ads-manager/monitor" },
          { label: "Optimize", description: "Get budget, audience, placement, and creative recommendations", href: "/ads/ads-manager/optimize" },
          { label: "Create Campaign", description: "Launch a new campaign with the guided 7-step wizard", href: "/ads/ads-manager/campaigns/create" },
        ]}
      />
    </div>
  );
}

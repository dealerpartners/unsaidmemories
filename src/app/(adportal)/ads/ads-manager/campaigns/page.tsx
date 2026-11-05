"use client";

import { useEffect, useState } from "react";
import { PageHeader, FilterBar, DataTable, StatusBadge, Button, BulkActionToolbar } from "@/components/ads/ui";

type ApiCampaign = { id: string; name: string; status: string; tier_code: string; daily_budget_cents: string | null; lifetime_budget_cents: string | null; lifetime_spend_cents: string | null };
type Row = { id: string; name: string; objective: string; status: string; budget: string; spend: string; impressions: string; clicks: string; ctr: string };

const dollars = (cents: string | number | null) => "$" + Math.round(Number(cents ?? 0) / 100).toLocaleString("en-US");
const compact = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(n));

const columns = [
  { key: "name", label: "Campaign" },
  { key: "objective", label: "Objective" },
  { key: "status", label: "Status", render: (_: any, row: any) => <StatusBadge status={row.status} /> },
  { key: "budget", label: "Budget" },
  { key: "spend", label: "Spend" },
  { key: "impressions", label: "Impressions" },
  { key: "clicks", label: "Clicks" },
  { key: "ctr", label: "CTR" },
];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : { campaigns: [] })),
      fetch("/api/ads/analytics?days=365").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([cd, ad]) => {
      const delivery = new Map<string, { impressions: number; clicks: number }>();
      for (const row of ad?.byCampaign ?? []) {
        delivery.set(String(row.campaign_id ?? row.id), { impressions: Number(row.impressions ?? 0), clicks: Number(row.clicks ?? 0) });
      }
      setCampaigns(((cd.campaigns ?? []) as ApiCampaign[]).map((c) => {
        const d = delivery.get(c.id) ?? { impressions: 0, clicks: 0 };
        const lifetime = Number(c.lifetime_budget_cents ?? 0);
        const daily = Number(c.daily_budget_cents ?? 0);
        return {
          id: c.id, name: c.name, objective: c.tier_code,
          status: ["active", "paused", "draft", "completed", "pending_review", "rejected", "in_review"].includes(c.status) ? c.status : "draft",
          budget: lifetime > 0 ? dollars(lifetime) : daily > 0 ? dollars(daily) + "/day" : "—",
          spend: dollars(c.lifetime_spend_cents),
          impressions: compact(d.impressions), clicks: compact(d.clicks),
          ctr: d.impressions > 0 ? ((d.clicks / d.impressions) * 100).toFixed(1) + "%" : "—",
        };
      }));
    }).catch(() => {});
  }, []);

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Campaigns"
        description="View and manage all your advertising campaigns."
        breadcrumbs={[{ label: "Ads Manager", href: "/ads/ads-manager" }, { label: "Campaigns" }]}
        actions={
          <Button onClick={() => window.location.href = "/ads/ads-manager/campaigns/create"}>
            + Create Campaign
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Search campaigns…"
        onSearch={setSearch}
        filters={[
          { label: "Status", options: ["Active", "Paused", "Draft", "In Review"] },
          { label: "Objective", options: ["Reach", "Traffic", "Video Views", "Sales", "Music Streams", "Lead Generation"] },
        ]}
      />

      <BulkActionToolbar
        selectedCount={selected.size}
        actions={[
          { label: "Pause", onClick: () => {} },
          { label: "Resume", onClick: () => {} },
          { label: "Duplicate", onClick: () => {} },
          { label: "Delete", onClick: () => {}, variant: "danger" },
        ]}
      />

      <DataTable
        columns={columns}
        data={filtered}
        selectable
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        rowHref={(row) => `/ads/campaigns/${row.id}`}
      />
    </div>
  );
}

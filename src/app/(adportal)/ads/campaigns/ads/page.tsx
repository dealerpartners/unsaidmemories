"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, MetricCard, StatusBadge, DataTable, FilterBar, BulkActionToolbar, EmptyState, Button, TabBar, FormField, EstimatePanel, PolicyPanel, ActivityTimeline, CardGrid, StatusToggle } from "@/components/ads/ui";

type AdRow = { id: string; name: string; campaign: string; status: string; type: string; results: string };

export default function AdsPage() {
  const [ads, setAds] = useState<AdRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] }))
      .then((d) => {
        setAds(((d.creatives ?? []) as { id: string; name: string; campaign_name: string | null; status: string; type?: string }[]).map((c) => ({
          id: c.id, name: c.name, campaign: c.campaign_name ?? "—",
          status: ["active", "paused", "draft", "completed", "pending_review", "rejected", "in_review"].includes(c.status) ? c.status : "draft",
          type: c.type ? c.type.charAt(0).toUpperCase() + c.type.slice(1) : "Image",
          results: "—",
        })));
      }).catch(() => {});
  }, []);
  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const toggleAll = () => { setSelected(selected.size === ads.length ? new Set() : new Set(ads.map((item: any) => item.id))); };

  return (
    <div>
      <PageHeader title="Ads" description="View and manage all ads across campaigns." actions={<Link href="/ads/campaigns/create"><Button>Create Ad</Button></Link>} />

      <FilterBar searchPlaceholder="Search ads…" onSearch={setSearch} filters={[
          { label: "Status", options: ["Active", "Paused", "Draft"] },
          { label: "Type", options: ["Audio", "Video", "Companion", "Carousel"] }
      ]} />

      <BulkActionToolbar selectedCount={selected.size} actions={[
          { label: "Pause", onClick: () => {} },
          { label: "Resume", onClick: () => {} },
          { label: "Duplicate", onClick: () => {} },
          { label: "Delete", onClick: () => {}, variant: "danger" as const }
      ]} />

      <DataTable
        columns={[
          { key: "name", label: "Ad", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
          { key: "campaign", label: "Campaign" },
          { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v as any} /> },
          { key: "type", label: "Type" },
          { key: "results", label: "Results" }
        ]}
        data={ads.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))}
        selectable
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
      />
    </div>
  );
}

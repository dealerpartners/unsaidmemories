"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, MetricCard, StatusBadge, DataTable, FilterBar, BulkActionToolbar, EmptyState, Button, TabBar, FormField, EstimatePanel, PolicyPanel, ActivityTimeline, CardGrid, StatusToggle } from "@/components/ads/ui";

type GroupRow = { id: string; name: string; campaign: string; status: string; budget: string; results: string };

export default function AdGroupsPage() {
  const [adgroups, setAdgroups] = useState<GroupRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then(async (cd) => {
        const out: GroupRow[] = [];
        for (const c of (cd.campaigns ?? []) as { id: string; name: string }[]) {
          const gd = await fetch(`/api/ads/campaigns/${c.id}/groups`).then((r) => (r.ok ? r.json() : { groups: [] })).catch(() => ({ groups: [] }));
          for (const g of gd.groups ?? []) {
            out.push({
              id: String(g.id), name: g.name, campaign: c.name,
              status: ["active", "paused", "draft"].includes(g.status) ? g.status : "draft",
              budget: "—",
              results: Number(g.creative_count ?? 0) > 0 ? `${g.creative_count} creatives` : "—",
            });
          }
        }
        setAdgroups(out);
      }).catch(() => {});
  }, []);
  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const toggleAll = () => { setSelected(selected.size === adgroups.length ? new Set() : new Set(adgroups.map((item: any) => item.id))); };

  return (
    <div>
      <PageHeader title="Ad Groups" description="Manage ad groups across all campaigns." actions={<Link href="/ads/campaigns/create"><Button>Create Ad Group</Button></Link>} />

      <FilterBar searchPlaceholder="Search adgroups…" onSearch={setSearch} filters={[
          { label: "Status", options: ["Active", "Paused", "Draft"] },
          { label: "Campaign", options: ["All campaigns"] }
      ]} />

      <BulkActionToolbar selectedCount={selected.size} actions={[
          { label: "Pause", onClick: () => {} },
          { label: "Resume", onClick: () => {} },
          { label: "Delete", onClick: () => {}, variant: "danger" as const }
      ]} />

      <DataTable
        columns={[
          { key: "name", label: "Ad Group", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
          { key: "campaign", label: "Campaign" },
          { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v as any} /> },
          { key: "budget", label: "Budget" },
          { key: "results", label: "Results" }
        ]}
        data={adgroups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))}
        selectable
        rowHref={(row) => `/ads/campaigns/groups/${row.id}`}
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
      />
    </div>
  );
}

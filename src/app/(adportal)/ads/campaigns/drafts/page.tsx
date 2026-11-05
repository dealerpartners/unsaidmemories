"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, MetricCard, StatusBadge, DataTable, FilterBar, BulkActionToolbar, EmptyState, Button, TabBar, FormField, EstimatePanel, PolicyPanel, ActivityTimeline, CardGrid, StatusToggle } from "@/components/ads/ui";

type ApiCampaign = { id: string; name: string; status: string; tier_code: string; updated_at: string | null };
type DraftRow = { id: string; name: string; objective: string; status: string; modified: string };

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/ads/campaigns")
      .then((r) => { if (!r.ok) throw new Error("campaigns"); return r.json(); })
      .then((data) => setDrafts(((data.campaigns ?? []) as ApiCampaign[])
        .filter((c) => c.status === "draft")
        .map((c) => ({ id: c.id, name: c.name, objective: c.tier_code, status: "draft", modified: c.updated_at ? new Date(c.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—" }))))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);
  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const toggleAll = () => { setSelected(selected.size === drafts.length ? new Set() : new Set(drafts.map((item: any) => item.id))); };

  return (
    <div>
      <PageHeader title="Drafts" description="Resume or discard campaign drafts."  />

      <FilterBar searchPlaceholder="Search drafts…" onSearch={setSearch} />

      <BulkActionToolbar selectedCount={selected.size} actions={[
          { label: "Resume editing", onClick: () => {} },
          { label: "Discard", onClick: () => {}, variant: "danger" as const }
      ]} />

      {loading ? (
        <div className="py-16 text-center text-sm text-neutral-500">Loading drafts…</div>
      ) : failed ? (
        <EmptyState title="Drafts unavailable" description="The campaigns service didn't answer. Your drafts are safe — try again shortly." />
      ) : drafts.length === 0 ? (
        <EmptyState title="No drafts" description="Campaigns you save as drafts will show up here so you can resume or discard them." action={{ label: "Create Campaign", href: "/ads/campaigns/create" }} />
      ) : (
      <DataTable
        columns={[
          { key: "name", label: "Draft", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
          { key: "objective", label: "Objective" },
          { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v as any} /> },
          { key: "modified", label: "Modified" }
        ]}
        data={search ? drafts.filter((d) => d.name.toLowerCase().includes(search.toLowerCase())) : drafts}
        selectable
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
      />
      )}
    </div>
  );
}

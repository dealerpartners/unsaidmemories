"use client";
import { useEffect, useState } from "react";
import { PageHeader, MetricCard, DataTable, StatusBadge, FilterBar } from "@/components/ads/ui";

const compact = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(Math.round(n)));
const money = (n: number) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

export default function Page() {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [search, setSearch] = useState("");
  useEffect(() => {
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] }))
      .then((d) => setRows(((d.creatives ?? []) as any[]).map((c) => ({
        id: String(c.id), name: c.name, status: ["active", "paused", "draft", "completed", "pending_review", "rejected", "in_review"].includes(c.status) ? c.status : "draft",
        metric: c.campaign_name ?? "—", extra: "—",
      })))).catch(() => {});
  }, []);
  return (
    <div>
      <PageHeader title="Ads" description="Your ads and their review state. Results roll up per campaign in this system, so per-ad delivery shows a dash." breadcrumbs={[{ label: "Ad Center", href: "/ads" }, { label: "Analytics", href: "/ads/analytics" }, { label: "Ads" }]} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard label="Ads" value={String(rows.length)} />
        <MetricCard label="Campaigns" value={String(new Set(rows.map((r) => r.metric)).size)} />
        <MetricCard label="Per-ad results" value="—" />
      </div>
      <FilterBar searchPlaceholder="Search ads…" onSearch={setSearch} filters={[{ label: "Status", options: ["Active", "Paused", "Draft"] }]} />
      <DataTable
        columns={[
          { key: "name", label: "Ad", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
          { key: "status", label: "Status", render: (_: string, row: any) => <StatusBadge status={row.status} /> },
          { key: "metric", label: "Campaign" },
          { key: "extra", label: "Results" },
        ]}
        data={rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))}
      />
    </div>
  );
}

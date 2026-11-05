"use client";
import { useEffect, useState } from "react";
import { PageHeader, MetricCard, DataTable, StatusBadge, FilterBar } from "@/components/ads/ui";

const compact = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(Math.round(n)));
const money = (n: number) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

export default function Page() {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [creatives, setCreatives] = useState(0);
  const [search, setSearch] = useState("");
  useEffect(() => {
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then(async (cd) => {
        const out: Record<string, string>[] = [];
        let cc = 0;
        for (const c of (cd.campaigns ?? []) as { id: string; name: string }[]) {
          const gd = await fetch(`/api/ads/campaigns/${c.id}/groups`).then((r) => (r.ok ? r.json() : { groups: [] })).catch(() => ({ groups: [] }));
          for (const g of gd.groups ?? []) {
            cc += Number(g.creative_count ?? 0);
            out.push({ id: String(g.id), name: g.name, status: ["active", "paused", "draft"].includes(g.status) ? g.status : "draft", metric: c.name, extra: "—" });
          }
        }
        setRows(out); setCreatives(cc);
      }).catch(() => {});
  }, []);
  return (
    <div>
      <PageHeader title="Ad Groups" description="Ad groups across your campaigns. Results roll up per campaign in this system, so per-group delivery shows a dash." breadcrumbs={[{ label: "Ad Center", href: "/ads" }, { label: "Analytics", href: "/ads/analytics" }, { label: "Ad Groups" }]} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard label="Ad groups" value={String(rows.length)} />
        <MetricCard label="Creatives" value={String(creatives)} />
        <MetricCard label="Per-group results" value="—" />
      </div>
      <FilterBar searchPlaceholder="Search ad groups…" onSearch={setSearch} filters={[{ label: "Status", options: ["Active", "Paused", "Draft"] }]} />
      <DataTable
        columns={[
          { key: "name", label: "Ad Group", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
          { key: "status", label: "Status", render: (_: string, row: any) => <StatusBadge status={row.status} /> },
          { key: "metric", label: "Campaign" },
          { key: "extra", label: "Results" },
        ]}
        data={rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))}
      />
    </div>
  );
}

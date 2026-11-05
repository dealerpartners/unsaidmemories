"use client";
import { useEffect, useState } from "react";
import { PageHeader, MetricCard, DataTable, FilterBar } from "@/components/ads/ui";

const compact = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(Math.round(n)));
const money = (n: number) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

type Totals = { impressions: number; clicks: number; spend: number };

export default function Page() {
  const [totals, setTotals] = useState<Totals>({ impressions: 0, clicks: 0, spend: 0 });
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [search, setSearch] = useState("");
  useEffect(() => {
    fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setTotals(d.totals);
        setRows((d.byPlacement ?? []).map((pl: any) => ({
          id: String(pl.placement), name: String(pl.placement),
          metric: compact(Number(pl.impressions ?? 0)), extra: compact(Number(pl.clicks ?? 0)), third: money(Number(pl.spend ?? 0)),
        })));
      }).catch(() => {});
  }, []);
  return (
    <div>
      <PageHeader title="Delivery" description="Delivery by placement, last 30 days." breadcrumbs={[{ label: "Ad Center", href: "/ads" }, { label: "Analytics", href: "/ads/analytics" }, { label: "Delivery" }]} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard label="Impressions" value={compact(totals.impressions)} />
        <MetricCard label="Clicks" value={compact(totals.clicks)} />
        <MetricCard label="Spend" value={money(totals.spend)} />
      </div>
      <FilterBar searchPlaceholder="Search placements…" onSearch={setSearch} filters={[]} />
      <DataTable
        columns={[
          { key: "name", label: "Placement", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
          { key: "metric", label: "Impressions" },
          { key: "extra", label: "Clicks" },
          { key: "third", label: "Spend" },
        ]}
        data={rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))}
      />
    </div>
  );
}

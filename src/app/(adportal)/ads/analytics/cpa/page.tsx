"use client";
import { useEffect, useState } from "react";
import { PageHeader, MetricCard, DataTable, StatusBadge, FilterBar } from "@/components/ads/ui";

const compact = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(Math.round(n)));
const money = (n: number) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
const money2 = (n: number) => "$" + Number(n).toFixed(2);
const ctrPct = (c: number, i: number) => (i > 0 ? ((c / i) * 100).toFixed(2) + "%" : "—");

type Totals = { impressions: number; clicks: number; conversions: number; spend: number; reach: number; ctr: number; cpa: number };
type Row = Record<string, string>;

export default function Page() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const t = totals ?? { impressions: 0, clicks: 0, conversions: 0, spend: 0, reach: 0, ctr: 0, cpa: 0 };

  useEffect(() => {
    fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setTotals(d.totals); setRows(d.byCampaign ?? []); } })
      .catch(() => {});
  }, []);

  const data: Row[] = rows.map((r: any) => ({
    id: String(r.id), name: r.name, status: r.status, metric: Number(r.leads ?? 0) > 0 ? money2(r.spend / Number(r.leads)) : "—", extra: compact(Number(r.leads ?? 0)),
  })).filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <PageHeader title="CPA" description="Cost per captured lead, last 30 days. Leads are the actions this system captures." breadcrumbs={[{ label: "Ad Center", href: "/ads" }, { label: "Analytics", href: "/ads/analytics" }, { label: "CPA" }]} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard label="Avg CPA" value={t.cpa > 0 ? money2(t.cpa) : "—"} />
        <MetricCard label="Leads" value={compact(rows.reduce((a: number, r: any) => a + Number(r.leads ?? 0), 0))} />
        <MetricCard label="Spend" value={money(t.spend)} />
      </div>
      <FilterBar searchPlaceholder="Search campaigns…" onSearch={setSearch} filters={[{ label: "Status", options: ["Active", "Paused", "Draft"] }]} />
      <DataTable
        columns={[
          { key: "name", label: "Name", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
          { key: "status", label: "Status", render: (_: string, row: any) => <StatusBadge status={row.status} /> },
{ key: "metric", label: "Cost / lead" },
          { key: "extra", label: "Leads" }
        ]}
        data={data}
      />
    </div>
  );
}

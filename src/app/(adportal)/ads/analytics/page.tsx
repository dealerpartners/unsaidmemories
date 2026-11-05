"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, MetricCard, DataTable, StatusBadge, Button } from "@/components/ads/ui";

const compact = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(Math.round(n)));
const money = (n: number) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
const money2 = (n: number) => "$" + Number(n).toFixed(2);
const VIEWS = ["Campaign", "Ad Group", "Ad", "Audience", "Creative", "Delivery"];
const OPTIONAL_COLS = [
  { key: "spend", label: "Spend" },
  { key: "impressions", label: "Impressions" },
  { key: "clicks", label: "Clicks" },
  { key: "ctr", label: "CTR" },
  { key: "cpa", label: "CPA" },
  { key: "leads", label: "Leads" },
] as const;

type Totals = { impressions: number; clicks: number; conversions: number; spend: number; reach: number; ctr: number; cpa: number };

export default function AnalyticsOverview() {
  const [view, setView] = useState(0);
  const [days, setDays] = useState(30);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [byCampaign, setByCampaign] = useState<any[]>([]);
  const [byPlacement, setByPlacement] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [creatives, setCreatives] = useState<any[]>([]);
  const [showCols, setShowCols] = useState(false);
  const [cols, setCols] = useState<Set<string>>(new Set(OPTIONAL_COLS.map((c) => c.key)));

  useEffect(() => {
    fetch(`/api/ads/analytics?days=${days}`).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setTotals(d.totals); setByCampaign(d.byCampaign ?? []); setByPlacement(d.byPlacement ?? []); } })
      .catch(() => {});
  }, [days]);

  useEffect(() => {
    if (view === 1 && groups.length === 0) {
      fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : { campaigns: [] }))
        .then(async (cd) => {
          const out: any[] = [];
          for (const c of (cd.campaigns ?? []) as { id: string; name: string }[]) {
            const gd = await fetch(`/api/ads/campaigns/${c.id}/groups`).then((r) => (r.ok ? r.json() : { groups: [] })).catch(() => ({ groups: [] }));
            for (const g of gd.groups ?? []) out.push({ id: String(g.id), name: g.name, status: g.status, campaign: c.name });
          }
          setGroups(out);
        }).catch(() => {});
    }
    if ((view === 2) && creatives.length === 0) {
      fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] }))
        .then((d) => setCreatives(d.creatives ?? [])).catch(() => {});
    }
  }, [view, groups.length, creatives.length]);

  const t = totals ?? { impressions: 0, clicks: 0, conversions: 0, spend: 0, reach: 0, ctr: 0, cpa: 0 };

  const campaignRows = useMemo(() => byCampaign.map((r) => ({
    id: String(r.id), name: r.name, status: r.status,
    spend: money(Number(r.spend ?? 0)), impressions: compact(Number(r.impressions ?? 0)), clicks: compact(Number(r.clicks ?? 0)),
    ctr: Number(r.impressions ?? 0) > 0 ? ((Number(r.clicks) / Number(r.impressions)) * 100).toFixed(2) + "%" : "—",
    cpa: Number(r.leads ?? 0) > 0 ? money2(Number(r.spend) / Number(r.leads)) : "—",
    leads: compact(Number(r.leads ?? 0)),
  })), [byCampaign]);

  const exportCsv = () => {
    let head: string[] = []; let lines: string[] = [];
    if (view === 0) {
      head = ["Campaign", "Status", "Spend", "Impressions", "Clicks", "CTR", "CPA", "Leads"];
      lines = campaignRows.map((r) => [r.name, r.status, r.spend, r.impressions, r.clicks, r.ctr, r.cpa, r.leads].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    } else if (view === 5) {
      head = ["Placement", "Impressions", "Clicks", "Spend"];
      lines = byPlacement.map((pl) => [pl.placement, pl.impressions, pl.clicks, pl.spend].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    } else {
      return;
    }
    const blob = new Blob([head.join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `analytics-${VIEWS[view].toLowerCase().replace(/\s+/g, "-")}-${days}d.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const campaignColumns = [
    { key: "name", label: "Campaign", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
    { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v as any} /> },
    ...OPTIONAL_COLS.filter((c) => cols.has(c.key)).map((c) => ({ key: c.key, label: c.label })),
  ];

  return (
    <div>
      <PageHeader title="Analytics Overview" description="Diagnose performance across campaigns, ad groups, ads, and audiences." />

      {/* Breakdown selector */}
      <div className="mb-6 flex gap-2">
        {VIEWS.map((v, i) => (
          <button key={v} onClick={() => setView(i)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${i === view ? "bg-[#f2eafe] text-[#6942c2]" : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`}>{v}</button>
        ))}
      </div>

      {/* Metric scorecards — real totals; ROAS has no revenue source and shows a dash */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <MetricCard label="Spend" value={money(t.spend)} />
        <MetricCard label="Impressions" value={compact(t.impressions)} />
        <MetricCard label="Clicks" value={compact(t.clicks)} />
        <MetricCard label="CTR" value={(t.ctr * 100).toFixed(2) + "%"} />
        <MetricCard label="CPA" value={t.cpa > 0 ? money2(t.cpa) : "—"} />
        <MetricCard label="ROAS" value="—" />
      </div>

      {/* Date + column controls */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700">
            <option value={30}>Last 30 days</option>
            <option value={7}>Last 7 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        <div className="flex gap-2">
          {(view === 0) && <Button variant="secondary" onClick={() => setShowCols(!showCols)}>Customize columns</Button>}
          {(view === 0 || view === 5) && <Button variant="secondary" onClick={exportCsv}>Export</Button>}
        </div>
      </div>
      {showCols && view === 0 && (
        <div className="mb-4 flex flex-wrap gap-4 rounded-xl border border-neutral-100 bg-white p-4">
          {OPTIONAL_COLS.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={cols.has(c.key)} onChange={() => { const n = new Set(cols); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); setCols(n); }} className="h-4 w-4 rounded border-neutral-300" />
              {c.label}
            </label>
          ))}
        </div>
      )}

      {view === 0 && (
        <DataTable columns={campaignColumns} data={campaignRows} rowHref={(row) => `/ads/campaigns/${row.id}`} />
      )}
      {view === 5 && (
        <DataTable
          columns={[
            { key: "name", label: "Placement", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
            { key: "impressions", label: "Impressions" },
            { key: "clicks", label: "Clicks" },
            { key: "spend", label: "Spend" },
          ]}
          data={byPlacement.map((pl) => ({ id: String(pl.placement), name: String(pl.placement), impressions: compact(Number(pl.impressions ?? 0)), clicks: compact(Number(pl.clicks ?? 0)), spend: money(Number(pl.spend ?? 0)) }))}
        />
      )}
      {view === 1 && (
        <DataTable
          columns={[
            { key: "name", label: "Ad Group", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
            { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v as any} /> },
            { key: "campaign", label: "Campaign" },
            { key: "results", label: "Results" },
          ]}
          data={groups.map((g) => ({ ...g, results: "—" }))}
        />
      )}
      {view === 2 && (
        <DataTable
          columns={[
            { key: "name", label: "Ad", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
            { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v as any} /> },
            { key: "campaign_name", label: "Campaign" },
            { key: "results", label: "Results" },
          ]}
          data={creatives.map((c: any) => ({ id: String(c.id), name: c.name, status: ["active", "paused", "draft", "completed", "pending_review", "rejected", "in_review"].includes(c.status) ? c.status : "draft", campaign_name: c.campaign_name ?? "—", results: "—" }))}
        />
      )}
      {(view === 3 || view === 4) && (
        <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
          {view === 3
            ? "Delivery isn't broken down by audience in this system — the ledger records impressions, clicks, spend and leads per campaign and placement, with no demographic split. Campaign and Delivery views show everything that is recorded."
            : "Creative performance rolls up to the campaign in this system — there is no per-creative delivery table. The Ad view lists your creatives; the Campaign view carries their results."}
        </div>
      )}
    </div>
  );
}

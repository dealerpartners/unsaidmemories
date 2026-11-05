"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PageHeader, MetricCard, DataTable, StatusBadge, StatusToggle, TabBar, Button,
  FilterBar, CustomColumns, BreakdownSelector, ExportButton, ActionsDropdown,
} from "@/components/ads/ui";

/* ═══════════════════════════════════════════════════════════
   Dashboard /ads/dashboard [P]
   
   Spec structure:
   ├── Dashboard Sections [C] — tabs: Campaigns, Audience, Tools, Analytics, Management, GMV Max, Settings
   ├── Campaign Performance Table [C]
   │   ├── All Campaigns View [L → Ads Manager / Campaigns]
   │   ├── Campaign Count Display [C]
   │   ├── CTR Destination [L → Analytics / CTR]
   │   ├── Clickers Destination [L → Analytics / Click Metrics]
   │   ├── Search & Filter [C]
   │   ├── Custom Columns [C]
   │   ├── Breakdown [C]
   │   ├── Campaign On / Off Toggle [C]
   │   ├── Actions Dropdown [C]
   │   └── View Report [L → Analytics & Measurement / Reports]
   └── GMV Max [P]
   ═══════════════════════════════════════════════════════════ */

const SECTIONS = ["Campaigns", "Audience", "Tools", "Analytics", "Management", "GMV Max", "Settings"];


const ALL_COLUMNS = [
  { key: "name", label: "Campaign" },
  { key: "status", label: "Status" },
  { key: "objective", label: "Objective" },
  { key: "budget", label: "Budget" },
  { key: "spend", label: "Spend" },
  { key: "results", label: "Results" },
  { key: "ctr", label: "CTR" },
  { key: "clickers", label: "Clickers" },
  { key: "roas", label: "ROAS" },
];

const BREAKDOWN_OPTIONS = [
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "placement", label: "Placement" },
  { key: "region", label: "Region" },
  { key: "device", label: "Device" },
];

const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtN = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");
const badgeFor = (st: string) => (["active", "paused", "draft", "completed", "pending_review", "rejected", "in_review"].includes(st) ? st : "draft");

export default function DashboardPage() {
  const [section, setSection] = useState(0);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [byCampaign, setByCampaign] = useState<any[]>([]);
  const [byPlacement, setByPlacement] = useState<any[]>([]);
  const [audiences, setAudiences] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const load = () => {
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : null)).then((d) => setCampaigns(d?.campaigns ?? [])).catch(() => {});
    fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setTotals(d.totals); setByCampaign(d.byCampaign ?? []); setByPlacement(d.byPlacement ?? []); } }).catch(() => {});
    fetch("/api/ads/audiences").then((r) => (r.ok ? r.json() : null)).then((d) => setAudiences(d?.audiences ?? [])).catch(() => {});
    fetch("/api/ads/settings?kind=general").then((r) => (r.ok ? r.json() : null)).then((d) => { const cols = d?.settings?.dashboard_columns; if (Array.isArray(cols) && cols.length) setVisibleCols(cols); }).catch(() => {});
  };
  useEffect(load, []);
  const perf = new Map(byCampaign.map((c: any) => [String(c.id), c]));
  const rows = campaigns.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())).map((c) => {
    const a = perf.get(String(c.id));
    const imps = a?.impressions ?? 0;
    const clicks = a?.clicks ?? 0;
    return {
      id: String(c.id), name: c.name, status: badgeFor(c.status) as any, rawStatus: c.status,
      objective: a?.objective ?? c.tier_code ?? "—",
      budget: c.lifetime_budget_cents && Number(c.lifetime_budget_cents) > 0 ? `${money(Number(c.lifetime_budget_cents) / 100)} total` : c.daily_budget_cents ? `${money(Number(c.daily_budget_cents) / 100)}/day` : "—",
      spend: money(a?.spend ?? 0),
      results: imps > 0 ? `${fmtN(clicks)} clicks` : "—",
      ctr: imps > 0 ? `${((clicks / imps) * 100).toFixed(2)}%` : "—",
      clickers: clicks > 0 ? fmtN(clicks) : "—",
      roas: "—",
      on: c.status === "active",
    };
  });
  const campaignToggles: Record<string, boolean> = Object.fromEntries(rows.map((r) => [r.id, r.on]));
  const [visibleCols, setVisibleCols] = useState(ALL_COLUMNS.map((c) => c.key));
  const [breakdown, setBreakdown] = useState("");

  const toggleCampaign = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const call = row.rawStatus === "active"
      ? fetch(`/api/ads/campaigns/${id}/pause`, { method: "POST" })
      : (row.rawStatus === "paused" || row.rawStatus === "approved")
        ? fetch(`/api/ads/campaigns/${id}/launch`, { method: "POST" })
        : Promise.resolve(null);
    Promise.resolve(call).then(() => load()).catch(() => load());
  };
  const exportCSV = () => {
    const csv = ["Campaign,Status,Budget,Spend,Clicks,CTR", ...rows.map((r) => [r.name, r.rawStatus, r.budget, r.spend, r.clickers, r.ctr].join(","))].join("\n");
    const a2 = document.createElement("a");
    a2.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a2.download = "dashboard-campaigns.csv";
    a2.click();
    URL.revokeObjectURL(a2.href);
  };

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your advertising performance, campaign health, and recent activity."
        breadcrumbs={[{ label: "Ad Center" }, { label: "Dashboard" }]}
        actions={
          <Link href="/ads/ads-manager/campaigns/create">
            <Button>Create Campaign</Button>
          </Link>
        }
      />

      {/* ─── Dashboard Sections Tabs ─── */}
      <TabBar tabs={SECTIONS} active={section} onChange={setSection} />

      {/* ═══ Campaigns Section ═══ */}
      {section === 0 && (
        <div>
          {/* KPI Scorecards */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Total Spend" value={totals ? money(totals.spend) : "—"} delta="last 30 days" deltaType="neutral" />
            <MetricCard label="Impressions" value={totals ? fmtN(totals.impressions) : "—"} delta="last 30 days" deltaType="neutral" />
            <MetricCard label="Clicks" value={totals ? fmtN(totals.clicks) : "—"} delta="last 30 days" deltaType="neutral" />
            <MetricCard label="Reach" value={totals ? fmtN(totals.reach) : "—"} delta="last 30 days" deltaType="neutral" />
          </div>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="CTR" value={totals ? `${((totals.ctr ?? 0) * 100).toFixed(2)}%` : "—"} delta="last 30 days" deltaType="neutral" />
            <MetricCard label="Cost per lead" value={totals && totals.cpa ? money(totals.cpa) : "—"} delta={totals && totals.cpa ? "per captured lead" : "no leads captured"} deltaType="neutral" />
            <MetricCard label="ROAS" value="—" delta="no revenue source connected" deltaType="neutral" />
            <MetricCard label="Active Campaigns" value={String(campaigns.filter((c) => c.status === "active").length)} delta={`of ${campaigns.length} total`} deltaType="neutral" />
          </div>

          {/* ─── Campaign Performance Table ─── */}
          <div className="space-y-3">
            {/* Toolbar: Search, Filter, Custom Columns, Breakdown, Export, Count */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[200px]">
                <FilterBar
                  onSearch={setSearch}
                  searchPlaceholder="Search campaigns…"
                  filters={[
                    { label: "Status", options: ["Active", "Paused", "Draft"] },
                    { label: "Objective", options: ["Awareness", "Consideration", "Conversion"] },
                  ]}
                />
              </div>
              <CustomColumns allColumns={ALL_COLUMNS} visibleKeys={visibleCols} onChange={setVisibleCols} />
              <BreakdownSelector options={BREAKDOWN_OPTIONS} selected={breakdown} onChange={setBreakdown} />
              <ExportButton
                onExportCSV={exportCSV}
                onExportPDF={() => window.print()}
              />
            </div>

            {/* Campaign Count Display */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-neutral-500">
                <span className="font-medium text-neutral-900">{rows.length}</span> campaigns
              </p>
              <Link href="/ads/ads-manager/campaigns" className="text-xs font-medium text-neutral-500 hover:text-neutral-700">
                View all in Ads Manager →
              </Link>
            </div>

            {/* Data Table */}
            <DataTable
              columns={[
                ...(visibleCols.includes("name") ? [{ key: "name" as const, label: "Campaign", render: (v: string, row: typeof campaigns[0]) => (
                  <div className="flex items-center gap-2">
                    <StatusToggle active={campaignToggles[row.id]} onToggle={() => toggleCampaign(row.id)} />
                    <span className="font-medium text-neutral-900">{v}</span>
                  </div>
                )}] : []),
                ...(visibleCols.includes("status") ? [{ key: "status" as const, label: "Status", render: (_: string, row: typeof campaigns[0]) => <StatusBadge status={row.status} /> }] : []),
                ...(visibleCols.includes("objective") ? [{ key: "objective" as const, label: "Objective" }] : []),
                ...(visibleCols.includes("budget") ? [{ key: "budget" as const, label: "Budget" }] : []),
                ...(visibleCols.includes("spend") ? [{ key: "spend" as const, label: "Spend", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> }] : []),
                ...(visibleCols.includes("results") ? [{ key: "results" as const, label: "Results" }] : []),
                ...(visibleCols.includes("ctr") ? [{ key: "ctr" as const, label: "CTR", render: (v: string) => v === "—" ? <span className="text-neutral-400">{v}</span> : <Link href="/ads/analytics/ctr" className="font-medium text-neutral-900 hover:text-blue-600 hover:underline">{v}</Link> }] : []),
                ...(visibleCols.includes("clickers") ? [{ key: "clickers" as const, label: "Clickers", render: (v: string) => v === "—" ? <span className="text-neutral-400">{v}</span> : <Link href="/ads/analytics/click-metrics" className="font-medium text-neutral-900 hover:text-blue-600 hover:underline">{v}</Link> }] : []),
                ...(visibleCols.includes("roas") ? [{ key: "roas" as const, label: "ROAS", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> }] : []),
                { key: "_actions" as const, label: "", render: (_: string, row: typeof campaigns[0]) => (
                  <div className="flex items-center gap-2">
                    <ActionsDropdown actions={[
                      { label: "Edit", onClick: () => { window.location.href = `/ads/campaigns/${row.id}/edit`; } },
                      { label: "Duplicate", onClick: () => { fetch(`/api/ads/campaigns/${row.id}/duplicate`, { method: "POST" }).then(() => load()).catch(() => {}); } },
                      { label: row.on ? "Pause" : "Resume", onClick: () => toggleCampaign(row.id) },
                      { label: "Delete", variant: "danger" as const, onClick: () => { fetch(`/api/ads/campaigns/${row.id}`, { method: "DELETE" }).then(() => load()).catch(() => {}); } },
                    ]} />
                    <Link href="/ads/analytics/reports" className="text-xs font-medium text-neutral-500 hover:text-neutral-700">View Report</Link>
                  </div>
                )},
              ].filter(Boolean)}
              data={rows}
              rowHref={(row) => `/ads/campaigns/${row.id}`}
            />
          </div>
          {breakdown && breakdown !== "placement" && (
            <p className="text-sm text-neutral-500">Breakdown by {breakdown} isn't collected by this system — delivery is recorded per campaign and per placement, so the campaign table above is the finest real cut.</p>
          )}
          {breakdown === "placement" && (
            <div className="rounded-xl border border-neutral-100 bg-white">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
                    <th className="px-4 py-3">Placement</th>
                    <th className="px-4 py-3">Impressions</th>
                    <th className="px-4 py-3">Clicks</th>
                    <th className="px-4 py-3">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {byPlacement.map((bp: any) => (
                    <tr key={bp.placement} className="border-b border-neutral-50">
                      <td className="px-4 py-3 text-sm font-medium text-neutral-900">{bp.placement}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{fmtN(bp.impressions)}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{fmtN(bp.clicks)}</td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{money(bp.spend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ Audience Section ═══ */}
      {section === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Total Audiences" value={String(audiences.length)} delta="saved on this account" deltaType="neutral" />
            <MetricCard label="Custom Audiences" value={String(audiences.length)} delta="every saved audience is a custom set" deltaType="neutral" />
            <MetricCard label="Lookalike Audiences" value="—" delta="lookalikes aren't a feature here" deltaType="neutral" />
            <MetricCard label="Total Reach" value={audiences.some((a) => a.reach != null) ? fmtN(audiences.reduce((sum, a) => sum + (Number(a.reach) || 0), 0)) : "—"} delta="summed recorded reach" deltaType="neutral" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Audience List", desc: "View and manage all audiences", href: "/ads/audiences" },
              { label: "Create Audience", desc: "Build a new custom or lookalike audience", href: "/ads/audiences/create" },
              { label: "Demographic Targeting", desc: "Set age, gender, and language defaults", href: "/ads/audiences/demographic" },
              { label: "Location Targeting", desc: "Define geographic targeting rules", href: "/ads/audiences/location" },
              { label: "Music Behavior", desc: "Target by listening behavior and genre", href: "/ads/audiences/music-behavior" },
              { label: "Artist Affinity", desc: "Target by artist and creator affinity", href: "/ads/audiences/artist-affinity" },
            ].map((card) => (
              <Link key={card.label} href={card.href} className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50">
                <h3 className="text-sm font-semibold text-neutral-900">{card.label}</h3>
                <p className="mt-1 text-xs text-neutral-500">{card.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Tools Section ═══ */}
      {section === 2 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Keyword Planner", href: "/ads/tools/keyword-planner" },
            { label: "Negative Keywords", href: "/ads/tools/negative-keywords" },
            { label: "Video Editor", href: "/ads/tools/video-editor" },
            { label: "Integrations", href: "/ads/tools/integrations" },
            { label: "MCP Server", href: "/ads/tools/mcp" },
            { label: "AI Skills", href: "/ads/ai/skills" },
          ].map((card) => (
            <Link key={card.label} href={card.href} className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50">
              <h3 className="text-sm font-semibold text-neutral-900">{card.label}</h3>
            </Link>
          ))}
        </div>
      )}

      {/* ═══ Analytics Section ═══ */}
      {section === 3 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Impressions" value={totals ? fmtN(totals.impressions) : "—"} delta="last 30 days" deltaType="neutral" />
            <MetricCard label="CTR" value={totals ? `${((totals.ctr ?? 0) * 100).toFixed(2)}%` : "—"} delta="last 30 days" deltaType="neutral" />
            <MetricCard label="Leads captured" value={totals ? fmtN(totals.leads ?? 0) : "—"} delta="conversion events aren't recorded" deltaType="neutral" />
            <MetricCard label="ROAS" value="—" delta="no revenue source connected" deltaType="neutral" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Analytics Dashboard", href: "/ads/analytics" },
              { label: "Campaign Analytics", href: "/ads/analytics/campaigns" },
              { label: "Audience Insights", href: "/ads/analytics/audience" },
              { label: "Attribution Analytics", href: "/ads/analytics/attribution" },
              { label: "Reports", href: "/ads/analytics/reports" },
              { label: "Experiments", href: "/ads/analytics/experiments" },
            ].map((card) => (
              <Link key={card.label} href={card.href} className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50">
                <h3 className="text-sm font-semibold text-neutral-900">{card.label}</h3>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Management Section ═══ */}
      {section === 4 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Ads Manager", desc: "Campaigns, ad groups, ads", href: "/ads/ads-manager" },
            { label: "Placement & Inventory", desc: "Manage ad placements", href: "/ads/inventory" },
            { label: "CatalogD Manager", desc: "Product catalog and feeds", href: "/ads/catalog" },
            { label: "Events Manager", desc: "Conversion tracking", href: "/ads/events" },
            { label: "Automated Rules", desc: "Automation and alerts", href: "/ads/automated-rules" },
            { label: "Comments Manager", desc: "Ad comment moderation", href: "/ads/comments-manager" },
            { label: "Notification Center", desc: "Issues and announcements", href: "/ads/notifications" },
          ].map((card) => (
            <Link key={card.label} href={card.href} className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50">
              <h3 className="text-sm font-semibold text-neutral-900">{card.label}</h3>
              {card.desc && <p className="mt-1 text-xs text-neutral-500">{card.desc}</p>}
            </Link>
          ))}
        </div>
      )}

      {/* ═══ GMV Max Section ═══ */}
      {section === 5 && (
        <div>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="GMV Total" value="—" delta="no commerce feed connected" deltaType="neutral" />
            <MetricCard label="ROAS" value="—" delta="no revenue source connected" deltaType="neutral" />
            <MetricCard label="Avg. Order Value" value="—" delta="no commerce feed connected" deltaType="neutral" />
            <MetricCard label="Conv. Rate" value="—" delta="conversion events aren't recorded" deltaType="neutral" />
          </div>
          <div className="rounded-xl border border-neutral-100 bg-white p-6">
            <h3 className="text-sm font-semibold text-neutral-900 mb-4">GMV Max Performance</h3>
            <p className="text-sm text-neutral-500">GMV Max optimizes your campaigns for maximum gross merchandise value. View detailed performance metrics and optimization settings on the dedicated page.</p>
            <Link href="/ads/gmv-max" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-neutral-900 hover:text-blue-600">
              View GMV Max Dashboard →
            </Link>
          </div>
        </div>
      )}

      {/* ═══ Settings Section ═══ */}
      {section === 6 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Ad Settings", href: "/ads/settings" },
            { label: "API Access", href: "/ads/settings/api" },
            { label: "Brand Safety", href: "/ads/settings/brand-safety" },
            { label: "Notification Settings", href: "/ads/settings/notifications" },
            { label: "Targeting Defaults", href: "/ads/settings/targeting-defaults" },
            { label: "Account Settings", href: "/ads/account/settings" },
            { label: "Billing & Payment", href: "/ads/billing" },
            { label: "Team & Members", href: "/ads/account/team" },
            { label: "Policies & Security", href: "/ads/policies-security" },
          ].map((card) => (
            <Link key={card.label} href={card.href} className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50">
              <h3 className="text-sm font-semibold text-neutral-900">{card.label}</h3>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

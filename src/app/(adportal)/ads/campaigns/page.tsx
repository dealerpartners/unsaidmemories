"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, FilterBar, StatusBadge, DataTable, BulkActionToolbar, EmptyState, Button } from "@/components/ads/ui";

type ApiCampaign = {
  id: string; name: string; status: string; tier_code: string;
  starts_at: string | null; ends_at: string | null;
  daily_budget_cents: string | null; lifetime_budget_cents: string | null;
  lifetime_spend_cents: string | null; impressions_today: string | null;
  creative_count: number; group_count: number;
};
type CampaignRow = { id: string; name: string; status: "active" | "paused" | "draft" | "completed"; objective: string; budget: string; spend: string; results: string; date: string };

const money = (cents: string | null) => {
  const n = cents == null ? 0 : Number(cents);
  return "$" + Math.round(n / 100).toLocaleString("en-US");
};
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
function toRow(c: ApiCampaign): CampaignRow {
  const daily = Number(c.daily_budget_cents ?? 0);
  const lifetime = Number(c.lifetime_budget_cents ?? 0);
  return {
    id: c.id,
    name: c.name,
    status: (["active", "paused", "draft", "completed"].includes(c.status) ? c.status : "draft") as CampaignRow["status"],
    objective: c.tier_code,
    budget: daily > 0 ? money(c.daily_budget_cents) + "/day" : lifetime > 0 ? money(c.lifetime_budget_cents) + " total" : "—",
    spend: money(c.lifetime_spend_cents),
    results: c.impressions_today != null ? Number(c.impressions_today).toLocaleString("en-US") + " impressions today" : "—",
    date: c.starts_at && c.ends_at ? fmtDay(c.starts_at) + " – " + fmtDay(c.ends_at) : c.starts_at ? "From " + fmtDay(c.starts_at) : "Not set",
  };
}

export default function AllCampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/ads/campaigns")
      .then((r) => { if (!r.ok) throw new Error("campaigns"); return r.json(); })
      .then((data) => setCampaigns((data.campaigns ?? []).map(toRow)))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const toggleAll = () => { setSelected(selected.size === campaigns.length ? new Set() : new Set(campaigns.map(c => c.id))); };
  const filtered = search ? campaigns.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : campaigns;

  return (
    <div>
      <PageHeader
        title="All Campaigns"
        description="Find, compare, pause, duplicate, edit, and report on campaigns."
        actions={
          <Link href="/ads/campaigns/create" className="flex h-9 items-center gap-2 rounded-lg bg-[#f2eafe] px-4 text-sm font-medium text-[#6942c2] hover:bg-[#e7dbfc]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
            Create Campaign
          </Link>
        }
      />

      <FilterBar
        searchPlaceholder="Search campaigns…"
        onSearch={setSearch}
        filters={[
          { label: "Status", options: ["Active", "Paused", "Draft", "Completed"] },
          { label: "Objective", options: ["Awareness", "Consideration", "Conversions"] },
          { label: "Date range", options: ["Last 7 days", "Last 30 days", "Last 90 days", "Custom"] },
        ]}
      />

      <BulkActionToolbar
        selectedCount={selected.size}
        actions={[
          { label: "Pause", onClick: () => {} },
          { label: "Resume", onClick: () => {} },
          { label: "Duplicate", onClick: () => {} },
          { label: "Create report", onClick: () => {} },
          { label: "Delete", onClick: () => {}, variant: "danger" },
        ]}
      />

      {loading ? (
        <div className="py-16 text-center text-sm text-neutral-500">Loading campaigns…</div>
      ) : failed ? (
        <EmptyState title="Campaigns unavailable" description="The campaigns service didn't answer. Your campaigns are safe — try again shortly." />
      ) : campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet" description="Campaigns you create will show up here, with their budgets, spend, and results." action={{ label: "Create Campaign", href: "/ads/campaigns/create" }} />
      ) : (
      <DataTable
        columns={[
          { key: "name", label: "Campaign", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
          { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v as any} /> },
          { key: "objective", label: "Objective" },
          { key: "budget", label: "Budget" },
          { key: "spend", label: "Spend", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
          { key: "results", label: "Results" },
          { key: "date", label: "Date range", render: (v: string) => <span className="text-neutral-400">{v}</span> },
          {
            key: "id", label: "", className: "w-10",
            render: (_: any, row: any) => (
              <div className="flex items-center gap-1">
                <Link href={`/ads/campaigns/${row.id}/edit`} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" title="Edit">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </Link>
                <Link href={`/ads/campaigns/${row.id}`} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" title="Analytics">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 5-5" /></svg>
                </Link>
              </div>
            ),
          },
        ]}
        data={filtered}
        selectable
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        rowHref={(row) => `/ads/campaigns/${row.id}`}
      />
      )}
    </div>
  );
}

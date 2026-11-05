"use client";

import Link from "next/link";
import { MetricCard, StatusBadge, DataTable, PageHeader, FilterBar, BulkActionToolbar } from "@/components/ads/ui";
import { useEffect, useState } from "react";


const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtN = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");
const badgeFor = (st: string) => (["active", "paused", "draft", "completed", "pending_review", "rejected", "in_review"].includes(st) ? st : "draft");

export default function AdsDashboard() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [byCampaign, setByCampaign] = useState<any[]>([]);
  /* Account state (K1): one account for the whole site — a signed-in
   * shopper becomes an advertiser by activating on this same account
   * (POST /api/ads/account), never by a separate login. Until now the
   * dashboard rendered its empty shell in all three states below, so
   * a recognized user with no advertiser had no route forward. */
  const [acct, setAcct] = useState<"loading" | "signedout" | "inactive" | "active">("loading");
  const [activating, setActivating] = useState(false);
  useEffect(() => {
    fetch("/api/ads/account")
      .then(async (r) => {
        if (r.status === 401) { setAcct("signedout"); return; }
        const d = r.ok ? await r.json() : null;
        setAcct(d?.advertiser ? "active" : "inactive");
      })
      .catch(() => setAcct("inactive"));
  }, []);
  const activate = async () => {
    setActivating(true);
    try {
      const r = await fetch("/api/ads/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = r.ok ? await r.json() : null;
      if (d?.created) { window.location.assign("/ads/onboarding"); return; }
      if (d?.advertiser) { setAcct("active"); return; }
    } catch { /* fall through to re-enable the button */ }
    setActivating(false);
  };
  const load = () => {
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : null)).then((d) => setCampaigns(d?.campaigns ?? [])).catch(() => {});
    fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setTotals(d.totals); setByCampaign(d.byCampaign ?? []); } }).catch(() => {});
  };
  useEffect(load, []);
  const perf = new Map(byCampaign.map((c: any) => [String(c.id), c]));
  const rows = campaigns.map((c) => {
    const a = perf.get(String(c.id));
    const clicks = a?.clicks ?? 0;
    return {
      id: String(c.id), name: c.name, status: badgeFor(c.status) as any, rawStatus: c.status,
      objective: a?.objective ?? c.tier_code ?? "—",
      budget: c.lifetime_budget_cents && Number(c.lifetime_budget_cents) > 0 ? `${money(Number(c.lifetime_budget_cents) / 100)} total` : c.daily_budget_cents ? `${money(Number(c.daily_budget_cents) / 100)}/day` : "—",
      spend: money(a?.spend ?? 0),
      results: clicks > 0 ? `${fmtN(clicks)} clicks` : "—",
      delivery: c.status === "active" ? "Delivering" : c.status === "paused" ? "Paused" : c.status === "draft" ? "—" : c.status,
    };
  });
  const bulk = (kind: string) => {
    const ids = [...selected];
    Promise.all(ids.map((id) => {
      const row = rows.find((r) => r.id === id);
      if (kind === "delete") return fetch(`/api/ads/campaigns/${id}`, { method: "DELETE" });
      if (kind === "duplicate") return fetch(`/api/ads/campaigns/${id}/duplicate`, { method: "POST" });
      if (kind === "pause" && row?.rawStatus === "active") return fetch(`/api/ads/campaigns/${id}/pause`, { method: "POST" });
      if (kind === "resume" && (row?.rawStatus === "paused" || row?.rawStatus === "approved")) return fetch(`/api/ads/campaigns/${id}/launch`, { method: "POST" });
      return Promise.resolve(null);
    })).then(() => { setSelected(new Set()); load(); }).catch(() => load());
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((c) => c.id)));
  };

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Monitor account health and jump into optimization."
        actions={
          <Link href="/ads/campaigns/create" className="flex h-10 items-center gap-2 rounded-lg bg-[#f2eafe] px-5 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            Create Campaign
          </Link>
        }
      />

      {acct === "signedout" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-5">
          <div>
            <p className="text-sm font-semibold text-neutral-900">Sign in to the Ad Center</p>
            <p className="mt-1 text-sm text-neutral-600">
              Advertisers use the same account they shop with — one account for the store and the Ad Center.
            </p>
          </div>
          <Link href="/ads/signin" className="flex h-10 items-center gap-2 rounded-lg bg-[#f2eafe] px-5 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc]">
            Sign in
          </Link>
        </div>
      )}
      {acct === "inactive" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-5">
          <div>
            <p className="text-sm font-semibold text-neutral-900">Your account doesn’t have an advertiser account yet</p>
            <p className="mt-1 text-sm text-neutral-600">
              Activate it on this same account — no separate login, nothing new to remember. Then a short business profile, and you can run campaigns.
            </p>
          </div>
          <button onClick={activate} disabled={activating} className="flex h-10 items-center gap-2 rounded-lg bg-[#f2eafe] px-5 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc] disabled:opacity-60">
            {activating ? "Activating…" : "Activate advertiser account"}
          </button>
        </div>
      )}

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Spend" value={totals ? money(totals.spend) : "—"} delta="last 30 days" deltaType="neutral" />
        <MetricCard label="Impressions" value={totals ? fmtN(totals.impressions) : "—"} delta="last 30 days" deltaType="neutral" />
        <MetricCard label="CTR" value={totals ? `${((totals.ctr ?? 0) * 100).toFixed(2)}%` : "—"} delta="last 30 days" deltaType="neutral" />
        <MetricCard label="Cost per lead" value={totals && totals.cpa ? money(totals.cpa) : "—"} delta={totals && totals.cpa ? "per captured lead" : "no leads captured"} deltaType="neutral" />
      </div>

      {/* Delivery health */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <MetricCard label="Active campaigns" value={String(campaigns.filter((c) => c.status === "active").length)} />
        <MetricCard label="Total clicks" value={totals ? fmtN(totals.clicks) : "—"} delta="last 30 days" deltaType="neutral" />
        <MetricCard label="ROAS" value="—" delta="no revenue source connected" deltaType="neutral" />
      </div>

      {/* Bulk actions */}
      <BulkActionToolbar
        selectedCount={selected.size}
        actions={[
          { label: "Pause", onClick: () => bulk("pause") },
          { label: "Resume", onClick: () => bulk("resume") },
          { label: "Duplicate", onClick: () => bulk("duplicate") },
          { label: "Delete", onClick: () => bulk("delete"), variant: "danger" },
        ]}
      />

      {/* Campaign table */}
      <DataTable
        columns={[
          { key: "name", label: "Campaign", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
          { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v as any} /> },
          { key: "objective", label: "Objective" },
          { key: "budget", label: "Budget" },
          { key: "spend", label: "Spend", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
          { key: "results", label: "Results" },
          { key: "delivery", label: "Delivery", render: (v: string) => <span className={v === "Delivering" ? "text-emerald-600" : "text-neutral-500"}>{v}</span> },
        ]}
        data={rows}
        selectable
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        rowHref={(row) => `/ads/campaigns/${row.id}`}
      />
    </div>
  );
}

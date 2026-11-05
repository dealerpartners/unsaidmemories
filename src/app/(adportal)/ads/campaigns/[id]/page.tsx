"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { PageHeader, TabBar, MetricCard, StatusBadge, StatusToggle, DataTable, ActivityTimeline, Button, FormField } from "@/components/ads/ui";

type Campaign = {
  id: string; name: string; status: string; tier_code: string;
  special_category: string | null; starts_at: string | null; ends_at: string | null;
  daily_budget_cents: number; lifetime_budget_cents: number; lifetime_spend_cents: number;
  created_at: string; updated_at: string;
};
type ApiGroup = { id: string; name: string; status: string; creatives: unknown[] };
type ApiCreative = { id: string; group_id: string | null; name: string; status: string; asset_url: string | null; width: number | null; height: number | null };

const money = (cents: number) => "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
const money2 = (dollars: number) => "$" + dollars.toLocaleString("en-US", { maximumFractionDigits: 2 });
const compact = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "K" : String(n);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const creativeType = (c: ApiCreative) => {
  const u = (c.asset_url ?? "").toLowerCase();
  if (/\.(mp3|wav|ogg|m4a)(\?|$)/.test(u)) return "Audio";
  if (/\.(mp4|webm|mov)(\?|$)/.test(u)) return "Video";
  if (u) return "Image";
  return "—";
};
const badgeStatus = (st: string) => (["active", "paused", "draft", "completed", "pending_review", "rejected", "in_review"].includes(st) ? st : "draft");

export default function CampaignDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState(0);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [creatives, setCreatives] = useState<ApiCreative[]>([]);
  const [delivery, setDelivery] = useState<{ impressions: number; clicks: number; spend: number; conversions: number } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notfound" | "failed">("loading");
  const [name, setName] = useState("");
  const [dailyBudget, setDailyBudget] = useState("");
  const [specialCategory, setSpecialCategory] = useState("");
  const [saveNote, setSaveNote] = useState("");

  const load = () => {
    fetch(`/api/ads/campaigns/${id}`)
      .then(async (r) => {
        if (r.status === 404) { setState("notfound"); throw new Error("nf"); }
        if (!r.ok) throw new Error("detail");
        return r.json();
      })
      .then((data) => {
        setCampaign(data.campaign);
        setGroups(data.groups ?? []);
        setCreatives(data.creatives ?? []);
        setName(data.campaign.name ?? "");
        setDailyBudget(String(Math.round((data.campaign.daily_budget_cents ?? 0) / 100)));
        setSpecialCategory(data.campaign.special_category ?? "");
        setState("ready");
      })
      .catch((e) => { if (String(e?.message) !== "nf") setState("failed"); });
    fetch("/api/ads/analytics?days=365")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const row = (data?.byCampaign ?? []).find((c: Record<string, unknown>) => String(c.campaign_id ?? c.id) === String(id));
        if (row) setDelivery({ impressions: Number(row.impressions ?? 0), clicks: Number(row.clicks ?? 0), spend: Number(row.spend ?? 0), conversions: Number(row.conversions ?? 0) });
      })
      .catch(() => {});
  };
  useEffect(load, [id]);

  const isActive = campaign?.status === "active";
  const advance = () => {
    if (!campaign) return;
    // Real lifecycle endpoints: pause and launch are their own routes;
    // draft -> scheduled is a PATCH status transition. Full map:
    // draft/scheduled --launch--> preflight --admin--> approved
    // --launch--> active --pause--> paused --launch--> active.
    if (campaign.status === "active") {
      fetch(`/api/ads/campaigns/${id}/pause`, { method: "POST" }).then(() => load()).catch(() => {});
    } else if (campaign.status === "paused" || campaign.status === "approved") {
      fetch(`/api/ads/campaigns/${id}/launch`, { method: "POST" }).then(() => load()).catch(() => {});
    } else if (campaign.status === "draft") {
      fetch(`/api/ads/campaigns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "scheduled" }) })
        .then(() => load())
        .catch(() => {});
    }
  };
  const save = () => {
    setSaveNote("");
    fetch(`/api/ads/campaigns/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), daily_budget_cents: Math.max(0, Math.round(Number(dailyBudget || 0) * 100)), special_category: specialCategory || null }),
    })
      .then(async (r) => { if (!r.ok) throw new Error("save"); setSaveNote("Saved."); load(); })
      .catch(() => setSaveNote("Save failed — the campaign may be locked in its current status."));
  };

  if (state === "loading") return <div className="py-16 text-center text-sm text-neutral-500">Loading campaign…</div>;
  if (state === "notfound") return <div className="py-16 text-center text-sm text-neutral-500">Campaign not found — it may belong to another advertiser account.</div>;
  if (state === "failed" || !campaign) return <div className="py-16 text-center text-sm text-neutral-500">This campaign didn't load. Try again shortly.</div>;

  const adGroups = groups.map((g) => ({
    id: g.id, name: g.name, status: badgeStatus(g.status), budget: "—", spend: "—",
    results: `${(g.creatives ?? []).length} ads`, optimization: "—",
  }));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const ads = creatives.map((c) => ({
    id: c.id, name: c.name, adGroup: (c.group_id && groupName.get(c.group_id)) || "—",
    status: badgeStatus(c.status), type: creativeType(c), spend: "—", results: "—",
  }));
  const activity = [
    { id: "created", action: "created this campaign", user: "You", time: fmtDate(campaign.created_at), detail: `Tier: ${campaign.tier_code}` },
    ...(campaign.updated_at !== campaign.created_at
      ? [{ id: "updated", action: "last updated", user: "You", time: fmtDate(campaign.updated_at), detail: `Status: ${campaign.status}` }]
      : []),
  ];
  const spend = delivery ? delivery.spend : (campaign.lifetime_spend_cents ?? 0) / 100;
  const impressions = delivery?.impressions ?? 0;
  const clicks = delivery?.clicks ?? 0;
  const conversions = delivery?.conversions ?? 0;

  return (
    <div>
      <PageHeader
        title={campaign.name}
        description={`${campaign.tier_code} · ${campaign.daily_budget_cents > 0 ? `Daily budget ${money(campaign.daily_budget_cents)}` : campaign.lifetime_budget_cents > 0 ? `Lifetime budget ${money(campaign.lifetime_budget_cents)}` : "No budget set"}`}
        breadcrumbs={[
          { label: "Campaigns", href: "/ads/campaigns" },
          { label: campaign.name },
        ]}
        actions={
          <>
            <StatusToggle active={isActive} onToggle={advance} />
            <Button variant="secondary">Duplicate</Button>
            <Link href={`/ads/campaigns/${id}/edit`}><Button>Edit</Button></Link>
          </>
        }
      />

      <TabBar tabs={["Overview", "Ad Groups", "Ads", "Analytics", "Settings", "Activity"]} active={tab} onChange={setTab} />

      {/* Overview */}
      {tab === 0 && (
        <div>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Spend" value={money2(spend)} />
            <MetricCard label="Impressions" value={compact(impressions)} />
            <MetricCard label="Clicks" value={clicks.toLocaleString("en-US")} />
            <MetricCard label="Conversions" value={conversions.toLocaleString("en-US")} />
          </div>
          <div className="mb-6 rounded-xl border border-neutral-100 bg-white p-6">
            <h3 className="text-sm font-semibold text-neutral-900 mb-4">Performance trend</h3>
            <div className="flex h-48 items-center justify-center text-sm text-neutral-400">Chart renders here — connect to analytics API</div>
          </div>
          <DataTable
            columns={[
              { key: "name", label: "Ad Group", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
              { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v as any} /> },
              { key: "budget", label: "Budget" },
              { key: "spend", label: "Spend" },
              { key: "results", label: "Results" },
            ]}
            data={adGroups}
            rowHref={(row) => `/ads/campaigns/groups/${row.id}`}
          />
        </div>
      )}

      {/* Ad Groups */}
      {tab === 1 && (
        <div>
          <div className="mb-4 flex justify-end">
            <Button>Create Ad Group</Button>
          </div>
          <DataTable
            columns={[
              { key: "name", label: "Ad Group", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
              { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v as any} /> },
              { key: "optimization", label: "Optimization" },
              { key: "budget", label: "Budget" },
              { key: "spend", label: "Spend" },
              { key: "results", label: "Results" },
            ]}
            data={adGroups}
            rowHref={(row) => `/ads/campaigns/groups/${row.id}`}
          />
        </div>
      )}

      {/* Ads */}
      {tab === 2 && (
        <div>
          <div className="mb-4 flex justify-end">
            <Button>Create Ad</Button>
          </div>
          <DataTable
            columns={[
              { key: "name", label: "Ad", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
              { key: "adGroup", label: "Ad Group" },
              { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v as any} /> },
              { key: "type", label: "Type" },
              { key: "spend", label: "Spend" },
              { key: "results", label: "Results" },
            ]}
            data={ads}
          />
        </div>
      )}

      {/* Analytics */}
      {tab === 3 && (
        <div>
          <div className="mb-6 grid grid-cols-3 gap-4 lg:grid-cols-6">
            <MetricCard label="Spend" value={money2(spend)} />
            <MetricCard label="Impressions" value={compact(impressions)} />
            <MetricCard label="Clicks" value={clicks.toLocaleString("en-US")} />
            <MetricCard label="CTR" value={impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) + "%" : "—"} />
            <MetricCard label="CPA" value={conversions > 0 ? money2(spend / conversions) : "—"} />
            <MetricCard label="ROAS" value="—" />
          </div>
          <div className="rounded-xl border border-neutral-100 bg-white p-6">
            <h3 className="text-sm font-semibold text-neutral-900 mb-4">Breakdown</h3>
            <div className="flex gap-2 mb-4">
              {["Placement", "Audience", "Device", "Time", "Creative"].map((b, i) => (
                <button key={b} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${i === 0 ? "bg-[#f2eafe] text-[#6942c2]" : "border border-neutral-200 text-neutral-600"}`}>{b}</button>
              ))}
            </div>
            <div className="flex h-48 items-center justify-center text-sm text-neutral-400">Breakdown chart</div>
          </div>
        </div>
      )}

      {/* Settings */}
      {tab === 4 && (
        <div className="rounded-xl border border-neutral-100 bg-white p-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <FormField label="Campaign name"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none" /></FormField>
            <FormField label="Tier"><select className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900" value={campaign.tier_code} disabled><option value={campaign.tier_code}>{campaign.tier_code}</option></select></FormField>
            <FormField label="Daily budget"><input value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} type="number" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900" /></FormField>
            <FormField label="Delivery type"><select className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900" disabled><option>Standard</option></select></FormField>
            <FormField label="Special ad category"><select className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900" value={specialCategory} onChange={(e) => setSpecialCategory(e.target.value)}><option value="">None</option><option value="housing">Housing</option><option value="credit">Credit</option><option value="employment">Employment</option></select></FormField>
          </div>
          {saveNote && <div className="mt-4 text-right text-sm text-neutral-500">{saveNote}</div>}
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary">Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      )}

      {/* Activity */}
      {tab === 5 && (
        <div className="rounded-xl border border-neutral-100 bg-white p-6">
          <ActivityTimeline items={activity} />
        </div>
      )}
    </div>
  );
}

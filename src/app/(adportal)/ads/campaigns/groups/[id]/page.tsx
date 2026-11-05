"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader, MetricCard, StatusBadge, DataTable, FilterBar, BulkActionToolbar, EmptyState, Button, TabBar, FormField, EstimatePanel, PolicyPanel, ActivityTimeline, CardGrid, StatusToggle } from "@/components/ads/ui";

type Group = { id: string; name: string; status: string; created_at: string; campaign_id: string; campaign_name: string; campaign_status: string };
type Creative = { id: string; name: string; status: string; cta: string | null };

export default function AdGroupDetailPage() {
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState(0);
  const [group, setGroup] = useState<Group | null>(null);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [campaign, setCampaign] = useState<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/ads/groups/${params.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("nf"))))
      .then((d) => {
        setGroup(d.group); setCreatives(d.creatives ?? []); setState("ready");
        return fetch(`/api/ads/campaigns/${d.group.campaign_id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      })
      .then((cd) => { if (cd?.campaign) setCampaign(cd); })
      .catch(() => setState("missing"));
  }, [params?.id]);

  if (state === "loading") return <div><PageHeader title="Ad Group" description="Loading…" /></div>;
  if (state === "missing" || !group) return <div><PageHeader title="Ad Group not found" description="This ad group doesn't exist or isn't on your account." /></div>;

  const placementNames = ((campaign?.placements ?? []) as { name?: string; code?: string }[]).map((p) => p.name || p.code).filter(Boolean);
  const targeting = campaign?.targeting;

  return (
    <div>
      <PageHeader title={group.name} description={`Ad group in ${group.campaign_name} · ${group.status}`} />
      <TabBar tabs={["Overview", "Audience", "Placements", "Delivery", "Analytics", "Activity"]} active={tab} onChange={setTab} />
      {tab === 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Creatives" value={String(creatives.length)} />
            <MetricCard label="Campaign status" value={group.campaign_status} />
            <MetricCard label="Budget" value="—" />
            <MetricCard label="Spend" value="—" />
          </div>
        </div>
      )},
      {tab === 1 && (
        <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
            <p>Audience is set at the campaign level.</p>
            <p className="mt-2">Languages: {targeting?.language_codes?.length ? targeting.language_codes.join(", ") : "all"} · States: {targeting?.state_codes?.length ? targeting.state_codes.join(", ") : "all"}</p>
          </div>
      )},
      {tab === 2 && (
        <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
            {placementNames.length ? <p>Placements (from the campaign): {placementNames.join(", ")}</p> : <p>Automatic placements — the campaign has no fixed placement list.</p>}
          </div>
      )},
      {tab === 3 && (
        <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">Delivery is tracked per campaign, not per ad group — see the campaign&rsquo;s Delivery view.</div>
      )},
      {tab === 4 && (
        <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">Results roll up per campaign in this system; there is no per-group delivery data to show.</div>
      )},
      {tab === 5 && (
        <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
            <p>Created {new Date(group.created_at).toLocaleString("en-US")}</p>
            <p className="mt-2">Creatives in this group: {creatives.length ? creatives.map((c) => c.name).join(", ") : "none yet"}</p>
          </div>
      )}
    </div>
  );
}

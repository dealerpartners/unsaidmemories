"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, MetricCard, DataTable, StatusBadge, FilterBar, BulkActionToolbar, Button } from "@/components/ads/ui";

type CreativeRow = { id: string; name: string; type: string; format: string; status: string; campaign: string; tags: string; updated: string };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function CreativesPage() {
  const [creatives, setCreatives] = useState<CreativeRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const load = () => {
    fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : { creatives: [] }))
      .then((d) => setCreatives(((d.creatives ?? []) as any[]).map((c) => ({
        id: String(c.id), name: c.name,
        type: c.type ? c.type.charAt(0).toUpperCase() + c.type.slice(1) : "Image",
        format: c.width && c.height ? `${c.width}×${c.height}` : "—",
        status: c.status, campaign: c.campaign_name ?? "—", tags: "—",
        updated: c.updated_at ? fmtDate(c.updated_at) : "—",
      })))).catch(() => {});
  };
  useEffect(load, []);

  const counts = {
    total: creatives.length,
    approved: creatives.filter((c) => c.status === "approved" || c.status === "active").length,
    review: creatives.filter((c) => c.status === "pending_review" || c.status === "in_review").length,
    rejected: creatives.filter((c) => c.status === "rejected").length,
  };

  const deleteSelected = () => {
    Promise.all([...selected].map((id) => fetch(`/api/ads/creatives/${id}`, { method: "DELETE" }).catch(() => {})))
      .then(() => { setSelected(new Set()); load(); });
  };
  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const toggleAll = () => { setSelected(selected.size === creatives.length ? new Set() : new Set(creatives.map(c => c.id))); };

  return (
    <div>
      <PageHeader
        title="Creative Management"
        description="Upload, preview, and manage all ad creatives — images, audio, video, and companion assets."
        breadcrumbs={[{ label: "Ad Center" }, { label: "Creatives" }]}
        actions={
          <div className="flex gap-2">
            <Link href="/ads/creatives/create"><Button>Create Creative</Button></Link>
            <Link href="/ads/creatives/library"><Button variant="secondary">Open Library</Button></Link>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Total Creatives" value={String(counts.total)} />
        <MetricCard label="Approved" value={String(counts.approved)} deltaType="positive" />
        <MetricCard label="In Review" value={String(counts.review)} deltaType="neutral" />
        <MetricCard label="Rejected" value={String(counts.rejected)} deltaType="positive" />
      </div>

      <FilterBar
        searchPlaceholder="Search creatives…"
        onSearch={setSearch}
        filters={[
          { label: "Type", options: ["Image", "Audio", "Video"] },
          { label: "Status", options: ["Approved", "In Review", "Rejected"] },
        ]}
      />

      <BulkActionToolbar
        selectedCount={selected.size}
        actions={[
          { label: "Delete", onClick: deleteSelected, variant: "danger" },
        ]}
      />

      <DataTable
        columns={[
          { key: "name", label: "Creative", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
          { key: "type", label: "Type" },
          { key: "format", label: "Format" },
          { key: "status", label: "Status", render: (_: string, row: any) => <StatusBadge status={row.status} /> },
          { key: "campaign", label: "Campaign" },
          { key: "tags", label: "Tags", render: (v: string) => <span className="text-xs text-neutral-400">{v}</span> },
          { key: "updated", label: "Updated", render: (v: string) => <span className="text-neutral-400">{v}</span> },
        ]}
        data={creatives.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))}
        selectable
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        rowHref={(row) => `/ads/creatives/library/${row.id}`}
      />

      {/* Quick Links */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "Audio Upload", description: "Upload and manage audio ad files", href: "/ads/creatives/audio" },
          { label: "Companion Images", description: "Manage companion banner assets", href: "/ads/creatives/companion" },
          { label: "Logo Management", description: "Upload and manage brand logos", href: "/ads/creatives/logo" },
          { label: "CTA Selector", description: "Choose call-to-action buttons", href: "/ads/creatives/cta" },
          { label: "Ad Preview", description: "Preview your ad across placements", href: "/ads/creatives/preview" },
          { label: "AI Creative Gen", description: "Generate creatives with AI", href: "/ads/creatives/ai" },
          { label: "Creator Partnerships", description: "Collaborate with creators", href: "/ads/creatives/partnerships" },
          { label: "Creative Studio", description: "Design and edit creatives", href: "/ads/creatives/studio" },
          { label: "Destination URLs", description: "Manage landing page URLs", href: "/ads/creatives/destination" },
        ].map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl border border-neutral-100 bg-white p-4 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
          >
            <h3 className="text-sm font-semibold text-neutral-900">{card.label}</h3>
            <p className="mt-1 text-xs text-neutral-500">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

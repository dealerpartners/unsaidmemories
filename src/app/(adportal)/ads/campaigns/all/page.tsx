"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, MetricCard, DataTable, StatusBadge, FilterBar, BulkActionToolbar, Button } from "@/components/ads/ui";

type ApiCampaign = { id: string; name: string; status: string; updated_at: string | null };
type Row = { id: string; name: string; status: "active" | "paused" | "draft" | "completed"; updated: string; updatedAt: string | null };

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/ads/campaigns")
      .then((r) => { if (!r.ok) throw new Error("campaigns"); return r.json(); })
      .then((data) => setRows(((data.campaigns ?? []) as ApiCampaign[]).map((c) => ({
        id: c.id, name: c.name,
        status: (["active", "paused", "draft", "completed"].includes(c.status) ? c.status : "draft") as Row["status"],
        updated: c.updated_at ? new Date(c.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
        updatedAt: c.updated_at,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const toggleAll = () => { setSelected(selected.size === rows.length ? new Set() : new Set(rows.map(r => r.id))); };
  return (
    <div>
      <PageHeader title="All" description="Every campaign in your account." breadcrumbs={[{ label: "Ad Center", href: "/ads" }, { label: "Campaigns", href: "/ads/campaigns" }, { label: "All" }]} actions={<Link href="/ads"><Button variant="secondary">Create</Button></Link>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard label="Total" value={loading ? "…" : String(rows.length)} />
        <MetricCard label="Active" value={loading ? "…" : String(rows.filter((r) => r.status === "active").length)} />
        <MetricCard label="Updated" value={rows.length ? (rows.map((r) => r.updatedAt).filter(Boolean).sort().slice(-1)[0] ? new Date(rows.map((r) => r.updatedAt).filter(Boolean).sort().slice(-1)[0] as string).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—") : "—"} />
      </div>
      <FilterBar searchPlaceholder="Search…" filters={[{ label: "Status", options: ["Active", "Draft", "Paused"] }]} />
      <BulkActionToolbar selectedCount={selected.size} actions={[{ label: "Edit", onClick: () => {} }, { label: "Archive", onClick: () => {} }, { label: "Delete", onClick: () => {}, variant: "danger" }]} />
      <DataTable
        columns={[
          { key: "name", label: "Name", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
          { key: "status", label: "Status", render: (_: string, row: any) => <StatusBadge status={row.status} /> },
          { key: "updated", label: "Updated", render: (v: string) => <span className="text-neutral-400">{v}</span> },
        ]}
        data={rows} selectable selected={selected} onToggleSelect={toggleSelect} onToggleAll={toggleAll}
      />
    </div>
  );
}
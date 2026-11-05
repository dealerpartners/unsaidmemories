"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, FilterBar, DataTable, StatusBadge, BulkActionToolbar, Button } from "@/components/ads/ui";


type Aud = { id: string; name: string; targeting: any; size: number | null; reach: number | null; updated_at: string };
const fmtN = (n: number | null | undefined) => (n == null ? "—" : n >= 1_000_000 ? `~${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `~${(n / 1_000).toFixed(0)}K` : String(n));
const typeOf = (t: any) => (!t ? "Custom" : t.age_range || t.gender ? "Demographic" : (t.locations ?? []).length ? "Location" : (t.languages ?? []).length ? "Language" : "Custom");

export default function AudiencesPage() {
  const [audiences, setAudiences] = useState<Aud[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const load = () => {
    fetch("/api/ads/audiences").then((r) => (r.ok ? r.json() : Promise.reject(new Error("audiences_unavailable"))))
      .then((d) => setAudiences(d.audiences ?? []))
      .catch(() => setLoadFailed(true));
  };
  useEffect(load, []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const toggleAll = () => { setSelected(selected.size === audiences.length ? new Set() : new Set(audiences.map(a => a.id))); };

  return (
    <div>
      <PageHeader
        title="Audiences"
        description="Your saved audiences — reusable targeting sets built from locations, languages, devices, age and gender."
        actions={<Link href="/ads/audiences/create"><Button>Create Audience</Button></Link>}
      />

      <FilterBar
        searchPlaceholder="Search audiences…"
        onSearch={setSearch}
        filters={[
          { label: "Facet", options: ["Location", "Language", "Age", "Gender"] },
        ]}
      />

      <BulkActionToolbar
        selectedCount={selected.size}
        actions={[
          { label: "Export", onClick: () => {
              const rows = audiences.filter((a) => selected.has(a.id));
              const csv = ["Name,Size,Reach,Updated", ...rows.map((a) => [a.name, a.size ?? "", a.reach ?? "", a.updated_at].join(","))].join("\n");
              const a2 = document.createElement("a");
              a2.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
              a2.download = "audiences.csv";
              a2.click();
              URL.revokeObjectURL(a2.href);
            } },
          { label: "Delete", variant: "danger", onClick: () => {
              Promise.all(audiences.filter((a) => selected.has(a.id)).map((a) => fetch(`/api/ads/audiences/${a.id}`, { method: "DELETE" }).catch(() => {})))
                .then(() => { setSelected(new Set()); load(); });
            } },
        ]}
      />

      <DataTable
        columns={[
          { key: "name", label: "Audience", render: (v: string, row: any) => <Link href={`/ads/audiences/${row.id}`} className="font-medium text-neutral-900 hover:underline">{v}</Link> },
          { key: "type", label: "Type" },
          { key: "size", label: "Size", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
          { key: "status", label: "Status", render: (v: string) => <StatusBadge status={v as any} /> },
          { key: "lookalike", label: "Lookalike" },
          { key: "updated", label: "Updated", render: (v: string) => <span className="text-neutral-400">{v}</span> },
        ]}
        data={loadFailed ? [] : audiences.filter((a) => a.name.toLowerCase().includes(search.toLowerCase())).map((a) => ({ ...a, type: typeOf(a.targeting), size: fmtN(a.size ?? a.reach), lookalike: "—", status: "ready" as const, updated: new Date(a.updated_at).toLocaleDateString("en-US") }))}
        selectable
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        rowHref={(row) => `/ads/audiences/${row.id}`}
      />
    </div>
  );
}

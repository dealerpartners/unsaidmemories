"use client";

import { CreateStepShell, useDraftCreate, NameField, CreateButton, stepInputCls } from "@/components/ads/create-step";
import { useEffect, useState } from "react";

export default function Page() {
  const d = useDraftCreate();
  const [placements, setPlacements] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch("/api/ads/placements").then((r) => (r.ok ? r.json() : null)).then((x) => setPlacements(x?.placements ?? (Array.isArray(x) ? x : []))).catch(() => {});
  }, []);
  const toggle = (k: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(k)) { n.delete(k); } else { n.add(k); } return n; });
  return (
    <CreateStepShell title="Placements" description="Where the campaign runs. None selected means automatic placement.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <NameField name={d.name} setName={d.setName} />
        <div className="mb-4 space-y-2">
          {placements.map((p) => (
            <label key={p.key} className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={picked.has(p.key)} onChange={() => toggle(p.key)} className="h-4 w-4 rounded border-neutral-300" />
              {p.name}
            </label>
          ))}
          {placements.length === 0 && <p className="text-sm text-neutral-500">Loading placements…</p>}
        </div>
        <CreateButton busy={d.busy} error={d.error} onClick={() => d.create({ placements: [...picked] })} />
      </div>
    </CreateStepShell>
  );
}

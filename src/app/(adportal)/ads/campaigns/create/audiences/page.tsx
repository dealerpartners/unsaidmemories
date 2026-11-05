"use client";

import { CreateStepShell, useDraftCreate, NameField, CreateButton, stepInputCls } from "@/components/ads/create-step";
import { useEffect, useState } from "react";

export default function Page() {
  const d = useDraftCreate();
  const [auds, setAuds] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch("/api/ads/audiences").then((r) => (r.ok ? r.json() : { audiences: [] })).then((x) => setAuds(x.audiences ?? [])).catch(() => {});
  }, []);
  const toggle = (k: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(k)) { n.delete(k); } else { n.add(k); } return n; });
  return (
    <CreateStepShell title="Audiences" description="Attach saved audiences to the new campaign's targeting.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <NameField name={d.name} setName={d.setName} />
        <div className="mb-4 space-y-2">
          {auds.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={picked.has(a.id)} onChange={() => toggle(a.id)} className="h-4 w-4 rounded border-neutral-300" />
              {a.name}
            </label>
          ))}
          {auds.length === 0 && <p className="text-sm text-neutral-500">No saved audiences yet — create one under Audiences first, or skip: the campaign is created without audience targeting.</p>}
        </div>
        <CreateButton busy={d.busy} error={d.error} onClick={() => d.create({ targeting: { audience_ids: [...picked] } })} />
      </div>
    </CreateStepShell>
  );
}

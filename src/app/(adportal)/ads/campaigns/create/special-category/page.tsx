"use client";

import { CreateStepShell, useDraftCreate, NameField, CreateButton, stepInputCls } from "@/components/ads/create-step";
import { useState } from "react";

export default function Page() {
  const d = useDraftCreate();
  const [cat, setCat] = useState("");
  return (
    <CreateStepShell title="Special Category" description="Campaigns about credit, employment, housing or social issues must declare it — the declaration is stored on the campaign.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <NameField name={d.name} setName={d.setName} />
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Special ad category</label>
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={stepInputCls}>
            <option value="">None — not a special category</option>
            <option value="credit">Credit</option>
            <option value="employment">Employment</option>
            <option value="housing">Housing</option>
            <option value="social_issues">Social issues</option>
          </select>
        </div>
        <CreateButton busy={d.busy} error={d.error} onClick={() => d.create(cat ? { special_category: cat } : {})} />
      </div>
    </CreateStepShell>
  );
}

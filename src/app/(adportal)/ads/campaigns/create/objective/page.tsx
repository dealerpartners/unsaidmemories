"use client";

import { CreateStepShell, useDraftCreate, NameField, CreateButton, stepInputCls } from "@/components/ads/create-step";
import { useEffect, useState } from "react";

export default function Page() {
  const d = useDraftCreate();
  const [tiers, setTiers] = useState<any[]>([]);
  const [tier, setTier] = useState("silver");
  useEffect(() => {
    fetch("/api/ads/budget-tiers").then((r) => (r.ok ? r.json() : null)).then((x) => setTiers(x?.tiers ?? [])).catch(() => {});
  }, []);
  return (
    <CreateStepShell title="Objective" description="In this system the objective is the campaign's tier — it sets the rate card the campaign runs on.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <NameField name={d.name} setName={d.setName} />
        <div className="mb-4 space-y-2">
          {tiers.map((t) => (
            <label key={t.code ?? t.name} className="flex cursor-pointer items-center justify-between rounded-lg border border-neutral-200 px-4 py-3">
              <span className="text-sm font-medium text-neutral-900">{t.name}</span>
              <input type="radio" name="tier" checked={tier === (t.code ?? t.name)} onChange={() => setTier(t.code ?? t.name)} className="h-4 w-4" />
            </label>
          ))}
          {tiers.length === 0 && <p className="text-sm text-neutral-500">Loading tiers…</p>}
        </div>
        <CreateButton busy={d.busy} error={d.error} onClick={() => d.create({ tier_code: tier })} />
      </div>
    </CreateStepShell>
  );
}

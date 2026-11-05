"use client";

import { CreateStepShell, useDraftCreate, NameField, CreateButton, stepInputCls } from "@/components/ads/create-step";
import { useState } from "react";

export default function Page() {
  const d = useDraftCreate();
  const [daily, setDaily] = useState("");
  const [lifetime, setLifetime] = useState("");
  return (
    <CreateStepShell title="Ad Group Budget" description="Ad groups in this system don't carry their own budgets — the budget lives on the campaign and its group inherits it. Set the campaign budget here.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <NameField name={d.name} setName={d.setName} />
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Daily budget ($)</label><input type="number" min="0" step="0.01" value={daily} onChange={(e) => setDaily(e.target.value)} className={stepInputCls} /></div>
          <div><label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Lifetime budget ($)</label><input type="number" min="0" step="0.01" value={lifetime} onChange={(e) => setLifetime(e.target.value)} className={stepInputCls} /></div>
        </div>
        <CreateButton busy={d.busy} error={d.error} onClick={() => d.create({ ...(Number(daily) > 0 ? { daily_budget_cents: Math.round(Number(daily) * 100) } : {}), ...(Number(lifetime) > 0 ? { lifetime_budget_cents: Math.round(Number(lifetime) * 100) } : {}) })} />
      </div>
    </CreateStepShell>
  );
}

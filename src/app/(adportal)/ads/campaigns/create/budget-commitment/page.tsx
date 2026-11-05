"use client";

import { CreateStepShell, useDraftCreate, NameField, CreateButton, stepInputCls } from "@/components/ads/create-step";
import { useState } from "react";

export default function Page() {
  const d = useDraftCreate();
  const [lifetime, setLifetime] = useState("");
  return (
    <CreateStepShell title="Budget Commitment" description="Commit a lifetime budget for the campaign. Delivery stops at the cap; charges settle from the billing ledger.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <NameField name={d.name} setName={d.setName} />
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400">Lifetime budget ($)</label><input type="number" min="0" step="0.01" value={lifetime} onChange={(e) => setLifetime(e.target.value)} className={stepInputCls} />
        </div>
        <CreateButton busy={d.busy} error={d.error} onClick={() => d.create({ ...(Number(lifetime) > 0 ? { lifetime_budget_cents: Math.round(Number(lifetime) * 100) } : {}) })} />
      </div>
    </CreateStepShell>
  );
}

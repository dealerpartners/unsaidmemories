"use client";

import { CreateStepShell, useDraftCreate, NameField, CreateButton, stepInputCls } from "@/components/ads/create-step";
import { useEffect, useState } from "react";

export default function Page() {
  const d = useDraftCreate();
  const [tiers, setTiers] = useState<any[]>([]);
  const [tier, setTier] = useState("silver");
  useEffect(() => { fetch("/api/ads/budget-tiers").then((r) => (r.ok ? r.json() : null)).then((x) => setTiers(x?.tiers ?? [])).catch(() => {}); }, []);
  return (
    <CreateStepShell title="Budget Tiers" description="Pick the rate-card tier the campaign runs on.">
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <NameField name={d.name} setName={d.setName} />
        <div className="mb-4 overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full">
            <thead><tr className="border-b border-neutral-100 bg-neutral-50 text-left text-xs font-medium uppercase tracking-wider text-neutral-400"><th className="px-4 py-2.5">Tier</th><th className="px-4 py-2.5">Monthly</th><th className="px-4 py-2.5"></th></tr></thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.code ?? t.name} className="border-b border-neutral-50">
                  <td className="px-4 py-2.5 text-sm font-medium text-neutral-900">{t.name}</td>
                  <td className="px-4 py-2.5 text-sm text-neutral-700">{t.monthly_price_cents != null ? `$${(Number(t.monthly_price_cents) / 100).toLocaleString("en-US")}` : t.price != null ? `$${Number(t.price).toLocaleString("en-US")}` : "—"}</td>
                  <td className="px-4 py-2.5 text-right"><input type="radio" name="tier" checked={tier === (t.code ?? t.name)} onChange={() => setTier(t.code ?? t.name)} className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {tiers.length === 0 && <p className="px-4 py-3 text-sm text-neutral-500">Loading tiers…</p>}
        </div>
        <CreateButton busy={d.busy} error={d.error} onClick={() => d.create({ tier_code: tier })} />
      </div>
    </CreateStepShell>
  );
}

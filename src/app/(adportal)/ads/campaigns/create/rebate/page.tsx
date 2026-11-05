"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CreateStepShell } from "@/components/ads/create-step";

export default function Page() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/rebates").then((r) => (r.ok ? r.json() : { rebates: [] })).then((d) => setRows(d.rebates ?? [])).catch(() => {});
  }, []);
  return (
    <CreateStepShell title="Rebate" description="Rebates and credits on this account — a campaign can be created under an existing offer, and new offers are made in Billing.">
      <div className="space-y-3">
        {rows.length === 0 && <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">No rebates or credits on this account yet.</div>}
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-neutral-100 bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-900">{r.name}</span>
              <span className="text-xs text-neutral-500">{r.status}</span>
            </div>
            <p className="mt-1 text-sm text-neutral-600">{r.rebate_type === "percent_off" ? `${r.percent}% off` : `$${r.amount} off`}{r.campaign_name ? ` · ${r.campaign_name}` : " · account-wide"}</p>
          </div>
        ))}
        <p className="text-sm"><Link href="/ads/billing/rebates" className="font-medium text-neutral-900 underline">Create or manage rebates in Billing</Link></p>
      </div>
    </CreateStepShell>
  );
}

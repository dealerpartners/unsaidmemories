"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Page() {
  const params = useParams<{ id: string }>();
  const [t, setT] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!params?.id) return;
    fetch("/api/ads/billing/transactions").then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const found = (d?.transactions ?? []).find((x: any) => String(x.id) === String(params.id));
        if (!found) setMissing(true); else setT(found);
      }).catch(() => setMissing(true));
  }, [params?.id]);
  if (missing) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Invoice not found</h1><p className="mt-1 text-sm text-neutral-500">This charge isn't on your account.</p></div>;
  if (!t) return <div><h1 className="text-2xl font-bold tracking-tight text-neutral-900">Invoice</h1><p className="mt-1 text-sm text-neutral-500">Loading…</p></div>;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Charge {String(t.id).slice(0, 8)}</h1>
          <p className="mt-1 text-sm text-neutral-500">{new Date(t.created_at).toLocaleString("en-US")}</p>
        </div>
        <button onClick={() => window.print()} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700">Print / save PDF</button>
      </div>
      <div className="space-y-4 rounded-xl border border-neutral-100 bg-white p-6 text-sm">
        <div className="flex justify-between"><span className="text-neutral-500">Campaign</span><span className="font-medium text-neutral-900">{t.campaign_name ?? "—"}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Type</span><span className="font-medium capitalize text-neutral-900">{t.type}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Amount</span><span className="font-medium text-neutral-900">{money(t.amount)} {t.currency ?? ""}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Status</span><span className="font-medium text-neutral-900">{t.status}</span></div>
        {t.provider_ref && <div className="flex justify-between"><span className="text-neutral-500">Provider reference</span><span className="font-medium text-neutral-900">{t.provider_ref}</span></div>}
        <div className="flex justify-between"><span className="text-neutral-500">Transaction ID</span><span className="font-medium text-neutral-900">{t.id}</span></div>
      </div>
    </div>
  );
}

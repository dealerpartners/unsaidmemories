"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ads/ui";

export default function Page() {
  const [account, setAccount] = useState<any>(null);
  const [prefs, setPrefs] = useState<any>({});
  useEffect(() => {
    fetch("/api/ads/billing/payment-methods").then((r) => (r.ok ? r.json() : null)).then((d) => setAccount(d?.account ?? null)).catch(() => {});
    fetch("/api/ads/settings?kind=billing").then((r) => (r.ok ? r.json() : null)).then((d) => setPrefs(d?.settings ?? {})).catch(() => {});
  }, []);
  return (
    <div>
      <PageHeader title="Billing Profile" description="Manage your billing identity and address." />
      <div className="max-w-2xl space-y-4 rounded-xl border border-neutral-100 bg-white p-6 text-sm">
        <div className="flex justify-between"><span className="text-neutral-500">Billing account</span><span className="font-medium text-neutral-900">{account?.name ?? "—"}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Account status</span><span className="font-medium text-neutral-900">{account?.status ?? "—"}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Verified</span><span className="font-medium text-neutral-900">{account ? (account.verified ? "Yes" : "No") : "—"}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Tier</span><span className="font-medium text-neutral-900">{account?.tier ?? "—"}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Stripe customer</span><span className="font-medium text-neutral-900">{account?.stripe_customer_id ? "On file" : "Not created yet"}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Billing name</span><span className="font-medium text-neutral-900">{prefs.billing_name ?? "—"}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Billing email</span><span className="font-medium text-neutral-900">{prefs.billing_email ?? "—"}</span></div>
        <p className="pt-2 text-xs text-neutral-400">Billing name and email are set in <a href="/ads/billing/payment-preferences" className="underline">Payment Preferences</a>. A street address isn't stored on the billing account in this system.</p>
      </div>
    </div>
  );
}

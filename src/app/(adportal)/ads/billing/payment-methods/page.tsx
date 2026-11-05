"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, Button } from "@/components/ads/ui";

export default function Page() {
  const [methods, setMethods] = useState<any[]>([]);
  const [account, setAccount] = useState<any>(null);
  useEffect(() => {
    fetch("/api/ads/billing/payment-methods").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setMethods(d.payment_methods ?? []); setAccount(d.account); } }).catch(() => {});
  }, []);
  return (
    <div>
      <PageHeader title="Payment Methods" description="Add and manage payment methods for your account." actions={<Link href="/ads/billing/payment-methods/add"><Button>Add Payment Method</Button></Link>} />
      <div className="space-y-3">
        {methods.length === 0 && (
          <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">No payment methods on file. Add one so billing can settle campaign spend.</div>
        )}
        {methods.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white p-5">
            <div>
              <p className="text-sm font-semibold capitalize text-neutral-900">{m.brand ?? m.method_type} ····{m.last4}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{m.method_type} · added {new Date(m.created_at).toLocaleDateString("en-US")}</p>
            </div>
            {m.is_default && <span className="rounded-full bg-[#f2eafe] px-3 py-1 text-xs font-medium text-[#6942c2]">Default</span>}
          </div>
        ))}
      </div>
      {account && (
        <p className="mt-4 text-xs text-neutral-400">Billing account: {account.name ?? account.id}{account.stripe_customer_id ? " · Stripe customer on file" : " · no Stripe customer yet (created when you add a card)"}</p>
      )}
    </div>
  );
}

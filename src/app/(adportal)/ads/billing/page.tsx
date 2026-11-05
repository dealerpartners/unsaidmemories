"use client";

import Link from "next/link";
import { PageHeader, MetricCard, DataTable, StatusBadge, Button, TabBar } from "@/components/ads/ui";
import { useEffect, useState } from "react";

const money = (n: unknown) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const txnBadge = (s: string) => (s === "succeeded" ? "completed" : s === "failed" ? "rejected" : "pending_review");
const txnLabel = (s: string) => (s === "succeeded" ? "Succeeded" : s === "failed" ? "Failed" : s === "pending" ? "Pending" : s);

export default function BillingOverview() {
  const [tab, setTab] = useState(0);
  const [txns, setTxns] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [methods, setMethods] = useState<any[]>([]);
  const [rebates, setRebates] = useState<any[]>([]);
  const [chargeNote, setChargeNote] = useState("");

  const load = () => {
    fetch("/api/ads/billing/transactions").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setTxns(d.transactions ?? []); setTotals(d.totals); } }).catch(() => {});
    fetch("/api/ads/billing/payment-methods").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setMethods(d.payment_methods ?? []); }).catch(() => {});
    fetch("/api/ads/rebates").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setRebates(d.rebates ?? []); }).catch(() => {});
  };
  useEffect(load, []);

  const def = methods.find((m) => m.is_default) ?? methods[0];
  const invoices = txns.filter((t) => t.type === "charge");

  const runCharge = () => {
    setChargeNote("");
    fetch("/api/ads/billing/charge", { method: "POST" })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "charge_failed"); return d; })
      .then((d) => {
        const n = (d.charged ?? 0) + (d.v2?.charged ?? 0);
        const f = (d.failed ?? 0) + (d.v2?.failed ?? 0);
        setChargeNote(n + f === 0 ? "Nothing was due — no campaign had unbilled spend over $0.50." : `Settled ${n} charge${n === 1 ? "" : "s"} totalling ${money(d.total)}${f ? `; ${f} failed` : ""}.`);
        load();
      })
      .catch((e) => setChargeNote("Couldn't run billing: " + String(e?.message || "unknown error")));
  };

  return (
    <div>
      <PageHeader title="Billing" description="Manage payment, invoices, and billing identity." />
      <TabBar tabs={["Overview", "Payment Methods", "Invoices", "Transactions", "Credits"]} active={tab} onChange={setTab} />

      {tab === 0 && (
        <div>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <MetricCard label="Unbilled spend" value={totals ? money(totals.unbilled) : "—"} />
            <MetricCard label="Total spend" value={totals ? money(totals.spent) : "—"} />
            <MetricCard label="Billed so far" value={totals ? money(totals.billed) : "—"} />
            <MetricCard label="Payment method" value={def ? `${def.brand ?? def.method_type} ····${def.last4}` : "None on file"} />
          </div>
          <div className="rounded-xl border border-neutral-100 bg-white p-6">
            <h3 className="text-sm font-semibold text-neutral-900">Settle up</h3>
            <p className="mt-1 text-sm text-neutral-600">Billing runs when you ask it to: it charges the default payment method for each campaign's unbilled spend over $0.50 and records the transactions here.</p>
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={runCharge}>Run billing now</Button>
              {!def && <span className="text-sm text-neutral-500">Add a payment method first — charges need a card on file.</span>}
            </div>
            {chargeNote && <p className="mt-3 text-sm text-neutral-600">{chargeNote}</p>}
          </div>
        </div>
      )}

      {tab === 1 && (
        <div>
          <div className="mb-4 flex justify-end">
            <Link href="/ads/billing/payment-methods/add"><Button>Add Payment Method</Button></Link>
          </div>
          <DataTable
            columns={[
              { key: "method", label: "Method", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
              { key: "type", label: "Type" },
              { key: "last4", label: "Last 4" },
              { key: "expiry", label: "Expiry" },
              { key: "default", label: "Default" },
            ]}
            data={methods.map((m) => ({ id: m.id, method: m.brand ?? m.method_type, type: m.method_type, last4: m.last4, expiry: "—", default: m.is_default ? "Default" : "" }))}
          />
          {methods.length === 0 && <p className="mt-3 text-sm text-neutral-500">No payment methods on file yet.</p>}
        </div>
      )}

      {tab === 2 && (
        <DataTable
          columns={[
            { key: "invoice", label: "Invoice", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
            { key: "date", label: "Date" },
            { key: "amount", label: "Amount" },
            { key: "status", label: "Status", render: (v: string, row: any) => <StatusBadge status={txnBadge(v) as any} label={txnLabel(v)} /> },
            { key: "due", label: "Due" },
          ]}
          data={invoices.map((t) => ({ id: t.id, invoice: `Charge ${String(t.id).slice(0, 8)}`, date: new Date(t.created_at).toLocaleDateString("en-US"), amount: money(t.amount), status: t.status, due: "On charge" }))}
        />
      )}

      {tab === 3 && (
        <DataTable
          columns={[
            { key: "txn", label: "Transaction", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
            { key: "type", label: "Type" },
            { key: "amount", label: "Amount" },
            { key: "date", label: "Date" },
            { key: "status", label: "Status", render: (v: string) => <StatusBadge status={txnBadge(v) as any} label={txnLabel(v)} /> },
          ]}
          data={txns.map((t) => ({ id: t.id, txn: String(t.id).slice(0, 8), type: t.type, amount: money(t.amount), date: new Date(t.created_at).toLocaleDateString("en-US"), status: t.status }))}
        />
      )}

      {tab === 4 && (
        <DataTable
          columns={[
            { key: "credit", label: "Credit", render: (v: string) => <span className="font-medium text-neutral-900">{v}</span> },
            { key: "type", label: "Type" },
            { key: "amount", label: "Amount" },
            { key: "expires", label: "Expires" },
            { key: "status", label: "Status", render: (v: string) => <StatusBadge status={(v === "active" ? "active" : "draft") as any} label={v} /> },
          ]}
          data={rebates.map((r) => ({ id: r.id, credit: r.name, type: r.rebate_type, amount: r.amount != null ? money(r.amount) : r.percent != null ? `${r.percent}%` : "—", expires: r.ends_at ? new Date(r.ends_at).toLocaleDateString("en-US") : "—", status: r.status }))}
        />
      )}
    </div>
  );
}

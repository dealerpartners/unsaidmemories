"use client";

// Advertising — Billing & spend (Sunny's MARKETING.html stat treatment).
// Real money movement from GET /api/admin/ads/billing/transactions
// (ad_transactions): settled / pending / refunded totals plus the
// transaction ledger. His mock's "payment method •• 4242" has no real
// source in ad_* and is not shown.

import { Stat, fmtWhen, useFetch } from "../frame";

type Tx = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  provider_ref: string | null;
  account_name: string | null;
  organization_name: string | null;
  campaign_name: string | null;
  created_at: string;
};
type Data = {
  transactions: Tx[];
  totals: { settled: number; pending: number; refunded: number };
  by_status: { status: string; n: number; amount: number }[];
};

const dollars = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function AdsBilling() {
  const { data, loading, error } = useFetch<Data>("/api/admin/ads/billing/transactions");
  if (loading) return <div className="card"><div className="empty">Loading…</div></div>;
  if (error || !data) return <div className="notice error">{error || "Billing data couldn't be loaded right now."}</div>;

  return (
    <>
      <div className="stat-grid">
        <Stat label="Settled" value={dollars(data.totals.settled)} foot="Completed ad payments" />
        <Stat label="Pending" value={dollars(data.totals.pending)} foot="Awaiting settlement" />
        <Stat label="Refunded" value={dollars(data.totals.refunded)} foot="Returned to advertisers" />
        <Stat label="Transactions" value={String(data.transactions.length)} foot="Most recent, up to 500" />
      </div>
      <div className="card">
        <div className="card-pad"><strong>Transactions</strong></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Account</th><th>Campaign</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {data.transactions.length === 0 ? (
                <tr><td colSpan={6}><div className="empty">No ad transactions recorded yet.</div></td></tr>
              ) : data.transactions.map((t) => (
                <tr key={t.id}>
                  <td>{fmtWhen(t.created_at)}</td>
                  <td>{t.account_name ?? t.organization_name ?? "—"}</td>
                  <td>{t.campaign_name ?? "—"}</td>
                  <td>{t.type}</td>
                  <td>{dollars(Number(t.amount))}</td>
                  <td><span className={`status ${t.status === "succeeded" ? "live" : t.status === "pending" ? "scheduled" : t.status === "refunded" ? "paused" : ""}`}>{t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

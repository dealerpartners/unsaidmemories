'use client';

import React, { useEffect, useState } from 'react';
import { StatementNav, fmt, thCls } from '../_shared';

// /admin/accounting/reports/revenue — Revenue Report, kept as the
// statement suite's operational revenue page: gross receipts by
// day, week and month against payouts, refunds and chargebacks.
// Same figures as before (acct_ar_receipts / acct_ar_invoices /
// acct_disputes / acct_refunds / acct_ap_payments), now rendered
// in the suite's shared header and table format.

type Data = {
  kpis: { grossToday: number; grossWeek: number; grossMonth: number; invoicedMonth: number; chargebacksAllTime: number; refundsIssued: number };
  days: { date: string; amount: number }[];
  payouts: { paymentNumber: string; date: string; amount: number; status: string }[];
  disputes: { disputeNumber: string; kind: string; amount: number; status: string }[];
};

const fmtDate = (d: string) =>
  d ? new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function RevenueReportPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/accounting/revenue-report', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then(setData)
      .catch(() => setError('The revenue report could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const kpi = (label: string, value: string, foot: string) => (
    <div className="border border-border rounded-xl bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
      <div className="text-[12px] text-muted-foreground">{foot}</div>
    </div>
  );

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Revenue Report</h1>
      </div>
      <StatementNav active="/admin/accounting/reports/revenue" />

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}
        {loading && !data ? <div className="text-muted-foreground text-sm">Loading the revenue report…</div> : null}
        {data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {kpi('Gross Receipts — Today', fmt(data.kpis.grossToday), 'customer receipts posted today')}
              {kpi('Gross Receipts — Week', fmt(data.kpis.grossWeek), 'last 7 days of receipts')}
              {kpi('Gross Receipts — Month', fmt(data.kpis.grossMonth), `invoiced ${fmt(data.kpis.invoicedMonth)} this month`)}
              {kpi('Chargebacks (all time)', fmt(data.kpis.chargebacksAllTime), `refunds issued ${fmt(data.kpis.refundsIssued)}`)}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
              <div>
                <div className="font-semibold text-[15px] mb-2">Daily Gross Receipts (This Month)</div>
                <div className="border border-border rounded-xl overflow-x-auto bg-card">
                  <div className="adm-table-wrap"><table className="adm-table">
                    <thead><tr className={thCls}>
                      <th className="p-3 border-r border-border">Day</th>
                      <th className="p-3 text-right">Gross Receipts</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {data.days.length === 0 ? (
                        <tr><td colSpan={2} className="p-3 text-center text-muted-foreground">No receipts this month. Receipts appear here as customer payments are recorded.</td></tr>
                      ) : data.days.map((d) => (
                        <tr key={d.date} className="hover:bg-accent/50">
                          <td className="p-3 border-r border-border">{fmtDate(d.date)}</td>
                          <td className="p-3 text-right tabular-nums">{fmt(d.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
              </div>
              <div>
                <div className="font-semibold text-[15px] mb-2">Scheduled Payouts — Vendor Payments</div>
                <div className="border border-border rounded-xl overflow-x-auto bg-card">
                  <div className="adm-table-wrap"><table className="adm-table">
                    <thead><tr className={thCls}>
                      <th className="p-3 border-r border-border">Payment</th>
                      <th className="p-3 border-r border-border">Date</th>
                      <th className="p-3 border-r border-border text-right">Amount</th>
                      <th className="p-3">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {data.payouts.length === 0 ? (
                        <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">No vendor payouts yet.</td></tr>
                      ) : data.payouts.map((p, i) => (
                        <tr key={i} className="hover:bg-accent/50">
                          <td className="p-3 border-r border-border font-medium">{p.paymentNumber}</td>
                          <td className="p-3 border-r border-border">{fmtDate(p.date)}</td>
                          <td className="p-3 border-r border-border text-right tabular-nums">{fmt(p.amount)}</td>
                          <td className="p-3 capitalize">{p.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
              </div>
            </div>

            <div className="font-semibold text-[15px] mt-5 mb-2">Disputes &amp; Chargebacks</div>
            <div className="border border-border rounded-xl overflow-x-auto bg-card">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead><tr className={thCls}>
                  <th className="p-3 border-r border-border">Dispute</th>
                  <th className="p-3 border-r border-border">Kind</th>
                  <th className="p-3 border-r border-border text-right">Amount</th>
                  <th className="p-3">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {data.disputes.length === 0 ? (
                    <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">No disputes on record.</td></tr>
                  ) : data.disputes.map((d, i) => (
                    <tr key={i} className="hover:bg-accent/50">
                      <td className="p-3 border-r border-border font-medium">{d.disputeNumber}</td>
                      <td className="p-3 border-r border-border capitalize">{d.kind}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{fmt(d.amount)}</td>
                      <td className="p-3 capitalize">{d.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { PeriodPicker, StatementNav, fmt, monthLabel, thCls, useStatement } from '../_shared';

// /admin/accounting/reports/trial-balance — Comparative Trial
// Balance (owner's financial_statements.html set): every account
// with a balance, debit and credit columns as of the period end
// and the prior period end, proving total debits = total credits
// at both dates before statements are drawn.

type Row = {
  code: string; name: string; type: string;
  debitCurrent: number; creditCurrent: number; debitPrior: number; creditPrior: number;
};
type Data = {
  period: string; priorPeriod: string; rows: Row[];
  totals: { debitCurrent: number; creditCurrent: number; debitPrior: number; creditPrior: number };
};

export default function TrialBalancePage() {
  const [period, setPeriod] = useState('');
  const { data, loading, error } = useStatement<Data>('trial-balance', period, setPeriod);
  const effPeriod = data?.period || period;
  const balancedNow = data ? data.totals.debitCurrent === data.totals.creditCurrent : false;
  const balancedPrior = data ? data.totals.debitPrior === data.totals.creditPrior : false;

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Trial Balance</h1>
        </div>
        {effPeriod ? <PeriodPicker period={effPeriod} onChange={setPeriod} /> : null}
      </div>
      <StatementNav active="/admin/accounting/reports/trial-balance" />

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}
        {loading && !data ? <div className="text-muted-foreground text-sm">Loading the trial balance…</div> : null}
        {data ? (
          <>
            <div className={`rounded-lg border px-4 py-2 text-sm mb-4 ${balancedNow && balancedPrior ? 'border-emerald-600/30 bg-emerald-50 text-emerald-900' : 'border-destructive/40 bg-destructive/5 text-destructive'}`}>
              {balancedNow && balancedPrior
                ? `✓ Books are in balance at both dates — debits equal credits (${fmt(data.totals.debitCurrent)} now, ${fmt(data.totals.debitPrior)} at prior month end).`
                : `⚠ Out of balance — current variance ${fmt(Math.abs(data.totals.debitCurrent - data.totals.creditCurrent))}, prior variance ${fmt(Math.abs(data.totals.debitPrior - data.totals.creditPrior))}.`}
            </div>
            <div className="border border-border rounded-xl overflow-x-auto bg-card">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead>
                  <tr className={thCls}>
                    <th className="p-3 border-r border-border">Code</th>
                    <th className="p-3 border-r border-border">Account</th>
                    <th className="p-3 border-r border-border">Type</th>
                    <th className="p-3 border-r border-border text-right">Debit — {monthLabel(data.period)}</th>
                    <th className="p-3 border-r border-border text-right">Credit — {monthLabel(data.period)}</th>
                    <th className="p-3 border-r border-border text-right">Debit — {monthLabel(data.priorPeriod)}</th>
                    <th className="p-3 text-right">Credit — {monthLabel(data.priorPeriod)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.length === 0 ? (
                    <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">No posted balances at either date. Accounts appear here once journal entries are posted against them.</td></tr>
                  ) : data.rows.map((r) => (
                    <tr key={r.code} className="hover:bg-accent/50">
                      <td className="p-3 border-r border-border tabular-nums">{r.code}</td>
                      <td className="p-3 border-r border-border font-medium">{r.name}</td>
                      <td className="p-3 border-r border-border capitalize">{r.type}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{r.debitCurrent ? fmt(r.debitCurrent) : '—'}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{r.creditCurrent ? fmt(r.creditCurrent) : '—'}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{r.debitPrior ? fmt(r.debitPrior) : '—'}</td>
                      <td className="p-3 text-right tabular-nums">{r.creditPrior ? fmt(r.creditPrior) : '—'}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40 font-semibold">
                    <td className="p-3 border-r border-border" colSpan={3}>Totals</td>
                    <td className="p-3 border-r border-border text-right tabular-nums">{fmt(data.totals.debitCurrent)}</td>
                    <td className="p-3 border-r border-border text-right tabular-nums">{fmt(data.totals.creditCurrent)}</td>
                    <td className="p-3 border-r border-border text-right tabular-nums">{fmt(data.totals.debitPrior)}</td>
                    <td className="p-3 text-right tabular-nums">{fmt(data.totals.creditPrior)}</td>
                  </tr>
                </tbody>
              </table></div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { PeriodPicker, StatementNav, fmt, monthLabel, useStatement } from '../_shared';

// /admin/accounting/reports/retained-earnings — Statement of
// Retained Earnings (owner's financial_statements.html): opening
// retained earnings + the period's net income − owner
// distributions = closing retained earnings, all from posted
// journal data, with the derivation printed on the page.

type Data = {
  period: string;
  reAccounts: { code: string; name: string }[];
  distAccounts: { code: string; name: string }[];
  openingRE: number; netIncome: number; distributions: number; closingRE: number;
  ledgerREBalance: number; derivation: string;
};

export default function RetainedEarningsPage() {
  const [period, setPeriod] = useState('');
  const { data, loading, error } = useStatement<Data>('retained-earnings', period, setPeriod);
  const effPeriod = data?.period || period;

  const line = (label: string, value: number, opts?: { bold?: boolean; sub?: string }) => (
    <tr className={opts?.bold ? 'bg-muted/40 font-semibold' : ''}>
      <td className="p-3">
        {label}
        {opts?.sub ? <div className="text-[12px] font-normal text-muted-foreground">{opts.sub}</div> : null}
      </td>
      <td className="p-3 text-right tabular-nums">{fmt(value)}</td>
    </tr>
  );

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Retained Earnings</h1>
        </div>
        {effPeriod ? <PeriodPicker period={effPeriod} onChange={setPeriod} /> : null}
      </div>
      <StatementNav active="/admin/accounting/reports/retained-earnings" />

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}
        {loading && !data ? <div className="text-muted-foreground text-sm">Loading the retained earnings statement…</div> : null}
        {data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ending Retained Earnings</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{fmt(data.closingRE)}</div>
                <div className="text-[12px] text-muted-foreground">accumulated equity after this period</div>
              </div>
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Net Income Added</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{fmt(data.netIncome)}</div>
                <div className="text-[12px] text-muted-foreground">posted revenue minus expenses this period</div>
              </div>
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Distributions Taken</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{fmt(data.distributions)}</div>
                <div className="text-[12px] text-muted-foreground">{data.distAccounts.map((a) => `${a.code} · ${a.name}`).join(' · ') || 'no distribution accounts in the chart'}</div>
              </div>
            </div>

            <div className="border border-border rounded-xl overflow-x-auto bg-card mt-5">
              <div className="adm-table-wrap"><table className="adm-table">
                <tbody className="divide-y divide-border">
                  {line('Retained Earnings, Beginning of Period', data.openingRE, {
                    sub: `Posted balance of ${data.reAccounts.map((a) => `${a.code} · ${a.name}`).join(' and ') || 'the retained-earnings accounts'} at the prior month end.`,
                  })}
                  {line('Add: Net Income for the Period', data.netIncome)}
                  {line('Less: Owner Distributions & Draws', data.distributions)}
                  {line('Retained Earnings, End of Period', data.closingRE, { bold: true })}
                  {line('Check: Ledger Balance of Retained-Earnings Accounts', data.ledgerREBalance, {
                    sub: 'This only moves when a closing entry posts earnings into the retained-earnings accounts; the difference to the line above is earnings not yet closed.',
                  })}
                </tbody>
              </table></div>
            </div>

            <div className="rounded-lg border border-border bg-card px-4 py-3 text-[13px] mt-4">
              <span className="font-semibold">How this statement is derived: </span>{data.derivation}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

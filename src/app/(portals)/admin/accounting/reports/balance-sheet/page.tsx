'use client';

import React, { useState } from 'react';
import { ComparativeTable, PeriodPicker, StatementNav, fmt, monthLabel, useStatement, type CompSection } from '../_shared';

// /admin/accounting/reports/balance-sheet — Comparative Balance
// Sheet (owner's financial_statements.html): account balances as
// of the period end against the prior period end, with change $
// and %, from posted journal lines. Equity folds in cumulative
// earnings through each date, and the page proves A = L + E.

type Data = {
  period: string; priorPeriod: string;
  sections: CompSection[];
  totalAssets: number; totalAssetsPrior: number;
  totalLiabEquity: number; totalLiabEquityPrior: number;
  balanced: boolean;
};

export default function BalanceSheetPage() {
  const [period, setPeriod] = useState('');
  const { data, loading, error } = useStatement<Data>('balance-sheet', period, setPeriod);
  const effPeriod = data?.period || period;

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Balance Sheet</h1>
        </div>
        {effPeriod ? <PeriodPicker period={effPeriod} onChange={setPeriod} /> : null}
      </div>
      <StatementNav active="/admin/accounting/reports/balance-sheet" />

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}
        {loading && !data ? <div className="text-muted-foreground text-sm">Loading the balance sheet…</div> : null}
        {data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Assets</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{fmt(data.totalAssets)}</div>
                <div className="text-[12px] text-muted-foreground">was {fmt(data.totalAssetsPrior)} at prior month end</div>
              </div>
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Liabilities + Equity</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{fmt(data.totalLiabEquity)}</div>
                <div className="text-[12px] text-muted-foreground">was {fmt(data.totalLiabEquityPrior)} at prior month end</div>
              </div>
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">A = L + E Balance</div>
                <div className="text-xl font-semibold mt-1">{data.balanced ? '✓ Balanced' : '⚠ Out of balance'}</div>
                <div className="text-[12px] text-muted-foreground">{data.balanced ? '0.00 variance — the books tie.' : `Off by ${fmt(Math.abs(data.totalAssets - data.totalLiabEquity))}.`}</div>
              </div>
            </div>
            {data.sections.map((s) => (
              <ComparativeTable key={s.title} section={s} currentLabel={`As of ${monthLabel(data.period)}`} priorLabel={`As of ${monthLabel(data.priorPeriod)}`} />
            ))}
            <p className="text-[12px] text-muted-foreground mt-4">
              Stated in United States Dollars (USD), accrual basis. Current Period Earnings inside Equity are the cumulative
              posted revenue minus expenses through each date — they move into Retained Earnings when a closing entry is posted.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

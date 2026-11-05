'use client';

import React, { useState } from 'react';
import { ComparativeTable, PeriodPicker, StatementNav, fmt, fmtSigned, changePct, monthLabel, useStatement, type CompSection } from '../_shared';

// /admin/accounting/reports/profit-loss — Comparative Income
// Statement (owner's financial_statements.html): posted activity
// inside the month against the same lines for the prior month,
// with change $ and %, gross profit (revenue − COGS, expense
// accounts coded 5xxx) and the net income bottom line.

type Data = {
  period: string; priorPeriod: string;
  sections: CompSection[];
  cogs: { current: number; prior: number };
  grossProfit: { current: number; prior: number };
  netIncome: { current: number; prior: number };
};

export default function ProfitLossPage() {
  const [period, setPeriod] = useState('');
  const { data, loading, error } = useStatement<Data>('profit-loss', period, setPeriod);
  const effPeriod = data?.period || period;

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Profit &amp; Loss</h1>
        </div>
        {effPeriod ? <PeriodPicker period={effPeriod} onChange={setPeriod} /> : null}
      </div>
      <StatementNav active="/admin/accounting/reports/profit-loss" />

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}
        {loading && !data ? <div className="text-muted-foreground text-sm">Loading the income statement…</div> : null}
        {data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Net Income — {monthLabel(data.period)}</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{fmt(data.netIncome.current)}</div>
                <div className="text-[12px] text-muted-foreground">{fmtSigned(data.netIncome.current - data.netIncome.prior)} vs {monthLabel(data.priorPeriod)} ({changePct(data.netIncome.current, data.netIncome.prior)})</div>
              </div>
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gross Profit</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{fmt(data.grossProfit.current)}</div>
                <div className="text-[12px] text-muted-foreground">Revenue minus cost of goods sold (accounts coded 5xxx)</div>
              </div>
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cost of Goods Sold</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{fmt(data.cogs.current)}</div>
                <div className="text-[12px] text-muted-foreground">was {fmt(data.cogs.prior)} in {monthLabel(data.priorPeriod)}</div>
              </div>
            </div>
            {data.sections.map((s) => (
              <ComparativeTable key={s.title} section={s} currentLabel={monthLabel(data.period)} priorLabel={monthLabel(data.priorPeriod)} />
            ))}
            <div className="border border-border rounded-xl overflow-x-auto bg-card mt-5">
              <div className="adm-table-wrap"><table className="adm-table">
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="p-3 font-medium">Gross Profit (Revenue − COGS)</td>
                    <td className="p-3 text-right tabular-nums">{fmt(data.grossProfit.current)}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">prior {fmt(data.grossProfit.prior)}</td>
                  </tr>
                  <tr className="bg-muted/40 font-semibold">
                    <td className="p-3">Net Income</td>
                    <td className="p-3 text-right tabular-nums">{fmt(data.netIncome.current)}</td>
                    <td className="p-3 text-right tabular-nums">prior {fmt(data.netIncome.prior)}</td>
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

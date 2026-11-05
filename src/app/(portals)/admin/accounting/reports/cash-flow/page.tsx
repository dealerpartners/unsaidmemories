'use client';

import React, { useState } from 'react';
import { PeriodPicker, StatementNav, fmt, fmtSigned, monthLabel, thCls, useStatement } from '../_shared';

// /admin/accounting/reports/cash-flow — Statement of Cash Flows
// (owner's financial_statements.html), direct method derived from
// the posted journal: each entry touching a cash/bank account is
// classified Operating / Investing / Financing by its counterpart
// accounts. The derivation is printed on the page, and opening
// cash + net change must reconcile to closing cash.

type Entry = { date: string; reference: string | null; memo: string | null; amount: number };
type Section = { key: string; label: string; total: number; entries: Entry[] };
type Data = {
  period: string;
  cashAccounts: { code: string; name: string }[];
  sections: Section[];
  openingCash: number; closingCash: number; netChange: number;
  internalTransfers: number; reconciles: boolean; derivation: string;
};

export default function CashFlowPage() {
  const [period, setPeriod] = useState('');
  const { data, loading, error } = useStatement<Data>('cash-flow', period, setPeriod);
  const effPeriod = data?.period || period;
  const operating = data?.sections.find((s) => s.key === 'operating');

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Cash Flow Statement</h1>
        </div>
        {effPeriod ? <PeriodPicker period={effPeriod} onChange={setPeriod} /> : null}
      </div>
      <StatementNav active="/admin/accounting/reports/cash-flow" />

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}
        {loading && !data ? <div className="text-muted-foreground text-sm">Loading the cash flow statement…</div> : null}
        {data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Operating Cash Flow</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{fmtSigned(operating?.total || 0)}</div>
                <div className="text-[12px] text-muted-foreground">{operating?.entries.length || 0} cash entr{operating?.entries.length === 1 ? 'y' : 'ies'} classified operating</div>
              </div>
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Opening Cash</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{fmt(data.openingCash)}</div>
                <div className="text-[12px] text-muted-foreground">cash &amp; bank balances at month start</div>
              </div>
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Net Change</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{fmtSigned(data.netChange)}</div>
                <div className="text-[12px] text-muted-foreground">{data.internalTransfers} internal transfer(s) excluded</div>
              </div>
              <div className="border border-border rounded-xl bg-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Closing Cash</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{fmt(data.closingCash)}</div>
                <div className="text-[12px] text-muted-foreground">{data.reconciles ? '✓ opening + change = closing' : '⚠ does not reconcile'}</div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card px-4 py-3 text-[13px] mt-4">
              <span className="font-semibold">How this statement is derived: </span>{data.derivation}
              <div className="text-muted-foreground mt-1">
                Cash &amp; bank accounts in scope: {data.cashAccounts.map((a) => `${a.code} · ${a.name}`).join('  ·  ') || 'none configured'}.
              </div>
            </div>

            {data.sections.map((s) => (
              <div key={s.key} className="mt-5">
                <div className="font-semibold text-[15px] mb-2">{s.label}</div>
                <div className="border border-border rounded-xl overflow-x-auto bg-card">
                  <div className="adm-table-wrap"><table className="adm-table">
                    <thead>
                      <tr className={thCls}>
                        <th className="p-3 border-r border-border">Date</th>
                        <th className="p-3 border-r border-border">Reference</th>
                        <th className="p-3 border-r border-border">Memo</th>
                        <th className="p-3 text-right">Cash Effect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {s.entries.length === 0 ? (
                        <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">No {s.key} cash movement this period.</td></tr>
                      ) : s.entries.map((e, i) => (
                        <tr key={i} className="hover:bg-accent/50">
                          <td className="p-3 border-r border-border tabular-nums">{e.date}</td>
                          <td className="p-3 border-r border-border">{e.reference || '—'}</td>
                          <td className="p-3 border-r border-border">{e.memo || '—'}</td>
                          <td className="p-3 text-right tabular-nums">{fmtSigned(e.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/40 font-semibold">
                        <td className="p-3 border-r border-border" colSpan={3}>Net Cash from {s.label}</td>
                        <td className="p-3 text-right tabular-nums">{fmtSigned(s.total)}</td>
                      </tr>
                    </tbody>
                  </table></div>
                </div>
              </div>
            ))}

            <div className="border border-border rounded-xl overflow-x-auto bg-card mt-5">
              <div className="adm-table-wrap"><table className="adm-table">
                <tbody className="divide-y divide-border">
                  <tr><td className="p-3 font-medium">Opening Cash &amp; Equivalents</td><td className="p-3 text-right tabular-nums">{fmt(data.openingCash)}</td></tr>
                  <tr><td className="p-3 font-medium">Net Change in Cash</td><td className="p-3 text-right tabular-nums">{fmtSigned(data.netChange)}</td></tr>
                  <tr className="bg-muted/40 font-semibold"><td className="p-3">Closing Cash &amp; Equivalents</td><td className="p-3 text-right tabular-nums">{fmt(data.closingCash)}</td></tr>
                </tbody>
              </table></div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

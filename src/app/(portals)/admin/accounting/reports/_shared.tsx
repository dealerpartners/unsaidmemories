'use client';

import React from 'react';
import Link from 'next/link';

// Shared chrome for the Financial Reporting statement suite
// (owner's financial_statements.html): one header format, one
// statement switcher, one period picker, one comparative table —
// so every statement in the set reads the same way.

export const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

export const fmtSigned = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));

export const changePct = (current: number, prior: number): string => {
  if (!prior) return current ? '—' : '0.0%';
  const p = ((current - prior) / Math.abs(prior)) * 100;
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;
};

export const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export const shiftPeriod = (period: string, delta: number) => {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const STATEMENTS = [
  { href: '/admin/accounting/reports/balance-sheet', label: 'Balance Sheet' },
  { href: '/admin/accounting/reports/profit-loss', label: 'Income Statement (P&L)' },
  { href: '/admin/accounting/reports/cash-flow', label: 'Cash Flow Statement' },
  { href: '/admin/accounting/reports/retained-earnings', label: 'Retained Earnings' },
  { href: '/admin/accounting/reports/trial-balance', label: 'Trial Balance' },
  { href: '/admin/accounting/reports/revenue', label: 'Revenue Report' },
] as const;

export const REPORT_LINKS = [
  { href: '/admin/accounting/reports/revenue-bridge', label: 'Gross-to-Net Bridge' },
  { href: '/admin/accounting/reports/settlement-clearing', label: 'Settlement Clearing' },
  { href: '/admin/accounting/reports/margin-matrix', label: 'Margin Matrix' },
  { href: '/admin/accounting/reports/funnel', label: 'Funnel Analytics' },
  { href: '/admin/accounting/reports/segments', label: 'Segment P&L' },
] as const;

export function StatementNav({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {STATEMENTS.map((s) => (
        <Link key={s.href} href={s.href}
          className={`h-8 px-3 inline-flex items-center rounded-full border text-[12.5px] font-medium ${active === s.href ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'border-border bg-card text-foreground'}`}>
          {s.label}
        </Link>
      ))}
      {REPORT_LINKS.map((s) => (
        <Link key={s.href} href={s.href}
          className={`h-8 px-3 inline-flex items-center rounded-full border text-[12.5px] font-medium ${active === s.href ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'border-border bg-card text-foreground'}`}>
          {s.label}
        </Link>
      ))}
    </div>
  );
}

export function PeriodPicker({ period, onChange }: { period: string; onChange: (p: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(shiftPeriod(period, -1))} data-tip="Shows the previous month, with the month before it as the comparison"
        className="h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium">← Prior</button>
      <input type="month" value={period} onChange={(e) => e.target.value && onChange(e.target.value)}
        className="bg-background border border-input rounded-lg px-3 h-9 text-[13px]" aria-label="Statement period" />
      <button type="button" onClick={() => onChange(shiftPeriod(period, 1))} data-tip="Shows the next month, with this month as the comparison"
        className="h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium">Next →</button>
    </div>
  );
}

export const thCls = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

export type CompRow = { code: string; name: string; current: number; prior: number };
export type CompSection = { title: string; totalLabel: string; rows: CompRow[]; totalCurrent: number; totalPrior: number };

// His comparative table: line item | current | prior | change $ | change %.
export function ComparativeTable({ section, currentLabel, priorLabel }: { section: CompSection; currentLabel: string; priorLabel: string }) {
  return (
    <div className="mt-5">
      <div className="font-semibold text-[15px] mb-2">{section.title}</div>
      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className={thCls}>
              <th className="p-3 border-r border-border">Account Designation / GAAP Line Item</th>
              <th className="p-3 border-r border-border text-right">{currentLabel}</th>
              <th className="p-3 border-r border-border text-right">{priorLabel}</th>
              <th className="p-3 border-r border-border text-right">Change ($)</th>
              <th className="p-3 text-right">Change (%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {section.rows.length === 0 ? (
              <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">No posted activity in either period.</td></tr>
            ) : section.rows.map((r) => (
              <tr key={`${section.title}-${r.code}-${r.name}`} className="hover:bg-accent/50">
                <td className="p-3 border-r border-border">
                  <span className="font-medium">{r.name}</span>
                  {r.code ? <span className="text-muted-foreground"> · {r.code}</span> : null}
                </td>
                <td className="p-3 border-r border-border text-right tabular-nums">{fmt(r.current)}</td>
                <td className="p-3 border-r border-border text-right tabular-nums">{fmt(r.prior)}</td>
                <td className="p-3 border-r border-border text-right tabular-nums">{fmtSigned(r.current - r.prior)}</td>
                <td className="p-3 text-right tabular-nums">{changePct(r.current, r.prior)}</td>
              </tr>
            ))}
            <tr className="bg-muted/40 font-semibold">
              <td className="p-3 border-r border-border">{section.totalLabel}</td>
              <td className="p-3 border-r border-border text-right tabular-nums">{fmt(section.totalCurrent)}</td>
              <td className="p-3 border-r border-border text-right tabular-nums">{fmt(section.totalPrior)}</td>
              <td className="p-3 border-r border-border text-right tabular-nums">{fmtSigned(section.totalCurrent - section.totalPrior)}</td>
              <td className="p-3 text-right tabular-nums">{changePct(section.totalCurrent, section.totalPrior)}</td>
            </tr>
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

export function useStatement<T>(statement: string, period: string, onPeriod: (p: string) => void) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    setLoading(true);
    const q = period ? `?statement=${statement}&period=${period}` : `?statement=${statement}`;
    fetch(`/api/admin/accounting/financial-statements${q}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        if (!live) return;
        setData(d);
        if (!period && d.period) onPeriod(d.period);
      })
      .catch(() => live && setError('This statement could not be loaded.'))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statement, period]);
  return { data, loading, error };
}

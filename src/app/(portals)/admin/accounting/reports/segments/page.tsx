'use client';

import React, { useEffect, useMemo, useState } from 'react';

// /admin/accounting/reports/segments — Dimensions & Segment P&L,
// rebuilt to the owner's spec (dimensions_segment_p_l.html): the
// profit & loss sliced by dimension — sales channel, product line,
// business unit, fulfillment location — with every slice
// reconciling back to the posted ledger totals.
// Data: GET /api/admin/accounting/segments over acct_dimensions,
// acct_dimension_values and posted acct_journal_lines (tags ride
// the lines' dimensions jsonb).

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type DimValue = { id: string; code: string; name: string };
type Segment = { valueKey: string; debit: number; credit: number; lines: number };
type Dimension = {
  id: string; code: string; name: string; values: DimValue[];
  segments: Segment[]; untagged: { debit: number; credit: number };
};
type ByType = { accountType: string; debit: number; credit: number };

export default function SegmentsPage() {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [totals, setTotals] = useState<{ debit: number; credit: number; lines: number }>({ debit: 0, credit: 0, lines: 0 });
  const [byType, setByType] = useState<ByType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDim, setActiveDim] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/accounting/segments', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        const dims: Dimension[] = Array.isArray(d.dimensions) ? d.dimensions : [];
        setDimensions(dims);
        setTotals(d.totals || { debit: 0, credit: 0, lines: 0 });
        setByType(Array.isArray(d.byAccountType) ? d.byAccountType : []);
        setActiveDim((cur) => cur || dims[0]?.id || null);
      })
      .catch(() => setError('Segment data could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const dim = useMemo(() => dimensions.find((d) => d.id === activeDim) || null, [dimensions, activeDim]);
  const labelFor = (d: Dimension, key: string) => {
    const v = d.values.find((x) => x.code === key || x.id === key || x.name === key);
    return v ? v.name : key;
  };
  const revenue = byType.find((t) => t.accountType === 'revenue');
  const expenses = byType.filter((t) => t.accountType === 'expense');
  const revenueNet = revenue ? revenue.credit - revenue.debit : 0;
  const expenseNet = expenses.reduce((s, t) => s + (t.debit - t.credit), 0);

  const thCls = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Dimensions &amp; Segment P&amp;L</h1>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mt-4">{error}</div>}

      <div className="border border-border rounded-xl bg-card mt-4">
        <div className="p-4 border-b border-border">
          <h2 className="font-display text-base font-semibold">Consolidated P&amp;L (all segments together)</h2>
          <p className="text-[13px] text-muted-foreground mt-1">The totals every slice below adds back up to.</p>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Revenue (net)</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">{loading ? '—' : fmt(revenueNet)}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Expenses (net)</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">{loading ? '—' : fmt(expenseNet)}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Net (revenue − expenses)</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">{loading ? '—' : fmt(revenueNet - expenseNet)}</div>
          </div>
        </div>
        {byType.length > 0 && (
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className={thCls}>
                <th className="p-3 border-r border-border">P&amp;L Line Item</th>
                <th className="p-3 border-r border-border text-right">Debits</th>
                <th className="p-3 text-right">Credits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {byType.map((t) => (
                <tr key={t.accountType} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-medium">{t.accountType[0].toUpperCase() + t.accountType.slice(1)} accounts</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(t.debit)}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(t.credit)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="p-3 border-r border-border">Consolidated Total (posted ledger)</td>
                <td className="p-3 border-r border-border text-right tabular-nums">{fmt(totals.debit)}</td>
                <td className="p-3 text-right tabular-nums">{fmt(totals.credit)}</td>
              </tr>
            </tbody>
          </table></div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {dimensions.map((d) => (
          <button
            key={d.id}
            onClick={() => setActiveDim(d.id)}
            className={`rounded-lg px-3 h-9 text-[13px] border ${activeDim === d.id ? 'text-white border-transparent' : 'bg-card border-border text-foreground'}`}
            style={activeDim === d.id ? { backgroundColor: '#7258e8' } : undefined}
            data-tip={`Slice the ledger by ${d.name}`}
          >
            By {d.name}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className={thCls}>
                <th className="p-3 border-r border-border">Segment</th>
                <th className="p-3 border-r border-border text-center">Posted Lines</th>
                <th className="p-3 border-r border-border text-right">Debits</th>
                <th className="p-3 border-r border-border text-right">Credits</th>
                <th className="p-3 text-right">Net (Debit − Credit)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="text-center text-muted-foreground">Loading segment data…</td></tr>
              ) : dimensions.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted-foreground">No dimensions are defined yet. Dimensions are the slices — sales channel, product line, business unit, fulfillment location. Once dimensions exist and journal lines carry their tags, each slice appears here and reconciles to the consolidated totals above.</td></tr>
              ) : !dim ? (
                <tr><td colSpan={5} className="text-center text-muted-foreground">Pick a dimension above to see its slice.</td></tr>
              ) : (
                <>
                  {dim.segments.map((s) => (
                    <tr key={s.valueKey} className="hover:bg-accent/50">
                      <td className="p-3 border-r border-border font-medium">{labelFor(dim, s.valueKey)}</td>
                      <td className="p-3 border-r border-border text-center tabular-nums">{s.lines}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{fmt(s.debit)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{fmt(s.credit)}</td>
                      <td className="p-3 text-right tabular-nums">{fmt(s.debit - s.credit)}</td>
                    </tr>
                  ))}
                  <tr className="hover:bg-accent/50">
                    <td className="p-3 border-r border-border text-muted-foreground">Untagged (no {dim.name} on the line)</td>
                    <td className="p-3 border-r border-border text-center text-muted-foreground">—</td>
                    <td className="p-3 border-r border-border text-right tabular-nums">{fmt(dim.untagged.debit)}</td>
                    <td className="p-3 border-r border-border text-right tabular-nums">{fmt(dim.untagged.credit)}</td>
                    <td className="p-3 text-right tabular-nums">{fmt(dim.untagged.debit - dim.untagged.credit)}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="p-3 border-r border-border" colSpan={2}>Consolidated Total</td>
                    <td className="p-3 border-r border-border text-right tabular-nums">{fmt(totals.debit)}</td>
                    <td className="p-3 border-r border-border text-right tabular-nums">{fmt(totals.credit)}</td>
                    <td className="p-3 text-right tabular-nums">{fmt(totals.debit - totals.credit)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

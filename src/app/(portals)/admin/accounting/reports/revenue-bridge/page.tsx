'use client';

import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { StatementNav, fmt, thCls } from '../_shared';

// /admin/accounting/reports/revenue-bridge — Gross-to-Net Revenue
// Bridge (owner's gross_to_net_revenue_bridge.html): the forensic
// waterfall from captured GMV to net realized revenue. Every
// stage is computed from a named source table; a stage with no
// records shows a real $0.00 and says why — never an estimate.

type Stage = { name: string; detail: string; amount: number; pctOfGmv: number; gl: string; source: string; audit: string };
type Data = {
  stages: Stage[]; gmv: number; net: number; yieldPct: number; totalDrag: number;
  memo: { pendingOrders: number; pendingTotal: number; glPostedRevenue: number };
};

export default function RevenueBridgePage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/accounting/revenue-bridge', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then(setData)
      .catch(() => setError('The revenue bridge could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const exportCsv = () => {
    if (!data) return;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = data.stages.map((s) => [s.name, s.amount.toFixed(2), `${s.pctOfGmv.toFixed(2)}%`, s.gl, s.source, s.audit].map(esc).join(','));
    const blob = new Blob([['Stage,Amount,% of GMV,GL Destination,Source,Audit Status', ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'revenue-bridge.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };

  const kpi = (label: string, value: string, foot: string) => (
    <div className="border border-border rounded-xl bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
      <div className="text-[12px] text-muted-foreground">{foot}</div>
    </div>
  );

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Gross-to-Net Revenue Bridge</h1>
        </div>
        <button type="button" onClick={exportCsv} disabled={!data} data-tip="Downloads this waterfall as a CSV file"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium disabled:opacity-50">
          <Download className="size-4" /> Export Waterfall CSV
        </button>
      </div>
      <StatementNav active="/admin/accounting/reports/revenue-bridge" />

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}
        {loading && !data ? <div className="text-muted-foreground text-sm">Loading the bridge…</div> : null}
        {data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {kpi('Gross Order Volume', fmt(data.gmv), 'captured storefront orders')}
              {kpi('Total Leakage / Drag', fmt(data.totalDrag), `${data.gmv ? (100 - data.yieldPct).toFixed(2) : '0.00'}% of GMV`)}
              {kpi('Net Realized Revenue', fmt(data.net), `${data.yieldPct.toFixed(2)}% yield on GMV`)}
              {kpi('Awaiting Payment (excluded)', fmt(data.memo.pendingTotal), `${data.memo.pendingOrders} order(s) placed but not captured — not counted in GMV`)}
            </div>

            <div className="font-semibold text-[15px] mt-5 mb-2">Waterfall Step-Down</div>
            <div className="border border-border rounded-xl bg-card p-4 flex flex-col gap-2">
              {data.stages.map((s, i) => {
                const width = data.gmv ? Math.max(2, (Math.abs(s.amount) / data.gmv) * 100) : 2;
                const isFirst = i === 0;
                const isNet = i === data.stages.length - 1;
                return (
                  <div key={s.name} className="flex items-center gap-3">
                    <div className="w-64 shrink-0 text-[12.5px] font-medium truncate">{s.name}</div>
                    <div className="flex-1 h-6 rounded bg-muted/50 relative overflow-hidden">
                      <div className={`h-full rounded ${isNet ? 'bg-[#7258e8]' : isFirst ? 'bg-emerald-500/70' : 'bg-red-400/70'}`} style={{ width: `${width}%` }} />
                    </div>
                    <div className="w-28 shrink-0 text-right text-[12.5px] tabular-nums font-medium">{fmt(s.amount)}</div>
                  </div>
                );
              })}
            </div>

            <div className="font-semibold text-[15px] mt-5 mb-2">Waterfall Revenue Ledger Bridge</div>
            <div className="border border-border rounded-xl overflow-x-auto bg-card">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead><tr className={thCls}>
                  <th className="p-3 border-r border-border">Bridge Stage &amp; Forensic Line</th>
                  <th className="p-3 border-r border-border text-right">Nominal Amount</th>
                  <th className="p-3 border-r border-border text-right">% of GMV</th>
                  <th className="p-3 border-r border-border">GL Destination</th>
                  <th className="p-3">Audit Status</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {data.stages.map((s, i) => (
                    <tr key={s.name} className={i === data.stages.length - 1 ? 'bg-muted/40 font-semibold' : 'hover:bg-accent/50'}>
                      <td className="p-3 border-r border-border">
                        <div className="font-medium">{i + 1}. {s.name}</div>
                        <div className="text-[11px] text-muted-foreground">{s.detail} · source: {s.source}</div>
                      </td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{fmt(s.amount)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{s.pctOfGmv.toFixed(2)}%</td>
                      <td className="p-3 border-r border-border">{s.gl}</td>
                      <td className="p-3">{s.audit}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>

            <div className="rounded-lg border border-border bg-card px-4 py-3 text-[13px] mt-4">
              <span className="font-semibold">Ledger check: </span>
              the posted general ledger carries {fmt(data.memo.glPostedRevenue)} of net revenue-account balance across all posted
              journals. The bridge above is built from operational sources (orders, refunds, disputes, payouts); the two figures
              meet only when order activity is posted into the ledger, so a difference between them is unposted activity, not an error in either record.
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { ViewHeader } from '@/components/admin/ViewHeader';

// /admin/dashboard — Executive GMV & Margins (owner's
// DASHBOARD_VIEW.html, View 2). This view IS the page (owner's verdict,
// 2026-11-02: his file replaces the presentation). What used to render
// under this view — the earlier page's KPI tiles, year-to-date panel,
// recent-orders list and needs-attention list — is off the route; the
// numbers live on Operations Vitals (/admin) and in Reports.
// DashboardView.tsx (the imported salon dashboard) stays on disk,
// unmounted, as before.
//
// Gross Revenue (YTD) is live from erp_orders via
// /api/admin/dashboard/views; the margin tiles and the category margin
// table render honest states — margins are not computable from the
// live schema (no line-item costs on the order ledger; see the
// dashboard gap list #1). The FY selector and Export Executive Pack
// buttons from his file are omitted for the same reason: no backend
// exists for them yet (gap list #2).

type Exec = { ytdRevenue: number; ytdDeltaPct: number | null; margin: { computable: boolean } };

const money = (v: unknown) => `$${Number(v ?? 0).toFixed(2)}`;

export default function DashboardPage() {
  const [exec, setExec] = useState<Exec | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const vRes = await fetch('/api/admin/dashboard/views', { cache: 'no-store' });
        if (vRes.ok) setExec((await vRes.json()).data?.executive ?? null);
        else setError('The executive figures could not be loaded.');
      } catch {
        setError('The executive figures could not be loaded.');
      }
    })();
  }, []);

  return (
    <div className="flex flex-col w-full bg-background text-foreground p-8 gap-6 max-w-[1400px] mx-auto">
      <ViewHeader title="Executive GMV & Margins" />

      {error ? (
        <p className="text-[13px] mt-4 flex items-center gap-2" style={{ color: '#b3261e' }}>
          <TriangleAlert size={14} aria-hidden="true" /> {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-5">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gross Revenue (YTD)</span>
          <div className="text-3xl font-bold mt-2">{exec ? money(exec.ytdRevenue) : '—'}</div>
          <p className="text-xs font-medium mt-1" style={{ color: '#0a6400' }}>
            {exec?.ytdDeltaPct != null
              ? `▲ ${exec.ytdDeltaPct >= 0 ? '+' : ''}${exec.ytdDeltaPct}% vs prior year`
              : 'Order value placed this year (erp_orders, non-cancelled)'}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Contribution Margin</span>
          <div className="text-3xl font-bold mt-2 text-muted-foreground">—</div>
          <p className="text-xs text-muted-foreground font-medium mt-1">Not computable yet — no cost basis on the order ledger (gap list #1)</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cost of Goods (POD Blanks)</span>
          <div className="text-3xl font-bold mt-2 text-muted-foreground">—</div>
          <p className="text-xs text-muted-foreground font-medium mt-1">Not computable yet — supplier variants carry no cost column (gap list #1)</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Operating Profit</span>
          <div className="text-3xl font-bold mt-2 text-muted-foreground">—</div>
          <p className="text-xs text-muted-foreground font-medium mt-1">Follows the margin bridge once costs land (gap list #1)</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-5 shadow-sm mt-4">
        <h2 className="text-sm font-bold mb-4">Margin Breakdown by Product Category</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-[11px] text-muted-foreground uppercase font-semibold">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Units Sold</th>
                <th className="px-4 py-3 text-right">Gross GMV</th>
                <th className="px-4 py-3 text-right">Blank Base Cost</th>
                <th className="px-4 py-3 text-right">Shipping &amp; Fees</th>
                <th className="px-4 py-3 text-right">Net Profit</th>
                <th className="px-4 py-3 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="px-4 py-4 text-[13px] text-muted-foreground">
                  No category margin rows yet — computing them needs line-item costs joined to the order ledger,
                  which the live schema does not carry (erp_orders has no items table; supplier_catalog_variants
                  has no cost column). See gap list #1 for what has to be built.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { ViewHeader, money } from '@/components/admin/ViewHeader';

// /admin/analytics — Platform Analytics (owner's DASHBOARD_VIEW.html,
// View 3). This view IS the page (owner's verdict, 2026-11-02: his file
// replaces the presentation — the legacy AnalyticsView and
// PlatformAnalyticsView components are no longer mounted on this
// route; their files stay on disk). The view's elements wire to what
// exists:
//   Revenue Trend      → /api/admin/analytics?report=revenue (daily
//                        series over erp_orders), bucketed into 5 weeks;
//                        "Compare prior" swaps in the prior 35 days from
//                        the same 70-day read.
//   Conversion card    → the measurable funnel from /api/admin/analytics
//                        aggregates. Per-channel conversion (Organic /
//                        Meta / Direct) is NOT wired: this database has
//                        no channel-attributed visit tracking — see the
//                        analytics route's own header and gap list #3.
//   Settlements table  → acct_payouts via /api/admin/dashboard/views.
//   Export CSV         → the analytics route's real CSV mode.

type DayRow = { day: string; value: number };
type Agg = {
  revenue30: number; orders30: number; carts30: number;
  accountsCreated30: number; checkoutConversion30: number | null;
};
type Settlement = { id: string; date: string | null; batch: string; channel: string; net: number; status: string };

function weekBuckets(rows: DayRow[]): number[] {
  const out = [0, 0, 0, 0, 0];
  rows.forEach((r, i) => {
    out[Math.min(4, Math.floor(i / 7))] += r.value;
  });
  return out;
}

export default function AnalyticsPage() {
  const [daily, setDaily] = useState<DayRow[]>([]);
  const [agg, setAgg] = useState<Agg | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [comparePrior, setComparePrior] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [seriesRes, aggRes, viewsRes] = await Promise.all([
          fetch('/api/admin/analytics?report=revenue&days=70', { cache: 'no-store' }),
          fetch('/api/admin/analytics', { cache: 'no-store' }),
          fetch('/api/admin/dashboard/views', { cache: 'no-store' }),
        ]);
        if (seriesRes.ok) {
          const j = await seriesRes.json();
          if (Array.isArray(j.rows)) setDaily(j.rows);
        }
        if (aggRes.ok) {
          const j = await aggRes.json();
          if (j.kpis) {
            setAgg({
              revenue30: Number(j.kpis.revenue30 ?? 0),
              orders30: Number(j.kpis.orders30 ?? 0),
              carts30: Number(j.kpis.carts30 ?? 0),
              accountsCreated30: Number(j.kpis.accountsCreated30 ?? 0),
              checkoutConversion30: j.kpis.checkoutConversion30 ?? null,
            });
          }
        }
        if (viewsRes.ok) setSettlements((await viewsRes.json()).data?.settlements ?? []);
      } catch { /* each card renders its honest empty state */ }
    })();
  }, []);

  const current = useMemo(() => weekBuckets(daily.slice(-35)), [daily]);
  const prior = useMemo(() => weekBuckets(daily.slice(0, Math.max(0, daily.length - 35))), [daily]);
  const bars = comparePrior ? prior : current;
  const maxBar = Math.max(1, ...bars);
  const aov = agg && agg.orders30 > 0 ? agg.revenue30 / agg.orders30 : null;

  const funnel = agg
    ? [
        { label: 'Accounts created', value: agg.accountsCreated30, pct: 100 },
        { label: 'Carts started', value: agg.carts30, pct: agg.accountsCreated30 > 0 ? Math.round((agg.carts30 / agg.accountsCreated30) * 100) : 0 },
        { label: 'Orders placed', value: agg.orders30, pct: agg.accountsCreated30 > 0 ? Math.round((agg.orders30 / agg.accountsCreated30) * 100) : 0 },
      ]
    : [];

  return (
    <div className="flex flex-col w-full bg-background text-foreground gap-6 max-w-[1400px] mx-auto p-8">
        <ViewHeader title="Platform Analytics">
          <a href="/api/admin/analytics?report=revenue&days=30&format=csv" className="px-3 py-1.5 bg-card border border-border rounded-md text-sm font-semibold hover:bg-muted/50">
            Export CSV
          </a>
          <span className="px-3 py-1.5 bg-card border border-border rounded-md text-sm font-semibold text-muted-foreground">Last 30 days</span>
        </ViewHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Revenue trend */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col justify-between h-80">
            <div className="flex justify-between items-center mb-2">
              <div>
                <span className="font-semibold text-sm uppercase tracking-wider">Revenue Trend</span>
                <p className="text-xs text-muted-foreground">Daily net sales across all storefronts, by week</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Compare prior:</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={comparePrior}
                  onClick={() => setComparePrior((v) => !v)}
                  className="w-8 h-4 rounded-full relative cursor-pointer"
                  style={{ backgroundColor: comparePrior ? '#0a6400' : '#dad9dd' }}
                  data-tip="Show the prior 35 days instead of the current 35"
                >
                  <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full" style={{ [comparePrior ? 'right' : 'left']: 2 } as React.CSSProperties} />
                </button>
              </div>
            </div>
            <div className="flex-1 flex items-end gap-3 pt-6 pb-2 border-b border-border">
              {bars.map((v, i) => (
                <div
                  key={i}
                  title={money(v)}
                  className="flex-1 rounded-t relative transition-colors"
                  style={{
                    height: `${Math.max(3, Math.round((v / maxBar) * 100))}%`,
                    backgroundColor: !comparePrior && i === bars.length - 1 ? '#0a6400' : '#e3e2e6',
                  }}
                >
                  {(!comparePrior && i === bars.length - 1) || v === maxBar ? (
                    <span className="absolute -top-6 left-0 text-[10px] font-mono font-bold" style={{ color: '#0a6400' }}>{money(v)}</span>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pt-2">
              {(comparePrior ? ['Prior 5', 'Prior 4', 'Prior 3', 'Prior 2', 'Prior 1'] : ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Current']).map((l) => (
                <span key={l} className="flex-1 text-center">{l}</span>
              ))}
            </div>
          </div>

          {/* Conversion — the measurable funnel (channel split is gap #3) */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col justify-between h-80">
            <div className="flex justify-between items-center mb-2">
              <div>
                <span className="font-semibold text-sm uppercase tracking-wider">Conversion by Channel</span>
                <p className="text-xs text-muted-foreground">Channel attribution is not tracked yet — the measurable 30-day funnel is shown instead (gap list #3)</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 my-auto">
              {funnel.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Funnel figures are unavailable right now.</p>
              ) : (
                funnel.map((f, i) => (
                  <div key={f.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold">{f.label}</span>
                      <span className="font-mono">{f.value.toLocaleString()} ({f.pct}% of accounts)</span>
                    </div>
                    <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                      <div className="h-full" style={{ width: `${Math.min(100, f.pct)}%`, backgroundColor: ['#0a6400', '#006c47', '#0077c5'][i] }} />
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="text-xs text-muted-foreground border-t border-border pt-2 flex items-center justify-between">
              <span>
                Average Order Value (AOV): <strong className="text-foreground font-semibold">{aov != null ? money(aov) : '—'}</strong>
                {agg?.checkoutConversion30 != null ? <> · Cart → order conversion: <strong className="text-foreground font-semibold">{agg.checkoutConversion30}%</strong></> : null}
              </span>
            </div>
          </div>
        </div>

        {/* Settlement runs & payouts */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/30">
            <h2 className="font-semibold text-sm">Recent Settlement Runs &amp; Payouts</h2>
            <span className="text-xs text-muted-foreground">Recorded payouts (acct_payouts)</span>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 font-semibold text-muted-foreground uppercase text-xs">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Settlement Batch</th>
                <th className="px-5 py-3">Channel / Gateway</th>
                <th className="px-5 py-3 text-right">Net Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {settlements.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-4 text-[13px] text-muted-foreground">
                    No settlement runs recorded yet — when payouts are recorded in acct_payouts, they appear here.
                  </td>
                </tr>
              ) : (
                settlements.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3 font-mono text-xs">{s.date ? new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—'}</td>
                    <td className="px-5 py-3 font-medium">{s.batch}{s.status ? ` · ${s.status}` : ''}</td>
                    <td className="px-5 py-3">{s.channel}</td>
                    <td className="px-5 py-3 text-right font-semibold font-mono" style={{ color: s.net >= 0 ? '#0a6400' : '#ba1a1a' }}>
                      {s.net >= 0 ? '+' : '−'}{money(Math.abs(s.net))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { StatementNav, fmt, thCls } from '../_shared';

// /admin/accounting/reports/funnel — Financial Funnel & Revenue
// Attrition Bridge (owner's e_commerce_conversion_funnel
// _analytics.html). The session-level event tables exist but hold
// no events yet, so this bridge is built from the order and
// fulfillment records that do exist — and the page labels every
// stage with its source so nothing is passed off as tracked
// session data.

type Stage = { name: string; detail: string; count: number; value: number; source: string; pctOfPlaced: number; lostCount: number; lostValue: number };
type Data = {
  stages: Stage[];
  abandonment: { orders: number; value: number; note: string };
  aov: number;
  cohorts: { label: string; buyers: number; orders: number; revenue: number; aov: number }[];
  identifiedBuyers: number;
  eventSources: { source: string; events: number }[];
};

export default function FunnelPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/accounting/funnel', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then(setData)
      .catch(() => setError('The funnel could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const kpi = (label: string, value: string, foot: string) => (
    <div className="border border-border rounded-xl bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
      <div className="text-[12px] text-muted-foreground">{foot}</div>
    </div>
  );
  const placed = data?.stages[0];

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Financial Funnel &amp; Revenue Attrition</h1>
      </div>
      <StatementNav active="/admin/accounting/reports/funnel" />

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}
        {loading && !data ? <div className="text-muted-foreground text-sm">Loading the funnel…</div> : null}
        {data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {kpi('Realized Inflow', fmt(data.stages[data.stages.length - 1]?.value || 0), 'kept revenue after refunds')}
              {kpi('Top-of-Funnel Pipeline', fmt(placed?.value || 0), `${placed?.count || 0} order(s) placed`)}
              {kpi('Pipeline Leakage', fmt((placed?.value || 0) - (data.stages[data.stages.length - 1]?.value || 0)), 'placed value not kept')}
              {kpi('Average Order Value', fmt(data.aov), 'across captured orders')}
            </div>

            <div className="flex flex-col gap-2 mt-5">
              {data.stages.map((s, i) => {
                const width = Math.max(3, s.pctOfPlaced);
                return (
                  <div key={s.name} className="border border-border rounded-xl bg-card p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="font-semibold text-[14px]">Stage {String(i + 1).padStart(2, '0')} · {s.name}
                        <span className="ml-2 text-[12px] font-normal text-muted-foreground">{s.detail} · source: {s.source}</span>
                      </div>
                      <div className="text-[13px] tabular-nums"><span className="font-semibold">{s.count}</span> orders · {fmt(s.value)} · {s.pctOfPlaced.toFixed(1)}% of placed</div>
                    </div>
                    <div className="h-3 rounded bg-muted/50 mt-3 overflow-hidden">
                      <div className="h-full rounded bg-[#7258e8]" style={{ width: `${width}%` }} />
                    </div>
                    {i > 0 && (s.lostCount > 0 || s.lostValue > 0) ? (
                      <div className="text-[12px] text-muted-foreground mt-2">Attrition from the previous stage: {s.lostCount} order(s) · {fmt(s.lostValue)} not carried forward.</div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-amber-600/40 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 mt-4">
              <span className="font-semibold">Checkout abandonment deficit: {data.abandonment.orders} order(s) · {fmt(data.abandonment.value)}. </span>
              {data.abandonment.note}
            </div>

            <div className="font-semibold text-[15px] mt-5 mb-2">New vs. Returning Cohort Economics</div>
            <div className="border border-border rounded-xl overflow-x-auto bg-card">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead><tr className={thCls}>
                  <th className="p-3 border-r border-border">Cohort</th>
                  <th className="p-3 border-r border-border text-right">Buyers</th>
                  <th className="p-3 border-r border-border text-right">Captured Orders</th>
                  <th className="p-3 border-r border-border text-right">Revenue</th>
                  <th className="p-3 text-right">Average Order Value</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {data.cohorts.map((c) => (
                    <tr key={c.label} className="hover:bg-accent/50">
                      <td className="p-3 border-r border-border font-medium">{c.label}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{c.buyers}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{c.orders}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{fmt(c.revenue)}</td>
                      <td className="p-3 text-right tabular-nums">{fmt(c.aov)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
            <p className="text-[12px] text-muted-foreground mt-2">Cohorts cover the {data.identifiedBuyers} buyer(s) identified on captured orders; guest orders without a customer record are in the stage counts but not in a cohort.</p>

            <div className="rounded-lg border border-border bg-card px-4 py-3 text-[13px] mt-4">
              <span className="font-semibold">About session-level stages: </span>
              the storefront event tables this funnel would normally read —{' '}
              {data.eventSources.map((s) => `${s.source} (${s.events} events)`).join(' · ')} — exist but hold no events yet.
              Session, product-view and add-to-cart stages will appear here from real data as soon as storefront tracking
              writes them; until then the bridge above runs on order and fulfillment records only, and says so on every stage.
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

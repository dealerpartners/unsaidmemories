'use client';

import React, { useEffect, useMemo, useState } from 'react';

// /admin/accounting/banking/cash-flow — Banking & Cash → Cash Flow &
// Forecasting. The baseline projection is computed by the server from
// real obligations: open AR invoices and recurring billing come in,
// open AP bills go out, starting from the actual ledger cash balance.
// The what-if sandbox re-derives the series in the browser from the
// same items with the planner's adjustments — it is labeled a
// simulation and never writes anything to the books.
// Data: /api/admin/accounting/cash-flow.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Item = { date: string; kind: 'in' | 'out'; label: string; detail: string; amount: number; overdue: boolean };

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function CashFlowForecastingPage() {
  const [asOf, setAsOf] = useState('');
  const [startingCash, setStartingCash] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(90);
  const [threshold, setThreshold] = useState('0');
  // What-if knobs (simulation only)
  const [arDelay, setArDelay] = useState(0);
  const [extraMonthlyOut, setExtraMonthlyOut] = useState(0);
  const [oneOffOut, setOneOffOut] = useState(0);
  const [scenario, setScenario] = useState<'base' | 'conservative' | 'optimistic'>('base');

  useEffect(() => {
    fetch('/api/admin/accounting/cash-flow', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setAsOf(d.asOf || '');
        setStartingCash(Number(d.startingCash || 0));
        setItems(Array.isArray(d.items) ? d.items : []);
      })
      .catch(() => setError('The cash flow forecast could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const simulated = scenario !== 'base' || arDelay !== 0 || extraMonthlyOut !== 0 || oneOffOut !== 0;

  const series = useMemo(() => {
    if (!asOf) return [];
    const delay = scenario === 'conservative' ? Math.max(arDelay, 15) : scenario === 'optimistic' ? Math.min(arDelay, -5) : arDelay;
    const adj = items.map((i) => (i.kind === 'in' && !i.overdue ? { ...i, date: addDays(i.date, delay) } : i));
    const weeks: { start: string; end: string; inflow: number; outflow: number; net: number; balance: number }[] = [];
    let balance = startingCash;
    const numWeeks = Math.ceil(horizon / 7);
    for (let w = 0; w < numWeeks; w++) {
      const start = addDays(asOf, w * 7);
      const end = addDays(asOf, w * 7 + 6);
      const inflow = adj.filter((i) => i.kind === 'in' && i.date >= start && i.date <= end).reduce((s, i) => s + i.amount, 0);
      let outflow = adj.filter((i) => i.kind === 'out' && i.date >= start && i.date <= end).reduce((s, i) => s + i.amount, 0);
      outflow += extraMonthlyOut / 4.345; // monthly extra spread weekly
      if (w === 1) outflow += oneOffOut; // one-off lands in week 2
      balance += inflow - outflow;
      weeks.push({ start, end, inflow, outflow, net: inflow - outflow, balance });
    }
    return weeks;
  }, [asOf, items, startingCash, horizon, arDelay, extraMonthlyOut, oneOffOut, scenario]);

  const horizonItems = useMemo(() => {
    if (!asOf) return { ins: [] as Item[], outs: [] as Item[] };
    const end = addDays(asOf, horizon);
    return {
      ins: items.filter((i) => i.kind === 'in' && i.date <= end),
      outs: items.filter((i) => i.kind === 'out' && i.date <= end),
    };
  }, [items, asOf, horizon]);

  const minBalance = series.length ? Math.min(...series.map((w) => w.balance)) : startingCash;
  const endBalance = series.length ? series[series.length - 1].balance : startingCash;
  const thresh = Number(threshold) || 0;
  const belowThreshold = series.find((w) => w.balance < thresh);

  // Simple SVG line chart of the cumulative balance.
  const chart = useMemo(() => {
    if (series.length < 2) return null;
    const W = 720, H = 180, P = 8;
    const vals = [...series.map((w) => w.balance), thresh];
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const x = (i: number) => P + (i / (series.length - 1)) * (W - 2 * P);
    const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P);
    const pts = series.map((w, i) => `${x(i)},${y(w.balance)}`).join(' ');
    return { W, H, pts, threshY: y(thresh) };
  }, [series, thresh]);

  const horizonBtn = (days: number) => (
    <button key={days} onClick={() => setHorizon(days)} className={`h-8 px-3 rounded-lg text-[12px] font-medium border ${horizon === days ? 'text-white border-transparent' : 'border-border text-foreground bg-card'}`} style={horizon === days ? { backgroundColor: '#7258e8' } : undefined}>
      {days} Days
    </button>
  );

  const scenarioBtn = (key: 'base' | 'conservative' | 'optimistic', label: string, tip: string) => (
    <button key={key} onClick={() => setScenario(key)} data-tip={tip} className={`h-8 px-3 rounded-lg text-[12px] font-medium border ${scenario === key ? 'text-white border-transparent' : 'border-border text-foreground bg-card'}`} style={scenario === key ? { backgroundColor: '#7258e8' } : undefined}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Cash Flow &amp; Forecasting</h1>
      </div>

      <div className="py-4 flex flex-col gap-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}
        {loading ? (
          <p className="text-[13px] text-muted-foreground">Building the forecast…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {horizonBtn(30)}{horizonBtn(60)}{horizonBtn(90)}
              <label className="text-[12px] font-medium ml-2">Safety threshold $
                <input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" data-tip="Your own planning line. The chart marks it and the forecast warns you if the projected balance dips below it." className="ml-1 w-28 bg-background border border-input rounded-lg px-2 h-8 text-[12px]" />
              </label>
              {simulated && <span className="text-[12px] font-medium" style={{ color: '#7258e8' }}>Simulation active — the books are unchanged</span>}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['Cash Today (Ledger)', fmt(startingCash)],
                [`Projected at ${horizon} Days`, fmt(endBalance)],
                ['Lowest Point', fmt(minBalance)],
                ['Below Threshold', belowThreshold ? `Week of ${belowThreshold.start}` : 'Never in horizon'],
              ].map(([label, value]) => (
                <div key={label} className="border border-border rounded-xl bg-card p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
                  <div className="text-lg font-semibold tabular-nums mt-1">{value}</div>
                </div>
              ))}
            </div>

            <div className="border border-border rounded-xl bg-card p-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Projected Cash Balance vs. Safety Threshold</h2>
              {chart ? (
                <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="w-full mt-2" role="img" aria-label="Projected cash balance by week">
                  <line x1="0" x2={chart.W} y1={chart.threshY} y2={chart.threshY} stroke="#b91c1c" strokeDasharray="5 4" strokeWidth="1" />
                  <polyline points={chart.pts} fill="none" stroke="#7258e8" strokeWidth="2" />
                </svg>
              ) : (
                <p className="text-[13px] text-muted-foreground mt-2">Not enough projection data to draw the line yet.</p>
              )}
              <div className="adm-table-wrap mt-2"><table className="adm-table">
                <thead>
                  <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
                    <th className="p-3 border-r border-border">Week</th>
                    <th className="p-3 border-r border-border text-right">Money In</th>
                    <th className="p-3 border-r border-border text-right">Money Out</th>
                    <th className="p-3 border-r border-border text-right">Net</th>
                    <th className="p-3 text-right">Projected Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {series.map((w) => (
                    <tr key={w.start} className="hover:bg-accent/50">
                      <td className="p-3 border-r border-border tabular-nums">{w.start} → {w.end}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{fmt(w.inflow)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{fmt(w.outflow)}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{fmt(w.net)}</td>
                      <td className="p-3 text-right font-semibold tabular-nums">{fmt(w.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>

            <div className="border border-border rounded-xl bg-card p-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Interactive What-If Simulation Sandbox</h2>
              <p className="text-[12px] text-muted-foreground mt-1">Adjust the knobs and the projection above redraws. This is a simulation over the same real items — nothing here is saved to the books.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {scenarioBtn('base', 'Base Case', 'The projection exactly as the books say: invoices and bills on their due dates.')}
                {scenarioBtn('conservative', 'Conservative', 'Customers pay 15 days late. See what slow collections do to the balance.')}
                {scenarioBtn('optimistic', 'Optimistic', 'Customers pay 5 days early.')}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <label className="text-[12px] font-medium">Delay customer collections by (days)
                  <input type="number" value={arDelay} onChange={(e) => setArDelay(Number(e.target.value) || 0)} className="mt-1 w-full bg-background border border-input rounded-lg px-3 h-9 text-[13px]" />
                </label>
                <label className="text-[12px] font-medium">Added monthly spending ($)
                  <input type="number" value={extraMonthlyOut} onChange={(e) => setExtraMonthlyOut(Number(e.target.value) || 0)} className="mt-1 w-full bg-background border border-input rounded-lg px-3 h-9 text-[13px]" />
                </label>
                <label className="text-[12px] font-medium">One-off purchase next week ($)
                  <input type="number" value={oneOffOut} onChange={(e) => setOneOffOut(Number(e.target.value) || 0)} className="mt-1 w-full bg-background border border-input rounded-lg px-3 h-9 text-[13px]" />
                </label>
              </div>
              <button
                onClick={() => { setArDelay(0); setExtraMonthlyOut(0); setOneOffOut(0); setScenario('base'); }}
                data-tip="Clear every what-if adjustment and return to the projection exactly as the books say."
                className="mt-3 h-8 px-3 rounded-lg text-[12px] font-medium border border-border text-foreground bg-card"
              >
                Reset to Baseline
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-border rounded-xl bg-card p-4">
                <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Money In (Expected Collections)</h3>
                {horizonItems.ins.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground mt-2">No open invoices or recurring billing fall in this horizon. When a customer invoice is sent and unpaid, or a recurring billing is active, it will be listed here on its due date.</p>
                ) : horizonItems.ins.map((i, idx) => (
                  <div key={idx} className="flex justify-between gap-3 py-2 border-b border-border last:border-0">
                    <div><div className="text-[13px] font-medium">{i.label}</div><div className="text-[11px] text-muted-foreground">{i.date} · {i.detail}</div></div>
                    <div className="text-[13px] font-semibold tabular-nums">{fmt(i.amount)}</div>
                  </div>
                ))}
              </div>
              <div className="border border-border rounded-xl bg-card p-4">
                <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Money Out (Committed Disbursements)</h3>
                {horizonItems.outs.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground mt-2">No open vendor bills fall in this horizon. When a bill is recorded and unpaid, it will be listed here on its due date.</p>
                ) : horizonItems.outs.map((i, idx) => (
                  <div key={idx} className="flex justify-between gap-3 py-2 border-b border-border last:border-0">
                    <div><div className="text-[13px] font-medium">{i.label}</div><div className="text-[11px] text-muted-foreground">{i.date} · {i.detail}</div></div>
                    <div className="text-[13px] font-semibold tabular-nums">{fmt(i.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Overdue invoices and bills are counted at day 0 — the money is already late, so the forecast treats it as due immediately and flags it in the lists above.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

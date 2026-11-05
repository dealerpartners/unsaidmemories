'use client';

import React, { useEffect, useState } from 'react';

// /admin/accounting/reports/budgets — Reporting → Budgets & Forecasts.
// The Budget vs Actual ledger: acct_budget_lines for the chosen
// version against realized actuals computed from posted journal
// lines (each account signed into its natural direction). MTD uses
// the accounting period that contains today. Below it, the runway
// view (ledger cash vs the average monthly net burn from posted
// cash activity) and the replenishment cash-out (open vendor bills
// due within 30 days) — all computed from the same live data.
// Data: /api/admin/accounting/budgets.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Version = { id: string; name: string; fiscalYear: number; versionNo: number; scenario: string; status: string; approvedAt: string | null; lineCount: number };
type Row = {
  accountId: string; code: string; name: string; accountType: string;
  annualBudget: number; mtdBudget: number; annualActual: number; mtdActual: number;
  variance: number; variancePct: number | null; hasBudget: boolean;
};

function statusFor(r: Row): string {
  if (!r.hasBudget) return 'No budget set';
  const t = (r.accountType || '').toLowerCase();
  if (t === 'revenue' || t === 'income') return r.annualActual >= r.annualBudget ? 'Ahead of target' : 'Behind target';
  if (t === 'expense' || t === 'cogs' || t === 'cost_of_goods_sold') return r.annualActual <= r.annualBudget ? 'Within budget' : 'Over budget';
  return Math.abs(r.variance) < 0.005 ? 'On target' : 'Variance';
}

export default function BudgetsForecastsPage() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [periods, setPeriods] = useState<{ id: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [runway, setRunway] = useState<{ cashNow: number; avgMonthlyBurn: number; runwayMonths: number | null; monthsSampled: number }>({ cashNow: 0, avgMonthlyBurn: 0, runwayMonths: null, monthsSampled: 0 });
  const [replenishment, setReplenishment] = useState({ dueIn30Days: 0, billCount: 0 });
  const [unbudgetedActual, setUnbudgetedActual] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', fiscalYear: new Date().getFullYear(), scenario: 'base' });
  const [lineForm, setLineForm] = useState({ accountId: '', periodId: '', amount: '' });
  const [busy, setBusy] = useState(false);

  const load = (version?: string) => {
    setLoading(true);
    const qs = version ? `?version=${version}` : '';
    fetch(`/api/admin/accounting/budgets${qs}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setVersions(d.versions || []);
        setSelectedId(d.selectedVersionId || '');
        setRows(d.rows || []);
        setPeriods(d.periods || []);
        setAccounts(d.accounts || []);
        setRunway(d.runway || { cashNow: 0, avgMonthlyBurn: 0, runwayMonths: null, monthsSampled: 0 });
        setReplenishment(d.replenishment || { dueIn30Days: 0, billCount: 0 });
        setUnbudgetedActual(Number(d.unbudgetedActual || 0));
      })
      .catch(() => setError('Budgets could not be loaded.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(), []);

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/admin/accounting/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || 'action failed');
    return d;
  };

  const createVersion = async () => {
    setBusy(true);
    try {
      const d = await post({ action: 'create_version', name: newForm.name, fiscalYear: newForm.fiscalYear, scenario: newForm.scenario });
      setShowNew(false);
      setNewForm({ name: '', fiscalYear: new Date().getFullYear(), scenario: 'base' });
      load(d.versionId);
    } catch (e: any) {
      setError(e?.message || 'The budget could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const addLine = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await post({ action: 'add_line', budgetId: selectedId, periodId: lineForm.periodId, accountId: lineForm.accountId, amount: Number(lineForm.amount) });
      setLineForm({ accountId: '', periodId: '', amount: '' });
      load(selectedId);
    } catch (e: any) {
      setError(e?.message || 'The budget line could not be added.');
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await post({ action: 'set_status', versionId: selectedId, status: 'approved' });
      load(selectedId);
    } catch (e: any) {
      setError(e?.message || 'Approval failed.');
    } finally {
      setBusy(false);
    }
  };

  const selected = versions.find((v) => v.id === selectedId) || null;
  const budgetedRows = rows.filter((r) => r.hasBudget);
  const totalBudget = budgetedRows.reduce((s, r) => s + r.annualBudget, 0);
  const totalActual = budgetedRows.reduce((s, r) => s + r.annualActual, 0);

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Budgets &amp; Forecasts</h1>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); load(e.target.value); }} className="bg-background border border-input rounded-lg px-3 h-9 text-[13px]">
            {versions.length === 0 && <option value="">No budget versions yet</option>}
            {versions.map((v) => (<option key={v.id} value={v.id}>{v.name} · FY{v.fiscalYear} v{v.versionNo} · {v.status}</option>))}
          </select>
          <button onClick={() => setShowNew((s) => !s)} data-tip="Start a new budget version for a fiscal year. You then add one line per account and month." className="h-9 px-4 rounded-lg text-[13px] font-medium text-white shrink-0" style={{ backgroundColor: '#7258e8' }}>
            New Budget
          </button>
          {selected && selected.status !== 'approved' && (
            <button onClick={approve} disabled={busy} data-tip="Mark this budget version approved. The approval date is written to the version record." className="h-9 px-4 rounded-lg text-[13px] font-medium border border-border text-foreground bg-card disabled:opacity-50">
              Approve
            </button>
          )}
        </div>
      </div>

      <div className="py-4 flex flex-col gap-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}

        {showNew && (
          <div className="border border-border rounded-xl bg-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-[12px] font-medium">Budget name
              <input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="FY2026 Operating Budget" className="mt-1 w-full bg-background border border-input rounded-lg px-3 h-9 text-[13px]" />
            </label>
            <label className="text-[12px] font-medium">Fiscal year
              <input type="number" value={newForm.fiscalYear} onChange={(e) => setNewForm({ ...newForm, fiscalYear: Number(e.target.value) || new Date().getFullYear() })} className="mt-1 w-full bg-background border border-input rounded-lg px-3 h-9 text-[13px]" />
            </label>
            <label className="text-[12px] font-medium">Scenario
              <select value={newForm.scenario} onChange={(e) => setNewForm({ ...newForm, scenario: e.target.value })} className="mt-1 w-full bg-background border border-input rounded-lg px-3 h-9 text-[13px]">
                <option value="base">Base</option>
                <option value="conservative">Conservative</option>
                <option value="optimistic">Optimistic</option>
              </select>
            </label>
            <div className="flex items-end">
              <button onClick={createVersion} disabled={busy || !newForm.name.trim()} data-tip="Create the budget version. It appears in the picker above with its first version number." className="h-9 px-4 rounded-lg text-[13px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#7258e8' }}>
                {busy ? 'Creating…' : 'Create Budget'}
              </button>
            </div>
          </div>
        )}

        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="p-4 pb-2 flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Budget vs. Actual (BVA) Variance Ledger</h2>
            {selected && <span className="text-[12px] text-muted-foreground">{selected.name} · {selected.lineCount} line(s) · target {fmt(totalBudget)} · realized {fmt(totalActual)}</span>}
          </div>
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
                <th className="p-3 border-r border-border">Account Category</th>
                <th className="p-3 border-r border-border text-right">Annual Target</th>
                <th className="p-3 border-r border-border text-right">MTD Budget</th>
                <th className="p-3 border-r border-border text-right">MTD Realized Actual</th>
                <th className="p-3 border-r border-border text-right">Annual Actual</th>
                <th className="p-3 border-r border-border text-right">Dollar Variance ($)</th>
                <th className="p-3 border-r border-border text-right">Variance (%)</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">Loading the variance ledger…</td></tr>
              ) : !selected ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">No budget version exists yet. Create one with New Budget, then add a line for each account and month — the actuals beside it come from the posted journals automatically.</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">This version has no lines, and no journal activity exists for its fiscal year yet. Add budget lines below to start the comparison.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.accountId} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border">
                    <div className="font-medium">{r.code} — {r.name}</div>
                    <div className="text-[11px] text-muted-foreground">{r.accountType}</div>
                  </td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{r.hasBudget ? fmt(r.annualBudget) : '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{r.hasBudget ? fmt(r.mtdBudget) : '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(r.mtdActual)}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(r.annualActual)}</td>
                  <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{r.hasBudget ? fmt(r.variance) : '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{r.variancePct != null ? `${r.variancePct >= 0 ? '+' : ''}${r.variancePct.toFixed(1)}%` : '—'}</td>
                  <td className="p-3 text-center text-[12px]">{statusFor(r)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {selected && unbudgetedActual !== 0 && (
            <p className="px-4 py-2 text-[12px] text-muted-foreground">
              Accounts with journal activity but no budget line total {fmt(unbudgetedActual)} of actuals — they are listed above with “No budget set” so nothing is hidden.
            </p>
          )}
        </div>

        {selected && (
          <div className="border border-border rounded-xl bg-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-[12px] font-medium">Account
              <select value={lineForm.accountId} onChange={(e) => setLineForm({ ...lineForm, accountId: e.target.value })} className="mt-1 w-full bg-background border border-input rounded-lg px-3 h-9 text-[13px]">
                <option value="">Choose an account…</option>
                {accounts.map((a) => (<option key={a.id} value={a.id}>{a.code} — {a.name}</option>))}
              </select>
            </label>
            <label className="text-[12px] font-medium">Month (period)
              <select value={lineForm.periodId} onChange={(e) => setLineForm({ ...lineForm, periodId: e.target.value })} className="mt-1 w-full bg-background border border-input rounded-lg px-3 h-9 text-[13px]">
                <option value="">Choose a period…</option>
                {periods.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </label>
            <label className="text-[12px] font-medium">Budgeted amount
              <input value={lineForm.amount} onChange={(e) => setLineForm({ ...lineForm, amount: e.target.value })} placeholder="0.00" inputMode="decimal" className="mt-1 w-full bg-background border border-input rounded-lg px-3 h-9 text-[13px]" />
            </label>
            <div className="flex items-end">
              <button onClick={addLine} disabled={busy || !lineForm.accountId || !lineForm.periodId || !lineForm.amount} data-tip="Add this amount to the budget for that account and month. The ledger above updates immediately." className="h-9 px-4 rounded-lg text-[13px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#7258e8' }}>
                {busy ? 'Adding…' : 'Add Budget Line'}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-border rounded-xl bg-card p-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Rolling Cash Flow &amp; Runway Trajectory</h2>
            <div className="mt-2 flex flex-col gap-1 text-[13px]">
              <p>Ledger cash on bank accounts today: <span className="font-semibold">{fmt(runway.cashNow)}</span></p>
              <p>Average monthly net burn (months with more out than in, last {runway.monthsSampled} month(s) of posted cash activity): <span className="font-semibold">{runway.avgMonthlyBurn > 0 ? fmt(runway.avgMonthlyBurn) : '—'}</span></p>
              <p>
                Runway: <span className="font-semibold">{runway.runwayMonths != null ? `${runway.runwayMonths.toFixed(1)} months` : 'Not applicable'}</span>
                {runway.runwayMonths == null && <span className="text-muted-foreground"> — cash is not in net burn over the sampled months, or there is no cash activity to measure yet.</span>}
              </p>
            </div>
          </div>
          <div className="border border-border rounded-xl bg-card p-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Inventory Replenishment Cash-Out Flow</h2>
            <div className="mt-2 flex flex-col gap-1 text-[13px]">
              <p>Committed cash-out due within 30 days: <span className="font-semibold">{fmt(replenishment.dueIn30Days)}</span></p>
              <p className="text-muted-foreground">Across {replenishment.billCount} open vendor bill(s) on file. When purchase orders for restocking are recorded as bills, they join this figure on their due dates.</p>
            </div>
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Actuals are posted journal activity only — drafts and unposted entries are excluded, so the comparison is always against the real books.
        </p>
      </div>
    </div>
  );
}

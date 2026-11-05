'use client';

import React, { useEffect, useMemo, useState } from 'react';

// /admin/accounting/banking/reconciliation — Banking & Cash →
// Reconciliation, the full workbench as its own route.
// Start a cycle for an account with the statement balance and date
// (or an imported statement), then tick both sides of the same money:
// bank transactions and the posted journal lines on the account's GL
// account. Every tick is saved to acct_reconciliation_items the
// moment it changes, so a cycle can be left and resumed. Finish &
// Lock writes the cycle reconciled with its totals and marks the
// cleared bank transactions reconciled.
// Data: /api/admin/accounting/reconciliations.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Item = {
  id: string; kind: 'bank' | 'journal'; date: string; reference: string | null;
  label: string; detail: string | null; amount: number; cleared: boolean; alreadyReconciled: boolean;
};
type HistoryRow = { id: string; asOfDate: string; statementBalance: number; glBalance: number; difference: number; status: string; completedAt: string | null };

export default function ReconciliationPage() {
  const [accounts, setAccounts] = useState<{ id: string; name: string; institutionName: string | null }[]>([]);
  const [accountId, setAccountId] = useState('');
  const [statements, setStatements] = useState<{ id: string; start: string; end: string; closingBalance: number }[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [active, setActive] = useState<{ id: string; asOfDate: string; statementBalance: number; status: string; bankItems: Item[]; journalItems: Item[] } | null>(null);
  const [currentGl, setCurrentGl] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stmtBalance, setStmtBalance] = useState('');
  const [stmtDate, setStmtDate] = useState('');
  const [stmtPick, setStmtPick] = useState('');
  const [filter, setFilter] = useState<'all' | 'out' | 'in'>('all');
  const [busy, setBusy] = useState(false);

  const load = (acct?: string, recon?: string) => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (acct) qs.set('account', acct);
    if (recon) qs.set('reconciliation', recon);
    fetch(`/api/admin/accounting/reconciliations?${qs.toString()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setAccounts(d.accounts || []);
        setAccountId(d.accountId || '');
        setStatements(d.statements || []);
        setHistory(d.history || []);
        setActive(d.active || null);
        setCurrentGl(Number(d.currentGlBalance || 0));
      })
      .catch(() => setError('The reconciliation workbench could not be loaded.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    load(qs.get('account') || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/admin/accounting/reconciliations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || 'action failed');
    return d;
  };

  const start = async () => {
    setBusy(true);
    try {
      await post({ action: 'start', bankAccountId: accountId, statementBalance: Number(stmtBalance), asOfDate: stmtDate });
      load(accountId);
    } catch (e: any) {
      setError(e?.message || 'The cycle could not be started.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item: Item, cleared: boolean) => {
    if (!active) return;
    setActive({ ...active, bankItems: active.bankItems.map((i) => (i.kind === item.kind && i.id === item.id ? { ...i, cleared } : i)), journalItems: active.journalItems.map((i) => (i.kind === item.kind && i.id === item.id ? { ...i, cleared } : i)) });
    try {
      await post({ action: 'toggle', reconciliationId: active.id, kind: item.kind, itemId: item.id, cleared });
    } catch (e: any) {
      setError(e?.message || 'That tick could not be saved.');
      load(accountId, active.id);
    }
  };

  const bulk = async (cleared: boolean) => {
    if (!active) return;
    setBusy(true);
    try {
      for (const item of shownItems.filter((i) => !i.alreadyReconciled && i.cleared !== cleared)) {
        await post({ action: 'toggle', reconciliationId: active.id, kind: item.kind, itemId: item.id, cleared });
      }
      load(accountId, active.id);
    } catch (e: any) {
      setError(e?.message || 'Bulk update failed.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await post({ action: 'finish', reconciliationId: active.id });
      load(accountId);
    } catch (e: any) {
      setError(e?.message || 'The cycle could not be finished.');
    } finally {
      setBusy(false);
    }
  };

  const allItems: Item[] = useMemo(() => {
    if (!active) return [];
    return [...active.bankItems, ...active.journalItems].sort((a, b) => a.date.localeCompare(b.date));
  }, [active]);

  const shownItems = allItems.filter((i) => {
    if (filter === 'out') return i.amount < 0;
    if (filter === 'in') return i.amount > 0;
    return true;
  });

  const clearedBank = active ? active.bankItems.filter((i) => i.cleared).reduce((s, i) => s + i.amount, 0) : 0;
  const clearedJournal = active ? active.journalItems.filter((i) => i.cleared).reduce((s, i) => s + i.amount, 0) : 0;
  const difference = clearedBank - clearedJournal;
  const outCount = allItems.filter((i) => i.amount < 0).length;
  const inCount = allItems.filter((i) => i.amount > 0).length;

  const chip = (key: 'all' | 'out' | 'in', label: string) => (
    <button key={key} onClick={() => setFilter(key)} className={`h-8 px-3 rounded-lg text-[12px] font-medium border ${filter === key ? 'text-white border-transparent' : 'border-border text-foreground bg-card'}`} style={filter === key ? { backgroundColor: '#7258e8' } : undefined}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Reconciliation</h1>
        </div>
        <select
          value={accountId}
          onChange={(e) => { setAccountId(e.target.value); load(e.target.value); }}
          data-tip="Choose the bank account to reconcile. Each account has its own cycles and history."
          className="bg-background border border-input rounded-lg px-3 h-9 text-[13px]"
        >
          {accounts.map((a) => (<option key={a.id} value={a.id}>{a.institutionName ? `${a.institutionName} — ` : ''}{a.name}</option>))}
        </select>
      </div>

      <div className="py-4 flex flex-col gap-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}

        {loading ? (
          <p className="text-[13px] text-muted-foreground">Loading the workbench…</p>
        ) : accounts.length === 0 ? (
          <div className="border border-border rounded-xl bg-card p-4 text-[13px] text-muted-foreground">
            No bank accounts are recorded yet, so there is nothing to reconcile. Add an account on Cards &amp; Bank Accounts first — its transactions and journal lines will appear here.
          </div>
        ) : !active ? (
          <div className="border border-border rounded-xl bg-card p-4 flex flex-col gap-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Start a cycle</h2>
            <p className="text-[13px] text-muted-foreground">
              The ledger (GL) balance for this account right now is <span className="font-semibold text-foreground">{fmt(currentGl)}</span>.
              Enter the closing balance and date from the bank statement to begin.
            </p>
            {statements.length > 0 && (
              <label className="text-[12px] font-medium">Imported statement
                <select
                  value={stmtPick}
                  onChange={(e) => {
                    setStmtPick(e.target.value);
                    const s = statements.find((x) => x.id === e.target.value);
                    if (s) { setStmtBalance(String(s.closingBalance)); setStmtDate(s.end); }
                  }}
                  className="mt-1 w-full md:w-96 bg-background border border-input rounded-lg px-3 h-9 text-[13px] block"
                >
                  <option value="">Choose an imported statement…</option>
                  {statements.map((s) => (<option key={s.id} value={s.id}>{s.start} → {s.end} · closing {fmt(s.closingBalance)}</option>))}
                </select>
              </label>
            )}
            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-[12px] font-medium">Statement balance
                <input value={stmtBalance} onChange={(e) => setStmtBalance(e.target.value)} placeholder="0.00" inputMode="decimal" className="mt-1 w-44 bg-background border border-input rounded-lg px-3 h-9 text-[13px] block" />
              </label>
              <label className="text-[12px] font-medium">Statement date
                <input value={stmtDate} onChange={(e) => setStmtDate(e.target.value)} type="date" className="mt-1 w-44 bg-background border border-input rounded-lg px-3 h-9 text-[13px] block" />
              </label>
              <button onClick={start} disabled={busy || !stmtBalance || !stmtDate} data-tip="Open a reconciliation cycle for this account and statement. Your ticks are saved as you go." className="h-9 px-4 rounded-lg text-[13px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#7258e8' }}>
                {busy ? 'Starting…' : 'Start Reconciliation'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                ['Statement Balance', fmt(active.statementBalance)],
                ['Cleared — Bank Side', fmt(clearedBank)],
                ['Cleared — Books Side', fmt(clearedJournal)],
                ['Difference (Bank − Books)', fmt(difference)],
                ['Statement − Cleared Bank', fmt(active.statementBalance - clearedBank)],
              ].map(([label, value]) => (
                <div key={label} className="border border-border rounded-xl bg-card p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
                  <div className="text-lg font-semibold tabular-nums mt-1">{value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {chip('all', `All Transactions ${allItems.length}`)}
              {chip('out', `Payments & Checks Out ${outCount}`)}
              {chip('in', `Deposits & Inflows ${inCount}`)}
              <button onClick={() => bulk(true)} disabled={busy} data-tip="Tick every row in the current filter as cleared, on both sides. Each tick is saved immediately." className="h-8 px-3 rounded-lg text-[12px] font-medium border border-border text-foreground bg-card disabled:opacity-50">Mark All Filtered Cleared</button>
              <button onClick={() => bulk(false)} disabled={busy} data-tip="Untick every row in the current filter." className="h-8 px-3 rounded-lg text-[12px] font-medium border border-border text-foreground bg-card disabled:opacity-50">Clear Filtered</button>
              <button onClick={finish} disabled={busy} data-tip="Finish this cycle: the totals and difference are written to the cycle record, and every cleared bank transaction is marked reconciled." className="h-8 px-3 rounded-lg text-[12px] font-medium text-white disabled:opacity-50 ml-auto" style={{ backgroundColor: '#7258e8' }}>
                {busy ? 'Working…' : 'Finish & Lock'}
              </button>
            </div>

            <div className="border border-border rounded-xl overflow-x-auto bg-card">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead>
                  <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
                    <th className="p-3 border-r border-border text-center">Cleared</th>
                    <th className="p-3 border-r border-border">Date</th>
                    <th className="p-3 border-r border-border">Ref / Check #</th>
                    <th className="p-3 border-r border-border">Payee &amp; Description</th>
                    <th className="p-3 border-r border-border">Type</th>
                    <th className="p-3 border-r border-border text-right">Payments (Outflow)</th>
                    <th className="p-3 border-r border-border text-right">Deposits (Inflow)</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shownItems.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-muted-foreground">No transactions in this view yet. Bank transactions arrive from feeds, statement imports or manual entry; journal lines appear when entries post to this account&apos;s GL account.</td></tr>
                  ) : shownItems.map((i) => (
                    <tr key={`${i.kind}-${i.id}`} className="hover:bg-accent/50">
                      <td className="p-3 border-r border-border text-center">
                        <input type="checkbox" checked={i.cleared} disabled={i.alreadyReconciled} onChange={(e) => toggle(i, e.target.checked)} />
                      </td>
                      <td className="p-3 border-r border-border tabular-nums whitespace-nowrap">{i.date}</td>
                      <td className="p-3 border-r border-border text-muted-foreground">{i.reference || '—'}</td>
                      <td className="p-3 border-r border-border">
                        <div className="font-medium">{i.label}</div>
                        {i.detail && <div className="text-[11px] text-muted-foreground">{i.detail}</div>}
                      </td>
                      <td className="p-3 border-r border-border">{i.kind === 'bank' ? 'Bank' : 'Journal'}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{i.amount < 0 ? fmt(-i.amount) : ''}</td>
                      <td className="p-3 border-r border-border text-right tabular-nums">{i.amount > 0 ? fmt(i.amount) : ''}</td>
                      <td className="p-3 text-center text-[12px]">{i.alreadyReconciled ? 'Reconciled' : i.cleared ? 'Cleared' : 'Open'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Cycle for statement dated {active.asOfDate} · status {active.status}. Ticks save as you go, so this cycle can be left and resumed from Past Cycles.
              The difference is the cleared bank total minus the cleared books total — it reads zero when both sides agree item for item.
            </p>
          </>
        )}

        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="p-4 pb-2"><h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Past Cycles</h2></div>
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
                <th className="p-3 border-r border-border">Statement Date</th>
                <th className="p-3 border-r border-border text-right">Statement Balance</th>
                <th className="p-3 border-r border-border text-right">GL Balance</th>
                <th className="p-3 border-r border-border text-right">Difference</th>
                <th className="p-3 border-r border-border">Status</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">No cycles yet for this account. Start one above and it will be listed here.</td></tr>
              ) : history.map((h) => (
                <tr key={h.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border tabular-nums">{h.asOfDate}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(h.statementBalance)}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(h.glBalance)}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(h.difference)}</td>
                  <td className="p-3 border-r border-border">{h.status}{h.completedAt ? ` · ${new Date(h.completedAt).toLocaleDateString()}` : ''}</td>
                  <td className="p-3 text-center">
                    {h.status === 'reconciled' || h.status === 'closed' ? (
                      <button
                        onClick={async () => { try { await post({ action: 'reopen', reconciliationId: h.id }); load(accountId, h.id); } catch (e: any) { setError(e?.message || 'Reopen failed.'); } }}
                        data-tip="Reopen this finished cycle so its ticks can be changed. Cleared bank transactions go back to matched."
                        className="text-[12px] font-medium underline text-foreground"
                      >
                        Reopen
                      </button>
                    ) : (
                      <button onClick={() => load(accountId, h.id)} data-tip="Resume this cycle in the workbench above." className="text-[12px] font-medium underline text-foreground">Resume</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';

// /admin/accounting/books/multi-currency — Multi-currency, rebuilt
// to the owner's spec (multi_currency.html): the FX rate table, the
// currency register, foreign-currency exposure from posted journal
// lines, and FX revaluation runs.
// Data: GET/POST /api/admin/accounting/multi-currency over
// acct_currencies, acct_exchange_rates, acct_journal_lines and
// acct_fx_revaluation_runs.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
const fmtPlain = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);

type Currency = { code: string; name: string; symbol: string | null; minor_units: number; is_active: boolean };
type Rate = { id: string; rate_date: string; from_currency: string; to_currency: string; rate: number; rate_type: string; source: string | null };
type Run = { id: string; period_name: string | null; revaluation_date: string; status: string; journal_id: string | null; created_at: string };
type Exposure = { currency: string; foreignDebits: number; foreignCredits: number; bookDebits: number; bookCredits: number; lines: number };

export default function MultiCurrencyPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [exposure, setExposure] = useState<Exposure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [rateForm, setRateForm] = useState({ fromCurrency: '', toCurrency: 'USD', rate: '', rateDate: today, rateType: 'spot' });
  const [ccyForm, setCcyForm] = useState({ code: '', name: '', symbol: '' });

  const load = () => {
    setLoading(true);
    fetch('/api/admin/accounting/multi-currency', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setCurrencies(Array.isArray(d.currencies) ? d.currencies : []);
        setRates(Array.isArray(d.rates) ? d.rates : []);
        setRuns(Array.isArray(d.runs) ? d.runs : []);
        setExposure(Array.isArray(d.exposure) ? d.exposure : []);
      })
      .catch(() => setError('Multi-currency data could not be loaded.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const act = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/multi-currency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Action failed');
      setNotice(okMsg);
      load();
      return true;
    } catch (err: any) {
      setError(err?.message || 'The action could not be completed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Multi-currency</h1>
        </div>
        <button
          disabled={busy}
          onClick={() => act({ action: 'start_revaluation' }, 'A draft revaluation run was opened for the current period — it appears in the runs table below.')}
          className="rounded-lg px-4 h-9 text-[13px] font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: '#7258e8' }}
          data-tip="Open a month-end revaluation run — foreign balances get re-measured at the current rates"
        >
          Run Month-End Revaluation
        </button>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mt-4">{error}</div>}
      {notice && <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm mt-4">{notice}</div>}

      <h2 className="font-display text-base font-semibold mt-4 mb-2">FX Rate Table</h2>
      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className={thCls}>
              <th className="p-3 border-r border-border">Pair</th>
              <th className="p-3 border-r border-border">Date</th>
              <th className="p-3 border-r border-border text-right">Spot Mid</th>
              <th className="p-3 border-r border-border">Rate Type</th>
              <th className="p-3 text-center">Primary Feed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={5} className="text-center text-muted-foreground">Loading exchange rates…</td></tr>
            ) : rates.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-muted-foreground">No exchange rates recorded yet. Add the first rate with the override form below — rates recorded here are the ones translations and revaluations use.</td></tr>
            ) : rates.map((r) => (
              <tr key={r.id} className="hover:bg-accent/50">
                <td className="p-3 border-r border-border font-semibold">{r.from_currency} / {r.to_currency}</td>
                <td className="p-3 border-r border-border text-muted-foreground">{r.rate_date}</td>
                <td className="p-3 border-r border-border text-right tabular-nums">{r.rate}</td>
                <td className="p-3 border-r border-border text-muted-foreground">{r.rate_type}</td>
                <td className="p-3 text-center text-muted-foreground">{r.source || 'manual'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="border border-border rounded-xl bg-card">
          <div className="p-4 border-b border-border">
            <h2 className="font-display text-base font-semibold">Custom FX Rate Override</h2>
            <p className="text-[13px] text-muted-foreground mt-1">Pin a rate for a date — period-end translations use the rate recorded for that date.</p>
          </div>
          <form
            className="p-4 grid grid-cols-2 gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ action: 'add_rate', ...rateForm, rate: parseFloat(rateForm.rate) || 0, source: 'manual' }, `Rate ${rateForm.fromCurrency.toUpperCase()} / ${rateForm.toCurrency} was recorded and now appears in the table above.`)) {
                setRateForm({ fromCurrency: '', toCurrency: 'USD', rate: '', rateDate: today, rateType: 'spot' });
              }
            }}
          >
            <div>
              <label className={labelCls}>From Currency</label>
              <input required value={rateForm.fromCurrency} onChange={(e) => setRateForm({ ...rateForm, fromCurrency: e.target.value.toUpperCase().slice(0, 3) })} placeholder="EUR" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>To Currency</label>
              <input required value={rateForm.toCurrency} onChange={(e) => setRateForm({ ...rateForm, toCurrency: e.target.value.toUpperCase().slice(0, 3) })} placeholder="USD" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Override Spot Mid Rate</label>
              <input required type="number" min="0" step="any" value={rateForm.rate} onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })} placeholder="1.08" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Effective Date</label>
              <input required type="date" value={rateForm.rateDate} onChange={(e) => setRateForm({ ...rateForm, rateDate: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Rate Type</label>
              <select value={rateForm.rateType} onChange={(e) => setRateForm({ ...rateForm, rateType: e.target.value })} className={inputCls}>
                <option value="spot">Spot</option>
                <option value="average">Month average</option>
                <option value="forward">Forward 30D</option>
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={busy} className="rounded-lg px-4 h-9 text-[13px] font-medium text-white disabled:opacity-60 w-full" style={{ backgroundColor: '#7258e8' }} data-tip="Save this exchange rate">
                {busy ? 'Saving…' : 'Save Rate'}
              </button>
            </div>
          </form>
        </div>

        <div className="border border-border rounded-xl bg-card">
          <div className="p-4 border-b border-border">
            <h2 className="font-display text-base font-semibold">Currency Register</h2>
            <p className="text-[13px] text-muted-foreground mt-1">The currencies in use. Add one before recording rates or balances in it.</p>
          </div>
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className={thCls}>
                <th className="p-3 border-r border-border">Code</th>
                <th className="p-3 border-r border-border">Name</th>
                <th className="p-3 border-r border-border">Symbol</th>
                <th className="p-3 text-center">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={4} className="text-center text-muted-foreground">Loading currencies…</td></tr>
              ) : currencies.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-muted-foreground">No currencies on the register yet.</td></tr>
              ) : currencies.map((c) => (
                <tr key={c.code} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold">{c.code}</td>
                  <td className="p-3 border-r border-border">{c.name}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{c.symbol || '—'}</td>
                  <td className="p-3 text-center">{c.is_active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <form
            className="p-4 border-t border-border grid grid-cols-3 gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ action: 'add_currency', ...ccyForm, minorUnits: 2 }, `Currency ${ccyForm.code.toUpperCase()} was added to the register.`)) {
                setCcyForm({ code: '', name: '', symbol: '' });
              }
            }}
          >
            <div>
              <label className={labelCls}>Code</label>
              <input required value={ccyForm.code} onChange={(e) => setCcyForm({ ...ccyForm, code: e.target.value.toUpperCase().slice(0, 3) })} placeholder="EUR" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Name</label>
              <input required value={ccyForm.name} onChange={(e) => setCcyForm({ ...ccyForm, name: e.target.value })} placeholder="Euro" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Symbol</label>
              <input value={ccyForm.symbol} onChange={(e) => setCcyForm({ ...ccyForm, symbol: e.target.value })} placeholder="€" className={inputCls} />
            </div>
            <div className="col-span-3">
              <button type="submit" disabled={busy} className="rounded-lg px-4 h-9 text-[13px] border bg-card border-border text-foreground disabled:opacity-60" data-tip="Add this currency to the register">
                + Add Foreign Currency
              </button>
            </div>
          </form>
        </div>
      </div>

      <h2 className="font-display text-base font-semibold mt-6 mb-2">Foreign Currency Exposure &amp; Balance Revaluation</h2>
      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className={thCls}>
              <th className="p-3 border-r border-border">Foreign Denomination</th>
              <th className="p-3 border-r border-border text-center">Posted Lines</th>
              <th className="p-3 border-r border-border text-right">Foreign Debits</th>
              <th className="p-3 border-r border-border text-right">Foreign Credits</th>
              <th className="p-3 border-r border-border text-right">USD Book Debits</th>
              <th className="p-3 text-right">USD Book Credits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={6} className="text-center text-muted-foreground">Loading exposure…</td></tr>
            ) : exposure.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-muted-foreground">No foreign-currency activity in the ledger yet. When journal lines are booked in another currency, each currency&apos;s exposure appears here — what was booked in it, and the USD value it sits on the books at — ready for revaluation.</td></tr>
            ) : exposure.map((x) => (
              <tr key={x.currency} className="hover:bg-accent/50">
                <td className="p-3 border-r border-border font-semibold">{x.currency}</td>
                <td className="p-3 border-r border-border text-center tabular-nums">{x.lines}</td>
                <td className="p-3 border-r border-border text-right tabular-nums">{fmtPlain(x.foreignDebits)}</td>
                <td className="p-3 border-r border-border text-right tabular-nums">{fmtPlain(x.foreignCredits)}</td>
                <td className="p-3 border-r border-border text-right tabular-nums">{fmt(x.bookDebits)}</td>
                <td className="p-3 text-right tabular-nums">{fmt(x.bookCredits)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <h2 className="font-display text-base font-semibold mt-6 mb-2">FX Revaluation Runs</h2>
      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className={thCls}>
              <th className="p-3 border-r border-border">Run Date</th>
              <th className="p-3 border-r border-border">Period</th>
              <th className="p-3 border-r border-border text-center">Status</th>
              <th className="p-3 text-center">Revaluation Journal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={4} className="text-center text-muted-foreground">Loading runs…</td></tr>
            ) : runs.length === 0 ? (
              <tr><td colSpan={4} className="text-center text-muted-foreground">No revaluation runs yet. Use Run Month-End Revaluation above to open one for the current period.</td></tr>
            ) : runs.map((r) => (
              <tr key={r.id} className="hover:bg-accent/50">
                <td className="p-3 border-r border-border text-muted-foreground">{r.revaluation_date}</td>
                <td className="p-3 border-r border-border">{r.period_name || '—'}</td>
                <td className="p-3 border-r border-border text-center">{r.status}</td>
                <td className="p-3 text-center text-muted-foreground">{r.journal_id ? 'Posted' : 'Not posted yet'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

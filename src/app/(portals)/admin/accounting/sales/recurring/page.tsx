'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';

// /admin/accounting/sales/recurring — Recurring Billing (owner's
// recurring_billing.html rebuilt as a real route): schedules
// (acct_recurring_invoices) with his columns (Schedule ID,
// Customer / Account, Frequency & Terms, Next Bill Date, Amount
// / Cycle, Payment Method, Auto-Charge Status, Actions), the
// Upcoming 30-Day Cash Realization curve and Billing Calendar
// Horizon projected from the real schedules by the API, and the
// Smart Dunning Engine — open invoices past due with their
// reminder history and a working Send Reminder per row.
// Generate / Pause / Resume / End run through
// /api/admin/accounting/recurring/[id]; creating a schedule uses
// the existing POST (one line item is enough to start).

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Schedule = {
  id: string; template_number: string; name: string | null; frequency: string;
  next_run_date: string | null; next_run_on: string | null; end_date: string | null;
  total: number; status: string; run_count: number; last_invoice_id: string | null;
  auto_charge: boolean | null; payment_method_id: string | null;
  crm_customers: { company_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
};
type Occ = { date: string; templateNumber: string; customer: string; amount: number };
type Dun = { id: string; invoiceNumber: string; customer: string; dueDate: string; daysOverdue: number; balance: number; reminderCount: number; lastReminderAt: string | null };
type Cust = { id: string; name: string };

const custName = (c: Schedule['crm_customers']): string => {
  if (!c) return '—';
  if (c.company_name) return c.company_name;
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';
};

export default function RecurringBillingPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [occurrences, setOccurrences] = useState<Occ[]>([]);
  const [weekly, setWeekly] = useState<number[]>([]);
  const [projected30, setProjected30] = useState(0);
  const [dunning, setDunning] = useState<Dun[]>([]);
  const [summary, setSummary] = useState<{ active: number; paused: number; ended: number } | null>(null);
  const [missedRuns, setMissedRuns] = useState(0);
  const [customers, setCustomers] = useState<Cust[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [freqTab, setFreqTab] = useState<string>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', customer_id: '', frequency: 'monthly', next_run_date: '', end_date: '', description: '', quantity: '1', unit_price: '' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/recurring', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setSchedules((Array.isArray(d.schedules) ? d.schedules : []).map((s: any) => ({ ...s, total: Number(s.total || 0) })));
        setOccurrences(Array.isArray(d.occurrences) ? d.occurrences : []);
        setWeekly(Array.isArray(d.weeklyProjection) ? d.weeklyProjection : []);
        setProjected30(Number(d.projected30 || 0));
        setDunning(Array.isArray(d.dunning) ? d.dunning : []);
        setSummary(d.summary || null);
        setMissedRuns(Number(d.missedRuns || 0));
      })
      .catch(() => setError('Recurring billing could not be loaded.'))
      .finally(() => setLoading(false));
    fetch('/api/admin/accounting/estimates/register', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.customers)) setCustomers(d.customers); })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const freqTabs = useMemo(() => {
    const present = [...new Set(schedules.map((s) => s.frequency))];
    return ['all', ...present];
  }, [schedules]);

  const shown = useMemo(() => {
    let rows = schedules;
    if (freqTab !== 'all') rows = rows.filter((s) => s.frequency === freqTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((s) => [s.template_number, s.name || '', custName(s.crm_customers), s.status].join(' ').toLowerCase().includes(q));
    }
    return rows;
  }, [schedules, freqTab, search]);

  const act = async (s: Schedule, action: string) => {
    if (action === 'end' && !window.confirm(`End schedule ${s.template_number}? It will stop generating invoices.`)) return;
    setBusy(s.id); setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/admin/accounting/recurring/${s.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'Action failed');
      setNotice(action === 'generate'
        ? `Schedule ${s.template_number} generated its next invoice — find it in Invoices & Billing.`
        : `Schedule ${s.template_number}: ${action} completed.`);
      load();
    } catch (e: any) { setError(e?.message || 'Action failed'); }
    finally { setBusy(null); }
  };

  const remind = async (d: Dun) => {
    setBusy(d.id); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'payment_send_reminder', payload: { invoice_id: d.id } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'Reminder failed');
      setNotice(j?.message || `Reminder sent for ${d.invoiceNumber}.`);
      load();
    } catch (e: any) { setError(e?.message || 'Reminder failed'); }
    finally { setBusy(null); }
  };

  const create = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.name.trim()) { setError('Give the schedule a name.'); return; }
    if (!form.customer_id) { setError('Pick the customer this schedule bills.'); return; }
    const unit = Number(form.unit_price);
    if (!Number.isFinite(unit) || unit <= 0) { setError('Enter the per-cycle amount as the line price.'); return; }
    setBusy('create'); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/recurring', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(), customer_id: form.customer_id, frequency: form.frequency,
          next_run_date: form.next_run_date || new Date().toISOString().slice(0, 10),
          end_date: form.end_date || null,
          lines: [{ description: form.description || form.name.trim(), quantity: Number(form.quantity) || 1, unit_price: unit }],
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'Create failed');
      setNotice(`Schedule ${j.template_number || ''} created — it is in the list below.`);
      setShowForm(false);
      setForm({ name: '', customer_id: '', frequency: 'monthly', next_run_date: '', end_date: '', description: '', quantity: '1', unit_price: '' });
      load();
    } catch (e: any) { setError(e?.message || 'Create failed'); }
    finally { setBusy(null); }
  };

  const maxWeek = Math.max(1, ...weekly);
  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Recurring Billing</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search schedule, customer…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
          <button type="button" onClick={() => setShowForm((s) => !s)} data-tip="Creates a new repeating billing schedule for a customer"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium">
            <Plus className="size-4" /> New Recurring Schedule
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {[
          { label: 'Active Schedules', value: String(summary?.active ?? 0) },
          { label: 'Paused', value: String(summary?.paused ?? 0) },
          { label: 'Ended', value: String(summary?.ended ?? 0) },
          { label: 'Next 30 Days (projected)', value: fmt(projected30) },
        ].map((k) => (
          <div key={k.label} className="border border-border rounded-xl bg-card p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{k.label}</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{k.value}</div>
          </div>
        ))}
      </div>

      {showForm && (
        <form onSubmit={create} className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-3">New Recurring Schedule</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><label className={labelCls}>Schedule name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Monthly memory-box subscription" required /></div>
            <div><label className={labelCls}>Customer</label>
              <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} className={inputCls} required>
                <option value="">— Select customer —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className={labelCls}>Frequency</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className={inputCls}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select></div>
            <div><label className={labelCls}>First run</label>
              <input type="date" value={form.next_run_date} onChange={(e) => setForm({ ...form, next_run_date: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>What is billed</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder="Memory box — monthly" /></div>
            <div><label className={labelCls}>Quantity</label>
              <input type="number" min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Amount / cycle</label>
              <input type="number" step="0.01" min="0" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>End date (optional)</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputCls} /></div>
          </div>
          <button type="submit" disabled={busy === 'create'} data-tip="Saves this schedule; it starts generating invoices on its run dates"
            className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
            {busy === 'create' ? 'Creating…' : 'Create Schedule'}
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        {freqTabs.map((f) => (
          <button key={f} type="button" onClick={() => setFreqTab(f)}
            className={`h-8 px-3 rounded-full border text-[12.5px] font-medium capitalize ${freqTab === f ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'border-border bg-card text-foreground'}`}>
            {f === 'all' ? 'All Schedules' : f}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Schedule ID</th>
              <th className={thCls}>Customer / Account</th>
              <th className={thCls}>Frequency &amp; Terms</th>
              <th className={thCls}>Next Bill Date</th>
              <th className={`${thCls} text-right`}>Amount / Cycle</th>
              <th className={thCls}>Payment Method</th>
              <th className={thCls}>Auto-Charge Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">Loading schedules…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">
                  {schedules.length === 0
                    ? 'No recurring schedules yet. Create one and it will generate a real, posted invoice on each run date.'
                    : 'No schedules match this view.'}
                </td></tr>
              ) : shown.map((s) => (
                <tr key={s.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{s.template_number}
                    <div className="text-[11px] font-normal text-muted-foreground">{s.name || ''} · {s.run_count} run(s)</div></td>
                  <td className="p-3 border-r border-border font-medium">{custName(s.crm_customers)}</td>
                  <td className="p-3 border-r border-border capitalize">{s.frequency}{s.end_date ? <div className="text-[11px] normal-case text-muted-foreground">ends {s.end_date}</div> : null}</td>
                  <td className="p-3 border-r border-border tabular-nums">{s.next_run_date || s.next_run_on || '—'}</td>
                  <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(s.total)}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{s.payment_method_id ? 'Card on file' : 'Invoice (no card on file)'}</td>
                  <td className="p-3 border-r border-border">
                    {s.status === 'active'
                      ? (s.auto_charge ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">Auto-charge on</span> : <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900">Sends invoice</span>)
                      : <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">{s.status}</span>}
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    {s.status === 'active' && (
                      <>
                        <button type="button" disabled={busy === s.id} onClick={() => act(s, 'generate')} data-tip="Generates this schedule's next invoice right now and advances the schedule"
                          className="text-[12px] underline mr-3 disabled:opacity-50">Run Now</button>
                        <button type="button" disabled={busy === s.id} onClick={() => act(s, 'pause')} data-tip="Pauses this schedule; it stops generating invoices until resumed"
                          className="text-[12px] underline mr-3 disabled:opacity-50">Pause</button>
                        <button type="button" disabled={busy === s.id} onClick={() => act(s, 'end')} data-tip="Ends this schedule for good"
                          className="text-[12px] underline disabled:opacity-50">End</button>
                      </>
                    )}
                    {s.status === 'paused' && (
                      <button type="button" disabled={busy === s.id} onClick={() => act(s, 'resume')} data-tip="Resumes this schedule"
                        className="text-[12px] underline disabled:opacity-50">Resume</button>
                    )}
                    {s.last_invoice_id ? <div><Link href={`/admin/accounting/invoices/${s.last_invoice_id}`} className="text-[12px] underline">Last Invoice →</Link></div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <h2 className="font-display text-lg font-semibold tracking-tight mt-8 mb-1">Upcoming 30-Day Cash Realization</h2>
        <p className="text-[13px] text-muted-foreground mb-3">Projected from the active schedules above — what they will bill, week by week, if nothing changes.</p>
        <div className="border border-border rounded-xl bg-card p-4">
          {weekly.length === 0 || projected30 === 0 ? (
            <div className="text-[13px] text-muted-foreground">No billings projected in the next 30 days — no active schedule runs in that window.</div>
          ) : weekly.map((w, i) => (
            <div key={i} className="flex items-center gap-3 mb-2 last:mb-0">
              <div className="w-20 text-[12px] text-muted-foreground">Week {i + 1}</div>
              <div className="flex-1 h-4 rounded bg-muted overflow-hidden"><div className="h-full bg-[#7258e8]" style={{ width: `${Math.max(2, (w / maxWeek) * 100)}%` }} /></div>
              <div className="w-24 text-right text-[13px] font-medium tabular-nums">{fmt(w)}</div>
            </div>
          ))}
        </div>

        <h2 className="font-display text-lg font-semibold tracking-tight mt-8 mb-1">Smart Dunning Engine</h2>
        <p className="text-[13px] text-muted-foreground mb-3">Open invoices past their due date, with how many reminders each has already had. Sending a reminder uses the real reminder engine (it throttles repeats and needs email configured).</p>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Invoice #</th>
              <th className={thCls}>Customer</th>
              <th className={thCls}>Due Date</th>
              <th className={`${thCls} text-right`}>Days Overdue</th>
              <th className={`${thCls} text-right`}>Balance</th>
              <th className={thCls}>Reminders Sent</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">Loading…</td></tr>
              ) : dunning.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">No overdue invoices. Everything open is still inside its terms.</td></tr>
              ) : dunning.map((d) => (
                <tr key={d.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{d.invoiceNumber}</td>
                  <td className="p-3 border-r border-border font-medium">{d.customer}</td>
                  <td className="p-3 border-r border-border tabular-nums">{d.dueDate}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums text-red-700 font-semibold">{d.daysOverdue}</td>
                  <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(d.balance)}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{d.reminderCount}{d.lastReminderAt ? ` · last ${String(d.lastReminderAt).slice(0, 10)}` : ''}</td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <button type="button" disabled={busy === d.id} onClick={() => remind(d)} data-tip="Emails a payment reminder for this invoice through the reminder engine"
                      className="text-[12px] underline mr-3 disabled:opacity-50">Send Reminder</button>
                    <Link href={`/admin/accounting/invoices/${d.id}`} className="text-[12px] underline">View Invoice</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <h2 className="font-display text-lg font-semibold tracking-tight mt-8 mb-1">Billing Calendar Horizon</h2>
        <p className="text-[13px] text-muted-foreground mb-3">Every scheduled billing in the next 30 days, in date order.</p>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Date</th>
              <th className={thCls}>Schedule</th>
              <th className={thCls}>Customer</th>
              <th className="p-3 text-right">Amount</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {occurrences.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-muted-foreground">No billings scheduled in the next 30 days.</td></tr>
              ) : occurrences.map((o, i) => (
                <tr key={i} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border tabular-nums">{o.date}</td>
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{o.templateNumber}</td>
                  <td className="p-3 border-r border-border">{o.customer}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(o.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

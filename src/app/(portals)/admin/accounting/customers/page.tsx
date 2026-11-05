'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Download } from 'lucide-react';

// /admin/accounting/customers — Customers & Accounts (owner's
// customers_accounts.html rebuilt as a real route): the AR
// customer ledger with his columns (Customer / Company, Primary
// Contact, Open Balance, Available Credit, Terms, Risk / Health,
// Actions). Credit limits live on acct_customers.credit_limit;
// Available Credit = limit − open balance, shown only when a
// limit is set. Health is computed from real overdue data.
// Actions: Adjust Credit (writes the limit), Payment Link (sends
// the oldest open invoice), Statement (generates a real statement
// for the current month), Add Customer, Export Directory (CSV).

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type ArCustomer = {
  id: string;
  customerNumber: string;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  currency: string;
  paymentTermsDays: number | null;
  sourceCustomerId: string | null;
  creditLimit: number | null;
  availableCredit: number | null;
  openBalance: number;
  openInvoices: number;
  totalInvoiced: number;
  lastInvoiceDate: string | null;
  overdueBalance: number;
  overdueInvoices: number;
  maxDaysOverdue: number;
  health: string;
  oldestOpenInvoiceId: string | null;
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open Balance' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'inactive', label: 'Inactive' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const healthChip = (c: ArCustomer) => {
  if (c.health === 'At risk') return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900">At risk{c.maxDaysOverdue ? ` · ${c.maxDaysOverdue}d overdue` : ''}</span>;
  if (c.health === 'Watch') return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Watch · overdue</span>;
  if (c.health === 'Inactive') return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">Inactive</span>;
  return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">Good standing</span>;
};

export default function CustomersAccountsPage() {
  const [customers, setCustomers] = useState<ArCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ legal_name: '', email: '', phone: '', payment_terms_days: '30', credit_limit: '' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/customers', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => setCustomers(Array.isArray(d.customers) ? d.customers : []))
      .catch(() => setError('AR customers could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    let rows = customers;
    if (tab === 'open') rows = rows.filter((c) => c.openBalance > 0);
    if (tab === 'overdue') rows = rows.filter((c) => c.overdueInvoices > 0);
    if (tab === 'inactive') rows = rows.filter((c) => !c.isActive);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((c) => [c.customerNumber, c.name, c.email || '', c.phone || ''].join(' ').toLowerCase().includes(q));
    }
    return rows;
  }, [customers, tab, search]);

  const totalOpen = customers.reduce((s, c) => s + c.openBalance, 0);
  const totalOverdue = customers.reduce((s, c) => s + c.overdueBalance, 0);

  const adjustCredit = async (c: ArCustomer) => {
    const raw = window.prompt(`Credit limit for ${c.name} (leave blank to remove the limit):`, c.creditLimit != null ? String(c.creditLimit) : '');
    if (raw === null) return;
    setBusy(c.id); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/customers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_credit_limit', id: c.id, credit_limit: raw.trim() === '' ? null : Number(raw) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Could not update the credit limit');
      setNotice(`Credit limit for ${c.name} ${raw.trim() === '' ? 'removed' : `set to ${fmt(Number(raw))}`}.`);
      load();
    } catch (e: any) { setError(e?.message || 'Update failed'); }
    finally { setBusy(null); }
  };

  const paymentLink = async (c: ArCustomer) => {
    if (!c.oldestOpenInvoiceId) { setNotice(`${c.name} has no open invoice to send a payment link for.`); return; }
    setBusy(c.id); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invoice_send', payload: { invoice_id: c.oldestOpenInvoiceId } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'Send failed');
      setNotice(`Payment link for ${c.name}'s oldest open invoice was emailed.`);
      load();
    } catch (e: any) { setError(e?.message || 'Send failed'); }
    finally { setBusy(null); }
  };

  const statement = async (c: ArCustomer) => {
    setBusy(c.id); setError(null); setNotice(null);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = now.toISOString().slice(0, 10);
    try {
      const r = await fetch('/api/admin/accounting/statements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: c.sourceCustomerId || c.id, period_start: start, period_end: end }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Statement failed');
      setNotice(`Statement for ${c.name} generated for ${start} → ${end}. Find it under Sales → Statements.`);
    } catch (e: any) { setError(e?.message || 'Statement failed'); }
    finally { setBusy(null); }
  };

  const addCustomer = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.legal_name.trim()) { setError('Customer name is required.'); return; }
    setBusy('create'); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/customers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legal_name: form.legal_name.trim(), email: form.email || null, phone: form.phone || null,
          payment_terms_days: Number(form.payment_terms_days) || 30,
          credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Create failed');
      setNotice(`${form.legal_name.trim()} added to the AR ledger.`);
      setShowForm(false);
      setForm({ legal_name: '', email: '', phone: '', payment_terms_days: '30', credit_limit: '' });
      load();
    } catch (e: any) { setError(e?.message || 'Create failed'); }
    finally { setBusy(null); }
  };

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Customer #', 'Customer', 'Email', 'Phone', 'Terms', 'Credit Limit', 'Open Balance', 'Available Credit', 'Health'];
    const lines = shown.map((c) => [c.customerNumber, c.name, c.email || '', c.phone || '', c.paymentTermsDays ? `Net ${c.paymentTermsDays}` : '', c.creditLimit != null ? c.creditLimit.toFixed(2) : '', c.openBalance.toFixed(2), c.availableCredit != null ? c.availableCredit.toFixed(2) : '', c.health].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'customers.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Customers &amp; Accounts</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, name, email…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
          <button type="button" onClick={exportCsv} data-tip="Downloads the customer directory currently shown as a CSV file"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium">
            <Download className="size-4" /> Export Directory
          </button>
          <button type="button" onClick={() => setShowForm((s) => !s)} data-tip="Adds a new customer account to the receivables ledger"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium">
            <Plus className="size-4" /> Add Customer
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={addCustomer} className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-3">New AR Customer</div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div><label className={labelCls}>Customer / Company</label>
              <input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Terms (days)</label>
              <input type="number" min="0" value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Credit limit (optional)</label>
              <input type="number" step="0.01" min="0" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} className={inputCls} /></div>
          </div>
          <button type="submit" disabled={busy === 'create'} data-tip="Saves this customer into the receivables ledger below"
            className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
            {busy === 'create' ? 'Adding…' : 'Add Customer'}
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`h-8 px-3 rounded-full border text-[12.5px] font-medium ${tab === t.key ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'border-border bg-card text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
                <th className="p-3 border-r border-border">Customer / Company</th>
                <th className="p-3 border-r border-border">Primary Contact</th>
                <th className="p-3 border-r border-border text-right">Open Balance</th>
                <th className="p-3 border-r border-border text-right">Available Credit</th>
                <th className="p-3 border-r border-border">Terms</th>
                <th className="p-3 border-r border-border">Risk / Health</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">Loading AR customers…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">
                  {customers.length === 0
                    ? 'No AR customers yet. A customer appears here the first time they are invoiced, or when you add one with Add Customer.'
                    : 'No customers match this view.'}
                </td></tr>
              ) : shown.map((c) => (
                <tr key={c.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">{c.customerNumber} · invoiced {fmt(c.totalInvoiced)} all-time</div>
                  </td>
                  <td className="p-3 border-r border-border">
                    <div>{c.email || '—'}</div>
                    <div className="text-[11px] text-muted-foreground">{c.phone || ''}</div>
                  </td>
                  <td className="p-3 border-r border-border text-right font-semibold tabular-nums">
                    {fmt(c.openBalance)}
                    {c.openInvoices > 0 ? <div className="text-[11px] font-normal text-muted-foreground">{c.openInvoices} open invoice(s)</div> : null}
                  </td>
                  <td className="p-3 border-r border-border text-right tabular-nums">
                    {c.availableCredit != null ? fmt(c.availableCredit) : <span className="text-muted-foreground">No limit set</span>}
                    {c.creditLimit != null ? <div className="text-[11px] text-muted-foreground">of {fmt(c.creditLimit)} limit</div> : null}
                  </td>
                  <td className="p-3 border-r border-border text-muted-foreground">{c.paymentTermsDays ? `Net ${c.paymentTermsDays}` : '—'}</td>
                  <td className="p-3 border-r border-border">{healthChip(c)}</td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <button type="button" disabled={busy === c.id} onClick={() => statement(c)} data-tip="Generates a statement of account for this month from their real invoices and payments"
                      className="text-[12px] underline mr-3 disabled:opacity-50">Statement</button>
                    <button type="button" disabled={busy === c.id} onClick={() => adjustCredit(c)} data-tip="Sets how much this customer may owe at once; drives the Available Credit column"
                      className="text-[12px] underline mr-3 disabled:opacity-50">Adjust Credit</button>
                    <button type="button" disabled={busy === c.id || !c.oldestOpenInvoiceId} onClick={() => paymentLink(c)} data-tip="Emails the customer a payment link for their oldest open invoice"
                      className="text-[12px] underline disabled:opacity-50">Payment Link</button>
                    <div><Link href="/admin/accounting/invoices" className="text-[12px] underline">Invoices</Link></div>
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

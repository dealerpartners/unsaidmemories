'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Download, BellRing } from 'lucide-react';

// /admin/accounting/invoices — Invoices & Billing (owner's
// invoices_billing.html rebuilt as a real route): the AR invoice
// register with his columns (Invoice #, Customer / Entity, Issue
// Date, Due Date / Terms, Gross Amount, Balance Due, Status,
// Actions), status tabs computed from live data, CSV export of
// what is on screen, batch reminders and per-row Send / Record
// Payment actions wired to /api/admin/accounting/actions.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Invoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  terms: string | null;
  total: number;
  amountPaid: number;
  balanceDue: number;
  status: string;
  sentAt: string | null;
  overdue: boolean;
  daysOverdue: number;
};

type Summary = { drafts: number; unpaid: number; paid: number; needsAttention: number; openBalance: number; overdueBalance: number };

const TABS = [
  { key: 'all', label: 'All Invoices' },
  { key: 'attention', label: 'Needs Attention' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'paid', label: 'Paid' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function statusChip(inv: Invoice) {
  if (inv.status === 'paid') return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">Paid</span>;
  if (inv.status === 'draft') return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">Draft</span>;
  if (inv.status === 'void' || inv.status === 'cancelled') return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">{inv.status}</span>;
  if (inv.overdue) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900">Overdue {inv.daysOverdue}d</span>;
  if (inv.status === 'partially_paid') return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Partially Paid</span>;
  return <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900">{inv.status.replace(/_/g, ' ')}</span>;
}

export default function InvoicesBillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('all');
  const [sortKey, setSortKey] = useState<'invoiceDate' | 'total' | 'balanceDue'>('invoiceDate');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/invoices', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => { setInvoices(Array.isArray(d.invoices) ? d.invoices : []); setSummary(d.summary || null); })
      .catch(() => setError('Invoices could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    let rows = invoices;
    if (tab === 'attention') rows = rows.filter((v) => v.overdue);
    if (tab === 'drafts') rows = rows.filter((v) => v.status === 'draft');
    if (tab === 'unpaid') rows = rows.filter((v) => !['paid', 'void', 'cancelled', 'draft'].includes(v.status) && v.balanceDue > 0);
    if (tab === 'paid') rows = rows.filter((v) => v.status === 'paid');
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((v) => [v.invoiceNumber, v.customerName, v.customerEmail || '', v.status].join(' ').toLowerCase().includes(q));
    }
    const dir = sortDir;
    return [...rows].sort((a, b) => {
      if (sortKey === 'invoiceDate') return dir * String(a.invoiceDate || '').localeCompare(String(b.invoiceDate || ''));
      return dir * ((a[sortKey] as number) - (b[sortKey] as number));
    });
  }, [invoices, tab, search, sortKey, sortDir]);

  const tabCount = (key: TabKey) => {
    if (!summary) return 0;
    if (key === 'all') return invoices.length;
    if (key === 'attention') return summary.needsAttention;
    if (key === 'drafts') return summary.drafts;
    if (key === 'unpaid') return summary.unpaid;
    return summary.paid;
  };

  const postAction = async (action: string, payload: Record<string, unknown>) => {
    const r = await fetch('/api/admin/accounting/actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.ok === false) throw new Error(j?.error || 'Action failed');
    return j;
  };

  const sendLink = async (inv: Invoice) => {
    setBusy(inv.id); setNotice(null); setError(null);
    try {
      await postAction(inv.sentAt ? 'invoice_resend' : 'invoice_send', { invoice_id: inv.id });
      setNotice(`Payment link for ${inv.invoiceNumber} emailed to ${inv.customerEmail || 'the customer'}.`);
      load();
    } catch (e: any) { setError(e?.message || 'Send failed'); }
    finally { setBusy(null); }
  };

  const recordPayment = async (inv: Invoice) => {
    const raw = window.prompt(`Record payment for ${inv.invoiceNumber} — amount (balance due ${fmt(Math.max(0, inv.balanceDue))}):`, String(Math.max(0, inv.balanceDue)));
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a payment amount greater than zero.'); return; }
    setBusy(inv.id); setNotice(null); setError(null);
    try {
      await postAction('invoice_mark_paid', { invoice_id: inv.id, amount_cents: Math.round(amount * 100), method: 'card' });
      setNotice(`Payment of ${fmt(amount)} recorded on ${inv.invoiceNumber}.`);
      load();
    } catch (e: any) { setError(e?.message || 'Payment failed'); }
    finally { setBusy(null); }
  };

  const batchReminders = async () => {
    const overdue = invoices.filter((v) => v.overdue);
    if (!overdue.length) { setNotice('No overdue invoices — nothing to remind.'); return; }
    setBusy('batch'); setNotice(null); setError(null);
    let sent = 0, skipped = 0, failed = 0;
    for (const inv of overdue) {
      try {
        const j = await postAction('payment_send_reminder', { invoice_id: inv.id });
        if (j?.message && /no outstanding|already reminded/i.test(j.message)) skipped++; else sent++;
      } catch { failed++; }
    }
    setBusy(null);
    setNotice(`Batch reminders done: ${sent} sent, ${skipped} skipped (no balance or recently reminded), ${failed} could not be sent.`);
    load();
  };

  const exportCsv = () => {
    const head = ['Invoice #', 'Customer', 'Issue Date', 'Due Date', 'Terms', 'Gross Amount', 'Balance Due', 'Status'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = shown.map((v) => [v.invoiceNumber, v.customerName, v.invoiceDate || '', v.dueDate || '', v.terms || '', v.total.toFixed(2), Math.max(0, v.balanceDue).toFixed(2), v.status].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'invoices.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sortBtn = (key: typeof sortKey, label: string) => (
    <button type="button" className="uppercase tracking-wider" onClick={() => { if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(key); setSortDir(-1); } }}>
      {label}{sortKey === key ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
    </button>
  );

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Invoices &amp; Billing</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, customer, status…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
          <button type="button" onClick={batchReminders} disabled={busy === 'batch'} data-tip="Emails a payment reminder for every overdue invoice on this list"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium disabled:opacity-50">
            <BellRing className="size-4" /> Batch Reminders
          </button>
          <button type="button" onClick={exportCsv} data-tip="Downloads the invoices currently shown as a CSV file"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium">
            <Download className="size-4" /> Export CSV
          </button>
          <Link href="/admin/accounting/invoices/new" data-tip="Opens the invoice builder to create a new invoice"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium">
            <Plus className="size-4" /> Create Invoice
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`h-8 px-3 rounded-full border text-[12.5px] font-medium ${tab === t.key ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'border-border bg-card text-foreground'}`}>
            {t.label} {tabCount(t.key)}
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
                <th className="p-3 border-r border-border">Invoice #</th>
                <th className="p-3 border-r border-border">Customer / Entity</th>
                <th className="p-3 border-r border-border">{sortBtn('invoiceDate', 'Issue Date')}</th>
                <th className="p-3 border-r border-border">Due Date / Terms</th>
                <th className="p-3 border-r border-border text-right">{sortBtn('total', 'Gross Amount')}</th>
                <th className="p-3 border-r border-border text-right">{sortBtn('balanceDue', 'Balance Due')}</th>
                <th className="p-3 border-r border-border">Status</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">Loading invoices…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">
                  {invoices.length === 0
                    ? 'No invoices yet. Invoices you create here — and invoices generated from estimates, recurring schedules and orders — will appear in this register.'
                    : 'No invoices match this view.'}
                </td></tr>
              ) : shown.map((inv) => (
                <tr key={inv.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{inv.invoiceNumber}</td>
                  <td className="p-3 border-r border-border">
                    <div className="font-medium">{inv.customerName}</div>
                    <div className="text-[11px] text-muted-foreground">{inv.customerEmail || ''}</div>
                  </td>
                  <td className="p-3 border-r border-border tabular-nums">{inv.invoiceDate || '—'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">
                    {inv.dueDate || '—'}{inv.terms ? <div className="text-[11px]">{inv.terms}</div> : null}
                  </td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(inv.total)}</td>
                  <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(Math.max(0, inv.balanceDue))}</td>
                  <td className="p-3 border-r border-border">{statusChip(inv)}</td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <Link href={`/admin/accounting/invoices/${inv.id}`} className="text-[12px] underline mr-3">View</Link>
                    {!['paid', 'void', 'cancelled'].includes(inv.status) && (
                      <>
                        <button type="button" disabled={busy === inv.id} onClick={() => sendLink(inv)} data-tip="Emails this customer a link to view and pay this invoice"
                          className="text-[12px] underline mr-3 disabled:opacity-50">Send Link</button>
                        <button type="button" disabled={busy === inv.id} onClick={() => recordPayment(inv)} data-tip="Records a payment against this invoice and posts it to the books"
                          className="text-[12px] underline disabled:opacity-50">Record Payment</button>
                      </>
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

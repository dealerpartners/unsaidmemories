'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Download } from 'lucide-react';

// /admin/accounting/sales/estimates — Estimates & Sales Orders
// (owner's estimates_sales_orders.html rebuilt as a real route):
// the estimate register with his columns (Estimate #, Customer,
// Expiration, Amount, Status, Invoicing Progress, Actions), a
// working New Estimate form (POST /api/admin/accounting/estimates,
// the same contract EstimatesView uses), lifecycle actions through
// /api/admin/accounting/estimates/[id], and invoicing progress
// computed from the converted AR invoice where a link exists.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Estimate = {
  id: string;
  estimateNumber: string;
  customerName: string;
  customerEmail: string | null;
  estimateDate: string | null;
  expiryDate: string | null;
  total: number;
  status: string;
  convertedInvoiceId: string | null;
  convertedInvoiceNumber: string | null;
  invoicedTotal: number | null;
  progressPct: number | null;
  expired: boolean;
};

type Cust = { id: string; name: string };

const TABS = [
  { key: 'all', label: 'All Estimates' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent / Pending Client' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'converted', label: 'Converted' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const chip = (e: Estimate) => {
  if (e.convertedInvoiceId || e.status === 'converted') return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">Converted</span>;
  if (e.status === 'accepted') return <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900">Accepted</span>;
  if (e.status === 'sent') return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Sent</span>;
  if (e.status === 'declined') return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900">Declined</span>;
  return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">{e.status}</span>;
};

export default function EstimatesSalesOrdersPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [customers, setCustomers] = useState<Cust[]>([]);
  const [summary, setSummary] = useState<{ draft: number; sent: number; accepted: number; converted: number; pipelineTotal: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_id: '', estimate_number: '', issue_date: '', expiry_date: '', subtotal: '', tax_total: '', discount_total: '', terms: 'Net 30', notes: '' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/estimates/register', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setEstimates(Array.isArray(d.estimates) ? d.estimates : []);
        setCustomers(Array.isArray(d.customers) ? d.customers : []);
        setSummary(d.summary || null);
      })
      .catch(() => setError('Estimates could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (showForm && !form.estimate_number) {
      setForm((f) => ({ ...f, estimate_number: `EST-${new Date().getFullYear()}-${String(estimates.length + 1).padStart(4, '0')}`, issue_date: f.issue_date || new Date().toISOString().slice(0, 10) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  const shown = useMemo(() => {
    let rows = estimates;
    if (tab === 'converted') rows = rows.filter((e) => e.convertedInvoiceId || e.status === 'converted');
    else if (tab !== 'all') rows = rows.filter((e) => e.status === tab && !e.convertedInvoiceId);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((e) => [e.estimateNumber, e.customerName, e.customerEmail || '', e.status].join(' ').toLowerCase().includes(q));
    }
    return rows;
  }, [estimates, tab, search]);

  const tabCount = (key: TabKey) => {
    if (!summary) return 0;
    if (key === 'all') return estimates.length;
    if (key === 'draft') return summary.draft;
    if (key === 'sent') return summary.sent;
    if (key === 'accepted') return summary.accepted;
    return summary.converted;
  };

  const act = async (e: Estimate, action: string) => {
    setBusy(e.id); setNotice(null); setError(null);
    try {
      const r = await fetch(`/api/admin/accounting/estimates/${e.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `Could not ${action} the estimate`);
      setNotice(`Estimate ${e.estimateNumber}: ${action} completed.`);
      load();
    } catch (err: any) { setError(err?.message || 'Action failed'); }
    finally { setBusy(null); }
  };

  const createEstimate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const subtotal = Number(form.subtotal) || 0;
    const tax = Number(form.tax_total) || 0;
    const discount = Number(form.discount_total) || 0;
    if (!form.estimate_number.trim()) { setError('Estimate number is required.'); return; }
    if (!subtotal) { setError('Enter a subtotal greater than zero.'); return; }
    setBusy('create'); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/estimates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimate_number: form.estimate_number.trim(),
          customer_id: form.customer_id || null,
          issue_date: form.issue_date || null,
          estimate_date: form.issue_date || null,
          expiry_date: form.expiry_date || null,
          subtotal, tax_total: tax, discount_total: discount,
          total: Math.round((subtotal + tax - discount) * 100) / 100,
          terms: form.terms || null, notes: form.notes || null, status: 'draft',
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Create failed');
      setNotice(`Estimate ${form.estimate_number.trim()} created — it is in the register below.`);
      setShowForm(false);
      setForm({ customer_id: '', estimate_number: '', issue_date: '', expiry_date: '', subtotal: '', tax_total: '', discount_total: '', terms: 'Net 30', notes: '' });
      load();
    } catch (err: any) { setError(err?.message || 'Create failed'); }
    finally { setBusy(null); }
  };

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Estimate #', 'Customer', 'Date', 'Expiration', 'Amount', 'Status', 'Invoiced', 'Progress %'];
    const lines = shown.map((e) => [e.estimateNumber, e.customerName, e.estimateDate || '', e.expiryDate || '', e.total.toFixed(2), e.status, e.invoicedTotal != null ? e.invoicedTotal.toFixed(2) : '', e.progressPct != null ? String(e.progressPct) : ''].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'estimates.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Estimates &amp; Sales Orders</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, customer, status…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
          <button type="button" onClick={exportCsv} data-tip="Downloads the estimates currently shown as a CSV file"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium">
            <Download className="size-4" /> Export Quotes
          </button>
          <button type="button" onClick={() => setShowForm((s) => !s)} data-tip="Opens the form to write a new estimate for a customer"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium">
            <Plus className="size-4" /> New Estimate
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={createEstimate} className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-3">New Estimate</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><label className={labelCls}>Customer</label>
              <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} className={inputCls}>
                <option value="">— Select customer —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className={labelCls}>Estimate #</label>
              <input value={form.estimate_number} onChange={(e) => setForm({ ...form, estimate_number: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Date</label>
              <input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Expires</label>
              <input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Subtotal</label>
              <input type="number" step="0.01" min="0" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Tax</label>
              <input type="number" step="0.01" min="0" value={form.tax_total} onChange={(e) => setForm({ ...form, tax_total: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Discount</label>
              <input type="number" step="0.01" min="0" value={form.discount_total} onChange={(e) => setForm({ ...form, discount_total: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Terms</label>
              <input value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} className={inputCls} placeholder="Net 30" /></div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button type="submit" disabled={busy === 'create'} data-tip="Saves this estimate as a draft in the register below"
              className="h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
              {busy === 'create' ? 'Creating…' : 'Create Estimate'}
            </button>
            <span className="text-[12.5px] text-muted-foreground">Total: {fmt((Number(form.subtotal) || 0) + (Number(form.tax_total) || 0) - (Number(form.discount_total) || 0))}</span>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`h-8 px-3 rounded-full border text-[12.5px] font-medium ${tab === t.key ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'border-border bg-card text-foreground'}`}>
            {t.label} ({tabCount(t.key)})
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
                <th className="p-3 border-r border-border">Estimate #</th>
                <th className="p-3 border-r border-border">Customer &amp; Project</th>
                <th className="p-3 border-r border-border">Expiration</th>
                <th className="p-3 border-r border-border text-right">Amount</th>
                <th className="p-3 border-r border-border">Status</th>
                <th className="p-3 border-r border-border">Invoicing Progress</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">Loading estimates…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">
                  {estimates.length === 0
                    ? 'No estimates yet. Estimates you write here will appear in this register, and converting one creates its invoice.'
                    : 'No estimates match this view.'}
                </td></tr>
              ) : shown.map((e) => (
                <tr key={e.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{e.estimateNumber}</td>
                  <td className="p-3 border-r border-border">
                    <div className="font-medium">{e.customerName}</div>
                    <div className="text-[11px] text-muted-foreground">{e.customerEmail || ''}</div>
                  </td>
                  <td className="p-3 border-r border-border text-muted-foreground">
                    {e.expiryDate || '—'}{e.expired ? <div className="text-[11px] text-red-700 font-semibold">Expired</div> : null}
                  </td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(e.total)}</td>
                  <td className="p-3 border-r border-border">{chip(e)}</td>
                  <td className="p-3 border-r border-border">
                    {e.progressPct != null ? (
                      <div className="min-w-[140px]">
                        <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-[#7258e8]" style={{ width: `${e.progressPct}%` }} /></div>
                        <div className="text-[11px] text-muted-foreground mt-1">Invoiced {fmt(e.invoicedTotal || 0)} of {fmt(e.total)} ({e.progressPct}%)</div>
                      </div>
                    ) : <span className="text-muted-foreground">Not invoiced yet</span>}
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    {e.status === 'draft' && !e.convertedInvoiceId && (
                      <button type="button" disabled={busy === e.id} onClick={() => act(e, 'send')} data-tip="Marks this estimate sent to the customer"
                        className="text-[12px] underline mr-3 disabled:opacity-50">Send</button>
                    )}
                    {e.status === 'sent' && !e.convertedInvoiceId && (
                      <>
                        <button type="button" disabled={busy === e.id} onClick={() => act(e, 'accept')} data-tip="Records that the customer accepted this estimate"
                          className="text-[12px] underline mr-3 disabled:opacity-50">Accept</button>
                        <button type="button" disabled={busy === e.id} onClick={() => act(e, 'decline')} data-tip="Records that the customer declined this estimate"
                          className="text-[12px] underline mr-3 disabled:opacity-50">Decline</button>
                      </>
                    )}
                    {['sent', 'accepted'].includes(e.status) && !e.convertedInvoiceId && (
                      <button type="button" disabled={busy === e.id} onClick={() => act(e, 'convert')} data-tip="Turns this estimate into a real invoice with the same totals"
                        className="text-[12px] underline disabled:opacity-50">Convert to Invoice</button>
                    )}
                    {e.convertedInvoiceId && (
                      <Link href={`/admin/accounting/invoices/${e.convertedInvoiceId}`} className="text-[12px] underline">
                        View Invoice {e.convertedInvoiceNumber || ''} →
                      </Link>
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

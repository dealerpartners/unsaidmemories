'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Download, Scale } from 'lucide-react';

// /admin/accounting/payments — Payments & Settlements (owner's
// payments_settlements.html rebuilt as a real route): every
// payment received (acct_ar_receipts) with his columns — Payment
// Ref, Date, Customer Entity, Channel / Rail, Gross Amount,
// Applied Invoice, Status — plus the settlements table
// (acct_payouts) where fee deductions and net settlement live.
// Record Offline Payment writes a real receipt row; the Stripe
// reconciliation link from the previous page is preserved.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Receipt = {
  id: string; receiptNumber: string; receiptDate: string | null; customerName: string;
  amount: number; paymentMethod: string | null; processor: string | null; channel: string;
  status: string; reference: string | null; appliedInvoices: string | null;
};
type Payout = {
  id: string; payoutNumber: string | null; provider: string | null;
  periodStart: string | null; periodEnd: string | null;
  gross: number; fees: number; refunds: number; chargebacks: number; net: number;
  status: string; scheduledFor: string | null; arrivedAt: string | null; destination: string | null;
};
type Cust = { id: string; name: string };

export default function PaymentsSettlementsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [customers, setCustomers] = useState<Cust[]>([]);
  const [summary, setSummary] = useState<{ receiptsTotal: number; receiptsCount: number; settlementsGross: number; settlementsFees: number; settlementsNet: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState<string>('all');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ receipt_number: '', customer_id: '', amount: '', payment_method: 'bank_transfer', receipt_date: '', reference: '' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/payments', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setReceipts(Array.isArray(d.receipts) ? d.receipts : []);
        setPayouts(Array.isArray(d.payouts) ? d.payouts : []);
        setSummary(d.summary || null);
      })
      .catch(() => setError('Payments could not be loaded.'))
      .finally(() => setLoading(false));
    fetch('/api/admin/accounting/estimates/register', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.customers)) setCustomers(d.customers); })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const channels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of receipts) counts.set(r.channel, (counts.get(r.channel) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [receipts]);

  const shown = useMemo(() => {
    let rows = receipts;
    if (channel !== 'all') rows = rows.filter((r) => r.channel === channel);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => [r.receiptNumber, r.customerName, r.status, r.reference || '', r.appliedInvoices || ''].join(' ').toLowerCase().includes(q));
    }
    return rows;
  }, [receipts, channel, search]);

  const recordPayment = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const amount = Number(form.amount);
    if (!form.receipt_number.trim()) { setError('Receipt / reference number is required.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter an amount greater than zero.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt_number: form.receipt_number.trim(),
          customer_id: form.customer_id || null,
          amount, payment_method: form.payment_method,
          receipt_date: form.receipt_date || new Date().toISOString().slice(0, 10),
          reference: form.reference || null, status: 'posted', currency: 'USD',
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Could not record the payment');
      setNotice(`Payment ${form.receipt_number.trim()} (${fmt(amount)}) recorded — it is in the register below.`);
      setShowForm(false);
      setForm({ receipt_number: '', customer_id: '', amount: '', payment_method: 'bank_transfer', receipt_date: '', reference: '' });
      load();
    } catch (e: any) { setError(e?.message || 'Could not record the payment'); }
    finally { setBusy(false); }
  };

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Payment Ref', 'Date', 'Customer', 'Channel', 'Gross Amount', 'Applied Invoice', 'Status'];
    const lines = shown.map((r) => [r.receiptNumber, r.receiptDate || '', r.customerName, r.channel, r.amount.toFixed(2), r.appliedInvoices || '', r.status].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'payments.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Payments &amp; Settlements</h1>
          <Link href="/admin/payments/reconciliation" className="inline-flex items-center gap-1.5 text-[12.5px] underline mt-1">
            <Scale className="size-3.5" /> Stripe Reconciliation — commerce payments vs Stripe charges vs webhook events
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ref, customer, invoice…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
          <button type="button" onClick={exportCsv} data-tip="Downloads the payments currently shown as a CSV file"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium">
            <Download className="size-4" /> Export CSV
          </button>
          <button type="button" onClick={() => setShowForm((s) => !s)} data-tip="Records a payment received outside the online checkout — cash, check, wire or ACH"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium">
            <Plus className="size-4" /> Record Offline Payment
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={recordPayment} className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-3">Record Offline Payment</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className={labelCls}>Receipt / Ref #</label>
              <input value={form.receipt_number} onChange={(e) => setForm({ ...form, receipt_number: e.target.value })} className={inputCls} placeholder="RCT-1007" required /></div>
            <div><label className={labelCls}>Customer</label>
              <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} className={inputCls}>
                <option value="">— Select customer —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className={labelCls}>Amount</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Channel / Rail</label>
              <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className={inputCls}>
                <option value="bank_transfer">Wire / Bank Transfer</option>
                <option value="ach">ACH Inbound</option>
                <option value="check">Check</option>
                <option value="cash">Cash</option>
                <option value="card">Card (in person)</option>
              </select></div>
            <div><label className={labelCls}>Date</label>
              <input type="date" value={form.receipt_date} onChange={(e) => setForm({ ...form, receipt_date: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Reference (optional)</label>
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className={inputCls} placeholder="Wire confirmation, check #" /></div>
          </div>
          <button type="submit" disabled={busy} data-tip="Saves this payment into the receipts register below"
            className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
            {busy ? 'Recording…' : 'Record Payment'}
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" onClick={() => setChannel('all')}
          className={`h-8 px-3 rounded-full border text-[12.5px] font-medium ${channel === 'all' ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'border-border bg-card text-foreground'}`}>
          All Transactions ({receipts.length})
        </button>
        {channels.map(([name, count]) => (
          <button key={name} type="button" onClick={() => setChannel(name)}
            className={`h-8 px-3 rounded-full border text-[12.5px] font-medium ${channel === name ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'border-border bg-card text-foreground'}`}>
            {name} ({count})
          </button>
        ))}
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Payment Ref</th>
              <th className={thCls}>Date &amp; Time</th>
              <th className={thCls}>Customer Entity</th>
              <th className={thCls}>Channel / Rail</th>
              <th className={`${thCls} text-right`}>Gross Amount</th>
              <th className={thCls}>Applied Invoice</th>
              <th className="p-3">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">Loading payments…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">
                  {receipts.length === 0
                    ? 'No payments received yet. Payments from checkout and invoices — and offline payments you record here — will appear in this register.'
                    : 'No payments match this view.'}
                </td></tr>
              ) : shown.map((r) => (
                <tr key={r.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{r.receiptNumber}</td>
                  <td className="p-3 border-r border-border tabular-nums">{r.receiptDate || '—'}</td>
                  <td className="p-3 border-r border-border font-medium">{r.customerName}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{r.channel}{r.processor ? <div className="text-[11px]">via {r.processor}</div> : null}</td>
                  <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(r.amount)}</td>
                  <td className="p-3 border-r border-border">{r.appliedInvoices || <span className="text-muted-foreground">Unapplied</span>}</td>
                  <td className="p-3">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <h2 className="font-display text-lg font-semibold tracking-tight mt-8 mb-1">Settlements</h2>
        <p className="text-[13px] text-muted-foreground mb-3">
          What processors paid out after fees, refunds and chargebacks.
          {summary && payouts.length > 0 ? <> Gross {fmt(summary.settlementsGross)} · fees {fmt(summary.settlementsFees)} · net {fmt(summary.settlementsNet)}.</> : null}
        </p>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Payout Ref</th>
              <th className={thCls}>Period</th>
              <th className={`${thCls} text-right`}>Gross Amount</th>
              <th className={`${thCls} text-right`}>Fee Deduction</th>
              <th className={`${thCls} text-right`}>Refunds / Chargebacks</th>
              <th className={`${thCls} text-right`}>Net Settlement</th>
              <th className={thCls}>Destination</th>
              <th className="p-3">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">Loading settlements…</td></tr>
              ) : payouts.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">
                  No processor payouts recorded yet. When Stripe (or another processor) pays out, each settlement lands here with its gross, the fees taken out, and the net that reached the bank.
                </td></tr>
              ) : payouts.map((p) => (
                <tr key={p.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{p.payoutNumber || p.provider || '—'}</td>
                  <td className="p-3 border-r border-border tabular-nums">{p.periodStart || '—'} → {p.periodEnd || '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(p.gross)}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">−{fmt(p.fees)}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">−{fmt(p.refunds + p.chargebacks)}</td>
                  <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(p.net)}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{p.destination || '—'}{p.arrivedAt ? <div className="text-[11px]">arrived {p.arrivedAt.slice(0, 10)}</div> : null}</td>
                  <td className="p-3">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

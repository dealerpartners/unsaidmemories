'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Download } from 'lucide-react';

// /admin/accounting/refunds — Credits, Refunds & Disputes
// (owner's credits_refunds_disputes.html rebuilt as a real
// route): one register over the three money-back record types —
// credit memos (acct_ar_credit_memos, with balance remaining =
// total − applied), merchant refunds (acct_refunds, issued
// through the journal-posting flow in the refunds API) and
// disputes/chargebacks (acct_disputes, worked in the Dispute
// Center). Refund policy (window, restocking fee, approval
// thresholds) is editable here and drives the issue flow.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Row = {
  key: string;
  kind: 'Credit Memo' | 'Refund' | 'Dispute';
  number: string;
  customer: string;
  date: string | null;
  reference: string | null;
  reason: string | null;
  gross: number;
  balanceRemaining: number | null;
  status: string;
  raw: any;
};

type Cust = { id: string; name: string };

const custName = (c: any): string => {
  if (!c) return '—';
  if (c.company_name) return c.company_name;
  const p = [c.first_name, c.last_name].filter(Boolean).join(' ');
  return p || '—';
};

const TABS = [
  { key: 'all', label: 'All Records' },
  { key: 'Credit Memo', label: 'Credit Memos' },
  { key: 'Refund', label: 'Merchant Refunds' },
  { key: 'Dispute', label: 'Disputes & Chargebacks' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function CreditsRefundsDisputesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [policy, setPolicy] = useState<any>(null);
  const [customers, setCustomers] = useState<Cust[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [showIssue, setShowIssue] = useState(false);
  const [issue, setIssue] = useState({ customer_id: '', amount: '', reason: '', order_ref: '', payment_method: 'card' });
  const [policyForm, setPolicyForm] = useState({ window_days: '', restocking_fee_percent: '', require_approval_above: '', auto_approve_below: '', notes: '' });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/admin/accounting/refunds', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed')))),
      fetch('/api/admin/accounting/disputes', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed')))),
    ])
      .then(([rf, dp]) => {
        const out: Row[] = [];
        for (const m of rf.creditMemos || []) {
          out.push({
            key: `memo-${m.id}`, kind: 'Credit Memo', number: m.memo_number || '—',
            customer: custName(m.crm_customers), date: m.memo_date || null,
            reference: null, reason: m.reason || null,
            gross: Number(m.total || 0),
            balanceRemaining: Number(m.total || 0) - Number(m.applied_amount || 0),
            status: String(m.status || ''), raw: m,
          });
        }
        for (const x of rf.refunds || []) {
          out.push({
            key: `refund-${x.id}`, kind: 'Refund', number: x.refund_number || '—',
            customer: custName(x.crm_customers), date: (x.issued_at || x.created_at || '').slice(0, 10) || null,
            reference: x.order_ref || null, reason: x.reason || x.refund_type || null,
            gross: Number(x.amount || 0), balanceRemaining: null,
            status: String(x.status || ''), raw: x,
          });
        }
        for (const d of dp.disputes || []) {
          out.push({
            key: `dispute-${d.id}`, kind: 'Dispute', number: d.dispute_number || '—',
            customer: custName(d.crm_customers), date: (d.created_at || '').slice(0, 10) || null,
            reference: d.order_ref || d.processor_dispute_id || null, reason: d.reason || d.kind || null,
            gross: Number(d.amount || 0), balanceRemaining: ['open', 'evidence_submitted'].includes(d.status) ? Number(d.amount || 0) : 0,
            status: String(d.status || ''), raw: d,
          });
        }
        out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        setRows(out);
        setPolicy(rf.policy || null);
        if (rf.policy) {
          setPolicyForm({
            window_days: String(rf.policy.window_days ?? ''), restocking_fee_percent: String(rf.policy.restocking_fee_percent ?? ''),
            require_approval_above: String(rf.policy.require_approval_above ?? ''), auto_approve_below: String(rf.policy.auto_approve_below ?? ''),
            notes: rf.policy.notes || '',
          });
        }
      })
      .catch(() => setError('Credits, refunds and disputes could not be loaded.'))
      .finally(() => setLoading(false));
    fetch('/api/admin/accounting/estimates/register', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.customers)) setCustomers(d.customers); })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    'Credit Memo': rows.filter((r) => r.kind === 'Credit Memo').length,
    Refund: rows.filter((r) => r.kind === 'Refund').length,
    Dispute: rows.filter((r) => r.kind === 'Dispute' && ['open', 'evidence_submitted'].includes(r.status)).length,
  }), [rows]);

  const shown = useMemo(() => {
    let out = rows;
    if (tab !== 'all') out = out.filter((r) => r.kind === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) => [r.number, r.customer, r.status, r.reason || '', r.reference || ''].join(' ').toLowerCase().includes(q));
    }
    return out;
  }, [rows, tab, search]);

  const refundAction = async (row: Row, action: string) => {
    setBusy(row.key); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/refunds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: row.raw.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'Action failed');
      setNotice(`Refund ${row.number}: ${action} completed.`);
      load();
    } catch (e: any) { setError(e?.message || 'Action failed'); }
    finally { setBusy(null); }
  };

  const issueRefund = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const amount = Number(issue.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a refund amount greater than zero.'); return; }
    setBusy('issue'); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/refunds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'issue', customer_id: issue.customer_id || null, amount, reason: issue.reason || null, order_ref: issue.order_ref || null, payment_method: issue.payment_method }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'Issue failed');
      setNotice(`Refund ${j.refund_number || ''} ${j.auto_issued ? 'issued and posted to the books' : 'recorded and waiting for approval (above the auto-approve threshold)'}.`);
      setShowIssue(false);
      setIssue({ customer_id: '', amount: '', reason: '', order_ref: '', payment_method: 'card' });
      load();
    } catch (e: any) { setError(e?.message || 'Issue failed'); }
    finally { setBusy(null); }
  };

  const savePolicy = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy('policy'); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/refunds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'policy', ...policyForm }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error || 'Policy save failed');
      setNotice('Refund policy saved.');
      load();
    } catch (e: any) { setError(e?.message || 'Policy save failed'); }
    finally { setBusy(null); }
  };

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Type', 'Memo / Case #', 'Customer', 'Date Issued', 'Original Reference', 'Reason / Code', 'Gross Amount', 'Balance Remaining', 'Status'];
    const lines = shown.map((r) => [r.kind, r.number, r.customer, r.date || '', r.reference || '', r.reason || '', r.gross.toFixed(2), r.balanceRemaining != null ? r.balanceRemaining.toFixed(2) : '', r.status].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'credits-refunds-disputes.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'p-3 border-r border-border';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Credits, Refunds &amp; Disputes</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, customer, reason…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
          <button type="button" onClick={exportCsv} data-tip="Downloads the records currently shown as a CSV ledger"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium">
            <Download className="size-4" /> Export Ledger
          </button>
          <button type="button" onClick={() => setShowIssue((s) => !s)} data-tip="Issues a refund to a customer; small refunds post immediately, larger ones wait for approval per the policy below"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium">
            <Plus className="size-4" /> Issue Refund
          </button>
        </div>
      </div>

      {showIssue && (
        <form onSubmit={issueRefund} className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-3">Issue Refund</div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div><label className={labelCls}>Customer</label>
              <select value={issue.customer_id} onChange={(e) => setIssue({ ...issue, customer_id: e.target.value })} className={inputCls}>
                <option value="">— Select customer —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className={labelCls}>Amount</label>
              <input type="number" step="0.01" min="0" value={issue.amount} onChange={(e) => setIssue({ ...issue, amount: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Order Reference</label>
              <input value={issue.order_ref} onChange={(e) => setIssue({ ...issue, order_ref: e.target.value })} className={inputCls} placeholder="ORD-1001" /></div>
            <div><label className={labelCls}>Back To</label>
              <select value={issue.payment_method} onChange={(e) => setIssue({ ...issue, payment_method: e.target.value })} className={inputCls}>
                <option value="card">Original card</option>
                <option value="ach">Bank account (ACH)</option>
                <option value="store_credit">Store credit</option>
                <option value="cash">Cash</option>
              </select></div>
            <div><label className={labelCls}>Reason</label>
              <input value={issue.reason} onChange={(e) => setIssue({ ...issue, reason: e.target.value })} className={inputCls} placeholder="Damaged in transit…" /></div>
          </div>
          <button type="submit" disabled={busy === 'issue'} data-tip="Creates the refund; it posts to the books right away or waits for approval, per the policy"
            className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
            {busy === 'issue' ? 'Issuing…' : 'Issue Refund'}
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`h-8 px-3 rounded-full border text-[12.5px] font-medium ${tab === t.key ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'border-border bg-card text-foreground'}`}>
            {t.label}{t.key !== 'all' ? ` (${counts[t.key as keyof typeof counts]})` : ` (${rows.length})`}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
              <th className={thCls}>Memo / Case #</th>
              <th className={thCls}>Customer</th>
              <th className={thCls}>Date Issued</th>
              <th className={thCls}>Original Reference</th>
              <th className={thCls}>Reason / Code</th>
              <th className={`${thCls} text-right`}>Gross Amount</th>
              <th className={`${thCls} text-right`}>Balance Remaining</th>
              <th className={thCls}>Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={9} className="text-center text-muted-foreground">Loading register…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-muted-foreground">
                  {rows.length === 0
                    ? 'Nothing here yet. Refunds you issue, credit memos written against invoices, and processor disputes will all appear in this register.'
                    : 'No records match this view.'}
                </td></tr>
              ) : shown.map((r) => (
                <tr key={r.key} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{r.number}<div className="text-[11px] font-normal text-muted-foreground">{r.kind}</div></td>
                  <td className="p-3 border-r border-border font-medium">{r.customer}</td>
                  <td className="p-3 border-r border-border tabular-nums">{r.date || '—'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{r.reference || '—'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{r.reason || '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(r.gross)}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{r.balanceRemaining != null ? fmt(r.balanceRemaining) : '—'}</td>
                  <td className="p-3 border-r border-border">{r.status.replace(/_/g, ' ')}</td>
                  <td className="p-3 text-center whitespace-nowrap">
                    {r.kind === 'Refund' && r.status === 'requested' && (
                      <>
                        <button type="button" disabled={busy === r.key} onClick={() => refundAction(r, 'approve')} data-tip="Approves this refund and posts it to the books"
                          className="text-[12px] underline mr-3 disabled:opacity-50">Approve</button>
                        <button type="button" disabled={busy === r.key} onClick={() => refundAction(r, 'reject')} data-tip="Rejects this refund request"
                          className="text-[12px] underline mr-3 disabled:opacity-50">Reject</button>
                        <button type="button" disabled={busy === r.key} onClick={() => refundAction(r, 'void')} data-tip="Voids this refund request without paying it"
                          className="text-[12px] underline disabled:opacity-50">Void</button>
                      </>
                    )}
                    {r.kind === 'Dispute' && (
                      <Link href="/admin/accounting/refunds/disputes" className="text-[12px] underline">Open in Dispute Center</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <form onSubmit={savePolicy} className="border border-border rounded-xl bg-card p-4 mt-6">
          <div className="font-semibold text-[14px] mb-1">Refund Policy</div>
          <p className="text-[12.5px] text-muted-foreground mb-3">
            {policy
              ? 'These rules drive the refund flow: refunds at or below the auto-approve amount post immediately; larger ones wait for approval.'
              : 'No policy saved yet — until one is, refunds above $25 wait for approval. Save the policy to set your own thresholds.'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div><label className={labelCls}>Return window (days)</label>
              <input type="number" min="0" value={policyForm.window_days} onChange={(e) => setPolicyForm({ ...policyForm, window_days: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Restocking fee %</label>
              <input type="number" step="0.01" min="0" value={policyForm.restocking_fee_percent} onChange={(e) => setPolicyForm({ ...policyForm, restocking_fee_percent: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Approval needed above ($)</label>
              <input type="number" step="0.01" min="0" value={policyForm.require_approval_above} onChange={(e) => setPolicyForm({ ...policyForm, require_approval_above: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Auto-approve below ($)</label>
              <input type="number" step="0.01" min="0" value={policyForm.auto_approve_below} onChange={(e) => setPolicyForm({ ...policyForm, auto_approve_below: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Notes</label>
              <input value={policyForm.notes} onChange={(e) => setPolicyForm({ ...policyForm, notes: e.target.value })} className={inputCls} /></div>
          </div>
          <button type="submit" disabled={busy === 'policy'} data-tip="Saves these refund rules for the whole shop"
            className="mt-4 h-9 px-4 rounded-lg border border-border bg-card text-[13px] font-medium disabled:opacity-50">
            {busy === 'policy' ? 'Saving…' : 'Save Policy'}
          </button>
        </form>
      </div>
    </div>
  );
}

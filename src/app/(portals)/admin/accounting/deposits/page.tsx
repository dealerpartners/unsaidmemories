'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

// /admin/accounting/deposits — Deposits & Clearing (owner's
// deposits_clearing.html rebuilt as a real route):
//   1) Select Payments to Include in Deposit Batch — received
//      payments (acct_ar_receipts) with checkboxes and a live
//      Deposit Slip Summary; "Record Deposit" marks the selected
//      payments deposited in one call (the batch is exactly that
//      set — the schema has no batch table, and none is faked).
//   2) Recent Finalized Deposit Batches — acct_payouts rows,
//      the processors' own batches with real fee/net figures,
//      plus the payments marked deposited above.
//   3) Customer Deposits Held — the GL 2350 deposit receipts
//      (reference DEPOSIT:…) with the existing collect / apply /
//      release / forfeit actions from the deposits API.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Receipt = {
  id: string; receipt_number: string; receipt_date: string | null; amount: number;
  payment_method: string | null; processor: string | null; status: string;
  reference: string | null;
  crm_customers: { company_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
};
type Payout = {
  id: string; payout_number: string | null; provider: string | null;
  period_start: string | null; period_end: string | null;
  gross_amount: number; fee_amount: number; net_amount: number;
  status: string; arrived_at: string | null;
};
type Cust = { id: string; name: string };

const custName = (c: Receipt['crm_customers']): string => {
  if (!c) return '—';
  if (c.company_name) return c.company_name;
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';
};
const num = (rows: any[], key: string) => (rows || []).map((r) => ({ ...r, [key]: Number(r[key] || 0) }));

export default function DepositsClearingPage() {
  const [awaiting, setAwaiting] = useState<Receipt[]>([]);
  const [deposited, setDeposited] = useState<Receipt[]>([]);
  const [held, setHeld] = useState<Receipt[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [customers, setCustomers] = useState<Cust[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [collect, setCollect] = useState({ customer_id: '', amount: '', payment_method: 'card', invoice_id: '' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/deposits', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setAwaiting(num(d.awaiting || [], 'amount'));
        setDeposited(num(d.deposited || [], 'amount'));
        setHeld(num(d.heldDeposits || [], 'amount'));
        setPayouts((d.payouts || []).map((p: any) => ({ ...p, gross_amount: Number(p.gross_amount || 0), fee_amount: Number(p.fee_amount || 0), net_amount: Number(p.net_amount || 0) })));
        setSelected(new Set());
      })
      .catch(() => setError('Deposits could not be loaded.'))
      .finally(() => setLoading(false));
    fetch('/api/admin/accounting/estimates/register', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.customers)) setCustomers(d.customers); })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedRows = useMemo(() => awaiting.filter((r) => selected.has(r.id)), [awaiting, selected]);
  const slipTotal = selectedRows.reduce((s, r) => s + r.amount, 0);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected((prev) => (prev.size === awaiting.length ? new Set() : new Set(awaiting.map((r) => r.id))));

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/admin/accounting/deposits', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.ok === false) throw new Error(j?.error || 'Action failed');
    return j;
  };

  const recordDeposit = async () => {
    if (!selectedRows.length) { setError('Tick at least one payment to include in the deposit.'); return; }
    setBusy('deposit'); setError(null); setNotice(null);
    try {
      const j = await post({ action: 'mark_deposited', ids: selectedRows.map((r) => r.id) });
      setNotice(`Deposit recorded: ${j.deposited ?? selectedRows.length} payment(s) totaling ${fmt(slipTotal)} marked as deposited — see them under Recently Deposited below.`);
      load();
    } catch (e: any) { setError(e?.message || 'Deposit failed'); }
    finally { setBusy(null); }
  };

  const heldAction = async (r: Receipt, action: string) => {
    if (action === 'forfeit' && !window.confirm(`Forfeit deposit ${r.receipt_number}? Its ${fmt(r.amount)} is recognized as revenue.`)) return;
    if (action === 'apply' && !window.confirm(`Apply deposit ${r.receipt_number} (${fmt(r.amount)}) to its invoice?`)) return;
    setBusy(r.id); setError(null); setNotice(null);
    try {
      await post({ action, id: r.id });
      setNotice(`Deposit ${r.receipt_number}: ${action} completed.`);
      load();
    } catch (e: any) { setError(e?.message || 'Action failed'); }
    finally { setBusy(null); }
  };

  const collectDeposit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const amount = Number(collect.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter the deposit amount.'); return; }
    setBusy('collect'); setError(null); setNotice(null);
    try {
      const j = await post({ action: 'collect', customer_id: collect.customer_id || null, amount, payment_method: collect.payment_method, invoice_id: collect.invoice_id || null });
      setNotice(`Deposit ${j.receipt_number || ''} collected and held — it is in Customer Deposits Held below.`);
      setCollect({ customer_id: '', amount: '', payment_method: 'card', invoice_id: '' });
      load();
    } catch (e: any) { setError(e?.message || 'Collect failed'); }
    finally { setBusy(null); }
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Deposits &amp; Clearing</h1>
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">Select Payments to Include in Deposit Batch</h2>
          <button type="button" onClick={recordDeposit} disabled={busy === 'deposit' || selectedRows.length === 0}
            data-tip="Marks every ticked payment as deposited — together they are this deposit batch"
            className="h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
            {busy === 'deposit' ? 'Recording…' : `Record Deposit (${fmt(slipTotal)})`}
          </button>
        </div>
        <div className="border border-border rounded-xl overflow-x-auto bg-card mt-3">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}><input type="checkbox" aria-label="Select all payments" checked={awaiting.length > 0 && selected.size === awaiting.length} onChange={toggleAll} /> Inc</th>
              <th className={thCls}>Date</th>
              <th className={thCls}>Channel</th>
              <th className={thCls}>Customer / Origin</th>
              <th className={thCls}>Doc #</th>
              <th className="p-3 text-right">Gross Amount</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">Loading payments…</td></tr>
              ) : awaiting.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">
                  No payments are waiting to be deposited. New receipts land here until you bundle them into a deposit.
                </td></tr>
              ) : awaiting.map((r) => (
                <tr key={r.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border"><input type="checkbox" aria-label={`Include ${r.receipt_number}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td className="p-3 border-r border-border tabular-nums">{r.receipt_date || '—'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{r.payment_method || '—'}{r.processor ? ` · ${r.processor}` : ''}</td>
                  <td className="p-3 border-r border-border font-medium">{custName(r.crm_customers)}</td>
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{r.receipt_number}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <div className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-2">Deposit Slip Summary</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]">
            <div>Payments selected<div className="text-xl font-semibold tabular-nums mt-0.5">{selectedRows.length}</div></div>
            <div>Gross deposit<div className="text-xl font-semibold tabular-nums mt-0.5">{fmt(slipTotal)}</div></div>
            <div>Processor fees<div className="text-[13px] text-muted-foreground mt-1">Deducted by the processor at settlement — the exact fee and net for each batch are on the finalized batches below and on Payments &amp; Settlements.</div></div>
          </div>
        </div>

        <h2 className="font-display text-lg font-semibold tracking-tight mt-8 mb-1">Recent Finalized Deposit Batches</h2>
        <p className="text-[13px] text-muted-foreground mb-3">Processor payouts are the finalized batches — each carries its own fees and net. Payments you mark deposited are listed under them.</p>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Batch</th>
              <th className={thCls}>Period / Arrived</th>
              <th className={`${thCls} text-right`}>Gross Amount</th>
              <th className={`${thCls} text-right`}>Fee Deduction</th>
              <th className={`${thCls} text-right`}>Net Deposit</th>
              <th className="p-3">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">Loading batches…</td></tr>
              ) : payouts.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">
                  No processor payout batches recorded yet. When Stripe pays out, the batch lands here with its gross, the fees taken, and the net that reached the bank.
                </td></tr>
              ) : payouts.map((p) => (
                <tr key={p.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{p.payout_number || p.provider || '—'}</td>
                  <td className="p-3 border-r border-border tabular-nums">{p.period_start || '—'} → {p.period_end || '—'}
                    {p.arrived_at ? <div className="text-[11px] text-muted-foreground">arrived {String(p.arrived_at).slice(0, 10)}</div> : null}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(p.gross_amount)}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">−{fmt(p.fee_amount)}</td>
                  <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(p.net_amount)}</td>
                  <td className="p-3">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <h3 className="font-semibold text-[14px] mt-6 mb-2">Recently Deposited Payments</h3>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Date</th>
              <th className={thCls}>Channel</th>
              <th className={thCls}>Customer / Origin</th>
              <th className={thCls}>Doc #</th>
              <th className="p-3 text-right">Gross Amount</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {deposited.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted-foreground">Nothing marked deposited yet — use the batch builder above.</td></tr>
              ) : deposited.map((r) => (
                <tr key={r.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border tabular-nums">{r.receipt_date || '—'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{r.payment_method || '—'}</td>
                  <td className="p-3 border-r border-border">{custName(r.crm_customers)}</td>
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{r.receipt_number}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <h2 className="font-display text-lg font-semibold tracking-tight mt-8 mb-1">Customer Deposits Held</h2>
        <p className="text-[13px] text-muted-foreground mb-3">Deposits collected against future invoices, held in Customer Deposits (GL 2350) until they are applied, released or forfeited.</p>
        <form onSubmit={collectDeposit} className="border border-border rounded-xl bg-card p-4 mb-4">
          <div className="font-semibold text-[14px] mb-3">Collect a Deposit</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><label className={labelCls}>Customer</label>
              <select value={collect.customer_id} onChange={(e) => setCollect({ ...collect, customer_id: e.target.value })} className={inputCls}>
                <option value="">— Select customer —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className={labelCls}>Amount</label>
              <input type="number" step="0.01" min="0" value={collect.amount} onChange={(e) => setCollect({ ...collect, amount: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Method</label>
              <select value={collect.payment_method} onChange={(e) => setCollect({ ...collect, payment_method: e.target.value })} className={inputCls}>
                <option value="card">Card</option>
                <option value="ach">ACH</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash">Cash</option>
              </select></div>
            <div><label className={labelCls}>For invoice ID (optional)</label>
              <input value={collect.invoice_id} onChange={(e) => setCollect({ ...collect, invoice_id: e.target.value })} className={inputCls} placeholder="Invoice UUID" /></div>
          </div>
          <button type="submit" disabled={busy === 'collect'} data-tip="Collects the deposit money and holds it against the customer's future invoice"
            className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
            {busy === 'collect' ? 'Collecting…' : 'Collect Deposit'}
          </button>
        </form>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Receipt #</th>
              <th className={thCls}>Customer</th>
              <th className={thCls}>Date</th>
              <th className={`${thCls} text-right`}>Amount Held</th>
              <th className={thCls}>Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">Loading deposits…</td></tr>
              ) : held.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">No customer deposits are being held right now.</td></tr>
              ) : held.map((r) => (
                <tr key={r.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{r.receipt_number}</td>
                  <td className="p-3 border-r border-border">{custName(r.crm_customers)}</td>
                  <td className="p-3 border-r border-border tabular-nums">{r.receipt_date || '—'}</td>
                  <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(r.amount)}</td>
                  <td className="p-3 border-r border-border">{r.status}</td>
                  <td className="p-3 text-center whitespace-nowrap">
                    {r.status === 'held' && (
                      <>
                        <button type="button" disabled={busy === r.id} onClick={() => heldAction(r, 'apply')} data-tip="Applies this deposit to the invoice it was collected for"
                          className="text-[12px] underline mr-3 disabled:opacity-50">Apply to Invoice</button>
                        <button type="button" disabled={busy === r.id} onClick={() => heldAction(r, 'release')} data-tip="Returns this deposit to the customer"
                          className="text-[12px] underline mr-3 disabled:opacity-50">Release</button>
                        <button type="button" disabled={busy === r.id} onClick={() => heldAction(r, 'forfeit')} data-tip="Keeps this deposit as revenue — the customer loses it"
                          className="text-[12px] underline disabled:opacity-50">Forfeit</button>
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

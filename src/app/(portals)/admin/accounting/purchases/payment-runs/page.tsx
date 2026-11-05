'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

// /admin/accounting/purchases/payment-runs — Purchases & Payables
// → Approvals & Payment Runs (owner spec:
// approvals_payment_runs.html). Two real machines on one page:
//  1. The approval queue over acct_ap_approvals — request an
//     approval for a bill, approve or reject it; the decision,
//     decider, time and comment are written back to the row.
//  2. The payment run builder over acct_ap_bills — select bills,
//     capture each one's early-payment discount terms, and execute:
//     every selected bill gets a real acct_ap_payments row, an
//     acct_ap_payment_applications row, a balanced journal
//     (DR AP / CR cash / CR discount) and a settled status.
// Workflow rules (acct_workflows) and recent payments list below.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

type Approval = { id: string; billId: string | null; reference: string; amount: number; dueDate: string | null; vendorName: string | null; sequenceNo: number; status: string; actedAt: string | null; comments: string | null };
type PayableBill = { id: string; billNumber: string; dueDate: string; total: number; balance: number; status: string; vendorName: string; paymentTermsDays: number | null; approvalStatus: string | null };
type Sel = { picked: boolean; discount: string; method: string };

const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';

export default function ApprovalsPaymentRunsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [bills, setBills] = useState<PayableBill[]>([]);
  const [workflows, setWorkflows] = useState<{ id: string; name: string; entityType: string; thresholdAmount: number | null; isActive: boolean }[]>([]);
  const [payments, setPayments] = useState<{ id: string; paymentNumber: string; paymentDate: string; amount: number; paymentMethod: string; status: string; vendorName: string | null; appliedBills: string | null }[]>([]);
  const [liquidCash, setLiquidCash] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<{ name: string; institution: string | null; masked: string | null }[]>([]);
  const [sel, setSel] = useState<Record<string, Sel>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/payment-runs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setApprovals(Array.isArray(d.approvals) ? d.approvals : []);
        setBills(Array.isArray(d.payableBills) ? d.payableBills : []);
        setWorkflows(Array.isArray(d.workflows) ? d.workflows : []);
        setPayments(Array.isArray(d.recentPayments) ? d.recentPayments : []);
        setLiquidCash(Number(d.liquidCash || 0));
        setBankAccounts(Array.isArray(d.bankAccounts) ? d.bankAccounts : []);
        setError(null);
      })
      .catch(() => setError('Approvals and payment runs could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/admin/accounting/payment-runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || 'action failed');
    return d;
  };

  const selFor = (id: string): Sel => sel[id] || { picked: false, discount: '', method: 'ach' };
  const picked = useMemo(() => bills.filter((b) => selFor(b.id).picked), [bills, sel]);
  const grossPicked = picked.reduce((s, b) => s + b.balance, 0);
  const discountPicked = picked.reduce((s, b) => s + Math.round((b.balance * (Number(selFor(b.id).discount) || 0)) / 100 * 100) / 100, 0);
  const netPicked = grossPicked - discountPicked;
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');

  const decide = async (a: Approval, decision: 'approved' | 'rejected') => {
    setBusy(`decide-${a.id}`);
    try {
      await post({ action: 'decide', approval_id: a.id, decision, comments: comments[a.id] || '' });
      setNotice(`Approval for ${a.reference} ${decision}.`);
      load();
    } catch (err: any) { setError(err?.message || 'Decision could not be saved.'); }
    finally { setBusy(null); }
  };

  const requestApproval = async (b: PayableBill) => {
    setBusy(`req-${b.id}`);
    try {
      await post({ action: 'request_approval', bill_id: b.id });
      setNotice(`Approval requested for ${b.billNumber} — it is now in the queue above.`);
      load();
    } catch (err: any) { setError(err?.message || 'Approval could not be requested.'); }
    finally { setBusy(null); }
  };

  const executeRun = async () => {
    setBusy('run');
    try {
      const d = await post({
        action: 'run',
        items: picked.map((b) => ({ bill_id: b.id, discount_percent: Number(selFor(b.id).discount) || 0, method: selFor(b.id).method })),
      });
      const made = Array.isArray(d.payments) ? d.payments : [];
      setNotice(`Payment run complete — ${made.length} payment(s) posted: ${made.map((p: any) => `${p.payment_number} (${p.bill_number}, ${fmt(p.net)})`).join(' · ')}`);
      setSel({});
      load();
    } catch (err: any) { setError(err?.message || 'Payment run failed.'); }
    finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Approvals & Payment Runs</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 py-4">
        {[
          { label: 'Queued for Payment Run', value: fmt(netPicked), foot: picked.length ? `${picked.length} bill(s) selected · ${fmt(grossPicked)} gross` : 'Select bills below to build a run' },
          { label: 'Early Payment Discounts', value: fmt(discountPicked), foot: 'From the discount % captured on selected bills' },
          { label: 'Available Liquid Cash', value: fmt(liquidCash), foot: bankAccounts.length ? `Funding: ${bankAccounts[0].name}${bankAccounts[0].masked ? ` (${bankAccounts[0].masked})` : ''}` : 'Per the general ledger cash accounts' },
          { label: 'Pending Approvals', value: String(pendingApprovals.length), foot: 'Waiting in the approval queue' },
        ].map((k) => (
          <div key={k.label} className="border border-border rounded-xl bg-card p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{k.label}</div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{k.value}</div>
            <div className="text-[12px] text-muted-foreground mt-1">{k.foot}</div>
          </div>
        ))}
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
      {notice && <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm mb-4">{notice}</div>}

      <h2 className="font-display text-lg font-semibold mb-3">Approval Queue</h2>
      <div className="border border-border rounded-xl overflow-x-auto bg-card mb-8">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
              <th className="p-3 border-r border-border">Reference</th>
              <th className="p-3 border-r border-border">Vendor</th>
              <th className="p-3 border-r border-border text-right">Amount</th>
              <th className="p-3 border-r border-border">Step</th>
              <th className="p-3 border-r border-border">Status</th>
              <th className="p-3 border-r border-border">Comment</th>
              <th className="p-3 text-center">Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={7} className="text-center text-muted-foreground">Loading approvals…</td></tr>
            ) : approvals.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted-foreground">No approvals yet. Use “Request Approval” on a bill below and it appears here for a decision.</td></tr>
            ) : approvals.map((a) => (
              <tr key={a.id} className="hover:bg-accent/50">
                <td className="p-3 border-r border-border font-semibold tabular-nums">{a.reference}</td>
                <td className="p-3 border-r border-border">{a.vendorName || '—'}</td>
                <td className="p-3 border-r border-border text-right tabular-nums">{fmt(a.amount)}</td>
                <td className="p-3 border-r border-border text-center tabular-nums">{a.sequenceNo}</td>
                <td className="p-3 border-r border-border capitalize">{a.status}{a.actedAt ? <div className="text-[11px] text-muted-foreground normal-case">{new Date(a.actedAt).toLocaleString('en-US')}</div> : null}</td>
                <td className="p-3 border-r border-border">
                  {a.status === 'pending' ? (
                    <input value={comments[a.id] || ''} onChange={(e) => setComments({ ...comments, [a.id]: e.target.value })} placeholder="Optional note…" className="bg-background border border-input rounded-lg px-2 h-8 text-[12px] w-full" />
                  ) : (a.comments || '—')}
                </td>
                <td className="p-3 text-center whitespace-nowrap">
                  {a.status === 'pending' ? (
                    <>
                      <button onClick={() => decide(a, 'approved')} disabled={busy === `decide-${a.id}`} data-tip="Approve this bill for payment. The decision, time and your note are saved on the approval record." className="text-[12px] underline mr-3 disabled:opacity-50">Approve</button>
                      <button onClick={() => decide(a, 'rejected')} disabled={busy === `decide-${a.id}`} data-tip="Reject this approval. The bill stays unpaid and the rejection is saved on the record." className="text-[12px] underline disabled:opacity-50">Reject</button>
                    </>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-lg font-semibold">Payment Run Builder</h2>
        <button onClick={executeRun} disabled={busy === 'run' || picked.length === 0} data-tip="Pay every selected bill now. Each one gets a payment record, a ledger posting, and a Paid status — then this page reloads to prove it." className="h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
          {busy === 'run' ? 'Running…' : `Execute Payment Run${picked.length ? ` (${picked.length})` : ''}`}
        </button>
      </div>
      <div className="border border-border rounded-xl overflow-x-auto bg-card mb-8">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
              <th className="p-3 border-r border-border text-center">Select</th>
              <th className="p-3 border-r border-border">Bill Ref</th>
              <th className="p-3 border-r border-border">Vendor / Beneficiary</th>
              <th className="p-3 border-r border-border">Due Date</th>
              <th className="p-3 border-r border-border">Discount Terms</th>
              <th className="p-3 border-r border-border text-right">Gross Due</th>
              <th className="p-3 border-r border-border text-right">Discount</th>
              <th className="p-3 border-r border-border text-right">Net Payment</th>
              <th className="p-3 border-r border-border">Method</th>
              <th className="p-3 border-r border-border">State</th>
              <th className="p-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={11} className="text-center text-muted-foreground">Loading payable bills…</td></tr>
            ) : bills.length === 0 ? (
              <tr><td colSpan={11} className="text-center text-muted-foreground">No bills are waiting to be paid. Bills with an open balance appear here ready for the next run.</td></tr>
            ) : bills.map((b) => {
              const s = selFor(b.id);
              const discount = Math.round((b.balance * (Number(s.discount) || 0)) / 100 * 100) / 100;
              return (
                <tr key={b.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border text-center">
                    <input type="checkbox" checked={s.picked} onChange={(e) => setSel({ ...sel, [b.id]: { ...s, picked: e.target.checked } })} data-tip="Include this bill in the payment run." />
                  </td>
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{b.billNumber}</td>
                  <td className="p-3 border-r border-border">
                    <div className="font-medium">{b.vendorName}</div>
                    <div className="text-[11px] text-muted-foreground">{b.paymentTermsDays ? `Net ${b.paymentTermsDays}` : ''}</div>
                  </td>
                  <td className="p-3 border-r border-border text-muted-foreground">{fmtDate(b.dueDate)}</td>
                  <td className="p-3 border-r border-border">
                    <span className="inline-flex items-center gap-1">
                      <input type="number" min="0" max="100" step="0.1" value={s.discount} onChange={(e) => setSel({ ...sel, [b.id]: { ...s, discount: e.target.value } })} placeholder="0" className="bg-background border border-input rounded-lg px-2 h-8 text-[12px] w-16" />
                      <span className="text-[12px]">% early-pay</span>
                    </span>
                  </td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(b.balance)}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(discount)}</td>
                  <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(b.balance - discount)}</td>
                  <td className="p-3 border-r border-border">
                    <select value={s.method} onChange={(e) => setSel({ ...sel, [b.id]: { ...s, method: e.target.value } })} className="bg-background border border-input rounded-lg px-2 h-8 text-[12px]">
                      <option value="ach">ACH Batch</option>
                      <option value="wire">Domestic Wire</option>
                      <option value="check">Check</option>
                      <option value="card">Card</option>
                    </select>
                  </td>
                  <td className="p-3 border-r border-border capitalize">{b.approvalStatus || 'Not submitted'}</td>
                  <td className="p-3 text-center">
                    {!b.approvalStatus && (
                      <button onClick={() => requestApproval(b)} disabled={busy === `req-${b.id}`} data-tip="Send this bill to the approval queue above before it is paid." className="text-[12px] underline disabled:opacity-50">Request Approval</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold mb-3">Approval Workflow Rules</h2>
          <div className="border border-border rounded-xl bg-card p-4">
            {workflows.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No approval workflow rules are configured yet. Rules you add in acct_workflows (name, what they apply to, and the amount that triggers them) will be listed here.</p>
            ) : workflows.map((w) => (
              <div key={w.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <div className="font-medium text-[13px]">{w.name}</div>
                  <div className="text-[12px] text-muted-foreground">Applies to {w.entityType}{w.thresholdAmount !== null ? ` · over ${fmt(w.thresholdAmount)}` : ''}</div>
                </div>
                <span className="text-[12px]">{w.isActive ? 'Active' : 'Inactive'}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold mb-3">Recent Payments</h2>
          <div className="border border-border rounded-xl overflow-x-auto bg-card">
            <div className="adm-table-wrap"><table className="adm-table">
              <thead>
                <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
                  <th className="p-3 border-r border-border">Payment</th>
                  <th className="p-3 border-r border-border">Vendor</th>
                  <th className="p-3 border-r border-border">Applied To</th>
                  <th className="p-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-muted-foreground">No AP payments posted yet.</td></tr>
                ) : payments.map((p) => (
                  <tr key={p.id} className="hover:bg-accent/50">
                    <td className="p-3 border-r border-border"><div className="font-semibold tabular-nums">{p.paymentNumber}</div><div className="text-[11px] text-muted-foreground">{fmtDate(p.paymentDate)} · {p.paymentMethod}</div></td>
                    <td className="p-3 border-r border-border">{p.vendorName || '—'}</td>
                    <td className="p-3 border-r border-border text-muted-foreground">{p.appliedBills || '—'}</td>
                    <td className="p-3 text-right tabular-nums">{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

// /admin/accounting/refunds/disputes — Dispute Center (Batch 2
// rebuild of the owner's credits_refunds_disputes.html dispute
// workflow, in the house client pattern): every acct_disputes
// row with KPIs, a Log a Dispute form and the evidence workflow
// (submit evidence / accept / mark won / mark lost) through
// POST /api/admin/accounting/disputes. Accepting or losing a
// chargeback posts DR Chargeback Expense (6040) / CR Stripe
// Clearing (1010) inside that API — the page re-fetches so the
// new state is the proof.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Dispute = {
  id: string; dispute_number: string; kind: string; reason: string | null;
  amount: number; status: string; evidence_due_at: string | null;
  evidence_notes: string | null; order_ref: string | null;
  processor_dispute_id: string | null; created_at: string | null;
  crm_customers: { company_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
};

const custName = (c: Dispute['crm_customers']): string => {
  if (!c) return '—';
  if (c.company_name) return c.company_name;
  const p = [c.first_name, c.last_name].filter(Boolean).join(' ');
  return p || '—';
};

const chip = (s: string) => {
  if (s === 'open') return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900">Open</span>;
  if (s === 'evidence_submitted') return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Evidence Submitted</span>;
  if (s === 'won') return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">Won</span>;
  if (s === 'lost' || s === 'accepted') return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">{s}</span>;
  return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">{s.replace(/_/g, ' ')}</span>;
};

export default function DisputeCenterPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ order_ref: '', processor_dispute_id: '', kind: 'chargeback', amount: '', reason: '', evidence_due_at: '' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/disputes', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => setDisputes((Array.isArray(d.disputes) ? d.disputes : []).map((x: any) => ({ ...x, amount: Number(x.amount || 0) }))))
      .catch(() => setError('Disputes could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const kpis = useMemo(() => ({
    open: disputes.filter((d) => d.status === 'open'),
    evidence: disputes.filter((d) => d.status === 'evidence_submitted').length,
    chargebacks: disputes.filter((d) => d.kind === 'chargeback').reduce((s, d) => s + d.amount, 0),
    won: disputes.filter((d) => d.status === 'won').length,
    lost: disputes.filter((d) => d.status === 'lost' || d.status === 'accepted').length,
  }), [disputes]);

  const shown = useMemo(() => {
    if (!search.trim()) return disputes;
    const q = search.toLowerCase();
    return disputes.filter((d) => [d.dispute_number, custName(d.crm_customers), d.kind, d.reason || '', d.status, d.order_ref || ''].join(' ').toLowerCase().includes(q));
  }, [disputes, search]);

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/admin/accounting/disputes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.ok === false) throw new Error(j?.error || 'Action failed');
    return j;
  };

  const act = async (d: Dispute, action: string) => {
    let notes: string | undefined;
    if (action === 'submit_evidence') {
      const raw = window.prompt(`Evidence summary for ${d.dispute_number} (tracking, delivery proof, communications):`, d.evidence_notes || '');
      if (raw === null) return;
      notes = raw;
    }
    if (action === 'accept' && !window.confirm(`Accept chargeback ${d.dispute_number}? The funds are conceded and the chargeback expense posts to the books.`)) return;
    if (action === 'lost' && !window.confirm(`Mark ${d.dispute_number} lost? The chargeback expense posts to the books.`)) return;
    setBusy(d.id); setError(null); setNotice(null);
    try {
      await post({ action, id: d.id, ...(notes !== undefined ? { notes } : {}) });
      setNotice(`Dispute ${d.dispute_number}: ${action.replace(/_/g, ' ')} completed.`);
      load();
    } catch (e: any) { setError(e?.message || 'Action failed'); }
    finally { setBusy(null); }
  };

  const create = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter the disputed amount.'); return; }
    setBusy('create'); setError(null); setNotice(null);
    try {
      const j = await post({
        action: 'create', order_ref: form.order_ref || null, processor_dispute_id: form.processor_dispute_id || null,
        kind: form.kind, amount, reason: form.reason || null, evidence_due_at: form.evidence_due_at || null,
      });
      setNotice(`Dispute ${j.dispute_number || ''} logged — it is in the center below.`);
      setShowForm(false);
      setForm({ order_ref: '', processor_dispute_id: '', kind: 'chargeback', amount: '', reason: '', evidence_due_at: '' });
      load();
    } catch (e: any) { setError(e?.message || 'Could not log the dispute'); }
    finally { setBusy(null); }
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'p-3 border-r border-border';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Disputes &amp; Chargebacks</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search case, customer, reason…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
          <button type="button" onClick={() => setShowForm((s) => !s)} data-tip="Logs a chargeback or inquiry the processor sent you, so it can be worked here"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium">
            <Plus className="size-4" /> Log a Dispute
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {[
          { label: 'Open', value: String(kpis.open.length), foot: fmt(kpis.open.reduce((s, d) => s + d.amount, 0)) },
          { label: 'Evidence Submitted', value: String(kpis.evidence), foot: 'waiting on the processor' },
          { label: 'Chargebacks (all time)', value: fmt(kpis.chargebacks), foot: 'gross disputed' },
          { label: 'Won / Lost', value: `${kpis.won} / ${kpis.lost}`, foot: 'closed cases' },
        ].map((k) => (
          <div key={k.label} className="border border-border rounded-xl bg-card p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{k.label}</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{k.value}</div>
            <div className="text-[11px] text-muted-foreground">{k.foot}</div>
          </div>
        ))}
      </div>

      {showForm && (
        <form onSubmit={create} className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-3">Log a Dispute</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className={labelCls}>Order reference</label>
              <input value={form.order_ref} onChange={(e) => setForm({ ...form, order_ref: e.target.value })} className={inputCls} placeholder="ORD-1001" /></div>
            <div><label className={labelCls}>Processor dispute ID</label>
              <input value={form.processor_dispute_id} onChange={(e) => setForm({ ...form, processor_dispute_id: e.target.value })} className={inputCls} placeholder="dp_…" /></div>
            <div><label className={labelCls}>Kind</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inputCls}>
                <option value="chargeback">Chargeback</option>
                <option value="inquiry">Inquiry</option>
              </select></div>
            <div><label className={labelCls}>Amount</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Reason</label>
              <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputCls} placeholder="fraudulent, product_not_received…" /></div>
            <div><label className={labelCls}>Evidence due</label>
              <input type="date" value={form.evidence_due_at} onChange={(e) => setForm({ ...form, evidence_due_at: e.target.value })} className={inputCls} /></div>
          </div>
          <button type="submit" disabled={busy === 'create'} data-tip="Adds this case to the dispute center below"
            className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
            {busy === 'create' ? 'Logging…' : 'Log Dispute'}
          </button>
        </form>
      )}

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
              <th className={thCls}>Dispute</th>
              <th className={thCls}>Customer</th>
              <th className={thCls}>Kind</th>
              <th className={thCls}>Reason</th>
              <th className={thCls}>Evidence Due</th>
              <th className={`${thCls} text-right`}>Amount</th>
              <th className={thCls}>Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">Loading disputes…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">
                  {disputes.length === 0
                    ? 'No disputes logged. When a processor chargeback or inquiry arrives, log it here and work the evidence from this center.'
                    : 'No disputes match this search.'}
                </td></tr>
              ) : shown.map((d) => (
                <tr key={d.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{d.dispute_number}
                    <div className="text-[11px] font-normal text-muted-foreground">{d.order_ref || d.processor_dispute_id || ''}</div></td>
                  <td className="p-3 border-r border-border font-medium">{custName(d.crm_customers)}</td>
                  <td className="p-3 border-r border-border">{d.kind}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{d.reason || '—'}</td>
                  <td className="p-3 border-r border-border tabular-nums">{d.evidence_due_at || '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(d.amount)}</td>
                  <td className="p-3 border-r border-border">{chip(d.status)}</td>
                  <td className="p-3 text-center whitespace-nowrap">
                    {d.status === 'open' && (
                      <>
                        <button type="button" disabled={busy === d.id} onClick={() => act(d, 'submit_evidence')} data-tip="Records your evidence summary and moves the case to Evidence Submitted"
                          className="text-[12px] underline mr-3 disabled:opacity-50">Submit Evidence</button>
                        <button type="button" disabled={busy === d.id} onClick={() => act(d, 'accept')} data-tip="Concedes the chargeback; the expense posts to the books"
                          className="text-[12px] underline disabled:opacity-50">Accept</button>
                      </>
                    )}
                    {d.status === 'evidence_submitted' && (
                      <>
                        <button type="button" disabled={busy === d.id} onClick={() => act(d, 'won')} data-tip="Marks the case won — the money stays with you"
                          className="text-[12px] underline mr-3 disabled:opacity-50">Mark Won</button>
                        <button type="button" disabled={busy === d.id} onClick={() => act(d, 'lost')} data-tip="Marks the case lost; the chargeback expense posts to the books"
                          className="text-[12px] underline disabled:opacity-50">Mark Lost</button>
                      </>
                    )}
                    {d.evidence_notes ? <div className="text-[11px] text-muted-foreground whitespace-normal text-left mt-1">{d.evidence_notes}</div> : null}
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

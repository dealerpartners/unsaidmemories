'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';

interface Estimate {
  id: string;
  estimate_number: string;
  customer_id?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  total: number;
  status: string;
  notes?: string | null;
  terms?: string | null;
  converted_invoice_id?: string | null;
}

interface Customer {
  id: string;
  name?: string | null;
  email?: string | null;
}

const fmt = (n: number) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted', 'void'];

export const EstimatesView: React.FC = () => {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showDrawer, setShowDrawer] = useState(false);
  const [editing, setEditing] = useState<Estimate | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    estimate_number: '',
    customer_id: '',
    issue_date: new Date().toISOString().slice(0, 10),
    expiry_date: '',
    subtotal: '',
    tax_total: '',
    discount_total: '',
    notes: '',
    terms: '',
    status: 'draft',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, cRes] = await Promise.all([
        fetch('/api/admin/accounting/estimates?limit=200&order=issue_date.desc', { cache: 'no-store' }),
        fetch('/api/admin/crm/customers?limit=500', { cache: 'no-store' }),
      ]);
      const eJson = await eRes.json().catch(() => ({}));
      const cJson = await cRes.json().catch(() => ({}));
      setEstimates(Array.isArray(eJson.data) ? eJson.data : []);
      const cRaw = Array.isArray(cJson.data) ? cJson.data : Array.isArray(cJson.customers) ? cJson.customers : [];
      const cData = cRaw.map((c: any) => ({ id: String(c.id), name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.name || null, email: c.email || null }));
      setCustomers(cData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      estimate_number: `EST-${new Date().getFullYear()}-${String(estimates.length + 1).padStart(4, '0')}`,
      customer_id: '', issue_date: new Date().toISOString().slice(0, 10),
      expiry_date: '', subtotal: '', tax_total: '', discount_total: '',
      notes: '', terms: '', status: 'draft',
    });
    setShowDrawer(true);
  };

  const openEdit = (e: Estimate) => {
    setEditing(e);
    setForm({
      estimate_number: e.estimate_number,
      customer_id: e.customer_id || '',
      issue_date: (e.issue_date || '').slice(0, 10),
      expiry_date: (e.expiry_date || '').slice(0, 10),
      subtotal: String(e.subtotal ?? ''),
      tax_total: String(e.tax_total ?? ''),
      discount_total: String(e.discount_total ?? ''),
      notes: e.notes || '', terms: e.terms || '', status: e.status,
    });
    setShowDrawer(true);
  };

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    try {
      const subtotal = Number(form.subtotal) || 0;
      const tax = Number(form.tax_total) || 0;
      const discount = Number(form.discount_total) || 0;
      const payload = {
        estimate_number: form.estimate_number.trim(),
        customer_id: form.customer_id || null,
        issue_date: form.issue_date,
        expiry_date: form.expiry_date || null,
        subtotal, tax_total: tax, discount_total: discount,
        total: Math.round((subtotal + tax - discount) * 100) / 100,
        notes: form.notes.trim() || null,
        terms: form.terms.trim() || null,
        status: form.status,
      };
      const res = await fetch(
        editing ? `/api/admin/accounting/estimates/${editing.id}` : '/api/admin/accounting/estimates',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Save failed');
      setShowDrawer(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (e: Estimate, status: string) => {
    try {
      // Status transitions stamp the lifecycle columns the schema carries
      // (sent_at / accepted_at / declined_at) so the record shows WHEN
      // each state was reached, not just the current state.
      const stamps: Record<string, string> = {
        sent: 'sent_at', accepted: 'accepted_at', declined: 'declined_at',
      };
      const body: Record<string, unknown> = { status };
      if (stamps[status]) body[stamps[status]] = new Date().toISOString();
      const res = await fetch(`/api/admin/accounting/estimates/${e.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Status update failed');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  // Convert-to-invoice: POSTs the convert route, which mints a real
  // acct_ar_invoices row from this estimate (lines copied, estimate
  // stamped converted + converted_invoice_id) — "converted" is a
  // write, not just a status flag.
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const convertToInvoice = async (e: Estimate) => {
    if (!window.confirm(`Convert estimate ${e.estimate_number} (${fmt(e.total)}) to an invoice?`)) return;
    setConvertingId(e.id);
    try {
      const res = await fetch(`/api/admin/accounting/estimates/${e.id}/convert`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || 'Conversion failed');
      alert(j.idempotent ? `${e.estimate_number} was already converted to invoice ${j.invoiceId}.` : `Invoice ${j.invoiceNumber} created from ${e.estimate_number}.`);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setConvertingId(null);
    }
  };

  const filtered = estimates.filter((e) => statusFilter === 'all' || e.status === statusFilter);

  return (
    <div className="w-full min-h-screen bg-background text-foreground flex flex-col">
      <div className="p-6 border-b border-border bg-background flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Estimates</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Quotes sent to customers before work is approved.</p>
        </div>
        <button onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3.5 text-[13px] font-medium cursor-pointer">
          <Plus className="size-4" /> New Estimate
        </button>
      </div>

      <div className="px-6 py-4 border-b border-border flex gap-2 overflow-x-auto">
        {['all', ...STATUSES].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-[12px] font-semibold uppercase border cursor-pointer whitespace-nowrap ${
              statusFilter === s ? 'bg-brand-teal/10 text-brand-teal border-brand-teal/40' : 'border-border text-muted-foreground hover:bg-muted/30'
            }`}>
            {s}
          </button>
        ))}
      </div>

      <div className="p-6">
        {loading && <p className="text-[13px] text-muted-foreground text-center py-12">Loading estimates…</p>}
        {!loading && filtered.length === 0 && (
          <div className="border border-border p-12 text-center">
            <p className="text-[13px] font-semibold">No estimates yet</p>
            <p className="text-[12px] text-muted-foreground mt-1">Create the first estimate to send a quote to a customer.</p>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="border border-border overflow-x-auto">
            <table className="w-full text-left text-[13px] border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border font-semibold uppercase">
                  <th className="p-3 border-r border-border">Estimate #</th>
                  <th className="p-3 border-r border-border">Customer</th>
                  <th className="p-3 border-r border-border">Issued</th>
                  <th className="p-3 border-r border-border">Expires</th>
                  <th className="p-3 border-r border-border text-right">Total</th>
                  <th className="p-3 border-r border-border text-center">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((e) => {
                  const cust = customers.find((c) => c.id === e.customer_id);
                  return (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="p-3 border-r border-border font-semibold">{e.estimate_number}</td>
                      <td className="p-3 border-r border-border">{cust?.name || cust?.email || '—'}</td>
                      <td className="p-3 border-r border-border text-muted-foreground">{(e.issue_date || '').slice(0, 10)}</td>
                      <td className="p-3 border-r border-border text-muted-foreground">{(e.expiry_date || '').slice(0, 10) || '—'}</td>
                      <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(e.total)}</td>
                      <td className="p-3 border-r border-border text-center">
                        <span className="text-[10px] font-semibold px-2 py-0.5 uppercase border border-border bg-muted/40">{e.status}</span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openEdit(e)} className="text-[12px] underline cursor-pointer">Edit</button>
                          {e.status === 'draft' && (
                            <button onClick={() => setStatus(e, 'sent')} className="text-[12px] underline cursor-pointer">Send</button>
                          )}
                          {e.status === 'sent' && (
                            <>
                              <button onClick={() => setStatus(e, 'accepted')} className="text-[12px] underline text-success cursor-pointer">Accept</button>
                              <button onClick={() => setStatus(e, 'declined')} className="text-[12px] underline text-destructive cursor-pointer">Decline</button>
                            </>
                          )}
                          {(e.status === 'accepted' || e.status === 'viewed') && (
                            <button onClick={() => convertToInvoice(e)} disabled={convertingId === e.id} className="text-[12px] underline font-semibold cursor-pointer disabled:opacity-50">
                              {convertingId === e.id ? 'Converting…' : 'Convert to Invoice'}
                            </button>
                          )}
                          {e.status === 'converted' && e.converted_invoice_id && (
                            <span className="text-[12px] text-muted-foreground">Invoice created</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div onClick={() => setShowDrawer(false)} className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-md bg-card border-l border-border p-6 z-10 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
              <h3 className="text-sm font-semibold uppercase">{editing ? 'Edit Estimate' : 'New Estimate'}</h3>
              <button onClick={() => setShowDrawer(false)} className="text-[12px] cursor-pointer">X</button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Estimate # *</label>
                <input required value={form.estimate_number} onChange={(e) => setForm({ ...form, estimate_number: e.target.value })}
                  className="w-full bg-card border border-border p-2 text-[12px]" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Customer</label>
                <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  className="w-full bg-card border border-border p-2 text-[12px] cursor-pointer">
                  <option value="">Select customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || c.email || c.id.slice(0, 8)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Issue Date</label>
                  <input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px]" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Expiry Date</label>
                  <input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px]" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Subtotal</label>
                  <input type="number" step="0.01" min="0" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px]" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Tax</label>
                  <input type="number" step="0.01" min="0" value={form.tax_total} onChange={(e) => setForm({ ...form, tax_total: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px]" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Discount</label>
                  <input type="number" step="0.01" min="0" value={form.discount_total} onChange={(e) => setForm({ ...form, discount_total: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px]" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full bg-card border border-border p-2 text-[12px]" rows={3} />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowDrawer(false)}
                  className="flex-1 border border-border py-2.5 text-[12px] uppercase font-semibold cursor-pointer">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 py-2.5 text-[12px] uppercase font-semibold cursor-pointer disabled:opacity-50">
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Estimate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

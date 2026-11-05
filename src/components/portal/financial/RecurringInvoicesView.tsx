'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Play } from 'lucide-react';

interface RecurringInvoice {
  id: string;
  template_name: string;
  customer_id?: string | null;
  frequency: string;
  interval_count: number;
  starts_on?: string | null;
  ends_on?: string | null;
  next_run_on?: string | null;
  last_run_on?: string | null;
  occurrences_limit?: number | null;
  occurrences_done: number;
  auto_send: boolean;
  currency: string;
  subtotal: number;
  total: number;
  status: string;
}

interface Customer {
  id: string;
  name?: string | null;
  email?: string | null;
}

const fmt = (n: number) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual'];
const STATUSES = ['draft', 'active', 'paused', 'completed', 'cancelled', 'failed'];

export const RecurringInvoicesView: React.FC = () => {
  const [templates, setTemplates] = useState<RecurringInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editing, setEditing] = useState<RecurringInvoice | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [form, setForm] = useState({
    template_name: '', customer_id: '', frequency: 'monthly', interval_count: '1',
    starts_on: new Date().toISOString().slice(0, 10), ends_on: '',
    occurrences_limit: '', auto_send: false, subtotal: '', total: '', status: 'draft',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, cRes] = await Promise.all([
        fetch('/api/admin/accounting/recurring-invoices?limit=200&order=next_run_on', { cache: 'no-store' }),
        fetch('/api/admin/crm/customers?limit=500', { cache: 'no-store' }),
      ]);
      const tJson = await tRes.json().catch(() => ({}));
      const cJson = await cRes.json().catch(() => ({}));
      setTemplates(Array.isArray(tJson.data) ? tJson.data : []);
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
      template_name: '', customer_id: '', frequency: 'monthly', interval_count: '1',
      starts_on: new Date().toISOString().slice(0, 10), ends_on: '',
      occurrences_limit: '', auto_send: false, subtotal: '', total: '', status: 'draft',
    });
    setShowDrawer(true);
  };

  const openEdit = (t: RecurringInvoice) => {
    setEditing(t);
    setForm({
      template_name: t.template_name,
      customer_id: t.customer_id || '',
      frequency: t.frequency,
      interval_count: String(t.interval_count || 1),
      starts_on: (t.starts_on || '').slice(0, 10),
      ends_on: (t.ends_on || '').slice(0, 10),
      occurrences_limit: t.occurrences_limit != null ? String(t.occurrences_limit) : '',
      auto_send: !!t.auto_send,
      subtotal: String(t.subtotal ?? ''),
      total: String(t.total ?? ''),
      status: t.status,
    });
    setShowDrawer(true);
  };

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    try {
      const subtotal = Number(form.subtotal) || 0;
      const payload = {
        template_name: form.template_name.trim(),
        customer_id: form.customer_id || null,
        frequency: form.frequency,
        interval_count: Math.max(1, Number(form.interval_count) || 1),
        starts_on: form.starts_on,
        ends_on: form.ends_on || null,
        next_run_on: form.starts_on,
        occurrences_limit: form.occurrences_limit ? Number(form.occurrences_limit) : null,
        auto_send: form.auto_send,
        subtotal,
        total: form.total ? Number(form.total) : subtotal,
        status: form.status,
      };
      const res = await fetch(
        editing ? `/api/admin/accounting/recurring-invoices/${editing.id}` : '/api/admin/accounting/recurring-invoices',
        { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
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

  const setStatus = async (t: RecurringInvoice, status: string) => {
    try {
      const res = await fetch(`/api/admin/accounting/recurring-invoices/${t.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed');
      await load();
    } catch {
      alert('Status update failed');
    }
  };

  const runNow = async () => {
    if (!confirm('Generate invoices for all due recurring templates now?')) return;
    setRunning(true);
    try {
      const res = await fetch('/api/cron/recurring-invoices', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Run failed');
      alert(`Generated ${j.generated ?? 0} invoice(s) from ${j.due ?? 0} due template(s).${j.errors?.length ? ' Errors: ' + j.errors.join('; ') : ''}`);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-background text-foreground flex flex-col">
      <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Recurring Invoices</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Templates that auto-generate invoices on schedule. A daily job creates invoices for templates due.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={runNow} disabled={running}
            className="inline-flex items-center gap-2 rounded-lg border border-border h-9 px-3.5 text-[13px] font-medium cursor-pointer hover:bg-muted/30 disabled:opacity-50">
            <Play className="size-4" /> {running ? 'Running…' : 'Run Due Now'}
          </button>
          <button onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3.5 text-[13px] font-medium cursor-pointer">
            <Plus className="size-4" /> New Template
          </button>
        </div>
      </div>

      <div className="p-6">
        {loading && <p className="text-[13px] text-muted-foreground text-center py-12">Loading…</p>}
        {!loading && templates.length === 0 && (
          <div className="border border-border p-12 text-center">
            <p className="text-[13px] font-semibold">No recurring templates yet</p>
            <p className="text-[12px] text-muted-foreground mt-1">Create a template for subscriptions, maintenance plans, or retainers.</p>
          </div>
        )}
        {!loading && templates.length > 0 && (
          <div className="border border-border overflow-x-auto">
            <table className="w-full text-left text-[13px] border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border font-semibold uppercase">
                  <th className="p-3 border-r border-border">Template</th>
                  <th className="p-3 border-r border-border">Customer</th>
                  <th className="p-3 border-r border-border">Frequency</th>
                  <th className="p-3 border-r border-border">Next Run</th>
                  <th className="p-3 border-r border-border text-center">Done</th>
                  <th className="p-3 border-r border-border text-right">Amount</th>
                  <th className="p-3 border-r border-border text-center">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {templates.map((t) => {
                  const cust = customers.find((c) => c.id === t.customer_id);
                  return (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="p-3 border-r border-border font-semibold">{t.template_name}</td>
                      <td className="p-3 border-r border-border">{cust?.name || cust?.email || '—'}</td>
                      <td className="p-3 border-r border-border capitalize text-muted-foreground">
                        {t.interval_count > 1 ? `every ${t.interval_count} ` : ''}{t.frequency}
                      </td>
                      <td className="p-3 border-r border-border text-muted-foreground">{(t.next_run_on || '').slice(0, 10) || '—'}</td>
                      <td className="p-3 border-r border-border text-center tabular-nums">
                        {t.occurrences_done}{t.occurrences_limit ? `/${t.occurrences_limit}` : ''}
                      </td>
                      <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(t.total)}</td>
                      <td className="p-3 border-r border-border text-center">
                        <span className="text-[10px] font-semibold px-2 py-0.5 uppercase border border-border bg-muted/40">{t.status}</span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openEdit(t)} className="text-[12px] underline cursor-pointer">Edit</button>
                          {t.status === 'draft' && <button onClick={() => setStatus(t, 'active')} className="text-[12px] underline text-success cursor-pointer">Activate</button>}
                          {t.status === 'active' && <button onClick={() => setStatus(t, 'paused')} className="text-[12px] underline cursor-pointer">Pause</button>}
                          {t.status === 'paused' && <button onClick={() => setStatus(t, 'active')} className="text-[12px] underline text-success cursor-pointer">Resume</button>}
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
              <h3 className="text-sm font-semibold uppercase">{editing ? 'Edit Template' : 'New Recurring Template'}</h3>
              <button onClick={() => setShowDrawer(false)} className="text-[12px] cursor-pointer">X</button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Template Name *</label>
                <input required value={form.template_name} onChange={(e) => setForm({ ...form, template_name: e.target.value })}
                  className="w-full bg-card border border-border p-2 text-[12px]" placeholder="e.g. Monthly Grooming Plan" />
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
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Frequency</label>
                  <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px] cursor-pointer">
                    {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Every N</label>
                  <input type="number" min="1" value={form.interval_count} onChange={(e) => setForm({ ...form, interval_count: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Starts On</label>
                  <input type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px]" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Ends On (optional)</label>
                  <input type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Subtotal</label>
                  <input type="number" step="0.01" min="0" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px]" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Max Occurrences (optional)</label>
                  <input type="number" min="1" value={form.occurrences_limit} onChange={(e) => setForm({ ...form, occurrences_limit: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px]" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="auto_send" checked={form.auto_send}
                  onChange={(e) => setForm({ ...form, auto_send: e.target.checked })} className="cursor-pointer" />
                <label htmlFor="auto_send" className="text-[12px] cursor-pointer">Auto-mark generated invoices as sent</label>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full bg-card border border-border p-2 text-[12px] cursor-pointer">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowDrawer(false)}
                  className="flex-1 border border-border py-2.5 text-[12px] uppercase font-semibold cursor-pointer">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 py-2.5 text-[12px] uppercase font-semibold cursor-pointer disabled:opacity-50">
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

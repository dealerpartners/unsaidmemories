'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';

interface Statement {
  id: string;
  customer_id: string;
  statement_number: string;
  period_start: string;
  period_end: string;
  opening_balance: number;
  charges_total: number;
  payments_total: number;
  credits_total: number;
  closing_balance: number;
  aging_current: number;
  aging_1_30: number;
  aging_31_60: number;
  aging_61_90: number;
  aging_over_90: number;
  status: string;
  generated_at?: string | null;
}

interface Customer {
  id: string;
  name?: string | null;
  email?: string | null;
}

const fmt = (n: number) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const StatementsView: React.FC = () => {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Statement | null>(null);
  const [form, setForm] = useState({
    customer_id: '',
    period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    period_end: new Date().toISOString().slice(0, 10),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, cRes] = await Promise.all([
        fetch('/api/admin/accounting/statements?limit=200&order=generated_at.desc', { cache: 'no-store' }),
        fetch('/api/admin/crm/customers?limit=500', { cache: 'no-store' }),
      ]);
      const sJson = await sRes.json().catch(() => ({}));
      const cJson = await cRes.json().catch(() => ({}));
      setStatements(Array.isArray(sJson.data) ? sJson.data : []);
      const cRaw = Array.isArray(cJson.data) ? cJson.data : Array.isArray(cJson.customers) ? cJson.customers : [];
      const cData = cRaw.map((c: any) => ({ id: String(c.id), name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.name || null, email: c.email || null }));
      setCustomers(cData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/accounting/statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Generation failed');
      setShowDrawer(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setSaving(false);
    }
  };

  const customerName = (id: string) => {
    const c = customers.find((x) => x.id === id);
    return c?.name || c?.email || id.slice(0, 8);
  };

  return (
    <div className="w-full min-h-screen bg-background text-foreground flex flex-col">
      <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Customer Statements</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Period statements generated from live invoices and payments, with aging.
          </p>
        </div>
        <button onClick={() => setShowDrawer(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3.5 text-[13px] font-medium cursor-pointer">
          <Plus className="size-4" /> Generate Statement
        </button>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          {loading && <p className="text-[13px] text-muted-foreground text-center py-12">Loading…</p>}
          {!loading && statements.length === 0 && (
            <div className="border border-border p-12 text-center">
              <p className="text-[13px] font-semibold">No statements yet</p>
              <p className="text-[12px] text-muted-foreground mt-1">Generate the first statement for a customer and period.</p>
            </div>
          )}
          {!loading && statements.length > 0 && (
            <div className="border border-border overflow-x-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="bg-muted/40 border-b border-border font-semibold uppercase">
                    <th className="p-3 border-r border-border">Statement #</th>
                    <th className="p-3 border-r border-border">Customer</th>
                    <th className="p-3 border-r border-border">Period</th>
                    <th className="p-3 border-r border-border text-right">Closing</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {statements.map((s) => (
                    <tr key={s.id} onClick={() => setSelected(s)}
                      className={`hover:bg-muted/30 cursor-pointer ${selected?.id === s.id ? 'bg-muted/40' : ''}`}>
                      <td className="p-3 border-r border-border font-semibold">{s.statement_number}</td>
                      <td className="p-3 border-r border-border">{customerName(s.customer_id)}</td>
                      <td className="p-3 border-r border-border text-muted-foreground text-[12px]">
                        {(s.period_start || '').slice(0, 10)} → {(s.period_end || '').slice(0, 10)}
                      </td>
                      <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(s.closing_balance)}</td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-semibold px-2 py-0.5 uppercase border border-border bg-muted/40">{s.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          {!selected && (
            <div className="border border-border p-12 text-center text-[13px] text-muted-foreground">
              Select a statement to see the breakdown.
            </div>
          )}
          {selected && (
            <div className="border border-border">
              <div className="bg-muted/40 border-b border-border p-4">
                <h3 className="text-[13px] font-semibold">{selected.statement_number}</h3>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {customerName(selected.customer_id)} · {(selected.period_start || '').slice(0, 10)} → {(selected.period_end || '').slice(0, 10)}
                </p>
              </div>
              <div className="p-4 space-y-2 text-[13px]">
                {(
                  [
                    ['Opening balance', selected.opening_balance],
                    ['Charges (invoices)', selected.charges_total],
                    ['Payments received', -selected.payments_total],
                    ['Credits', -selected.credits_total],
                  ] as const
                ).map(([label, val]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold tabular-nums">{fmt(val)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-2 font-semibold">
                  <span>Closing balance</span>
                  <span className="tabular-nums">{fmt(selected.closing_balance)}</span>
                </div>
              </div>
              <div className="border-t border-border p-4">
                <h4 className="text-[11px] font-semibold uppercase text-muted-foreground mb-2">Aging</h4>
                <div className="grid grid-cols-5 gap-2 text-center">
                  {(
                    [
                      ['Current', selected.aging_current],
                      ['1–30', selected.aging_1_30],
                      ['31–60', selected.aging_31_60],
                      ['61–90', selected.aging_61_90],
                      ['90+', selected.aging_over_90],
                    ] as const
                  ).map(([label, val]) => (
                    <div key={label} className="border border-border p-2">
                      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
                      <div className="text-[12px] font-semibold tabular-nums mt-1">{fmt(val)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div onClick={() => setShowDrawer(false)} className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-md bg-card border-l border-border p-6 z-10 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
              <h3 className="text-sm font-semibold uppercase">Generate Statement</h3>
              <button onClick={() => setShowDrawer(false)} className="text-[12px] cursor-pointer">X</button>
            </div>
            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Customer *</label>
                <select required value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  className="w-full bg-card border border-border p-2 text-[12px] cursor-pointer">
                  <option value="">Select customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || c.email || c.id.slice(0, 8)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Period Start *</label>
                  <input type="date" required value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px]" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Period End *</label>
                  <input type="date" required value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px]" />
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Computed from live invoices and payments for the period. Opening balance from prior unpaid invoices.
              </p>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowDrawer(false)}
                  className="flex-1 border border-border py-2.5 text-[12px] uppercase font-semibold cursor-pointer">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 py-2.5 text-[12px] uppercase font-semibold cursor-pointer disabled:opacity-50">
                  {saving ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

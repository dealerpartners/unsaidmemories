'use client';

import React, { useCallback, useEffect, useState } from 'react';

// /admin/accounting/purchases/services — Purchases & Payables →
// Service Items & Rates (owner spec: service_items_rates.html).
//
// Where the service items live: not in a dedicated table. The
// tables named service_items/crm_services are the old grooming
// booking catalogs (pet sizes, durations, deposits) — the wrong
// domain for the books. In this accounting system the service
// catalog IS the chart of accounts: revenue accounts are the
// services the business sells, expense accounts the services and
// costs it buys, each carrying its real posted activity from
// /api/admin/accounting/service-items. The burdened-cost vs
// billable-rate analyzer below is computed from those posted
// journals (realized revenue vs the COGS labor family) — this
// schema stores no per-tier rate card, and the page does not
// pretend otherwise. New Service Item creates a real chart
// account through the existing accounts API.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Item = { id: string; code: string; name: string; accountType: string; subtype: string | null; isActive: boolean; realized: number };
type Analyzer = { billableRevenue: number; burdenedCost: number; marginPct: number | null; laborCostLines: Item[]; revenueLines: number; expenseLines: number };

const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';

export default function ServiceItemsRatesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [analyzer, setAnalyzer] = useState<Analyzer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', account_type: 'revenue', subtype: '' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/service-items', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => { setItems(Array.isArray(d.items) ? d.items : []); setAnalyzer(d.analyzer || null); setError(null); })
      .catch(() => setError('Service items could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch('/api/admin/accounting/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: form.code, name: form.name, account_type: form.account_type, subtype: form.subtype || null, is_active: true, is_posting_allowed: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || 'save failed');
      setForm({ code: '', name: '', account_type: 'revenue', subtype: '' });
      setShowForm(false);
      load();
    } catch (err: any) { setError(err?.message || 'Service item could not be saved.'); }
    finally { setSaving(false); }
  };

  const shown = items.filter((i) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [i.code, i.name, i.subtype || '', i.accountType].join(' ').toLowerCase().includes(q);
  });
  const revenueItems = shown.filter((i) => i.accountType === 'revenue');
  const expenseItems = shown.filter((i) => i.accountType === 'expense');

  const registryTable = (rows: Item[], kind: string) => (
    <div className="border border-border rounded-xl overflow-x-auto bg-card mb-8">
      <div className="adm-table-wrap"><table className="adm-table">
        <thead>
          <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
            <th className="p-3 border-r border-border">Service Code</th>
            <th className="p-3 border-r border-border">Service Name & Scope</th>
            <th className="p-3 border-r border-border">Billing Type</th>
            <th className="p-3 border-r border-border">Default GL</th>
            <th className="p-3 border-r border-border text-right">Booked Activity (Posted)</th>
            <th className="p-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading ? (
            <tr><td colSpan={6} className="text-center text-muted-foreground">Loading service items…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={6} className="text-center text-muted-foreground">No {kind} service lines on the books yet.</td></tr>
          ) : rows.map((i) => (
            <tr key={i.id} className="hover:bg-accent/50">
              <td className="p-3 border-r border-border font-semibold tabular-nums">{i.code}</td>
              <td className="p-3 border-r border-border"><div className="font-medium">{i.name}</div></td>
              <td className="p-3 border-r border-border">{i.accountType === 'revenue' ? 'Billable — revenue posting' : 'Purchased — expense posting'}</td>
              <td className="p-3 border-r border-border text-muted-foreground">GL {i.code} · {i.subtype || (i.accountType === 'revenue' ? 'Revenue' : 'Expense')}</td>
              <td className="p-3 border-r border-border text-right tabular-nums">{fmt(i.realized)}</td>
              <td className="p-3">{i.isActive ? 'Active' : 'Inactive'}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Service Items & Rates</h1>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, name…" className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
          <button onClick={() => setShowForm((s) => !s)} data-tip="Add a service line to the books. It is created as a real account in the chart of accounts and appears in the registry." className="h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium whitespace-nowrap">
            New Service Item
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 py-4">
        {[
          { label: 'Catalog Breadth', value: `${items.length} Service Codes`, foot: `${analyzer?.revenueLines ?? 0} sold · ${analyzer?.expenseLines ?? 0} purchased` },
          { label: 'Realized Billable Revenue', value: fmt(analyzer?.billableRevenue || 0), foot: 'Posted to revenue service accounts' },
          { label: 'Burdened Labor Cost', value: fmt(analyzer?.burdenedCost || 0), foot: 'COGS labor family: direct labor, payroll taxes & fringe, subcontractors' },
          { label: 'Service Labor Margin', value: analyzer?.marginPct === null || analyzer?.marginPct === undefined ? '—' : `${analyzer.marginPct}%`, foot: 'Realized revenue minus burdened labor cost, from posted journals' },
        ].map((k) => (
          <div key={k.label} className="border border-border rounded-xl bg-card p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{k.label}</div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{k.value}</div>
            <div className="text-[12px] text-muted-foreground mt-1">{k.foot}</div>
          </div>
        ))}
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}

      {showForm && (
        <form onSubmit={submit} className="border border-border rounded-xl bg-card p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <label className="text-[12px] font-medium">Code *
            <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputCls} placeholder="4230" />
          </label>
          <label className="text-[12px] font-medium md:col-span-2">Service name *
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Design Consultation" />
          </label>
          <label className="text-[12px] font-medium">Kind
            <select value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} className={inputCls}>
              <option value="revenue">Sold service (revenue)</option>
              <option value="expense">Purchased service (expense)</option>
            </select>
          </label>
          <label className="text-[12px] font-medium">Category
            <input value={form.subtype} onChange={(e) => setForm({ ...form, subtype: e.target.value })} className={inputCls} placeholder="Optional" />
          </label>
          <div className="md:col-span-5">
            <button type="submit" disabled={saving} data-tip="Create this service line in the chart of accounts. The registry reloads so you can see it." className="h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Create Service Item'}</button>
          </div>
        </form>
      )}

      <h2 className="font-display text-lg font-semibold mb-3">Contractor Burdened Cost vs Billable Rate Analyzer</h2>
      <div className="border border-border rounded-xl bg-card p-4 mb-8">
        <p className="text-[13px] text-muted-foreground mb-3">
          Computed from posted journal activity — realized billable revenue against the burdened labor cost lines (direct labor, payroll taxes &amp; fringe benefits, and subcontractor costs, which is where labor burden posts in this chart). The books do not store a per-tier rate card, so this analyzer shows the margin the ledger proves rather than invented tier rates.
        </p>
        <div className="grid md:grid-cols-3 gap-3 mb-3">
          <div className="border border-border rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Billable (Realized Revenue)</div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{fmt(analyzer?.billableRevenue || 0)}</div>
          </div>
          <div className="border border-border rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Burdened Cost (Labor Family)</div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{fmt(analyzer?.burdenedCost || 0)}</div>
          </div>
          <div className="border border-border rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Gross Margin</div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{analyzer?.marginPct === null || analyzer?.marginPct === undefined ? '—' : `${analyzer.marginPct}%`}</div>
          </div>
        </div>
        {analyzer && analyzer.laborCostLines.length > 0 && (
          <table className="w-full text-[12px]">
            <thead><tr className="bg-muted/30 text-left"><th className="p-2">Burden Component (GL)</th><th className="p-2 text-right">Posted Cost</th></tr></thead>
            <tbody>
              {analyzer.laborCostLines.filter((l) => l.realized !== 0).map((l) => (
                <tr key={l.id} className="border-t border-border"><td className="p-2">GL {l.code} · {l.name}</td><td className="p-2 text-right tabular-nums">{fmt(l.realized)}</td></tr>
              ))}
              {analyzer.laborCostLines.every((l) => l.realized === 0) && (
                <tr className="border-t border-border"><td colSpan={2} className="p-2 text-muted-foreground">No labor costs have been posted yet — the analyzer fills in as payroll and subcontractor bills post.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="font-display text-lg font-semibold mb-3">Service Items Master Registry — Sold Services</h2>
      {registryTable(revenueItems, 'revenue')}
      <h2 className="font-display text-lg font-semibold mb-3">Purchased Services & Cost Lines</h2>
      {registryTable(expenseItems, 'expense')}
    </div>
  );
}

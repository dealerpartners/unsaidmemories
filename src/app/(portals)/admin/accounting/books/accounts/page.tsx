'use client';

import React, { useEffect, useMemo, useState } from 'react';

// /admin/accounting/books/accounts — Chart of Accounts: the numbered
// chart grouped by the owner's bands in the live thousands scheme
// (1000s assets … 6000s+ overhead & other), with the Account Builder
// Studio create form and the step-by-step wizard at ./wizard.
// Data: GET/POST /api/admin/accounting/accounts over
// acct_chart_of_accounts (entity/book context resolved server-side).

type Account = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  subtype: string | null;
  normal_balance: string;
  description: string | null;
  parent_account_id: string | null;
  is_posting_allowed: boolean;
  is_active: boolean;
};

const RANGES: { key: string; label: string; from: number; to: number }[] = [
  { key: 'all', label: 'All Accounts', from: 0, to: 99999 },
  { key: '1000', label: 'Assets (1000–1999)', from: 1000, to: 1999 },
  { key: '2000', label: 'Liabilities (2000–2999)', from: 2000, to: 2999 },
  { key: '3000', label: 'Equity (3000–3999)', from: 3000, to: 3999 },
  { key: '4000', label: 'Revenue (4000–4999)', from: 4000, to: 4999 },
  { key: '5000', label: 'COGS & Expenses (5000–5999)', from: 5000, to: 5999 },
  { key: '6000', label: 'Overhead & Other (6000–8999)', from: 6000, to: 8999 },
];

const TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState('all');
  const [form, setForm] = useState({ code: '', name: '', account_type: 'expense', subtype: '', normal_balance: '', description: '', parent_account_id: '' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/accounting/accounts?limit=500', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => setAccounts(Array.isArray(d.data) ? d.data : []))
      .catch(() => setError('The chart of accounts could not be loaded.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const shown = accounts.filter((a) => {
    const n = parseInt(a.code, 10);
    const r = RANGES.find((x) => x.key === range) || RANGES[0];
    if (range !== 'all' && !(Number.isFinite(n) && n >= r.from && n <= r.to)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [a.code, a.name, a.account_type, a.subtype || ''].join(' ').toLowerCase().includes(q);
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    const body: Record<string, unknown> = {
      code: form.code.trim(),
      name: form.name.trim(),
      account_type: form.account_type,
      subtype: form.subtype.trim() || null,
      description: form.description.trim() || null,
      parent_account_id: form.parent_account_id || null,
      is_posting_allowed: true,
      is_active: true,
    };
    if (form.normal_balance) body.normal_balance = form.normal_balance;
    try {
      const r = await fetch('/api/admin/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Create failed');
      setForm({ code: '', name: '', account_type: 'expense', subtype: '', normal_balance: '', description: '', parent_account_id: '' });
      setNotice(`Account ${body.code} · ${body.name} was created and now appears in the chart below.`);
      load();
    } catch (err: any) {
      setError(err?.message || 'The account could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Chart of Accounts</h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/admin/accounting/books/accounts/wizard"
            className="rounded-lg px-3 h-9 inline-flex items-center text-[13px] font-medium text-white shrink-0"
            style={{ backgroundColor: '#7258e8' }}
            data-tip="Step-by-step: start from the basic chart or add your own account with its own name and number"
          >
            New Account Wizard
          </a>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number, name, type…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-72"
            type="text"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {RANGES.map((r) => {
          const count = r.key === 'all' ? accounts.length : accounts.filter((a) => { const n = parseInt(a.code, 10); return Number.isFinite(n) && n >= r.from && n <= r.to; }).length;
          return (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-lg px-3 h-9 text-[13px] border ${range === r.key ? 'text-white border-transparent' : 'bg-card border-border text-foreground'}`}
              style={range === r.key ? { backgroundColor: '#7258e8' } : undefined}
              data-tip="Show only the accounts in this number range"
            >
              {r.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="border border-border rounded-xl bg-card mt-4">
        <div className="p-4 border-b border-border">
          <h2 className="font-display text-base font-semibold">Account Builder Studio</h2>
          <p className="text-[13px] text-muted-foreground mt-1">Add a new account to the chart. Pick the number range that matches its kind — assets 1000s, liabilities 2000s, equity 3000s, revenue 4000s, costs &amp; expenses 5000s and up. Prefer steps? Use the New Account Wizard above.</p>
        </div>
        <form onSubmit={create} className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Account #</label>
            <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="6050" className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Account Title</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Office Supplies" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} className={inputCls}>
              {TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Detail Type</label>
            <input value={form.subtype} onChange={(e) => setForm({ ...form, subtype: e.target.value })} placeholder="current_asset" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Normal Balance</label>
            <select value={form.normal_balance} onChange={(e) => setForm({ ...form, normal_balance: e.target.value })} className={inputCls}>
              <option value="">Auto (by category)</option>
              <option value="debit">Debit (DR)</option>
              <option value="credit">Credit (CR)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Nest as sub-account of</label>
            <select value={form.parent_account_id} onChange={(e) => setForm({ ...form, parent_account_id: e.target.value })} className={inputCls}>
              <option value="">— None (top level) —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Audit Description &amp; Memo</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this account is for" className={inputCls} />
          </div>
          <div className="md:col-span-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg px-4 h-9 text-[13px] font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#7258e8' }}
              data-tip="Create this account — it will appear in the chart and can be posted to right away"
            >
              {saving ? 'Creating…' : '+ New Account'}
            </button>
            {notice && <span className="text-[13px] text-foreground">{notice}</span>}
          </div>
        </form>
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
                <th className="p-3 border-r border-border">Account #</th>
                <th className="p-3 border-r border-border">Account Title</th>
                <th className="p-3 border-r border-border">Category</th>
                <th className="p-3 border-r border-border">Detail Type</th>
                <th className="p-3 border-r border-border">Normal Balance</th>
                <th className="p-3 border-r border-border">Sub-account of</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">Loading the chart of accounts…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground">No accounts in this range yet. Accounts appear here when they are created in the Account Builder above.</td></tr>
              ) : shown.map((a) => (
                <tr key={a.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{a.code}</td>
                  <td className="p-3 border-r border-border">
                    <div className="font-medium">{a.name}</div>
                    {a.description && <div className="text-[11px] text-muted-foreground">{a.description}</div>}
                  </td>
                  <td className="p-3 border-r border-border text-muted-foreground">{a.account_type}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{a.subtype || '—'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{a.normal_balance === 'debit' ? 'Debit (DR)' : 'Credit (CR)'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{a.parent_account_id && byId.get(a.parent_account_id) ? `${byId.get(a.parent_account_id)!.code} · ${byId.get(a.parent_account_id)!.name}` : '—'}</td>
                  <td className="p-3 text-center">{a.is_active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

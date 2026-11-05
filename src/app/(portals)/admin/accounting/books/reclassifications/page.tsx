'use client';

import React, { useEffect, useState } from 'react';

// /admin/accounting/books/reclassifications — Reclassifications,
// rebuilt to the owner's spec (reclassifications.html): the register
// of journal entries that move an amount from one GL account to
// another (source = 'reclassification'), each carrying its audit
// justification, plus the create form that posts a new one.
// Data: GET/POST /api/admin/accounting/reclassifications.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Reclass = {
  id: string;
  entryNo: number;
  date: string;
  memo: string | null;
  status: string;
  amount: number;
  fromAccount: { code: string; name: string; subtype: string | null } | null;
  toAccount: { code: string; name: string; subtype: string | null } | null;
};
type Account = { id: string; code: string; name: string; account_type: string; is_active: boolean; is_posting_allowed: boolean };

export default function ReclassificationsPage() {
  const [rows, setRows] = useState<Reclass[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ fromAccountCode: '', toAccountCode: '', amount: '', entryDate: today, memo: '' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/admin/accounting/reclassifications', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed')))),
      fetch('/api/admin/accounting/accounts?limit=500', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed')))),
    ])
      .then(([rj, aj]) => {
        setRows(Array.isArray(rj.reclassifications) ? rj.reclassifications : []);
        setAccounts(Array.isArray(aj.data) ? aj.data : []);
      })
      .catch(() => setError('Reclassifications could not be loaded.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/reclassifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) || 0 }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Posting failed');
      setForm({ fromAccountCode: '', toAccountCode: '', amount: '', entryDate: today, memo: '' });
      setNotice('The reclassification was posted to the ledger and now appears in the register below.');
      load();
    } catch (err: any) {
      setError(err?.message || 'The reclassification could not be posted.');
    } finally {
      setSaving(false);
    }
  };

  const shown = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [r.memo || '', r.fromAccount?.name || '', r.fromAccount?.code || '', r.toAccount?.name || '', r.toAccount?.code || ''].join(' ').toLowerCase().includes(q);
  });
  const postingAccounts = accounts.filter((a) => a.is_active && a.is_posting_allowed !== false);

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Reclassifications</h1>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search memo or account…"
          className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-72"
          type="text"
        />
      </div>

      <div className="border border-border rounded-xl bg-card mt-4">
        <div className="p-4 border-b border-border">
          <h2 className="font-display text-base font-semibold">Create Reclassification</h2>
          <p className="text-[13px] text-muted-foreground mt-1">The amount leaves the source account and lands in the target account as one balanced entry. The justification note is attached to the entry as its audit trail — it is required.</p>
        </div>
        <form onSubmit={submit} className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Source Account (moves out)</label>
            <select required value={form.fromAccountCode} onChange={(e) => setForm({ ...form, fromAccountCode: e.target.value })} className={inputCls}>
              <option value="">— Pick an account —</option>
              {postingAccounts.map((a) => <option key={a.id} value={a.code}>{a.code} · {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Target Account (moves in)</label>
            <select required value={form.toAccountCode} onChange={(e) => setForm({ ...form, toAccountCode: e.target.value })} className={inputCls}>
              <option value="">— Pick an account —</option>
              {postingAccounts.map((a) => <option key={a.id} value={a.code}>{a.code} · {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Amount</label>
            <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input required type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} className={inputCls} />
          </div>
          <div className="md:col-span-3">
            <label className={labelCls}>Audit justification note</label>
            <input required value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="Why is this amount moving? (required — saved on the journal entry)" className={inputCls} />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg px-4 h-9 text-[13px] font-medium text-white disabled:opacity-60 w-full"
              style={{ backgroundColor: '#7258e8' }}
              data-tip="Post this reclassification — the amount moves between the two accounts as a balanced journal entry"
            >
              {saving ? 'Posting…' : '+ Create Reclassification'}
            </button>
          </div>
          {notice && <div className="md:col-span-4 text-[13px] text-foreground">{notice}</div>}
        </form>
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className={thCls}>
                <th className="p-3 border-r border-border">Date</th>
                <th className="p-3 border-r border-border">Payee / Memo</th>
                <th className="p-3 border-r border-border">Current Account</th>
                <th className="p-3 border-r border-border">Current Class</th>
                <th className="p-3 border-r border-border">Target Preview</th>
                <th className="p-3 border-r border-border text-right">Amount</th>
                <th className="p-3 border-r border-border text-center">Audit Flag</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">Loading reclassifications…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">No reclassifications yet. When an amount is moved between accounts with the form above, the entry appears here with its justification.</td></tr>
              ) : shown.map((r) => (
                <tr key={r.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border text-muted-foreground">{r.date}</td>
                  <td className="p-3 border-r border-border">
                    <div className="font-medium">{r.memo || '—'}</div>
                    <div className="text-[11px] text-muted-foreground">Journal #{r.entryNo}</div>
                  </td>
                  <td className="p-3 border-r border-border">{r.fromAccount ? `${r.fromAccount.code} · ${r.fromAccount.name}` : '—'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{r.fromAccount?.subtype || '—'}</td>
                  <td className="p-3 border-r border-border">{r.toAccount ? `${r.toAccount.code} · ${r.toAccount.name}` : '—'}</td>
                  <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(r.amount)}</td>
                  <td className="p-3 border-r border-border text-center">{r.memo ? 'Justification attached' : 'Missing note'}</td>
                  <td className="p-3 text-center">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

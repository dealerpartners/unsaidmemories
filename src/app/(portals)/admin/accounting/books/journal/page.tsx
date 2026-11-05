'use client';

import React, { useEffect, useMemo, useState } from 'react';

// /admin/accounting/books/journal — Journal Entries, rebuilt to the
// owner's spec (journal_entries.html): "Create Double-Entry Journal
// Entry" (lines must balance before the entry can post) over the
// "Journal Entries Historical Register".
// Data: GET/POST /api/admin/accounting/journal-entries (include=lines)
// over acct_journal_entries / acct_journal_lines / acct_journal_batches;
// accounts from /api/admin/accounting/accounts.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type JLine = { id: string; line_no: number; account_code: string; account_name: string; description: string | null; debit: number; credit: number };
type Entry = {
  id: string; entry_no: number; entry_date: string; memo: string | null; reference: string | null;
  source: string; status: string; total_debit: number; total_credit: number; created_by: string | null;
  lines: JLine[];
};
type Account = { id: string; code: string; name: string; is_posting_allowed: boolean; is_active: boolean };
type DraftLine = { accountCode: string; description: string; debit: string; credit: string };

export default function JournalEntriesPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ entry_date: today, memo: '', reference: '' });
  const [lines, setLines] = useState<DraftLine[]>([
    { accountCode: '', description: '', debit: '', credit: '' },
    { accountCode: '', description: '', debit: '', credit: '' },
  ]);
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/admin/accounting/journal-entries?include=lines&limit=200', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed')))),
      fetch('/api/admin/accounting/accounts?limit=500', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed')))),
    ])
      .then(([ej, aj]) => {
        const list: Entry[] = (Array.isArray(ej.data) ? ej.data : []).map((e: any) => ({
          ...e,
          total_debit: Number(e.total_debit || 0),
          total_credit: Number(e.total_credit || 0),
          lines: Array.isArray(e.lines) ? e.lines : [],
        }));
        list.sort((a, b) => (b.entry_date || '').localeCompare(a.entry_date || '') || Number(b.entry_no) - Number(a.entry_no));
        setEntries(list);
        setAccounts(Array.isArray(aj.data) ? aj.data : []);
      })
      .catch(() => setError('Journal entries could not be loaded.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const totalDebit = useMemo(() => Math.round(lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0) * 100) / 100, [lines]);
  const totalCredit = useMemo(() => Math.round(lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0) * 100) / 100, [lines]);
  const usableLines = lines.filter((l) => l.accountCode && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0));
  const balanced = totalDebit > 0 && totalDebit === totalCredit && usableLines.length >= 2;

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!balanced) return;
    setPosting(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/journal-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_date: form.entry_date,
          memo: form.memo.trim() || 'Manual journal entry',
          reference: form.reference.trim() || null,
          lines: usableLines.map((l) => ({
            accountCode: l.accountCode,
            description: l.description.trim() || form.memo.trim(),
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
          })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Posting failed');
      setForm({ entry_date: today, memo: '', reference: '' });
      setLines([
        { accountCode: '', description: '', debit: '', credit: '' },
        { accountCode: '', description: '', debit: '', credit: '' },
      ]);
      setNotice('The entry was posted to the ledger and now appears at the top of the register below.');
      load();
    } catch (err: any) {
      setError(err?.message || 'The journal entry could not be posted.');
    } finally {
      setPosting(false);
    }
  };

  const shown = entries.filter((en) => {
    if (statusFilter !== 'all' && en.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [String(en.entry_no), en.memo || '', en.reference || '', en.source].join(' ').toLowerCase().includes(q);
  });
  const statuses = useMemo(() => Array.from(new Set(entries.map((e) => e.status))), [entries]);
  const postingAccounts = accounts.filter((a) => a.is_active && a.is_posting_allowed !== false);

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Journal Entries</h1>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search journal #, memo, reference…"
          className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-72"
          type="text"
        />
      </div>

      <div className="border border-border rounded-xl bg-card mt-4">
        <div className="p-4 border-b border-border">
          <h2 className="font-display text-base font-semibold">Create Double-Entry Journal Entry</h2>
          <p className="text-[13px] text-muted-foreground mt-1">Every amount you take out of one account goes into another: total debits must equal total credits before the entry can post.</p>
        </div>
        <form onSubmit={post} className="p-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Entry Date</label>
              <input type="date" required value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Memo / Purpose Reference</label>
              <input required value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="What this entry records" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Reference</label>
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Invoice #, check #, …" className={inputCls} />
            </div>
          </div>
          <div className="border border-border rounded-xl overflow-x-auto">
            <table className="adm-table w-full">
              <thead>
                <tr className={thCls}>
                  <th className="p-2 border-r border-border">#</th>
                  <th className="p-2 border-r border-border">Account</th>
                  <th className="p-2 border-r border-border">Line Description</th>
                  <th className="p-2 border-r border-border text-right">Debit ($)</th>
                  <th className="p-2 border-r border-border text-right">Credit ($)</th>
                  <th className="p-2 text-center"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="p-2 border-r border-border text-muted-foreground">{i + 1}</td>
                    <td className="p-2 border-r border-border">
                      <select value={l.accountCode} onChange={(e) => { const n = [...lines]; n[i] = { ...n[i], accountCode: e.target.value }; setLines(n); }} className={inputCls}>
                        <option value="">— Pick an account —</option>
                        {postingAccounts.map((a) => <option key={a.id} value={a.code}>{a.code} · {a.name}</option>)}
                      </select>
                    </td>
                    <td className="p-2 border-r border-border">
                      <input value={l.description} onChange={(e) => { const n = [...lines]; n[i] = { ...n[i], description: e.target.value }; setLines(n); }} placeholder="Line description" className={inputCls} />
                    </td>
                    <td className="p-2 border-r border-border">
                      <input type="number" min="0" step="0.01" value={l.debit} onChange={(e) => { const n = [...lines]; n[i] = { ...n[i], debit: e.target.value }; setLines(n); }} className={`${inputCls} text-right`} />
                    </td>
                    <td className="p-2 border-r border-border">
                      <input type="number" min="0" step="0.01" value={l.credit} onChange={(e) => { const n = [...lines]; n[i] = { ...n[i], credit: e.target.value }; setLines(n); }} className={`${inputCls} text-right`} />
                    </td>
                    <td className="p-2 text-center">
                      <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length <= 2} className="text-[12px] underline disabled:opacity-40" data-tip="Remove this line from the entry">Remove</button>
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="p-2 border-r border-border" colSpan={3}>Totals</td>
                  <td className="p-2 border-r border-border text-right tabular-nums">{fmt(totalDebit)}</td>
                  <td className="p-2 border-r border-border text-right tabular-nums">{fmt(totalCredit)}</td>
                  <td className="p-2" />
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setLines([...lines, { accountCode: '', description: '', debit: '', credit: '' }])} className="rounded-lg px-3 h-9 text-[13px] border bg-card border-border text-foreground" data-tip="Add another debit/credit line to this entry">
              + Add Journal Line Split
            </button>
            <button
              type="submit"
              disabled={!balanced || posting}
              className="rounded-lg px-4 h-9 text-[13px] font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#7258e8' }}
              data-tip="Post this entry to the ledger — only possible when debits equal credits"
            >
              {posting ? 'Posting…' : 'Post Journal to Ledger'}
            </button>
            <span className="text-[13px] text-muted-foreground">
              {totalDebit === 0 && totalCredit === 0
                ? 'Enter the lines of the entry — debits must equal credits.'
                : balanced
                  ? 'Balanced — ready to post.'
                  : `Out of balance by ${fmt(Math.abs(totalDebit - totalCredit))} — debits must equal credits before posting.`}
            </span>
            {notice && <span className="text-[13px] text-foreground">{notice}</span>}
          </div>
        </form>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={() => setStatusFilter('all')} className={`rounded-lg px-3 h-9 text-[13px] border ${statusFilter === 'all' ? 'text-white border-transparent' : 'bg-card border-border text-foreground'}`} style={statusFilter === 'all' ? { backgroundColor: '#7258e8' } : undefined} data-tip="Show every journal entry">All Entries ({entries.length})</button>
        {statuses.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`rounded-lg px-3 h-9 text-[13px] border ${statusFilter === s ? 'text-white border-transparent' : 'bg-card border-border text-foreground'}`} style={statusFilter === s ? { backgroundColor: '#7258e8' } : undefined} data-tip={`Show only ${s} entries`}>
            {s[0].toUpperCase() + s.slice(1)} ({entries.filter((e) => e.status === s).length})
          </button>
        ))}
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        <h2 className="font-display text-base font-semibold mb-2">Journal Entries Historical Register</h2>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className={thCls}>
                <th className="p-3 border-r border-border">Journal #</th>
                <th className="p-3 border-r border-border">Date</th>
                <th className="p-3 border-r border-border">Memo / Purpose</th>
                <th className="p-3 border-r border-border">Source</th>
                <th className="p-3 border-r border-border text-right">Debits ($)</th>
                <th className="p-3 border-r border-border text-right">Credits ($)</th>
                <th className="p-3 border-r border-border text-center">Status</th>
                <th className="p-3 text-center">Lines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">Loading journal entries…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">No journal entries match. Entries appear here as sales, bills, payments and manual entries post to the ledger.</td></tr>
              ) : shown.map((en) => (
                <React.Fragment key={en.id}>
                  <tr className="hover:bg-accent/50">
                    <td className="p-3 border-r border-border font-semibold tabular-nums">#{en.entry_no}</td>
                    <td className="p-3 border-r border-border text-muted-foreground">{en.entry_date}</td>
                    <td className="p-3 border-r border-border">
                      <div className="font-medium">{en.memo || '—'}</div>
                      {en.reference && <div className="text-[11px] text-muted-foreground">Ref: {en.reference}</div>}
                    </td>
                    <td className="p-3 border-r border-border text-muted-foreground">{en.source}</td>
                    <td className="p-3 border-r border-border text-right tabular-nums">{fmt(en.total_debit)}</td>
                    <td className="p-3 border-r border-border text-right tabular-nums">{fmt(en.total_credit)}</td>
                    <td className="p-3 border-r border-border text-center">{en.status}</td>
                    <td className="p-3 text-center">
                      <button onClick={() => setExpanded(expanded === en.id ? null : en.id)} className="text-[12px] underline" data-tip="Show the debit and credit lines inside this entry">
                        {expanded === en.id ? 'Hide' : `${en.lines.length} line(s)`}
                      </button>
                    </td>
                  </tr>
                  {expanded === en.id && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <table className="adm-table w-full">
                          <thead>
                            <tr className={thCls}>
                              <th className="p-2 border-r border-border">#</th>
                              <th className="p-2 border-r border-border">Account</th>
                              <th className="p-2 border-r border-border">Line Description</th>
                              <th className="p-2 border-r border-border text-right">Debit ($)</th>
                              <th className="p-2 text-right">Credit ($)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {en.lines.map((l) => (
                              <tr key={l.id}>
                                <td className="p-2 border-r border-border text-muted-foreground">{l.line_no}</td>
                                <td className="p-2 border-r border-border">{l.account_code} · {l.account_name}</td>
                                <td className="p-2 border-r border-border text-muted-foreground">{l.description || '—'}</td>
                                <td className="p-2 border-r border-border text-right tabular-nums">{l.debit ? fmt(l.debit) : '—'}</td>
                                <td className="p-2 text-right tabular-nums">{l.credit ? fmt(l.credit) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

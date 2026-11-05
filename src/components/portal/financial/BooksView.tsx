'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DawgNavSection } from '@/lib/types';
import { Search, Plus, CheckCircle2, AlertTriangle, BookOpen, Download } from 'lucide-react';

interface BooksViewProps {
  onNavigateSection?: (section: DawgNavSection) => void;
}

interface GlAccount {
  id: string;
  code: string;
  name: string;
  account_type: string;
  subtype?: string | null;
  description?: string | null;
  is_active?: boolean | null;
}

interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  description?: string | null;
  debit: number;
  credit: number;
}

interface JournalEntry {
  id: string;
  entry_no?: string | null;
  entry_date?: string | null;
  memo?: string | null;
  reference?: string | null;
  source?: string | null;
  total_debit: number;
  total_credit: number;
  status?: string | null;
  lines?: JournalLine[];
}

interface BankTxn {
  id: string;
  transaction_date?: string | null;
  description?: string | null;
  payee?: string | null;
  amount: number;
  match_status?: string | null;
}

const fmt = (n: number) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const BooksView: React.FC<BooksViewProps> = ({ onNavigateSection }) => {
  const [activeTab, setActiveTab] = useState<'gl' | 'coa' | 'transactions' | 'je'>('gl');
  const [coaSearch, setCoaSearch] = useState('');
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [showJeDrawer, setShowJeDrawer] = useState(false);

  const [accounts, setAccounts] = useState<GlAccount[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [bankTxns, setBankTxns] = useState<BankTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeJe, setActiveJe] = useState<string | null>(null);

  const [newAccount, setNewAccount] = useState({ code: '', name: '', type: 'asset', sub: '', description: '' });
  const [jeForm, setJeForm] = useState({
    memo: '',
    reference: '',
    entry_date: new Date().toISOString().slice(0, 10),
    lines: [
      { accountCode: '', debit: '', credit: '' },
      { accountCode: '', debit: '', credit: '' },
    ] as { accountCode: string; debit: string; credit: string }[],
  });
  const [jeError, setJeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // SA-38 Export Ledger — server-side CSV over posted journal lines.
  const [exportFrom, setExportFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [exportTo, setExportTo] = useState(new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const handleExportLedger = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      const res = await fetch('/api/admin/accounting/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'export_ledger',
          payload: { from_date: exportFrom || undefined, to_date: exportTo || undefined },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || 'Ledger export failed');
      if (!j.count) {
        setExportMsg('No posted journal lines in that range — nothing to export.');
        return;
      }
      const blob = new Blob([j.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = j.filename || 'general-ledger.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportMsg(`Exported ${j.count} ledger line(s) — Σ debits ${fmt(j.totalDebit)} · Σ credits ${fmt(j.totalCredit)}.`);
    } catch (err) {
      setExportMsg(err instanceof Error ? err.message : 'Ledger export failed');
    } finally {
      setExporting(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accRes, jeRes, txnRes] = await Promise.all([
        fetch('/api/admin/accounting/accounts?limit=500', { cache: 'no-store' }),
        fetch('/api/admin/accounting/journal-entries?limit=200&include=lines&order=entry_date.desc', { cache: 'no-store' }),
        fetch('/api/admin/accounting/bank-transactions?limit=200&order=transaction_date.desc', { cache: 'no-store' }),
      ]);
      const accJson = await accRes.json().catch(() => ({}));
      const jeJson = await jeRes.json().catch(() => ({}));
      const txnJson = await txnRes.json().catch(() => ({}));
      setAccounts(Array.isArray(accJson.data) ? accJson.data : []);
      const jes: JournalEntry[] = Array.isArray(jeJson.data) ? jeJson.data : [];
      setJournalEntries(jes);
      setActiveJe((prev) => prev || jes[0]?.id || null);
      setBankTxns(Array.isArray(txnJson.data) ? txnJson.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load books data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Per-account balances computed from posted journal lines.
  const balances = React.useMemo(() => {
    const map = new Map<string, { debit: number; credit: number }>();
    for (const je of journalEntries) {
      if ((je.status || '').toLowerCase() !== 'posted') continue;
      for (const l of je.lines || []) {
        const cur = map.get(l.account_code) || { debit: 0, credit: 0 };
        cur.debit += Number(l.debit || 0);
        cur.credit += Number(l.credit || 0);
        map.set(l.account_code, cur);
      }
    }
    return map;
  }, [journalEntries]);

  const accountBalance = (acc: GlAccount) => {
    const b = balances.get(acc.code);
    if (!b) return 0;
    const t = (acc.account_type || '').toLowerCase();
    // Assets & expenses carry debit balances; liabilities/equity/revenue carry credit.
    return t === 'asset' || t === 'expense' ? b.debit - b.credit : b.credit - b.debit;
  };

  const kpi = (type: string) =>
    accounts.filter((a) => (a.account_type || '').toLowerCase() === type)
      .reduce((s, a) => s + accountBalance(a), 0);

  const totalDebits = journalEntries
    .filter((j) => (j.status || '').toLowerCase() === 'posted')
    .reduce((s, j) => s + Number(j.total_debit || 0), 0);
  const totalCredits = journalEntries
    .filter((j) => (j.status || '').toLowerCase() === 'posted')
    .reduce((s, j) => s + Number(j.total_credit || 0), 0);
  const trialBalanced = Math.round((totalDebits - totalCredits) * 100) / 100 === 0;

  const filteredAccounts = accounts.filter((a) => {
    const q = coaSearch.trim().toLowerCase();
    if (!q) return true;
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) ||
      (a.account_type || '').toLowerCase().includes(q);
  });

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newAccount.code.trim(),
          name: newAccount.name.trim(),
          account_type: newAccount.type,
          subtype: newAccount.sub.trim() || null,
          description: newAccount.description.trim() || null,
          is_active: true,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to create account');
      setShowAddDrawer(false);
      setNewAccount({ code: '', name: '', type: 'asset', sub: '', description: '' });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setSaving(false);
    }
  };

  const jeTotals = jeForm.lines.reduce(
    (s, l) => ({
      d: s.d + (Number(l.debit) || 0),
      c: s.c + (Number(l.credit) || 0),
    }),
    { d: 0, c: 0 },
  );
  const jeBalanced =
    jeForm.lines.some((l) => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0)) &&
    Math.round((jeTotals.d - jeTotals.c) * 100) / 100 === 0;

  const handleCreateJe = async (e: React.FormEvent) => {
    e.preventDefault();
    setJeError(null);
    const payloadLines = jeForm.lines
      .filter((l) => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map((l) => ({
        accountCode: l.accountCode,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }));
    if (payloadLines.length < 2) {
      setJeError('A journal entry needs at least two lines.');
      return;
    }
    if (!jeBalanced) {
      setJeError(`Unbalanced: debits (${fmt(jeTotals.d)}) != credits (${fmt(jeTotals.c)}).`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/accounting/journal-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memo: jeForm.memo.trim() || 'Manual journal entry',
          reference: jeForm.reference.trim() || null,
          entry_date: jeForm.entry_date,
          lines: payloadLines,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to post journal entry');
      setShowJeDrawer(false);
      setJeForm({
        memo: '', reference: '', entry_date: new Date().toISOString().slice(0, 10),
        lines: [
          { accountCode: '', debit: '', credit: '' },
          { accountCode: '', debit: '', credit: '' },
        ],
      });
      await load();
    } catch (err) {
      setJeError(err instanceof Error ? err.message : 'Failed to post journal entry');
    } finally {
      setSaving(false);
    }
  };

  const selectedJe = journalEntries.find((j) => j.id === activeJe) || null;

  return (
    <div className="w-full min-h-screen bg-background text-foreground flex flex-col">
      {/* STATUS STRIP */}
      <div className="w-full bg-muted/60 border-b border-border px-4 py-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-success animate-pulse"></span>
          <span className="font-medium text-[11px] text-muted-foreground">Books &amp; General Records</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="font-medium">
            Trial Balance:{' '}
            <span className={trialBalanced ? 'text-success font-semibold' : 'text-destructive font-semibold'}>
              {trialBalanced ? 'Balanced' : 'Out of balance'}
            </span>
          </span>
          <span className="hidden sm:inline font-medium">
            {journalEntries.length} journal {journalEntries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </div>

      {/* PAGE HEADER */}
      <div className="p-6 border-b border-border bg-background flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Books &amp; General Records</h1>
          <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            Double-entry bookkeeping. Balances are computed live from posted journal lines — no stored balances.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={exportFrom}
            onChange={(e) => setExportFrom(e.target.value)}
            aria-label="Ledger export from date"
            className="h-9 rounded-lg border border-border bg-card px-2 text-[12px] text-foreground"
          />
          <input
            type="date"
            value={exportTo}
            onChange={(e) => setExportTo(e.target.value)}
            aria-label="Ledger export to date"
            className="h-9 rounded-lg border border-border bg-card px-2 text-[12px] text-foreground"
          />
          <button
            onClick={handleExportLedger}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card hover:bg-accent h-9 px-3.5 text-[13px] font-medium cursor-pointer disabled:opacity-50"
          >
            <Download className="size-4" /> {exporting ? 'Exporting…' : 'Export Ledger'}
          </button>
          {activeTab === 'je' && (
            <button
              onClick={() => setShowJeDrawer(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3.5 text-[13px] font-medium shadow-card cursor-pointer"
            >
              <Plus className="size-4" /> New Journal Entry
            </button>
          )}
        </div>
      </div>

      {exportMsg && (
        <div className="px-6 py-2 text-[12px] text-muted-foreground border-b border-border bg-muted/30">{exportMsg}</div>
      )}

      {/* SUB NAVIGATION TABS */}
      <div className="w-full bg-background border-b border-border flex overflow-x-auto shrink-0 custom-scrollbar">
        {(
          [
            ['gl', '01', 'General Ledger', null],
            ['coa', '02', 'Chart of Accounts', accounts.length],
            ['transactions', '03', 'Transactions', bankTxns.length],
            ['je', '04', 'Journal Entries', journalEntries.length],
          ] as const
        ).map(([key, num, label, count]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-3 text-[13px] font-medium border-r border-border flex items-center gap-2 cursor-pointer transition-colors duration-150 whitespace-nowrap ${
              activeTab === key ? 'text-primary border-b-primary -mb-px' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <span className="text-[11px] text-muted-foreground/70 tabular-nums">{num}</span>
            <span>{label}</span>
            {count !== null && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="p-12 text-center text-[13px] text-muted-foreground">Loading ledger…</div>
      )}
      {error && !loading && (
        <div className="p-12 text-center">
          <p className="text-[13px] text-destructive font-semibold">Failed to load: {error}</p>
          <button onClick={load} className="mt-3 text-[12px] underline text-muted-foreground cursor-pointer">Retry</button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* TAB: GENERAL LEDGER OVERVIEW */}
          {activeTab === 'gl' && (
            <div className="animate-fade-in p-6 space-y-6 bg-muted/30 min-h-[500px]">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {(
                  [
                    ['Total Assets', kpi('asset')],
                    ['Liabilities', kpi('liability')],
                    ['Owners Equity', kpi('equity')],
                    ['Revenue (MTD)', kpi('revenue')],
                  ] as const
                ).map(([label, val]) => (
                  <div key={label} className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-card">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                    <p className="text-2xl font-display font-semibold tabular-nums text-foreground mt-2">{fmt(val)}</p>
                    <span className="text-[11px] text-muted-foreground mt-1">From posted journal lines</span>
                  </div>
                ))}
              </div>

              <div className="bg-card border border-border">
                <div className="bg-muted/40 border-b border-border p-3 tabular-nums font-semibold text-[13px] uppercase flex items-center justify-between">
                  <span>Recent Posted Journals</span>
                  <span className="text-[10px] text-muted-foreground">
                    Σ Debits {fmt(totalDebits)} · Σ Credits {fmt(totalCredits)}
                  </span>
                </div>
                <div className="p-4 space-y-4">
                  {journalEntries.filter((j) => (j.status || '').toLowerCase() === 'posted').length === 0 && (
                    <p className="text-[13px] text-muted-foreground py-6 text-center">
                      No posted journal entries yet. Post one from the Journal Entries tab.
                    </p>
                  )}
                  {journalEntries
                    .filter((j) => (j.status || '').toLowerCase() === 'posted')
                    .slice(0, 10)
                    .map((je) => (
                      <div key={je.id} className="border border-border p-3 space-y-3 bg-card">
                        <div className="flex items-center justify-between border-b border-border pb-2">
                          <div>
                            <span className="tabular-nums font-semibold text-[13px]">{je.entry_no || je.id.slice(0, 8)}</span>
                            <span className="text-[11px] text-muted-foreground/70 ml-3">{je.entry_date || ''}</span>
                          </div>
                          <span className="text-[9px] tabular-nums font-semibold border px-1.5 py-0.2 bg-muted/40 text-foreground border-border uppercase">
                            {je.status}
                          </span>
                        </div>
                        <p className="text-[12px] text-muted-foreground font-medium">{je.memo || je.reference || '—'}</p>
                        <div className="space-y-1">
                          {(je.lines || []).map((l, lIdx) => (
                            <div key={lIdx} className="grid grid-cols-12 text-[12px] font-medium">
                              <div className={`col-span-6 ${l.credit > 0 ? 'pl-4 text-muted-foreground' : 'text-foreground'}`}>
                                {l.account_code} {l.account_name}
                              </div>
                              <div className="col-span-3 text-right">{l.debit > 0 ? fmt(l.debit) : '—'}</div>
                              <div className="col-span-3 text-right">{l.credit > 0 ? fmt(l.credit) : '—'}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: CHART OF ACCOUNTS */}
          {activeTab === 'coa' && (
            <div className="animate-fade-in p-6 bg-card space-y-6">
              <div className="bg-muted/30 p-4 border border-border flex flex-col md:flex-row items-center gap-4">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/70" />
                  <input
                    type="text"
                    value={coaSearch}
                    onChange={(e) => setCoaSearch(e.target.value)}
                    className="w-full bg-card border border-border pl-10 pr-4 py-2 text-[12px] focus:outline-none text-foreground"
                    placeholder="Search code, name, or type…"
                  />
                </div>
                <button
                  onClick={() => setShowAddDrawer(true)}
                  className="bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 text-[12px] uppercase px-5 py-2 font-semibold cursor-pointer rounded-lg border border-border w-full md:w-auto"
                >
                  + Add Account
                </button>
              </div>

              {filteredAccounts.length === 0 ? (
                <div className="border border-border p-12 text-center">
                  <BookOpen className="size-8 mx-auto text-muted-foreground/50" />
                  <p className="text-[13px] font-semibold mt-3">No accounts found</p>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    {accounts.length === 0
                      ? 'The chart of accounts is empty. Add the first account to get started.'
                      : 'No accounts match your search.'}
                  </p>
                </div>
              ) : (
                <div className="border border-border overflow-x-auto">
                  <table className="w-full text-left text-[13px] text-foreground border-collapse">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border font-semibold uppercase">
                        <th className="p-3 border-r border-border w-24">Code</th>
                        <th className="p-3 border-r border-border">Account Name</th>
                        <th className="p-3 border-r border-border">Type</th>
                        <th className="p-3 border-r border-border">Subtype</th>
                        <th className="p-3 border-r border-border text-right w-40">Balance</th>
                        <th className="p-3 text-center w-32">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-medium">
                      {filteredAccounts.map((acc) => (
                        <tr key={acc.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 border-r border-border font-semibold">{acc.code}</td>
                          <td className="p-3 border-r border-border font-semibold">{acc.name}</td>
                          <td className="p-3 border-r border-border uppercase text-muted-foreground">{acc.account_type}</td>
                          <td className="p-3 border-r border-border text-muted-foreground">{acc.subtype || '—'}</td>
                          <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(accountBalance(acc))}</td>
                          <td className="p-3 text-center">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 uppercase border ${
                              acc.is_active === false
                                ? 'bg-muted/40 border-border text-muted-foreground'
                                : 'bg-success/10 border-success/20 text-success'
                            }`}>
                              {acc.is_active === false ? 'Inactive' : 'Active'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: TRANSACTIONS */}
          {activeTab === 'transactions' && (
            <div className="animate-fade-in p-6 bg-card space-y-6">
              <div className="border border-border">
                <div className="bg-muted/40 border-b border-border p-4">
                  <h2 className="text-sm font-semibold uppercase text-foreground">Bank Transactions</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Imported bank feed · match against journal lines</p>
                </div>
                {bankTxns.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-[13px] font-semibold">No bank transactions yet</p>
                    <p className="text-[12px] text-muted-foreground mt-1">
                      Transactions appear here once a bank feed is connected and synced.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-left text-[13px] text-foreground border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 font-semibold uppercase">
                          <th className="p-3 border-r border-border">Date</th>
                          <th className="p-3 border-r border-border">Description</th>
                          <th className="p-3 border-r border-border">Payee</th>
                          <th className="p-3 border-r border-border text-right w-36">Amount</th>
                          <th className="p-3 text-center w-36">Match State</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-card font-medium">
                        {bankTxns.map((t) => (
                          <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                            <td className="p-3 border-r border-border text-muted-foreground">{t.transaction_date || '—'}</td>
                            <td className="p-3 border-r border-border">{t.description || '—'}</td>
                            <td className="p-3 border-r border-border text-muted-foreground">{t.payee || '—'}</td>
                            <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(t.amount)}</td>
                            <td className="p-3 text-center">
                              <span className="text-[10px] font-semibold border px-2 py-0.5 uppercase bg-muted/40 border-border text-muted-foreground">
                                {(t.match_status || 'unmatched').replace(/_/g, ' ')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: JOURNAL ENTRIES */}
          {activeTab === 'je' && (
            <div className="animate-fade-in p-6 bg-muted/30 min-h-[500px] grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 bg-card border border-border flex flex-col">
                <div className="bg-muted/40 border-b border-border p-3 font-semibold text-[13px] uppercase text-foreground">
                  Journal Vouchers
                </div>
                <div className="divide-y divide-border overflow-y-auto flex-1 max-h-[450px] custom-scrollbar bg-card">
                  {journalEntries.length === 0 && (
                    <p className="p-6 text-[12px] text-muted-foreground text-center">
                      No journal entries yet. Create the first one with “New Journal Entry”.
                    </p>
                  )}
                  {journalEntries.map((je) => (
                    <button
                      key={je.id}
                      onClick={() => setActiveJe(je.id)}
                      className={`w-full text-left p-4 space-y-2 cursor-pointer transition-colors block border-none ${
                        activeJe === je.id ? 'bg-muted/40' : 'hover:bg-muted/30 bg-card'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold">{je.entry_no || je.id.slice(0, 8)}</span>
                        <span className="text-[11px] text-muted-foreground/70">{je.entry_date || ''}</span>
                      </div>
                      <p className="text-[12px] text-muted-foreground font-medium line-clamp-1">{je.memo || je.reference || '—'}</p>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="tabular-nums text-muted-foreground/70">{(je.lines || []).length} lines</span>
                        <span className={`text-[10px] font-semibold border px-1.5 py-0.5 uppercase ${
                          (je.status || '').toLowerCase() === 'posted'
                            ? 'bg-success/10 border-success/20 text-success'
                            : 'bg-warning/10 border-warning/20 text-warning'
                        }`}>
                          {je.status || 'draft'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-8 space-y-6">
                {!selectedJe && (
                  <div className="bg-card border border-border p-12 text-center text-[13px] text-muted-foreground">
                    Select a journal entry to view its lines.
                  </div>
                )}
                {selectedJe && (() => {
                  const lines = selectedJe.lines || [];
                  const d = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
                  const c = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
                  const balanced = Math.round((d - c) * 100) / 100 === 0;
                  return (
                    <div className="bg-card border border-border">
                      <div className="bg-muted/40 border-b border-border p-4">
                        <span className="text-[11px] bg-primary text-primary-foreground px-1.5 py-0.5 font-semibold uppercase">
                          Voucher // {selectedJe.entry_no || selectedJe.id.slice(0, 8)}
                        </span>
                        <h3 className="text-[13px] font-semibold text-foreground mt-1.5 uppercase">{selectedJe.memo || '—'}</h3>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {selectedJe.entry_date || ''} · Source: {selectedJe.source || 'manual'}
                          {selectedJe.reference ? ` · Ref: ${selectedJe.reference}` : ''}
                        </p>
                      </div>
                      <div className="p-4 space-y-4">
                        <div className="border border-border overflow-x-auto">
                          <table className="w-full text-left text-[13px] text-foreground border-collapse">
                            <thead>
                              <tr className="bg-muted/30 border-b border-border font-semibold uppercase">
                                <th className="p-3 border-r border-border">Account</th>
                                <th className="p-3 border-r border-border text-right w-44">Debit</th>
                                <th className="p-3 text-right w-44">Credit</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border bg-card">
                              {lines.map((line, lIdx) => (
                                <tr key={lIdx} className="hover:bg-muted/30 transition-colors">
                                  <td className={`p-3 border-r border-border font-semibold ${line.credit > 0 ? 'pl-8 text-muted-foreground' : 'text-foreground'}`}>
                                    {line.account_code} {line.account_name}
                                    {line.description && <span className="block text-[11px] font-normal text-muted-foreground">{line.description}</span>}
                                  </td>
                                  <td className="p-3 border-r border-border text-right font-semibold tabular-nums">
                                    {line.debit > 0 ? fmt(line.debit) : '—'}
                                  </td>
                                  <td className="p-3 text-right font-semibold tabular-nums">
                                    {line.credit > 0 ? fmt(line.credit) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-muted/40 border-t border-border font-semibold">
                                <td className="p-3 border-r border-border uppercase text-right">Total</td>
                                <td className="p-3 border-r border-border text-right tabular-nums">{fmt(d)}</td>
                                <td className="p-3 text-right tabular-nums">{fmt(c)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                        <div className="flex items-center justify-between bg-muted/40 p-3 text-[11px] font-semibold text-muted-foreground uppercase border border-border">
                          <span>Double-entry check</span>
                          {balanced ? (
                            <span className="text-success flex items-center gap-1.5"><CheckCircle2 className="size-4" /> Debits = Credits</span>
                          ) : (
                            <span className="text-destructive flex items-center gap-1.5"><AlertTriangle className="size-4" /> Out of balance</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </>
      )}

      {/* ADD ACCOUNT DRAWER */}
      {showAddDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div onClick={() => setShowAddDrawer(false)} className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-md bg-card border-l border-border p-6 z-10 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
              <h3 className="text-sm font-semibold uppercase text-foreground">New GL Account</h3>
              <button onClick={() => setShowAddDrawer(false)} className="text-[12px] cursor-pointer">X</button>
            </div>
            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Code *</label>
                <input required value={newAccount.code} onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })}
                  className="w-full bg-card border border-border p-2 text-[12px] text-foreground" placeholder="e.g. 4300" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Name *</label>
                <input required value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                  className="w-full bg-card border border-border p-2 text-[12px] text-foreground" placeholder="e.g. Franchise Fee Revenue" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Type</label>
                <select value={newAccount.type} onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value })}
                  className="w-full bg-card border border-border p-2 text-[12px] text-foreground cursor-pointer">
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Subtype</label>
                <input value={newAccount.sub} onChange={(e) => setNewAccount({ ...newAccount, sub: e.target.value })}
                  className="w-full bg-card border border-border p-2 text-[12px] text-foreground" placeholder="e.g. franchise_revenue" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Description</label>
                <input value={newAccount.description} onChange={(e) => setNewAccount({ ...newAccount, description: e.target.value })}
                  className="w-full bg-card border border-border p-2 text-[12px] text-foreground" />
              </div>
              <div className="pt-4 flex gap-2">
                <button type="button" onClick={() => setShowAddDrawer(false)}
                  className="flex-1 border border-border py-2.5 text-[12px] uppercase font-semibold cursor-pointer">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 py-2.5 text-[12px] uppercase font-semibold cursor-pointer disabled:opacity-50">
                  {saving ? 'Saving…' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW JOURNAL ENTRY DRAWER */}
      {showJeDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div onClick={() => setShowJeDrawer(false)} className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-lg bg-card border-l border-border p-6 z-10 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
              <h3 className="text-sm font-semibold uppercase text-foreground">New Journal Entry</h3>
              <button onClick={() => setShowJeDrawer(false)} className="text-[12px] cursor-pointer">X</button>
            </div>
            <form onSubmit={handleCreateJe} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Memo *</label>
                <input required value={jeForm.memo} onChange={(e) => setJeForm({ ...jeForm, memo: e.target.value })}
                  className="w-full bg-card border border-border p-2 text-[12px] text-foreground" placeholder="What is this entry for?" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Reference</label>
                  <input value={jeForm.reference} onChange={(e) => setJeForm({ ...jeForm, reference: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px] text-foreground" placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">Date</label>
                  <input type="date" value={jeForm.entry_date} onChange={(e) => setJeForm({ ...jeForm, entry_date: e.target.value })}
                    className="w-full bg-card border border-border p-2 text-[12px] text-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-semibold uppercase text-muted-foreground">Lines</label>
                {jeForm.lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2">
                    <select value={l.accountCode}
                      onChange={(e) => setJeForm({ ...jeForm, lines: jeForm.lines.map((x, xi) => xi === i ? { ...x, accountCode: e.target.value } : x) })}
                      className="col-span-6 bg-card border border-border p-2 text-[12px] text-foreground cursor-pointer">
                      <option value="">Select account…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.code}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                    <input type="number" step="0.01" min="0" placeholder="Debit" value={l.debit}
                      onChange={(e) => setJeForm({ ...jeForm, lines: jeForm.lines.map((x, xi) => xi === i ? { ...x, debit: e.target.value, credit: '' } : x) })}
                      className="col-span-2 bg-card border border-border p-2 text-[12px] text-foreground" />
                    <input type="number" step="0.01" min="0" placeholder="Credit" value={l.credit}
                      onChange={(e) => setJeForm({ ...jeForm, lines: jeForm.lines.map((x, xi) => xi === i ? { ...x, credit: e.target.value, debit: '' } : x) })}
                      className="col-span-2 bg-card border border-border p-2 text-[12px] text-foreground" />
                    <button type="button"
                      onClick={() => setJeForm({ ...jeForm, lines: jeForm.lines.filter((_, xi) => xi !== i) })}
                      className="col-span-2 text-[11px] text-destructive border border-border cursor-pointer">Remove</button>
                  </div>
                ))}
                <button type="button"
                  onClick={() => setJeForm({ ...jeForm, lines: [...jeForm.lines, { accountCode: '', debit: '', credit: '' }] })}
                  className="text-[12px] text-muted-foreground underline cursor-pointer">+ Add line</button>
              </div>

              <div className={`p-3 text-[12px] font-semibold border flex items-center justify-between ${
                jeBalanced ? 'border-success/20 bg-success/10 text-success' : 'border-destructive/20 bg-destructive/10 text-destructive'
              }`}>
                <span>Σ Debits {fmt(jeTotals.d)} · Σ Credits {fmt(jeTotals.c)}</span>
                {jeBalanced ? <span>Balanced ✓</span> : <span>Must balance to post</span>}
              </div>

              {jeError && <p className="text-[12px] text-destructive font-semibold">{jeError}</p>}

              <div className="pt-2 flex gap-2">
                <button type="button" onClick={() => setShowJeDrawer(false)}
                  className="flex-1 border border-border py-2.5 text-[12px] uppercase font-semibold cursor-pointer">Cancel</button>
                <button type="submit" disabled={saving || !jeBalanced}
                  className="flex-1 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 py-2.5 text-[12px] uppercase font-semibold cursor-pointer disabled:opacity-50">
                  {saving ? 'Posting…' : 'Post Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

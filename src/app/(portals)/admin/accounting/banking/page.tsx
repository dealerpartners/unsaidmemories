'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// /admin/accounting/banking — Banking & Cash → Cards & Bank Accounts.
// The complete account register: every acct_bank_accounts row with its
// GL code, the ledger balance from posted journal activity, the bank
// balance (latest statement closing balance, or the sum of recorded
// transactions when no statement exists — the source is labeled), the
// last completed reconciliation, and honest feed health (a feed only
// reads "connected" when a provider connection id is on the account).
// Data: /api/admin/accounting/bank-accounts. New accounts are written
// through the existing banking action endpoint (add_account).

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type BankAccount = {
  id: string;
  name: string;
  institutionName: string | null;
  accountType: string;
  maskedNumber: string | null;
  currency: string;
  isActive: boolean;
  glAccountId: string | null;
  glCode: string | null;
  glName: string | null;
  ledgerBalance: number;
  bankBalance: number;
  bankBalanceSource: 'statement' | 'transactions';
  statementEnd: string | null;
  transactionCount: number;
  lastReconciledAt: string | null;
  openReconStatus: string | null;
  feed: { provider: string | null; connected: boolean; lastSyncAt: string | null };
};

type GlAccount = { id: string; code: string; name: string; account_type: string };

const TYPE_LABEL: Record<string, string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit: 'Credit Card',
  credit_card: 'Credit Card',
  clearing: 'Merchant Clearing',
  money_market: 'Money Market',
  cash: 'Cash',
};

export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [glAccounts, setGlAccounts] = useState<GlAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', institution_name: '', account_type: 'checking', masked_account_number: '', gl_account_id: '' });

  const load = () => {
    setLoading(true);
    fetch('/api/admin/accounting/bank-accounts', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setAccounts(Array.isArray(d.accounts) ? d.accounts : []);
        setGlAccounts(Array.isArray(d.glAccounts) ? d.glAccounts : []);
      })
      .catch(() => setError('Bank accounts could not be loaded.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of accounts) counts.set(a.accountType, (counts.get(a.accountType) || 0) + 1);
    return [...counts.entries()];
  }, [accounts]);

  const shown = accounts.filter((a) => {
    if (typeFilter !== 'all' && a.accountType !== typeFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [a.name, a.institutionName || '', a.maskedNumber || '', a.glCode || ''].join(' ').toLowerCase().includes(q);
  });

  const connectedFeeds = accounts.filter((a) => a.feed.connected);
  const totalLedger = accounts.reduce((s, a) => s + a.ledgerBalance, 0);

  const saveAccount = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/admin/accounting/banking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_account', ...form, gl_account_id: form.gl_account_id || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || 'save failed');
      setShowAdd(false);
      setForm({ name: '', institution_name: '', account_type: 'checking', masked_account_number: '', gl_account_id: '' });
      load();
    } catch {
      setError('The account could not be saved. Check the details and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Cards &amp; Bank Accounts</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search institution, account, GL code…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64"
            type="text"
          />
          <button
            onClick={() => setShowAdd((v) => !v)}
            data-tip="Record a bank, card or clearing account in the books. Live bank feeds are connected separately, from Integrations."
            className="h-9 px-4 rounded-lg text-[13px] font-medium text-white shrink-0"
            style={{ backgroundColor: '#7258e8' }}
          >
            Add Account
          </button>
        </div>
      </div>

      <div className="py-4 flex flex-col gap-4">
        <div className="border border-border rounded-xl bg-card p-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Active Institutional Feeds</h2>
          {connectedFeeds.length === 0 ? (
            <p className="text-[13px] text-muted-foreground mt-2">
              No live bank feeds are connected. Balances below come from statements and transactions recorded in the books.
              Connect a feed from <Link href="/admin/integrations" className="underline text-foreground">Integrations</Link> and it will show here with its last sync time.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-1">
              {connectedFeeds.map((a) => (
                <p key={a.id} className="text-[13px]">
                  <span className="font-medium">{a.feed.provider}</span> — {a.name}
                  <span className="text-muted-foreground"> · last sync {a.feed.lastSyncAt ? new Date(a.feed.lastSyncAt).toLocaleString() : 'never'}</span>
                </p>
              ))}
            </div>
          )}
        </div>

        {showAdd && (
          <div className="border border-border rounded-xl bg-card p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-[12px] font-medium">Account name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Operating Checking" className="mt-1 w-full bg-background border border-input rounded-lg px-3 h-9 text-[13px]" />
            </label>
            <label className="text-[12px] font-medium">Institution
              <input value={form.institution_name} onChange={(e) => setForm({ ...form, institution_name: e.target.value })} placeholder="Bank or card issuer" className="mt-1 w-full bg-background border border-input rounded-lg px-3 h-9 text-[13px]" />
            </label>
            <label className="text-[12px] font-medium">Account type
              <select value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} className="mt-1 w-full bg-background border border-input rounded-lg px-3 h-9 text-[13px]">
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="credit">Credit Card</option>
                <option value="clearing">Merchant Clearing</option>
                <option value="money_market">Money Market</option>
                <option value="cash">Cash</option>
              </select>
            </label>
            <label className="text-[12px] font-medium">Masked number
              <input value={form.masked_account_number} onChange={(e) => setForm({ ...form, masked_account_number: e.target.value })} placeholder="****4242" className="mt-1 w-full bg-background border border-input rounded-lg px-3 h-9 text-[13px]" />
            </label>
            <label className="text-[12px] font-medium">GL account
              <select value={form.gl_account_id} onChange={(e) => setForm({ ...form, gl_account_id: e.target.value })} className="mt-1 w-full bg-background border border-input rounded-lg px-3 h-9 text-[13px]">
                <option value="">Choose the ledger account this bank account posts to…</option>
                {glAccounts.map((g) => (<option key={g.id} value={g.id}>{g.code} — {g.name}</option>))}
              </select>
            </label>
            <div className="flex items-end">
              <button onClick={saveAccount} disabled={saving || !form.name.trim()} data-tip="Save this account into the register. It appears in the list below right away." className="h-9 px-4 rounded-lg text-[13px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#7258e8' }}>
                {saving ? 'Saving…' : 'Save Account'}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTypeFilter('all')} className={`h-8 px-3 rounded-lg text-[12px] font-medium border ${typeFilter === 'all' ? 'text-white border-transparent' : 'border-border text-foreground bg-card'}`} style={typeFilter === 'all' ? { backgroundColor: '#7258e8' } : undefined}>
            All Institutions ({accounts.length})
          </button>
          {types.map(([t, c]) => (
            <button key={t} onClick={() => setTypeFilter(t)} className={`h-8 px-3 rounded-lg text-[12px] font-medium border ${typeFilter === t ? 'text-white border-transparent' : 'border-border text-foreground bg-card'}`} style={typeFilter === t ? { backgroundColor: '#7258e8' } : undefined}>
              {TYPE_LABEL[t] || t} ({c})
            </button>
          ))}
        </div>

        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}

        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
                <th className="p-3 border-r border-border">Institution &amp; Account Name</th>
                <th className="p-3 border-r border-border">Masked Number</th>
                <th className="p-3 border-r border-border">Account Type</th>
                <th className="p-3 border-r border-border">GL Code</th>
                <th className="p-3 border-r border-border text-right">Live Bank Balance</th>
                <th className="p-3 border-r border-border text-right">Ledger Balance</th>
                <th className="p-3 border-r border-border">Last Reconciliation</th>
                <th className="p-3 border-r border-border">Feed Health</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={9} className="text-center text-muted-foreground">Loading bank accounts…</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-muted-foreground">No bank accounts are recorded yet. Add the first one with Add Account — it will appear here, in Bank Feeds Triage, and in Reconciliation.</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-muted-foreground">No accounts match this filter.</td></tr>
              ) : shown.map((a) => {
                const diff = a.bankBalance - a.ledgerBalance;
                return (
                  <tr key={a.id} className="hover:bg-accent/50">
                    <td className="p-3 border-r border-border">
                      <div className="font-medium">{a.institutionName || '—'}</div>
                      <div className="text-[12px] text-muted-foreground">{a.name}{a.isActive ? '' : ' · inactive'}</div>
                    </td>
                    <td className="p-3 border-r border-border tabular-nums text-muted-foreground">{a.maskedNumber || '—'}</td>
                    <td className="p-3 border-r border-border">{TYPE_LABEL[a.accountType] || a.accountType}</td>
                    <td className="p-3 border-r border-border tabular-nums">{a.glCode ? `${a.glCode}` : '—'}{a.glName ? <div className="text-[11px] text-muted-foreground">{a.glName}</div> : null}</td>
                    <td className="p-3 border-r border-border text-right">
                      <div className="font-semibold tabular-nums">{fmt(a.bankBalance)}</div>
                      <div className="text-[11px] text-muted-foreground">{a.bankBalanceSource === 'statement' ? `statement ${a.statementEnd || ''}` : `${a.transactionCount} transaction(s) on file`}</div>
                    </td>
                    <td className="p-3 border-r border-border text-right">
                      <div className="font-semibold tabular-nums">{fmt(a.ledgerBalance)}</div>
                      {Math.abs(diff) > 0.004 && <div className="text-[11px] text-muted-foreground">diff {fmt(diff)}</div>}
                    </td>
                    <td className="p-3 border-r border-border text-muted-foreground">
                      {a.lastReconciledAt || 'Never'}
                      {a.openReconStatus && <div className="text-[11px]">in progress</div>}
                    </td>
                    <td className="p-3 border-r border-border">
                      {a.feed.connected ? (
                        <span className="text-[12px] font-medium">Connected{a.feed.provider ? ` · ${a.feed.provider}` : ''}</span>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">Not connected</span>
                      )}
                      {a.feed.lastSyncAt && <div className="text-[11px] text-muted-foreground">sync {new Date(a.feed.lastSyncAt).toLocaleDateString()}</div>}
                    </td>
                    <td className="p-3 text-center">
                      <Link href={`/admin/accounting/banking/reconciliation?account=${a.id}`} data-tip="Open the reconciliation workbench for this account — tick what cleared and finish the cycle." className="text-[12px] font-medium underline text-foreground">Reconcile</Link>
                      {' · '}
                      <Link href="/admin/accounting/banking/triage" data-tip="Match unreviewed bank transactions to journal entries." className="text-[12px] font-medium underline text-foreground">Triage</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Ledger balance is the posted journal balance on each account&apos;s GL account. Bank balance is the latest statement closing balance when a statement has been imported, otherwise the sum of bank transactions recorded in the books — it is not a live bank figure unless a feed is connected.
        </p>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';

// /admin/accounting/banking/triage — Banking & Cash → Bank Feeds & Triage.
// The review queue for bank transactions that are not reconciled yet.
// The server computes SUGGESTED matches from posted journal lines on
// each account's GL account (exact amount, ranked by date proximity) —
// they are labeled suggestions; nothing is matched until Confirm Match
// is pressed. Accepting writes the match to acct_bank_transactions and
// records an acct_reconciliation_items row; excluding and restoring
// are real status writes too.
// Data: /api/admin/accounting/bank-triage.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Suggestion = { journalLineId: string; entryNo: string; entryDate: string; description: string; amount: number; reason: string };
type ManualLine = { journalLineId: string; entryNo: string; entryDate: string; description: string; amount: number };
type TriageTxn = {
  id: string; bankAccountId: string; accountName: string; date: string; postedDate: string | null;
  amount: number; description: string | null; payee: string | null; reference: string | null;
  matchStatus: string; matchedJournalLineId: string | null; suggestions: Suggestion[];
};

export default function BankFeedsTriagePage() {
  const [txns, setTxns] = useState<TriageTxn[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [manualLines, setManualLines] = useState<Record<string, ManualLine[]>>({});
  const [counts, setCounts] = useState({ review: 0, matched: 0, excluded: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'review' | 'matched' | 'excluded'>('review');
  const [accountFilter, setAccountFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/accounting/bank-triage', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        const list: TriageTxn[] = Array.isArray(d.transactions) ? d.transactions : [];
        setTxns(list);
        setAccounts(Array.isArray(d.accounts) ? d.accounts : []);
        setManualLines(d.manualLines || {});
        setCounts(d.counts || { review: 0, matched: 0, excluded: 0 });
        setChosen((prev) => {
          const next = { ...prev };
          for (const t of list) {
            if (!next[t.id] && t.suggestions.length > 0) next[t.id] = t.suggestions[0].journalLineId;
          }
          return next;
        });
      })
      .catch(() => setError('The triage queue could not be loaded.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const act = async (action: string, t: TriageTxn, journalLineId?: string) => {
    setBusy(t.id);
    try {
      const r = await fetch('/api/admin/accounting/bank-triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, transactionId: t.id, journalLineId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || 'action failed');
      load();
    } catch (e: any) {
      setError(e?.message || 'That action could not be completed.');
    } finally {
      setBusy(null);
    }
  };

  const autoMatchSelected = async () => {
    const rows = shown.filter((t) => checked[t.id] && chosen[t.id]);
    for (const t of rows) {
      await act('accept', t, chosen[t.id]);
    }
  };

  const shown = useMemo(() => txns.filter((t) => {
    if (tab === 'review' && !(t.matchStatus === 'unmatched' || t.matchStatus === 'pending')) return false;
    if (tab === 'matched' && !(t.matchStatus === 'matched' || t.matchStatus === 'reconciled')) return false;
    if (tab === 'excluded' && t.matchStatus !== 'excluded') return false;
    if (accountFilter !== 'all' && t.bankAccountId !== accountFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return [t.payee || '', t.description || '', t.reference || '', t.accountName].join(' ').toLowerCase().includes(q);
    }
    return true;
  }), [txns, tab, accountFilter, search]);

  const tabBtn = (key: 'review' | 'matched' | 'excluded', label: string, n: number, tip: string) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      data-tip={tip}
      className={`h-8 px-3 rounded-lg text-[12px] font-medium border ${tab === key ? 'text-white border-transparent' : 'border-border text-foreground bg-card'}`}
      style={tab === key ? { backgroundColor: '#7258e8' } : undefined}
    >
      {label} ({n})
    </button>
  );

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Bank Feeds &amp; Triage</h1>
        </div>
        <div className="flex items-center gap-2">
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="bg-background border border-input rounded-lg px-3 h-9 text-[13px]">
            <option value="all">All accounts</option>
            {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search payee, description…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-56"
            type="text"
          />
        </div>
      </div>

      <div className="py-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {tabBtn('review', 'For Review', counts.review, 'Bank transactions still waiting to be matched to the books.')}
          {tabBtn('matched', 'Matched', counts.matched, 'Transactions already matched to a journal entry (or fully reconciled).')}
          {tabBtn('excluded', 'Excluded', counts.excluded, 'Transactions set aside as not belonging to the books — a bank fee duplicate, a transfer between your own accounts, and so on.')}
          <button
            onClick={autoMatchSelected}
            disabled={!shown.some((t) => checked[t.id] && chosen[t.id])}
            data-tip="Confirm the suggested match for every ticked row in one go. Each one is written to the books exactly like Confirm Match."
            className="h-8 px-3 rounded-lg text-[12px] font-medium text-white disabled:opacity-50 ml-auto"
            style={{ backgroundColor: '#7258e8' }}
          >
            Auto-Match Selected
          </button>
        </div>

        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}

        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
                <th className="p-3 border-r border-border text-center"></th>
                <th className="p-3 border-r border-border">Date / Timestamp</th>
                <th className="p-3 border-r border-border">Payee &amp; Statement Description</th>
                <th className="p-3 border-r border-border text-right">Amount</th>
                <th className="p-3 border-r border-border">Suggested Match / GL Target</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">Loading the triage queue…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground">
                  {tab === 'review'
                    ? 'Nothing is waiting for review. When bank transactions arrive — from a connected feed, a statement import, or manual entry — the ones that still need a match will appear here.'
                    : tab === 'matched'
                      ? 'No matched transactions yet. Confirm a suggested match in For Review and it will be listed here.'
                      : 'Nothing has been excluded. Use Exclude on a review row to set a transaction aside.'}
                </td></tr>
              ) : shown.map((t) => {
                const manual = manualLines[t.bankAccountId] || [];
                const picked = chosen[t.id] || '';
                return (
                  <tr key={t.id} className="hover:bg-accent/50">
                    <td className="p-3 border-r border-border text-center">
                      {tab === 'review' && (
                        <input type="checkbox" checked={!!checked[t.id]} disabled={!picked} onChange={(e) => setChecked({ ...checked, [t.id]: e.target.checked })} />
                      )}
                    </td>
                    <td className="p-3 border-r border-border whitespace-nowrap">
                      <div className="tabular-nums">{t.date}</div>
                      <div className="text-[11px] text-muted-foreground">{t.accountName}</div>
                    </td>
                    <td className="p-3 border-r border-border">
                      <div className="font-medium">{t.payee || t.description || '—'}</div>
                      {t.payee && t.description && <div className="text-[11px] text-muted-foreground">{t.description}</div>}
                      {t.reference && <div className="text-[11px] text-muted-foreground">Ref {t.reference}</div>}
                    </td>
                    <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(t.amount)}</td>
                    <td className="p-3 border-r border-border">
                      {tab === 'review' ? (
                        <>
                          <select
                            value={picked}
                            onChange={(e) => setChosen({ ...chosen, [t.id]: e.target.value })}
                            className="w-full bg-background border border-input rounded-lg px-2 h-9 text-[12px]"
                          >
                            <option value="">Choose a journal line…</option>
                            {t.suggestions.length > 0 && (
                              <optgroup label="Suggested matches">
                                {t.suggestions.map((s) => (
                                  <option key={s.journalLineId} value={s.journalLineId}>
                                    #{s.entryNo} · {s.entryDate} · {fmt(s.amount)} — {s.description} ({s.reason})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {manual.length > 0 && (
                              <optgroup label="All unmatched journal lines on this account">
                                {manual.filter((m) => !t.suggestions.some((s) => s.journalLineId === m.journalLineId)).map((m) => (
                                  <option key={m.journalLineId} value={m.journalLineId}>
                                    #{m.entryNo} · {m.entryDate} · {fmt(m.amount)} — {m.description}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                          <div className="text-[11px] text-muted-foreground mt-1">
                            {t.suggestions.length > 0
                              ? `Suggestion: ${t.suggestions[0].reason.toLowerCase()} — check it before confirming.`
                              : 'No exact-amount suggestion. Pick the journal line by hand, or exclude the transaction.'}
                          </div>
                        </>
                      ) : tab === 'matched' ? (
                        <span className="text-[12px] text-muted-foreground">{t.matchStatus === 'reconciled' ? 'Reconciled in a finished cycle' : 'Matched to a journal line'}</span>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">Excluded from matching</span>
                      )}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {tab === 'review' && (
                        <>
                          <button onClick={() => act('accept', t, picked)} disabled={busy === t.id || !picked} data-tip="Write this match to the books: the transaction is marked matched and recorded on the account's open reconciliation." className="text-[12px] font-medium underline text-foreground disabled:opacity-50">Confirm Match</button>
                          {' · '}
                          <button onClick={() => act('exclude', t)} disabled={busy === t.id} data-tip="Set this transaction aside — it stays on the bank account but leaves the matching queue." className="text-[12px] font-medium underline text-foreground disabled:opacity-50">Exclude</button>
                        </>
                      )}
                      {tab === 'matched' && t.matchStatus === 'matched' && (
                        <button onClick={() => act('unmatch', t)} disabled={busy === t.id} data-tip="Undo this match and send the transaction back to For Review." className="text-[12px] font-medium underline text-foreground disabled:opacity-50">Unmatch</button>
                      )}
                      {tab === 'excluded' && (
                        <button onClick={() => act('restore', t)} disabled={busy === t.id} data-tip="Bring this transaction back into For Review." className="text-[12px] font-medium underline text-foreground disabled:opacity-50">Restore</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Suggestions come only from posted journal lines on the same account&apos;s GL account with the exact same amount. A match is never written until you confirm it.
        </p>
      </div>
    </div>
  );
}

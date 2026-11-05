'use client';

import React, { useEffect, useState } from 'react';

// ============================================================================
// BankingView — 3.10 Banking.
//
//   Bank Accounts  → manual account tracking (acct_bank_accounts, real rows)
//   Transactions   → manual transaction entry (acct_bank_transactions)
//   Reconciliation → match bank txns against journal entries (match_status)
//   Payouts        → inbound deposits/payouts recorded as bank transactions
//                    (fin_bank_payouts, SA-86 — read-only, real rows)
//   Connect Bank   → SA-84: Stripe Connect ONLY. The button starts Stripe's
//                    hosted Express onboarding; bank details are entered on
//                    Stripe's pages and never typed into or stored in this
//                    app. Manual accounts below are for reconciliation
//                    tracking — they are not "connections".
// ============================================================================

type Account = {
  id: string; name: string; institution_name: string | null;
  account_type: string; masked_account_number: string | null;
  currency: string; is_active: boolean; ledger_balance: number; txn_count: number;
  provider: string | null; last_sync_at: string | null;
};

type Txn = {
  id: string; bank_account_id: string; account_name: string;
  transaction_date: string | null; amount: number; currency: string;
  description: string | null; payee: string | null; reference: string | null;
  match_status: string; matched_journal_line_id: string | null;
};

const money = (n: any) => `$${(Number(n) || 0).toFixed(2)}`;

export const BankingView: React.FC = () => {
  const [tab, setTab] = useState<'accounts' | 'transactions' | 'reconcile' | 'payouts'>('accounts');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddTxn, setShowAddTxn] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unreconciled' | 'reconciled'>('unreconciled');

  // Add-account form
  const [fName, setFName] = useState('');
  const [fInst, setFInst] = useState('');
  const [fType, setFType] = useState('checking');
  const [fLast4, setFLast4] = useState('');
  // Add-transaction form
  const [tAccount, setTAccount] = useState('');
  const [tAmount, setTAmount] = useState('');
  const [tDesc, setTDesc] = useState('');
  const [tDate, setTDate] = useState('');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [aRes, tRes] = await Promise.all([
        fetch('/api/admin/banking/accounts', { cache: 'no-store' }),
        fetch(`/api/admin/banking/transactions?match_status=${filter}`, { cache: 'no-store' }),
      ]);
      if (aRes.ok) setAccounts((await aRes.json()).accounts || []);
      if (tRes.ok) setTxns((await tRes.json()).transactions || []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filter]);

  const addAccount = async () => {
    if (!fName.trim()) return;
    const res = await fetch('/api/admin/banking/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fName.trim(), institution_name: fInst.trim() || null, account_type: fType, masked_account_number: fLast4.trim() || null }),
    });
    if (res.ok) { setShowAdd(false); setFName(''); setFInst(''); setFLast4(''); load(); }
    else { const d = await res.json(); setError(d.error || 'Failed'); }
  };

  const addTxn = async () => {
    if (!tAccount || !tAmount) return;
    const res = await fetch('/api/admin/banking/transactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bank_account_id: tAccount, amount: Number(tAmount), description: tDesc.trim() || null, transaction_date: tDate || null }),
    });
    if (res.ok) { setShowAddTxn(false); setTAmount(''); setTDesc(''); setTDate(''); load(); }
    else { const d = await res.json(); setError(d.error || 'Failed'); }
  };

  // The Reconciliation tab needs ALL transactions to show truthful
  // reconciled/unreconciled counts — the Transactions tab list is loaded
  // through the status filter (default 'unreconciled'), which previously
  // fed this tab too and pinned its Reconciled count at 0 forever.
  const [recTxns, setRecTxns] = useState<Txn[]>([]);
  const loadRec = async () => {
    try {
      const res = await fetch('/api/admin/banking/transactions?match_status=all', { cache: 'no-store' });
      if (res.ok) setRecTxns((await res.json()).transactions || []);
    } catch { /* surfaced by the main load() error path */ }
  };
  useEffect(() => { if (tab === 'reconcile') loadRec(); }, [tab]);

  const reconcile = async (id: string, unreconcile = false) => {
    const res = await fetch('/api/admin/banking/reconcile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: id, unreconcile }),
    });
    if (res.ok) { load(); loadRec(); } else { const d = await res.json(); setError(d.error || 'Failed'); }
  };

  const deactivate = async (id: string) => {
    if (!confirm('Deactivate this account? Its history is kept.')) return;
    const res = await fetch(`/api/admin/banking/accounts/${id}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  // SA-84 — Connect Account via Stripe Connect (the only connection model).
  const [connecting, setConnecting] = useState(false);
  const connectBank = async () => {
    setConnecting(true); setError(null);
    try {
      const res = await fetch('/api/admin/stripe-connections/connect', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) throw new Error(d.error || 'Could not start Stripe onboarding');
      window.location.href = d.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start Stripe onboarding');
      setConnecting(false);
    }
  };

  // Stripe Financial Connections — collect the business's own bank
  // accounts through Stripe's hosted flow and link them as tracked
  // accounts (provider 'stripe_financial_connections'). Any Stripe-side
  // refusal (FC not enabled, platform under review) surfaces verbatim.
  const [fcBusy, setFcBusy] = useState(false);
  const [fcMsg, setFcMsg] = useState<string | null>(null);
  const connectFinancialConnections = async () => {
    setFcBusy(true); setFcMsg(null);
    try {
      const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!key) throw new Error('Stripe publishable key is not configured on this deployment.');
      const sessRes = await fetch('/api/admin/banking/financial-connections/session', { method: 'POST' });
      const sess = await sessRes.json().catch(() => ({}));
      if (!sessRes.ok || !sess.clientSecret) throw new Error(sess.error || 'Could not start Financial Connections');
      const { loadStripe } = await import('@stripe/stripe-js');
      const stripe = await loadStripe(key);
      if (!stripe) throw new Error('Stripe.js failed to load.');
      const collect = stripe as unknown as {
        collectFinancialConnectionsAccounts: (opts: { clientSecret: string }) => Promise<{
          financialConnectionsSession?: { accounts?: { data?: any[] } };
          error?: { message?: string };
        }>;
      };
      const result = await collect.collectFinancialConnectionsAccounts({ clientSecret: sess.clientSecret });
      if (result.error) throw new Error(result.error.message || 'Financial Connections was cancelled or failed.');
      const collected = result.financialConnectionsSession?.accounts?.data || [];
      if (collected.length === 0) { setFcMsg('No accounts were selected — nothing was linked.'); return; }
      const linkRes = await fetch('/api/admin/banking/financial-connections/link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: collected.map((a: any) => ({ id: a.id, display_name: a.display_name, institution_name: a.institution_name, last4: a.last4, subtype: a.subtype })) }),
      });
      const link = await linkRes.json().catch(() => ({}));
      if (!linkRes.ok) throw new Error(link.error || 'Linking failed');
      setFcMsg(`Linked ${link.linked} account(s)${link.skipped ? `, ${link.skipped} already tracked` : ''}. Balances sync from the linked accounts.`);
      load();
    } catch (e) {
      setFcMsg(e instanceof Error ? e.message : 'Financial Connections failed');
    } finally { setFcBusy(false); }
  };

  // SA-86 — View Payouts: real inbound deposits/payouts from bank transactions.
  const [payouts, setPayouts] = useState<any[] | null>(null);
  const [payoutTotal, setPayoutTotal] = useState(0);
  const [stripeConn, setStripeConn] = useState<any>(null);
  useEffect(() => {
    if (tab !== 'payouts' || payouts !== null) return;
    (async () => {
      try {
        const res = await fetch('/api/admin/finance/actions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'fin_bank_payouts', payload: {} }),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok && d.bankPayouts) {
          setPayouts(d.bankPayouts.payouts || []);
          setPayoutTotal(d.bankPayouts.totals?.totalPayouts || 0);
          setStripeConn(d.bankPayouts.stripeConnection || null);
        } else { setPayouts([]); setError(d.error || 'Failed to load payouts'); }
      } catch { setPayouts([]); }
    })();
  }, [tab, payouts]);

  if (loading) return <div className="p-6 text-muted-foreground">Loading banking…</div>;

  return (
    <div className="flex flex-col w-full text-foreground bg-card">
      <div className="p-6 border-b border-border">
        <h1 className="font-display text-xl font-semibold tracking-tight">Banking & Reconciliation</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5 max-w-3xl">
          Manual bank account tracking and reconciliation. There is no live bank feed —
          balances and transactions are entered by hand until a bank integration is connected.
        </p>
      </div>

      <div className="px-6 pt-4 flex items-center gap-2 border-b border-border">
        {([['accounts', 'Bank Accounts'], ['transactions', 'Transactions'], ['reconcile', 'Reconciliation'], ['payouts', 'Payouts']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px cursor-pointer ${
              tab === t ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="px-6 pt-4 text-[12px] text-destructive">{error}</p>}

      {tab === 'accounts' && (
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted-foreground">{accounts.length} account{accounts.length === 1 ? '' : 's'}</p>
            <button onClick={() => setShowAdd(true)}
              className="px-3 py-1.5 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[12px] font-semibold hover:opacity-90 cursor-pointer">
              + Add Account
            </button>
          </div>

          {/* SA-84 — Connect via Stripe Connect ONLY. Bank details are
              entered on Stripe's hosted onboarding pages; nothing is typed
              into or stored in this app. Accounts below are tracked
              manually for reconciliation — they are not connections. */}
          <div className="border border-dashed border-border rounded-lg p-4 flex items-center justify-between bg-muted/20">
            <div>
              <p className="text-[13px] font-semibold">Connect your bank via Stripe</p>
              <p className="text-[12px] text-muted-foreground">Payouts and payroll funding run on your Stripe Connect account. Stripe collects your bank details on its secure pages — never here. Accounts below are tracked manually for reconciliation.</p>
              <p className="text-[12px] text-warning mt-1">Processor notice: Stripe has currently disabled this platform (payouts and Connect off, review pending) — onboarding cannot complete until Stripe reinstates it or a replacement processor is chosen. Manual account tracking and reconciliation below are unaffected.</p>
            </div>
            <button onClick={connectBank} disabled={connecting}
              title="Start Stripe Connect onboarding — bank details are entered on Stripe only"
              className="px-3 py-1.5 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[12px] font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50 shrink-0 ml-4">
              {connecting ? 'Opening Stripe…' : 'Connect Bank'}
            </button>
            <button onClick={connectFinancialConnections} disabled={fcBusy}
              title="Link this business's bank accounts through Stripe Financial Connections — balances and transactions stay in sync"
              className="px-3 py-1.5 border border-border rounded-lg text-[12px] font-semibold hover:bg-muted cursor-pointer disabled:opacity-50 shrink-0 ml-2">
              {fcBusy ? 'Opening…' : 'Link Bank Accounts (Financial Connections)'}
            </button>
          </div>
          {fcMsg && <p className="text-[12px] border border-border rounded-lg px-3 py-2 bg-muted/30">{fcMsg}</p>}

          {accounts.length === 0 ? (
            <div className="border border-border rounded-lg p-12 text-center text-muted-foreground text-[13px]">
              No bank accounts yet. Add one to start tracking balances manually.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {accounts.map((a) => (
                <div key={a.id} className="border border-border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-[14px]">{a.name}</p>
                    {!a.is_active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Inactive</span>}
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {a.institution_name || '—'}{a.masked_account_number ? ` •••• ${a.masked_account_number}` : ''} · {a.account_type}
                  </p>
                  <p className="text-[20px] font-bold tabular-nums">{money(a.ledger_balance)}</p>
                  <p className="text-[11px] text-muted-foreground">{a.txn_count} transactions</p>
                  {a.is_active && (
                    <button onClick={() => deactivate(a.id)}
                      className="text-[11px] text-destructive hover:underline cursor-pointer">Deactivate</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {showAdd && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/90 p-4">
              <div className="w-full max-w-sm bg-card rounded-2xl border border-border p-6 space-y-3">
                <h3 className="text-[15px] font-semibold">Add Bank Account</h3>
                <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Account name *"
                  className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-foreground" />
                <input value={fInst} onChange={(e) => setFInst(e.target.value)} placeholder="Institution (e.g. Chase)"
                  className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-foreground" />
                <div className="grid grid-cols-2 gap-2">
                  <select value={fType} onChange={(e) => setFType(e.target.value)}
                    className="border border-border rounded-lg px-3 py-2 text-[13px] cursor-pointer">
                    <option value="checking">Checking</option>
                    <option value="business_checking">Business Checking</option>
                    <option value="savings">Savings</option>
                    <option value="credit">Credit</option>
                  </select>
                  <input value={fLast4} onChange={(e) => setFLast4(e.target.value)} placeholder="Last 4"
                    maxLength={4}
                    className="border border-border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-foreground" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted cursor-pointer">Cancel</button>
                  <button onClick={addAccount} className="flex-1 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[13px] font-semibold cursor-pointer">Add</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'transactions' && (
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {(['unreconciled', 'reconciled', 'all'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium capitalize cursor-pointer ${
                    filter === f ? 'bg-brand-teal/10 text-brand-teal' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}>
                  {f}
                </button>
              ))}
            </div>
            <button onClick={() => { setTAccount(accounts[0]?.id || ''); setShowAddTxn(true); }}
              className="px-3 py-1.5 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[12px] font-semibold hover:opacity-90 cursor-pointer">
              + Add Transaction
            </button>
          </div>
          {txns.length === 0 ? (
            <div className="border border-border rounded-lg p-12 text-center text-muted-foreground text-[13px]">
              No {filter !== 'all' ? filter + ' ' : ''}transactions. Add bank transactions manually to reconcile them against the ledger.
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[11px] uppercase">
                    <th className="p-3">Date</th><th className="p-3">Account</th><th className="p-3">Description</th>
                    <th className="p-3 text-right">Amount</th><th className="p-3">Status</th><th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {txns.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="p-3 text-muted-foreground">{t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '—'}</td>
                      <td className="p-3">{t.account_name}</td>
                      <td className="p-3">{t.description || t.payee || '—'}</td>
                      <td className={`p-3 text-right font-semibold tabular-nums ${Number(t.amount) < 0 ? 'text-destructive' : 'text-success'}`}>
                        {money(t.amount)}
                      </td>
                      <td className="p-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${t.match_status === 'reconciled' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                          {t.match_status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {t.match_status === 'reconciled' ? (
                          <button onClick={() => reconcile(t.id, true)} className="text-[11px] text-muted-foreground hover:underline cursor-pointer">Unreconcile</button>
                        ) : (
                          <button onClick={() => reconcile(t.id)} className="text-[11px] text-foreground font-medium hover:underline cursor-pointer">Reconcile</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showAddTxn && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/90 p-4">
              <div className="w-full max-w-sm bg-card rounded-2xl border border-border p-6 space-y-3">
                <h3 className="text-[15px] font-semibold">Add Transaction</h3>
                <select value={tAccount} onChange={(e) => setTAccount(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-[13px] cursor-pointer">
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <input type="number" step="0.01" value={tAmount} onChange={(e) => setTAmount(e.target.value)}
                  placeholder="Amount (negative = outflow)"
                  className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-foreground" />
                <input value={tDesc} onChange={(e) => setTDesc(e.target.value)} placeholder="Description"
                  className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-foreground" />
                <input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-[13px] cursor-pointer" />
                <div className="flex gap-2">
                  <button onClick={() => setShowAddTxn(false)} className="flex-1 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted cursor-pointer">Cancel</button>
                  <button onClick={addTxn} className="flex-1 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[13px] font-semibold cursor-pointer">Add</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'reconcile' && (
        <div className="p-6 space-y-4">
          <p className="text-[13px] text-muted-foreground max-w-3xl">
            Reconciliation matches bank transactions against general-ledger journal entries.
            Mark a transaction reconciled once you've verified it against the books.
          </p>
          {(() => {
            const unrec = recTxns.filter((t) => t.match_status !== 'reconciled');
            const rec = recTxns.filter((t) => t.match_status === 'reconciled');
            const unrecTotal = unrec.reduce((s, t) => s + Number(t.amount), 0);
            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="border border-border rounded-lg p-4">
                    <p className="text-[10px] uppercase text-muted-foreground font-semibold">Unreconciled</p>
                    <p className="text-[20px] font-bold tabular-nums mt-1">{unrec.length}</p>
                  </div>
                  <div className="border border-border rounded-lg p-4">
                    <p className="text-[10px] uppercase text-muted-foreground font-semibold">Unreconciled Total</p>
                    <p className="text-[20px] font-bold tabular-nums mt-1">{money(unrecTotal)}</p>
                  </div>
                  <div className="border border-border rounded-lg p-4">
                    <p className="text-[10px] uppercase text-muted-foreground font-semibold">Reconciled</p>
                    <p className="text-[20px] font-bold tabular-nums mt-1">{rec.length}</p>
                  </div>
                </div>
                {unrec.length === 0 ? (
                  <div className="border border-border rounded-lg p-12 text-center text-muted-foreground text-[13px]">
                    Everything is reconciled. Add bank transactions under the Transactions tab to reconcile them here.
                  </div>
                ) : (
                  <div className="border border-border rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-[11px] uppercase">
                          <th className="p-3">Date</th><th className="p-3">Account</th><th className="p-3">Description</th>
                          <th className="p-3 text-right">Amount</th><th className="p-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {unrec.map((t) => (
                          <tr key={t.id} className="hover:bg-muted/30">
                            <td className="p-3 text-muted-foreground">{t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '—'}</td>
                            <td className="p-3">{t.account_name}</td>
                            <td className="p-3">{t.description || t.payee || '—'}</td>
                            <td className={`p-3 text-right font-semibold tabular-nums ${Number(t.amount) < 0 ? 'text-destructive' : 'text-success'}`}>{money(t.amount)}</td>
                            <td className="p-3 text-right">
                              <button onClick={() => reconcile(t.id)} className="text-[11px] font-medium hover:underline cursor-pointer">Mark Reconciled</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {tab === 'payouts' && (
        <div className="p-6 space-y-4">
          <p className="text-[13px] text-muted-foreground max-w-3xl">
            Inbound deposits and payouts recorded as bank transactions (read-only).
            {stripeConn && !stripeConn.connected && ' No Stripe account is connected yet — connect one under Financial → Stripe Connections or with Connect Bank on the Bank Accounts tab.'}
            {stripeConn?.connected && !stripeConn.onboardingComplete && ' Your Stripe account is connected but onboarding is incomplete, so Stripe payouts are not enabled yet.'}
            {stripeConn?.connected && stripeConn.onboardingComplete && ' Stripe payouts are enabled on your connected account; payouts recorded as bank transactions are listed below.'}
          </p>
          {payouts === null ? (
            <div className="border border-border rounded-lg p-12 text-center text-muted-foreground text-[13px]">Loading payouts…</div>
          ) : payouts.length === 0 ? (
            <div className="border border-border rounded-lg p-12 text-center text-muted-foreground text-[13px] space-y-2">
              <p className="font-semibold text-foreground">No payouts recorded</p>
              <p>No inbound deposits or payouts have been recorded as bank transactions yet.</p>
            </div>
          ) : (
            <>
              <p className="text-[13px] text-muted-foreground">{payouts.length} payout{payouts.length === 1 ? '' : 's'} · total {money(payoutTotal)}</p>
              <div className="border border-border rounded-lg overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-[11px] uppercase">
                      <th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3">Payee</th>
                      <th className="p-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payouts.map((p: any) => (
                      <tr key={p.transactionId} className="hover:bg-muted/30">
                        <td className="p-3 text-muted-foreground">{p.date ? new Date(p.date).toLocaleDateString() : '—'}</td>
                        <td className="p-3">{p.description || '—'}</td>
                        <td className="p-3">{p.payee || '—'}</td>
                        <td className="p-3 text-right font-semibold tabular-nums text-success">{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

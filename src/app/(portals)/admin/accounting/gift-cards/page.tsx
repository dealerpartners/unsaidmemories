'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

// /admin/accounting/gift-cards — Gift Cards & Store Credit
// (owner's gift_cards_store_credit.html rebuilt as a real
// route): the card register with his columns (Card / Voucher
// Code, Customer / Recipient, Issue Date, Original Value,
// Current Balance, Status, Last Activity, Actions) and the
// ASC 606 breakage schedule. Breakage on this page is an
// ESTIMATE — balances on cards inactive 12+ months, with the
// assumption printed on the schedule — while "recognized
// breakage" is the real posted figure from expire transactions.
// Issue / Top Up / Redeem / Freeze / Expire / Replace all run
// through the journal-posting gift-cards API.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);

type Card = {
  id: string; code: string; kind: string; status: string;
  initial_amount: number; balance: number; issued_to_email: string | null;
  issued_reason: string | null; expires_at: string | null;
  created_at: string; last_activity_at: string; months_inactive: number;
};
type Txn = { id: string; gift_card_id: string; txn_type: string; amount: number; balance_after: number; notes: string | null; reference: string | null; created_at: string };
type Breakage = { windowMonths: number; outstanding: number; current: number; aging6to12: number; estimatedBreakage: number; recognizedBreakage: number };

const TABS = [
  { key: 'all', label: 'All Cards' },
  { key: 'funded', label: 'Active & Funded' },
  { key: 'zero', label: 'Zero Balance' },
  { key: 'expired', label: 'Expired' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function GiftCardsStoreCreditPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [breakage, setBreakage] = useState<Breakage | null>(null);
  const [summary, setSummary] = useState<{ total: number; active: number; funded: number; zeroBalance: number; expired: number; outstanding: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ kind: 'gift_card', amount: '', email: '', reason: '', expires_at: '' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/gift-cards', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setCards((Array.isArray(d.cards) ? d.cards : []).map((c: any) => ({ ...c, initial_amount: Number(c.initial_amount || 0), balance: Number(c.balance || 0) })));
        setTxns((Array.isArray(d.transactions) ? d.transactions : []).map((t: any) => ({ ...t, amount: Number(t.amount || 0), balance_after: Number(t.balance_after || 0) })));
        setBreakage(d.breakage || null);
        setSummary(d.summary || null);
      })
      .catch(() => setError('Gift cards could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    let rows = cards;
    if (tab === 'funded') rows = rows.filter((c) => c.status === 'active' && c.balance > 0);
    if (tab === 'zero') rows = rows.filter((c) => c.balance === 0);
    if (tab === 'expired') rows = rows.filter((c) => c.status === 'expired');
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((c) => [c.code, c.kind, c.status, c.issued_to_email || '', c.issued_reason || ''].join(' ').toLowerCase().includes(q));
    }
    return rows;
  }, [cards, tab, search]);

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/admin/accounting/gift-cards', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.ok === false) throw new Error(j?.error || 'Action failed');
    return j;
  };

  const act = async (c: Card, action: string) => {
    let amount: number | undefined;
    if (action === 'add_value' || action === 'redeem') {
      const raw = window.prompt(action === 'add_value' ? `Add how much value to ${c.code}?` : `Redeem how much from ${c.code} (balance ${fmt(c.balance)})?`);
      if (raw === null) return;
      amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0) { setError('Enter an amount greater than zero.'); return; }
    }
    if (action === 'expire' && !window.confirm(`Expire ${c.code}? Its remaining balance of ${fmt(c.balance)} is recognized as breakage revenue in the books.`)) return;
    if (action === 'void' && !window.confirm(`Void ${c.code}? It can no longer be used.`)) return;
    setBusy(c.id); setError(null); setNotice(null);
    try {
      const j = await post({ action, id: c.id, ...(amount !== undefined ? { amount } : {}) });
      setNotice(action === 'replace'
        ? `${c.code} replaced — new code ${j.code} carries the balance.`
        : `${c.code}: ${action.replace(/_/g, ' ')} completed.`);
      load();
    } catch (e: any) { setError(e?.message || 'Action failed'); }
    finally { setBusy(null); }
  };

  const issue = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter the card value.'); return; }
    setBusy('issue'); setError(null); setNotice(null);
    try {
      const j = await post({ action: 'issue', kind: form.kind, amount, email: form.email || null, reason: form.reason || null, expires_at: form.expires_at || null });
      setNotice(`${form.kind === 'store_credit' ? 'Store credit' : 'Gift card'} ${j.code} issued for ${fmt(amount)} — it is in the register below.`);
      setShowForm(false);
      setForm({ kind: 'gift_card', amount: '', email: '', reason: '', expires_at: '' });
      load();
    } catch (e: any) { setError(e?.message || 'Issue failed'); }
    finally { setBusy(null); }
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Gift Cards &amp; Store Credit</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, email, status…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
          <button type="button" onClick={() => setShowForm((s) => !s)} data-tip="Issues a new gift card or store credit; the sale posts to the books right away"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium">
            <Plus className="size-4" /> Issue Gift Voucher / Credit
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={issue} className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-3">Issue Gift Card / Store Credit</div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div><label className={labelCls}>Type</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inputCls}>
                <option value="gift_card">Gift Card</option>
                <option value="store_credit">Store Credit</option>
              </select></div>
            <div><label className={labelCls}>Value</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} required /></div>
            <div><label className={labelCls}>Recipient email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Reason</label>
              <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputCls} placeholder="Birthday gift, goodwill credit…" /></div>
            <div><label className={labelCls}>Expires (optional)</label>
              <input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} className={inputCls} /></div>
          </div>
          <button type="submit" disabled={busy === 'issue'} data-tip="Creates the card with a fresh code and posts the sale to the books"
            className="mt-4 h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
            {busy === 'issue' ? 'Issuing…' : 'Issue'}
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`h-8 px-3 rounded-full border text-[12.5px] font-medium ${tab === t.key ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'border-border bg-card text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Card / Voucher Code</th>
              <th className={thCls}>Customer / Recipient</th>
              <th className={thCls}>Issue Date</th>
              <th className={`${thCls} text-right`}>Original Value</th>
              <th className={`${thCls} text-right`}>Current Balance</th>
              <th className={thCls}>Status</th>
              <th className={thCls}>Last Activity</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">Loading cards…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">
                  {cards.length === 0
                    ? 'No gift cards or store credit yet. Cards sold at checkout and credits you issue here will appear in this register.'
                    : 'No cards match this view.'}
                </td></tr>
              ) : shown.map((c) => (
                <React.Fragment key={c.id}>
                  <tr className="hover:bg-accent/50">
                    <td className="p-3 border-r border-border font-semibold tabular-nums">{c.code}
                      <div className="text-[11px] font-normal text-muted-foreground">{c.kind === 'store_credit' ? 'Store Credit' : 'Gift Card'}</div></td>
                    <td className="p-3 border-r border-border">{c.issued_to_email || '—'}
                      {c.issued_reason ? <div className="text-[11px] text-muted-foreground">{c.issued_reason}</div> : null}</td>
                    <td className="p-3 border-r border-border tabular-nums">{String(c.created_at).slice(0, 10)}</td>
                    <td className="p-3 border-r border-border text-right tabular-nums">{fmt(c.initial_amount)}</td>
                    <td className="p-3 border-r border-border text-right font-semibold tabular-nums">{fmt(c.balance)}</td>
                    <td className="p-3 border-r border-border">{c.status}</td>
                    <td className="p-3 border-r border-border text-muted-foreground">{String(c.last_activity_at).slice(0, 10)}
                      <div className="text-[11px]">{c.months_inactive} mo ago</div></td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {c.status === 'active' && (
                        <>
                          <button type="button" disabled={busy === c.id} onClick={() => act(c, 'add_value')} data-tip="Adds value to this card and posts it to the books"
                            className="text-[12px] underline mr-3 disabled:opacity-50">Top Up</button>
                          <button type="button" disabled={busy === c.id} onClick={() => act(c, 'redeem')} data-tip="Spends value from this card against a sale"
                            className="text-[12px] underline mr-3 disabled:opacity-50">Redeem</button>
                          <button type="button" disabled={busy === c.id} onClick={() => act(c, 'deactivate')} data-tip="Freezes this card so it cannot be spent until reactivated"
                            className="text-[12px] underline mr-3 disabled:opacity-50">Freeze</button>
                          <button type="button" disabled={busy === c.id} onClick={() => act(c, 'expire')} data-tip="Expires this card and recognizes its leftover balance as breakage revenue"
                            className="text-[12px] underline mr-3 disabled:opacity-50">Expire</button>
                        </>
                      )}
                      {c.status === 'deactivated' && (
                        <button type="button" disabled={busy === c.id} onClick={() => act(c, 'reactivate')} data-tip="Unfreezes this card so it can be spent again"
                          className="text-[12px] underline mr-3 disabled:opacity-50">Reactivate</button>
                      )}
                      {!['voided', 'expired'].includes(c.status) && (
                        <button type="button" disabled={busy === c.id} onClick={() => act(c, 'replace')} data-tip="Voids this code and issues a replacement card carrying the same balance"
                          className="text-[12px] underline mr-3 disabled:opacity-50">Replace</button>
                      )}
                      <button type="button" onClick={() => setHistoryFor(historyFor === c.id ? null : c.id)} data-tip="Shows every transaction recorded against this card"
                        className="text-[12px] underline">History</button>
                    </td>
                  </tr>
                  {historyFor === c.id && (
                    <tr><td colSpan={8} className="bg-muted/30 p-3">
                      {txns.filter((t) => t.gift_card_id === c.id).length === 0
                        ? <span className="text-[12.5px] text-muted-foreground">No transactions recorded for this card.</span>
                        : txns.filter((t) => t.gift_card_id === c.id).map((t) => (
                          <div key={t.id} className="flex flex-wrap gap-x-4 text-[12.5px] py-0.5">
                            <span className="tabular-nums">{String(t.created_at).slice(0, 10)}</span>
                            <span className="font-medium">{t.txn_type.replace(/_/g, ' ')}</span>
                            <span className="tabular-nums">{fmt(t.amount)}</span>
                            <span className="text-muted-foreground">balance after {fmt(t.balance_after)}</span>
                            {t.notes ? <span className="text-muted-foreground">{t.notes}</span> : null}
                            {t.reference ? <span className="text-muted-foreground">ref {t.reference}</span> : null}
                          </div>
                        ))}
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table></div>
        </div>

        <h2 className="font-display text-lg font-semibold tracking-tight mt-8 mb-1">ASC 606 Revenue Recognition &amp; Breakage Schedule</h2>
        <p className="text-[13px] text-muted-foreground mb-3">
          Gift-card money is a liability until it is spent or it expires. The estimate below counts balances on cards with
          no activity for {breakage?.windowMonths ?? 12}+ months as likely breakage — an estimate for review, with that
          assumption stated; it posts nothing. Recognized breakage is the real figure already posted by card expirations.
        </p>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Bucket</th>
              <th className={thCls}>What it means</th>
              <th className="p-3 text-right">Amount</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              <tr><td className="p-3 border-r border-border font-medium">Outstanding liability</td>
                <td className="p-3 border-r border-border text-muted-foreground">Balances on all active cards and credits</td>
                <td className="p-3 text-right font-semibold tabular-nums">{fmt(breakage?.outstanding ?? 0)}</td></tr>
              <tr><td className="p-3 border-r border-border font-medium">Active (activity in last 6 months)</td>
                <td className="p-3 border-r border-border text-muted-foreground">Likely still to be spent</td>
                <td className="p-3 text-right tabular-nums">{fmt(breakage?.current ?? 0)}</td></tr>
              <tr><td className="p-3 border-r border-border font-medium">Aging (6–{breakage?.windowMonths ?? 12} months inactive)</td>
                <td className="p-3 border-r border-border text-muted-foreground">Going quiet — watch list</td>
                <td className="p-3 text-right tabular-nums">{fmt(breakage?.aging6to12 ?? 0)}</td></tr>
              <tr><td className="p-3 border-r border-border font-medium">Estimated breakage ({breakage?.windowMonths ?? 12}+ months inactive)</td>
                <td className="p-3 border-r border-border text-muted-foreground">Estimate only — expire a card from the register to actually recognize it</td>
                <td className="p-3 text-right font-semibold tabular-nums">{fmt(breakage?.estimatedBreakage ?? 0)}</td></tr>
              <tr><td className="p-3 border-r border-border font-medium">Recognized breakage (posted)</td>
                <td className="p-3 border-r border-border text-muted-foreground">Sum of expire transactions — already in the books as revenue</td>
                <td className="p-3 text-right tabular-nums">{fmt(breakage?.recognizedBreakage ?? 0)}</td></tr>
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

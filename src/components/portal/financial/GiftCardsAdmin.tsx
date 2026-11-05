'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  useIssueGiftCard,
  useAddGiftCardValue,
  useDeactivateGiftCard,
  useVoidGiftCard,
  useEditGiftCard,
  useSendGiftCardReceipt,
  useReissueGiftCard,
  useReactivateGiftCard,
  useExpireGiftCard,
  useCheckGiftCardBalance,
  useRedeemGiftCard,
  useTransferGiftCard,
  useReplaceGiftCard,
  useConvertGiftCardToCredit,
  useIssueStoreCredit,
  useSendGiftCardReminder,
} from '@/hooks/admin/useActions';

type Card = {
  id: string; card_number: string; initial_value: string; balance: string; status: string; card_format: string;
  recipient_name: string | null; recipient_email: string | null; sender_name: string | null;
  issued_at: string; last_used_at: string | null; design_name: string | null;
};
type Kpi = {
  total: number; active: number; liability: number; sold: number;
  issued_this_month?: number; issued_this_month_count?: number;
  redeemed_mtd?: number; expired_inactive?: number; avg_value?: number;
  store_credits_outstanding?: number; store_credits_count?: number;
};
type Design = { id: string; name: string; imageUrl: string; published: boolean };
type StoreCredit = {
  id: string; credit_number: string; customer_id: string | null;
  original_amount: string; balance: string; status: string; issued_at: string; expires_at: string | null;
};

const money = (n: number | string) => `$${Number(n).toFixed(2)}`;
const btn = 'h-8 px-3 rounded-lg border border-border bg-background text-[12px] font-medium hover:bg-accent cursor-pointer disabled:opacity-50';

type CardTab = 'designs' | 'cards' | 'digital' | 'physical' | 'credits' | 'depleted';

export function GiftCardsAdmin() {
  const [tab, setTab] = useState<CardTab>('designs');
  const [cards, setCards] = useState<Card[]>([]);
  const [kpi, setKpi] = useState<Kpi>({ total: 0, active: 0, liability: 0, sold: 0 });
  const [designs, setDesigns] = useState<Design[]>([]);
  const [storeCredits, setStoreCredits] = useState<StoreCredit[]>([]);
  const [q, setQ] = useState('');
  const [formatFilter, setFormatFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [issuedFilter, setIssuedFilter] = useState('all');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const issueGiftCard = useIssueGiftCard();
  const addGiftCardValue = useAddGiftCardValue();
  const deactivateGiftCard = useDeactivateGiftCard();
  const voidGiftCard = useVoidGiftCard();
  const editGiftCard = useEditGiftCard();
  const sendGiftCardReceipt = useSendGiftCardReceipt();
  const reissueGiftCard = useReissueGiftCard();
  const reactivateGiftCard = useReactivateGiftCard();
  const expireGiftCard = useExpireGiftCard();
  const checkGiftCardBalance = useCheckGiftCardBalance();
  const redeemGiftCard = useRedeemGiftCard();
  const transferGiftCard = useTransferGiftCard();
  const replaceGiftCard = useReplaceGiftCard();
  const convertGiftCardToCredit = useConvertGiftCardToCredit();
  const issueStoreCredit = useIssueStoreCredit();
  const sendGiftCardReminder = useSendGiftCardReminder();
  const [cardBusy, setCardBusy] = useState<string | null>(null);

  const runCardAction = async (cardId: string, label: string, fn: () => Promise<unknown>) => {
    setCardBusy(`${cardId}:${label}`);
    try {
      await fn();
      await load();
    } catch (e: any) {
      setMsg(e?.message || `${label} failed`);
    } finally {
      setCardBusy(null);
    }
  };

  const handleIssueCard = async () => {
    const email = window.prompt('Recipient email:');
    if (!email) return;
    const amountStr = window.prompt('Card value (USD):', '50');
    const cents = Math.round(parseFloat(amountStr || '0') * 100);
    if (!cents || cents <= 0) { setMsg('Enter a valid amount'); return; }
    setBusy(true);
    try {
      await issueGiftCard.mutateAsync({ recipient_email: email, initial_balance: cents / 100 } as never);
      setMsg('Gift card issued.');
      await load();
    } catch (e: any) { setMsg(e?.message || 'Issue failed'); } finally { setBusy(false); }
  };

  const load = useCallback(async () => {
    const [c, d] = await Promise.all([
      fetch('/api/admin/gift-cards').then((r) => r.json()).catch(() => null),
      fetch('/api/admin/gift-card-designs').then((r) => r.json()).catch(() => null),
    ]);
    if (c) { setCards(c.cards || []); setKpi(c.kpi || { total: 0, active: 0, liability: 0, sold: 0 }); setStoreCredits(c.store_credits || []); }
    if (d) setDesigns(d.designs || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addDesign(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !name.trim()) return;
    setBusy(true); setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('path', 'gift-cards');
      const up = await fetch('/api/admin/media', { method: 'POST', body: fd });
      const upj = await up.json();
      if (!up.ok) throw new Error(upj.error || 'Upload failed');
      const res = await fetch('/api/admin/gift-card-designs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, imageUrl: upj.url }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not save design');
      setName(''); setFile(null);
      (document.getElementById('gc-design-file') as HTMLInputElement | null)?.value && ((document.getElementById('gc-design-file') as HTMLInputElement).value = '');
      setMsg('Design saved as a draft. Publish it to show it on the gift card page.');
      await load();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  async function patch(id: string, body: object) {
    await fetch('/api/admin/gift-card-designs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) });
    await load();
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this design? Cards already sold keep working.')) return;
    await fetch(`/api/admin/gift-card-designs?id=${id}`, { method: 'DELETE' });
    await load();
  }

  const shown = cards.filter((c) => {
    const s = q.trim().toLowerCase();
    if (s && ![c.card_number, c.recipient_name, c.recipient_email, c.sender_name].some((v) => (v || '').toLowerCase().includes(s))) return false;
    if (tab === 'digital' && c.card_format !== 'digital') return false;
    if (tab === 'physical' && c.card_format !== 'physical') return false;
    if (tab === 'depleted' && Number(c.balance) > 0) return false;
    if (formatFilter !== 'all' && c.card_format !== formatFilter) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (balanceFilter === 'with_balance' && Number(c.balance) <= 0) return false;
    if (balanceFilter === 'zero' && Number(c.balance) > 0) return false;
    if (issuedFilter !== 'all' && c.issued_at) {
      const t = new Date(c.issued_at).getTime();
      const now = Date.now();
      if (issuedFilter === 'mtd' && c.issued_at.slice(0, 7) !== new Date().toISOString().slice(0, 7)) return false;
      if (issuedFilter === '30d' && t < now - 30 * 24 * 3600 * 1000) return false;
    }
    return true;
  });

  const isCardTab = tab !== 'designs' && tab !== 'credits';
  const tabLabel: Record<CardTab, string> = {
    designs: 'Designs', cards: 'All Cards', digital: 'Digital Cards',
    physical: 'Physical Cards', credits: 'Store Credits', depleted: 'Depleted',
  };

  const handleIssueStoreCredit = async () => {
    const customerId = window.prompt('Customer ID (UUID) for the store credit:');
    if (!customerId) return;
    const amountStr = window.prompt('Credit amount (USD):', '25');
    const amount = parseFloat(amountStr || '0');
    if (!amount || amount <= 0) { setMsg('Enter a valid amount'); return; }
    setBusy(true);
    try {
      await issueStoreCredit.mutateAsync({ customer_id: customerId, amount });
      setMsg('Store credit issued.');
      await load();
    } catch (e: any) { setMsg(e?.message || 'Issue failed'); } finally { setBusy(false); }
  };

  return (
    <div className="w-full p-6 text-foreground">
      <h1 className="text-xl font-semibold">Gift Cards &amp; Credits</h1>
      <div className="mt-4 flex gap-2 items-center flex-wrap">
        {(['designs', 'cards', 'digital', 'physical', 'credits', 'depleted'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`${btn} ${tab === t ? 'bg-primary text-primary-foreground' : ''}`}>
            {tabLabel[t]}{t === 'credits' && kpi.store_credits_count ? ` (${kpi.store_credits_count})` : ''}
          </button>
        ))}
        {isCardTab && (
          <>
            <button onClick={handleIssueCard} disabled={busy} className={`${btn} ml-auto bg-primary text-primary-foreground`}>
              + Issue Gift Card
            </button>
            <button onClick={handleIssueStoreCredit} disabled={busy} className={btn}>
              + Issue Store Credit
            </button>
          </>
        )}
        {tab === 'credits' && (
          <button onClick={handleIssueStoreCredit} disabled={busy} className={`${btn} ml-auto bg-primary text-primary-foreground`}>
            + Issue Store Credit
          </button>
        )}
      </div>

      {tab === 'designs' && (
        <div className="mt-6 space-y-6">
          <form onSubmit={addDesign} className="rounded-xl border border-border bg-card p-4 space-y-3 max-w-xl">
            <h2 className="text-sm font-semibold">Add a design</h2>
            <p className="text-[12px] text-muted-foreground">
              Upload artwork at 1600 × 1009 px (credit-card shape), JPG or WebP under 300 KB. Keep the bottom-left calm: the amount and names print there.
            </p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Design name, e.g. Spring Paws" className="w-full h-9 rounded-lg border border-input bg-background px-3 text-[13px]" />
            <input id="gc-design-file" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-[12px]" />
            <div><button disabled={busy || !file || !name.trim()} className={btn}>{busy ? 'Uploading…' : 'Save design'}</button></div>
            {msg && <p className="text-[12px] text-muted-foreground">{msg}</p>}
          </form>

          {designs.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No designs yet. Until one is published, buyers see the default card.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {designs.map((d) => (
                <div key={d.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.imageUrl} alt={d.name} className="aspect-[1.586/1] w-full object-cover" />
                  <div className="p-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold">{d.name}</p>
                      <p className={`text-[11px] ${d.published ? 'text-success' : 'text-muted-foreground'}`}>{d.published ? 'Published' : 'Draft'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className={btn} onClick={() => patch(d.id, { published: !d.published })}>{d.published ? 'Unpublish' : 'Publish'}</button>
                      <button className={btn} onClick={() => remove(d.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isCardTab && (
        <div className="mt-6">
          {msg && <p className="mb-3 text-[12px] text-muted-foreground">{msg}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Outstanding balance', money(kpi.liability)],
              ['Active cards', String(kpi.active)],
              ['Total sold', money(kpi.sold)],
              ['Cards issued', String(kpi.total)],
              ['Redeemed (MTD)', money(kpi.redeemed_mtd || 0)],
              ['Issued this month', money(kpi.issued_this_month || 0)],
              ['Store credits outstanding', money(kpi.store_credits_outstanding || 0)],
              ['Expired', String(kpi.expired_inactive || 0)],
              ['Average card value', money(kpi.avg_value || 0)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] uppercase text-muted-foreground">{l}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search card number, recipient, sender…" className="w-full max-w-sm h-9 rounded-lg border border-input bg-background px-3 text-[13px]" />
            <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-[12px]" aria-label="Card type filter">
              <option value="all">Type: All</option>
              <option value="digital">Digital</option>
              <option value="physical">Physical</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-[12px]" aria-label="Status filter">
              <option value="all">Status: All</option>
              <option value="active">Active</option>
              <option value="partially_redeemed">Partially redeemed</option>
              <option value="redeemed">Redeemed</option>
              <option value="expired">Expired</option>
              <option value="converted">Converted</option>
              <option value="cancelled">Cancelled</option>
              <option value="replaced">Replaced</option>
            </select>
            <select value={balanceFilter} onChange={(e) => setBalanceFilter(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-[12px]" aria-label="Balance filter">
              <option value="all">Balance: All</option>
              <option value="with_balance">With balance</option>
              <option value="zero">Zero balance</option>
            </select>
            <select value={issuedFilter} onChange={(e) => setIssuedFilter(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-[12px]" aria-label="Issued filter">
              <option value="all">Issued: All</option>
              <option value="mtd">This month</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-[12px]">
              <thead className="text-left text-muted-foreground">
                <tr>{['Card', 'Recipient', 'From', 'Value', 'Balance', 'Status', 'Design', 'Issued', 'Last Used', 'Actions'].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const busyKey = (label: string) => cardBusy === `${c.id}:${label}`;
                  const smallBtn = 'h-7 px-2 rounded-lg border border-border bg-background text-[11px] font-medium hover:bg-accent cursor-pointer disabled:opacity-50 whitespace-nowrap';
                  const act = (label: string, fn: () => Promise<unknown>) =>
                    runCardAction(c.id, label, fn);
                  return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3 font-semibold tabular-nums">{c.card_number}<div className="text-[10px] text-muted-foreground capitalize">{c.card_format || 'digital'}</div></td>
                    <td className="p-3">{c.recipient_name || '—'}<div className="text-[10px] text-muted-foreground">{c.recipient_email}</div></td>
                    <td className="p-3">{c.sender_name || '—'}</td>
                    <td className="p-3 tabular-nums">{money(c.initial_value)}</td>
                    <td className="p-3 tabular-nums">{money(c.balance)}</td>
                    <td className="p-3 capitalize">{c.status.replace('_', ' ')}</td>
                    <td className="p-3">{c.design_name || 'Default'}</td>
                    <td className="p-3 tabular-nums">{new Date(c.issued_at).toLocaleDateString()}</td>
                    <td className="p-3 tabular-nums">{c.last_used_at ? new Date(c.last_used_at).toLocaleDateString() : '—'}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        <button className={smallBtn} disabled={!!cardBusy}
                          onClick={() => {
                            const amt = window.prompt('Add value (USD):', '25');
                            const cents = Math.round(parseFloat(amt || '0') * 100);
                            if (cents > 0) act('Add value', () => addGiftCardValue.mutateAsync({ card_id: c.id, amount_cents: cents }));
                          }}>
                          {busyKey('Add value') ? '…' : '+ Value'}
                        </button>
                        <button className={smallBtn} disabled={!!cardBusy}
                          onClick={() => act('Balance', () => checkGiftCardBalance.mutateAsync({ card_number: c.card_number } as never).then((r: any) => { setMsg(`Balance: ${money(r?.balance ?? c.balance)}`); }))}>
                          {busyKey('Balance') ? '…' : 'Balance'}
                        </button>
                        {(c.status === 'active' || c.status === 'partially_redeemed') && (
                          <>
                            <button className={smallBtn} disabled={!!cardBusy}
                              onClick={() => {
                                const amt = window.prompt(`Redeem amount from ${c.card_number} (USD):`, c.balance);
                                const amount = parseFloat(amt || '0');
                                if (amount > 0) act('Redeem', () => redeemGiftCard.mutateAsync({ card_number: c.card_number, amount }));
                              }}>
                              {busyKey('Redeem') ? '…' : 'Redeem'}
                            </button>
                            <button className={smallBtn} disabled={!!cardBusy}
                              onClick={() => {
                                const newCustomerId = window.prompt('Transfer to customer ID (UUID):');
                                if (newCustomerId) act('Transfer', () => transferGiftCard.mutateAsync({ card_id: c.id, new_customer_id: newCustomerId }));
                              }}>
                              {busyKey('Transfer') ? '…' : 'Transfer'}
                            </button>
                            <button className={smallBtn} disabled={!!cardBusy}
                              onClick={() => window.confirm(`Convert ${c.card_number} remaining balance to store credit?`) && act('Convert', () => convertGiftCardToCredit.mutateAsync({ gift_card_id: c.id } as never))}>
                              {busyKey('Convert') ? '…' : 'To Credit'}
                            </button>
                            <button className={smallBtn} disabled={!!cardBusy}
                              onClick={() => {
                                const reason = window.prompt('Replace reason:', 'lost') || 'lost';
                                act('Replace', () => replaceGiftCard.mutateAsync({ card_id: c.id, reason }));
                              }}>
                              {busyKey('Replace') ? '…' : 'Replace'}
                            </button>
                            <button className={smallBtn} disabled={!!cardBusy}
                              onClick={() => act('Remind', () => sendGiftCardReminder.mutateAsync({ card_id: c.id }).then(() => setMsg('Reminder sent.'))) }>
                              {busyKey('Remind') ? '…' : 'Remind'}
                            </button>
                          </>
                        )}
                        {c.status === 'active' ? (
                          <>
                            <button className={smallBtn} disabled={!!cardBusy}
                              onClick={() => {
                                const reason = window.prompt(`Deactivate ${c.card_number} — reason (balance is preserved):`, 'Customer request');
                                if (reason) act('Deactivate', () => deactivateGiftCard.mutateAsync({ card_id: c.id, reason }));
                              }}>
                              {busyKey('Deactivate') ? '…' : 'Deactivate'}
                            </button>
                            <button className={smallBtn} disabled={!!cardBusy}
                              onClick={() => {
                                const name = window.prompt('Recipient name:', c.recipient_name || '');
                                if (name === null) return;
                                const email = window.prompt('Recipient email:', c.recipient_email || '');
                                if (email === null) return;
                                act('Edit', () => editGiftCard.mutateAsync({ card_id: c.id, recipient_name: name, recipient_email: email }));
                              }}>
                              {busyKey('Edit') ? '…' : 'Edit'}
                            </button>
                            <button className={smallBtn} disabled={!!cardBusy}
                              onClick={() => act('Receipt', () => sendGiftCardReceipt.mutateAsync({ card_id: c.id }).then(() => setMsg('Receipt sent.')))}>
                              {busyKey('Receipt') ? '…' : 'Receipt'}
                            </button>
                            <button className={smallBtn} disabled={!!cardBusy}
                              onClick={() => window.confirm(`Reissue card ${c.card_number} to the recipient by email?`) && act('Reissue', () => reissueGiftCard.mutateAsync({ card_id: c.id }).then(() => setMsg('Card reissued — delivery email sent.')))}>
                              {busyKey('Reissue') ? '…' : 'Reissue'}
                            </button>
                            <button className={smallBtn} disabled={!!cardBusy}
                              onClick={() => window.confirm(`Expire card ${c.card_number}?`) && act('Expire', () => expireGiftCard.mutateAsync({ card_id: c.id }))}>
                              {busyKey('Expire') ? '…' : 'Expire'}
                            </button>
                            <button className={smallBtn} disabled={!!cardBusy}
                              onClick={() => {
                                const reason = window.prompt('Void reason:', 'Entered in error') || 'Void';
                                window.confirm(`Void card ${c.card_number}? This zeroes the balance.`) && act('Void', () => voidGiftCard.mutateAsync({ card_id: c.id, reason }));
                              }}>
                              {busyKey('Void') ? '…' : 'Void'}
                            </button>
                          </>
                        ) : (
                          <button className={smallBtn} disabled={!!cardBusy}
                            onClick={() => act('Reactivate', () => reactivateGiftCard.mutateAsync({ card_id: c.id }))}>
                            {busyKey('Reactivate') ? '…' : 'Reactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {shown.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No gift cards match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'credits' && (
        <div className="mt-6">
          {msg && <p className="mb-3 text-[12px] text-muted-foreground">{msg}</p>}
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-[12px]">
              <thead className="text-left text-muted-foreground">
                <tr>{['Credit #', 'Customer', 'Original', 'Balance', 'Status', 'Issued', 'Expires'].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {storeCredits.map((sc) => (
                  <tr key={sc.id} className="border-t border-border">
                    <td className="p-3 font-semibold tabular-nums">{sc.credit_number}</td>
                    <td className="p-3 tabular-nums">{sc.customer_id ? sc.customer_id.slice(0, 8) : '—'}</td>
                    <td className="p-3 tabular-nums">{money(sc.original_amount)}</td>
                    <td className="p-3 tabular-nums">{money(sc.balance)}</td>
                    <td className="p-3 capitalize">{sc.status}</td>
                    <td className="p-3 tabular-nums">{new Date(sc.issued_at).toLocaleDateString()}</td>
                    <td className="p-3 tabular-nums">{sc.expires_at ? new Date(sc.expires_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
                {storeCredits.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No store credits issued yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

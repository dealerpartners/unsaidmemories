'use client';

import { useCallback, useEffect, useState } from 'react';
import { LifeBuoy, Send } from 'lucide-react';

// ============================================================================
// SupportIntake — the shared portal support surface (employee + seller).
// Files tickets into the ONE Support Desk queue through the portal's own
// API; the conversation lives on the ticket. Honest async model: this is
// a ticket inbox, not live chat — the copy says so, and the states are
// the ticket's real statuses. Internal staff notes never render here
// (the APIs exclude them server-side).
// ============================================================================

type Thread = {
  ticket: {
    id: string; ticketRef: string; subject: string; status: string;
    category: string; createdAt: string;
  };
  messages: { id: string; from: string; text: string; at: string }[];
};

type IntakeData = { linked: boolean; tickets: Thread[] };

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'billing', label: 'Billing' },
  { value: 'technical', label: 'Technical' },
  { value: 'seller_support', label: 'Seller support' },
  { value: 'payments', label: 'Payments' },
];

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-brand-teal/10 text-brand-teal',
  pending: 'bg-amber-100 text-amber-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-neutral-200 text-neutral-600',
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function SupportIntake({
  endpoint, title, intro, defaultCategory, unlinkedMessage,
}: {
  endpoint: string;
  title: string;
  intro: string;
  defaultCategory: string;
  unlinkedMessage: string;
}) {
  const [data, setData] = useState<IntakeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      const json = await res.json();
      if (res.ok) setData(json);
    } catch { /* keep last state */ } finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);

  const submit = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not send — please try again.');
      setNotice(json.created ? `Ticket ${json.ticketRef} opened — you'll get an email confirmation with your reference.` : 'Message added to your ticket.');
      await load();
      return true;
    } catch (e: any) {
      setNotice(e.message);
      return false;
    } finally { setBusy(false); }
  };

  const newTicket = async () => {
    if (!body.trim()) return;
    if (await submit({ subject: subject.trim() || undefined, category, body })) {
      setSubject(''); setBody('');
    }
  };

  const reply = async (ticketId: string) => {
    const text = (replies[ticketId] || '').trim();
    if (!text) return;
    if (await submit({ ticketId, body: text })) {
      setReplies((r) => ({ ...r, [ticketId]: '' }));
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-1 flex items-center gap-2">
        <LifeBuoy className="h-5 w-5 text-orange-600" />
        <h1 className="text-lg font-semibold text-neutral-800">{title}</h1>
      </div>
      <p className="mb-5 text-sm text-neutral-500">{intro}</p>

      {notice && <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

      {loading && <p className="text-sm text-neutral-400">Loading your tickets…</p>}

      {!loading && data && !data.linked && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-600">{unlinkedMessage}</div>
      )}

      {!loading && data?.linked && (
        <>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-neutral-700">Open a ticket</h2>
            <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_180px]">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (optional — we'll use your first line)" className="rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-neutral-200 px-2 py-2 text-sm">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="How can the support team help?" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-neutral-400">This is a ticket inbox, not live chat — the team replies as they work the queue, and you'll get an email when they do.</p>
              <button onClick={newTicket} disabled={busy || !body.trim()} className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-sm text-white hover:bg-orange-700 disabled:opacity-50">
                <Send className="h-3.5 w-3.5" /> File ticket
              </button>
            </div>
          </div>

          <h2 className="mb-2 mt-6 text-sm font-semibold text-neutral-700">Your tickets</h2>
          {data.tickets.length === 0 && (
            <p className="rounded-lg border border-dashed border-neutral-200 bg-white p-4 text-sm text-neutral-400">
              No tickets yet — anything you file shows up here with its replies.
            </p>
          )}
          <div className="space-y-3">
            {data.tickets.map(({ ticket, messages }) => (
              <div key={ticket.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-neutral-400">{ticket.ticketRef}</span>
                  <span className="text-sm font-medium text-neutral-800">{ticket.subject}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[ticket.status] || ''}`}>{ticket.status}</span>
                  <span className="text-xs text-neutral-400">opened {fmt(ticket.createdAt)}</span>
                </div>
                <div className="space-y-2">
                  {messages.map((m) => (
                    <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.from === 'requester' ? 'bg-neutral-100' : 'ml-auto bg-orange-50'}`}>
                      <div className="mb-0.5 text-[11px] text-neutral-400">{m.from === 'requester' ? 'You' : 'Support'} · {fmt(m.at)}</div>
                      <p className="whitespace-pre-wrap text-neutral-700">{m.text}</p>
                    </div>
                  ))}
                </div>
                {(ticket.status === 'open' || ticket.status === 'pending') && (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={replies[ticket.id] || ''}
                      onChange={(e) => setReplies((r) => ({ ...r, [ticket.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') reply(ticket.id); }}
                      placeholder="Add a reply…"
                      className="flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
                    />
                    <button onClick={() => reply(ticket.id)} disabled={busy || !(replies[ticket.id] || '').trim()} className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm text-white hover:bg-orange-700 disabled:opacity-50">Reply</button>
                  </div>
                )}
                {(ticket.status === 'resolved' || ticket.status === 'closed') && (
                  <p className="mt-2 text-xs text-neutral-400">This ticket is {ticket.status}. Filing a new ticket above reopens the conversation with the team.</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

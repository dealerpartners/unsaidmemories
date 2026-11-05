'use client';

// SupportThread — the customer's two-way support conversation with the
// shop, backed by crm_messages via /api/customer/messages — the SAME
// store the admin customer profile reads, so a message sent here lands
// in front of staff, and staff replies land here. This is an
// asynchronous inbox, not live chat: no presence, no typing state.
// (Extracted from the old /customer/messages page when Support became
// the conversation's one customer-facing home.)
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Loader2, Paperclip, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThreadMessage {
  id: string;
  from: 'salon' | 'customer';
  text: string;
  at: string | null;
  channel: string | null;
}

interface ThreadAttachment {
  id: string;
  filename: string | null;
  sizeBytes: number | null;
  scanStatus: string;
  createdAt: string;
}

// §16 CSAT — the rating state for the most recent finished ticket,
// served by /api/customer/support/csat. 'prompt' renders the capture;
// 'rated' shows the recorded score back, read-only.
interface CsatState {
  state: 'none' | 'prompt' | 'rated';
  ticketId: string | null;
  ticketRef: string | null;
  subject: string | null;
  ticketStatus: string | null;
  score: number | null;
  comment: string | null;
  answeredAt: string | null;
}

const fmtBytes = (n: number | null) => {
  if (n === null || n === undefined) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const fmtWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';

export function SupportThread({ ticketId }: { ticketId?: string } = {}) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ThreadAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [csat, setCsat] = useState<CsatState | null>(null);
  const [csatScore, setCsatScore] = useState<number | null>(null);
  const [csatComment, setCsatComment] = useState('');
  const [csatSending, setCsatSending] = useState(false);
  const [csatError, setCsatError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(ticketId ? `/api/customer/messages?ticket=${ticketId}` : '/api/customer/messages', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not load your messages');
      setMessages(Array.isArray(j.messages) ? j.messages : []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load your messages');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  // Attachments on this conversation — yours and the shop's public
  // files. Nothing here downloads until its security scan is clean;
  // a file still being scanned says so, plainly.
  const loadAttachments = useCallback(async () => {
    try {
      const res = await fetch(ticketId ? `/api/customer/support/attachments?ticket=${ticketId}` : '/api/customer/support/attachments', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(j.attachments)) setAttachments(j.attachments);
    } catch { /* the thread itself still works without the file list */ }
  }, [ticketId]);

  // CSAT state for the latest finished ticket. Reloaded after a send
  // too: a message on a finished conversation opens a fresh ticket,
  // which changes which ticket the rating belongs to.
  const loadCsat = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/support/csat', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.csat) setCsat(j.csat as CsatState);
    } catch { /* the thread itself still works without the rating block */ }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    loadAttachments();
    loadCsat();
  }, [load, loadAttachments, loadCsat]);

  const submitCsat = async () => {
    if (!csat?.ticketId || csatScore === null || csatSending) return;
    setCsatSending(true);
    setCsatError(null);
    try {
      const res = await fetch('/api/customer/support/csat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: csat.ticketId, score: csatScore, comment: csatComment.trim() || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not save your rating');
      if (j.csat) setCsat(j.csat as CsatState);
      setCsatScore(null);
      setCsatComment('');
    } catch (e) {
      setCsatError(e instanceof Error ? e.message : 'Could not save your rating');
    } finally {
      setCsatSending(false);
    }
  };

  const attach = async (file: File) => {
    setAttaching(true);
    setAttachError(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      if (ticketId) fd.set('ticketId', ticketId);
      const res = await fetch('/api/customer/support/attachments', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not attach the file');
      await loadAttachments();
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : 'Could not attach the file');
    } finally {
      setAttaching(false);
    }
  };

  const download = async (a: ThreadAttachment) => {
    try {
      const res = await fetch(`/api/customer/support/attachments/${a.id}`, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Download failed');
      if (j.url) window.open(j.url, '_blank', 'noopener');
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : 'Download failed');
    }
  };

  // F5 · Report a salon message to Trust & Safety (public.message_flags,
  // worked in Admin → Trust & Safety → Message Flag Review).
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  const submitFlag = async (messageId: string) => {
    setFlagBusy(true);
    setFlagError(null);
    try {
      const res = await fetch('/api/customer/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'flag', message_id: messageId, reason: flagReason.trim() || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not report this message');
      setReportedIds((prev) => new Set(prev).add(messageId));
      setFlaggingId(null);
      setFlagReason('');
    } catch (e) {
      setFlagError(e instanceof Error ? e.message : 'Could not report this message');
    } finally {
      setFlagBusy(false);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/customer/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, ...(ticketId ? { ticketId } : {}) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not send your message');
      setDraft('');
      if (j.message) setMessages((m) => [...m, j.message]);
      else await load();
      void loadCsat();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Could not send your message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="max-h-[520px] overflow-y-auto p-4 space-y-3">
        {loading ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground py-8 justify-center">
            <Loader2 className="size-4 animate-spin" /> Loading your conversation…
          </p>
        ) : loadError ? (
          <div className="py-8 text-center">
            <p className="text-[13px] text-destructive">{loadError}</p>
            <button onClick={load} className="mt-3 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold cursor-pointer">
              Retry
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="py-10 text-center">
            <MessageSquare className="size-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-[13px] text-muted-foreground">
              No messages yet. Write to us below — about a groom, a booking, an order, anything — and the shop team will reply right here.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn('flex', m.from === 'customer' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-2.5',
                  m.from === 'customer'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted text-foreground rounded-bl-md',
                )}
              >
                <p className="text-[13px] whitespace-pre-wrap">{m.text}</p>
                <p className={cn('text-[10px] mt-1', m.from === 'customer' ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {m.from === 'customer' ? 'You' : 'UnSaid Memories'} · {fmtWhen(m.at)}
                </p>
                {m.from !== 'customer' && (
                  reportedIds.has(m.id) ? (
                    <p className="text-[10px] mt-1 text-muted-foreground">Reported to our Trust &amp; Safety team</p>
                  ) : flaggingId === m.id ? (
                    <span className="block mt-2">
                      <input value={flagReason} onChange={(e) => setFlagReason(e.target.value)}
                        placeholder="Why are you reporting this? (optional)"
                        className="w-full rounded-lg border border-border bg-background px-2 py-1 text-[12px] text-foreground" />
                      {flagError && <span className="block text-[11px] text-destructive mt-1">{flagError}</span>}
                      <span className="flex gap-2 mt-1.5">
                        <button onClick={() => submitFlag(m.id)} disabled={flagBusy}
                          className="rounded-lg bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50 cursor-pointer">
                          {flagBusy ? 'Reporting…' : 'Send report'}
                        </button>
                        <button onClick={() => { setFlaggingId(null); setFlagError(null); }}
                          className="rounded-lg border border-border px-2 py-0.5 text-[11px] font-medium cursor-pointer">Cancel</button>
                      </span>
                    </span>
                  ) : (
                    <button onClick={() => { setFlaggingId(m.id); setFlagError(null); }}
                      className="block text-[10px] mt-1 underline underline-offset-2 text-muted-foreground hover:text-foreground cursor-pointer">
                      Report
                    </button>
                  )
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      {attachments.length > 0 && (
        <div className="border-t border-border px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Files on this conversation</p>
          <ul className="space-y-1.5">
            {attachments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <Paperclip className="size-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">{a.filename || 'Untitled file'}</span>
                {a.sizeBytes !== null && <span className="text-muted-foreground">{fmtBytes(a.sizeBytes)}</span>}
                {a.scanStatus === 'clean' ? (
                  <button onClick={() => download(a)} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-primary px-2 py-0.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 cursor-pointer">
                    <Download className="size-3.5" /> Download
                  </button>
                ) : a.scanStatus === 'pending' ? (
                  <span className="ml-auto text-[12px] text-muted-foreground">Awaiting scan — downloads open once the file is checked</span>
                ) : (
                  <span className="ml-auto text-[12px] text-destructive">Unavailable — this file did not pass its security scan</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {csat && csat.state !== 'none' && (
        <div className="border-t border-border px-4 py-3 bg-muted/40">
          {csat.state === 'rated' ? (
            <div>
              <p className="text-[13px] text-foreground">
                Your rating for ticket <span className="font-semibold">{csat.ticketRef}</span>:{' '}
                <span className="font-semibold">{csat.score} of 5</span>
              </p>
              {csat.comment && (
                <p className="text-[13px] text-muted-foreground italic mt-1">&ldquo;{csat.comment}&rdquo;</p>
              )}
              <p className="text-[12px] text-muted-foreground mt-1">
                Thanks for telling us — the shop team reads every rating.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[13px] font-semibold text-foreground">How did we do?</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Ticket {csat.ticketRef}
                {csat.subject ? ` (${csat.subject})` : ''} is {csat.ticketStatus}. Rate the help you got —
                1 is poor, 5 is excellent.
              </p>
              <div className="flex items-center gap-1.5 mt-2.5" role="radiogroup" aria-label="Rate this ticket from 1 (poor) to 5 (excellent)">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    role="radio"
                    aria-checked={csatScore === n}
                    onClick={() => setCsatScore(n)}
                    className={cn(
                      'size-9 rounded-lg border text-[14px] font-semibold cursor-pointer',
                      csatScore === n
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-border hover:bg-muted',
                    )}
                  >
                    {n}
                  </button>
                ))}
                <span className="text-[11px] text-muted-foreground ml-1.5">1 = poor · 5 = excellent</span>
              </div>
              <textarea
                value={csatComment}
                onChange={(e) => setCsatComment(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Anything else we should know? (optional)"
                className="w-full mt-2.5 rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              {csatError && <p className="text-[12px] text-destructive mt-1.5">{csatError}</p>}
              <button
                onClick={submitCsat}
                disabled={csatSending || csatScore === null}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
              >
                {csatSending ? <Loader2 className="size-4 animate-spin" /> : null} Send rating
              </button>
            </div>
          )}
        </div>
      )}
      <div className="border-t border-border p-3">
        {sendError && <p className="text-[12px] text-destructive mb-2">{sendError}</p>}
        {attachError && <p className="text-[12px] text-destructive mb-2">{attachError}</p>}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) attach(f);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={attaching}
            title="Attach a file (10 MB max) — a photo of the issue, a receipt, an invoice…"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-60 cursor-pointer"
          >
            {attaching ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />} Attach
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder="Write to the shop team…"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send
          </button>
        </div>
      </div>
    </div>
  );
}

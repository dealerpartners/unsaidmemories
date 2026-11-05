'use client';

/* "Your conversations" — the signed-in customer's support home,
   mounted in their account under Help and care (/account/help):
   their tickets (the desk's real support_tickets) with the
   conversation thread (SupportThread) open on the selected one.
   Email links land there as /account/help?ticket=SUP-n. Support
   belongs in the portal (owner ruling, 2026-11-03) — customers
   never leave their account to reach their thread. */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SupportThread } from '@/components/portal/customer/support-thread';

type TicketRow = {
  id: string;
  ticketRef: string;
  subject: string;
  status: string;
  lastMessageAt: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  pending: 'Waiting for you',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function CustomerSupport() {
  const params = useSearchParams();
  const wanted = params.get('ticket');
  const [state, setState] = useState<'loading' | 'signed-out' | 'ready'>('loading');
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/customer/support/tickets', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) { setState('signed-out'); return; }
        const j = await r.json().catch(() => ({}));
        const rows: TicketRow[] = Array.isArray(j.tickets) ? j.tickets : [];
        setTickets(rows);
        const byRef = wanted ? rows.find((t) => t.ticketRef === wanted || t.id === wanted) : undefined;
        const open = rows.find((t) => t.status === 'open' || t.status === 'pending');
        setSelectedId((byRef ?? open ?? rows[0])?.id ?? null);
        setState('ready');
      })
      .catch(() => setState('signed-out'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state !== 'ready') return null;

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  return (
    <section aria-label="Your support conversations" style={{ marginBottom: 8 }}>
      <h2 className="help-section-title">Your conversations</h2>
      {tickets.length === 0 ? (
        <div className="help-card help-card-static">
          <span className="help-card-question">No support conversations yet</span>
          <span className="help-card-teaser">
            When you write to us, your conversation with the team lives here — every reply, in one thread.
          </span>
          <a href="#write-to-us" className="help-card-more" style={{ marginTop: 8 }}>
            Write to us below
          </a>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }} role="tablist" aria-label="Your tickets">
            {tickets.map((t) => {
              const active = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedId(t.id)}
                  data-tip={`${t.subject} — ${STATUS_LABEL[t.status] ?? t.status}`}
                  style={{
                    appearance: 'none', cursor: 'pointer', textAlign: 'left',
                    border: active ? '2px solid #171420' : '1px solid #ddd6e8',
                    background: active ? '#f7f5fb' : '#fff', borderRadius: 12,
                    padding: '9px 13px', font: 'inherit',
                  }}
                >
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#171420' }}>
                    {t.ticketRef} · {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                  <span style={{ display: 'block', fontSize: 13, color: '#171420', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.subject}
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: '#5c5670' }}>
                    {t.lastMessageAt ? `Last activity ${new Date(t.lastMessageAt).toLocaleDateString('en-US')}` : `Opened ${new Date(t.createdAt).toLocaleDateString('en-US')}`}
                  </span>
                </button>
              );
            })}
          </div>
          {selected && <SupportThread key={selected.id} ticketId={selected.id} />}
        </>
      )}
    </section>
  );
}

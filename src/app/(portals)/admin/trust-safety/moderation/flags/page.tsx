'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Flag, Bot } from 'lucide-react';
import TrustSafetyNav from '@/components/admin/TrustSafetyNav';

// ---------------------------------------------------------------------------
// Content moderation — Message flag review (Admin tree F5).
//
// The queue over public.message_flags (migration 20261089), written by
// the message surfaces — the first writer is the customer's support
// thread (Report on a salon message). Each row shows the flagged
// crm_messages message itself; Dismiss / Actioned record the decision
// (reviewer + time on the flag row, and on the seller_audit_log trail
// via the API). Before the flag store existed this page served a stated
// absence; the store and its writer now exist, so the queue is real.
// ---------------------------------------------------------------------------

type FlagRow = {
  id: string; message_id: string; reporter_type: string; reporter_id: string | null;
  reason: string | null; status: string; reviewed_by: string | null;
  reviewed_at: string | null; created_at: string;
  message_body: string | null; message_subject: string | null;
  message_channel: string | null; message_direction: string | null;
  message_at: string | null;
};
type Counts = { open: number; dismissed: number; actioned: number; total: number };

const STATES = ['open', 'dismissed', 'actioned', 'all'] as const;

export default function MessageFlagsPage() {
  const [state, setState] = useState<(typeof STATES)[number]>('open');
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/trust-safety/moderation/flags?state=${state}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setFlags(j.flags || []);
      setCounts(j.counts || null);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [state]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: string) => {
    setBusyId(id); setError(null);
    try {
      const r = await fetch('/api/admin/trust-safety/moderation/flags', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/trust-safety/moderation" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="size-3.5" /> Content Moderation
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Flag className="size-6" /> Message Flag Review
        </h1>
      </div>

      <TrustSafetyNav />

      {error && <div className="text-[13px] text-red-600">{error}</div>}

      <div className="flex items-center gap-2">
        {STATES.map((s) => (
          <button key={s} onClick={() => setState(s)}
            className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium capitalize ${state === s ? 'bg-brand-teal/10 text-brand-teal' : 'hover:bg-muted'}`}>
            {s}{counts ? ` (${s === 'all' ? counts.total : counts[s as keyof Counts]})` : ''}
          </button>
        ))}
      </div>

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? <p className="px-5 py-6 text-[13px] text-muted-foreground">Loading…</p>
          : flags.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-muted-foreground">
              {state === 'open'
                ? 'No open message flags. When a customer reports a message from their support thread, it queues here.'
                : `No ${state === 'all' ? '' : state + ' '}message flags recorded.`}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {flags.map((f) => (
                <div key={f.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[13px] whitespace-pre-wrap">{f.message_body || f.message_subject || '(no body recorded)'}</p>
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        {f.message_channel ?? 'message'} · {f.message_direction ?? '—'}
                        {f.message_at ? ` · sent ${new Date(f.message_at).toLocaleString()}` : ''}
                        {' '}· flagged by {f.reporter_type} {new Date(f.created_at).toLocaleString()}
                        {f.reason ? ` · reason: ${f.reason}` : ''}
                        {f.status !== 'open' && f.reviewed_at ? ` · ${f.status} ${new Date(f.reviewed_at).toLocaleString()}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {f.status === 'open' && (
                        <>
                          <button disabled={busyId === f.id} onClick={() => act(f.id, 'actioned')}
                            className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">Actioned</button>
                          <button disabled={busyId === f.id} onClick={() => act(f.id, 'dismiss')}
                            className="rounded-lg border px-3 py-1.5 text-[12px] font-medium hover:bg-muted disabled:opacity-50">Dismiss</button>
                        </>
                      )}
                      {f.status !== 'open' && (
                        <button disabled={busyId === f.id} onClick={() => act(f.id, 'reopen')}
                          className="rounded-lg border px-3 py-1.5 text-[12px] font-medium hover:bg-muted disabled:opacity-50">Reopen</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </section>

      <Link
        href="/admin/trust-safety/moderation/ai-review"
        className="block bg-card border border-border rounded-xl hover:border-foreground/30 transition-colors group"
      >
        <div className="flex items-center justify-between">
          <Bot className="size-5 text-muted-foreground" />
          <ArrowRight className="size-4 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
        </div>
        <h2 className="text-[15px] font-semibold mt-3">AI content review</h2>
        <p className="text-[13px] text-muted-foreground mt-2">
          The review_moderation function now has its producer pass and its own queue face —
          proposals over pending reviews, decided by this desk. Open the AI review queue.
        </p>
      </Link>
    </div>
  );
}

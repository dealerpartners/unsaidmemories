'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, Play, CheckCircle2, XCircle, Star } from 'lucide-react';
import TrustSafetyNav from '@/components/admin/TrustSafetyNav';

// F5 · AI content review — proposals of the registered review_moderation
// function, produced by the deterministic pass over pending reviews.
// The desk decides: Apply takes the recommended action on the review
// (the manual queue's semantics); Dismiss records the override and
// changes nothing. No verdict ever executes itself.
type Proposal = {
  id: string;
  state: string;
  decided_at: string | null;
  created_at: string;
  recommendation: string | null;
  rationale: string | null;
  signals: Record<string, boolean> | null;
  review_id: string | null;
  rating: number | null;
  title: string | null;
  body: string | null;
  author_name: string | null;
  product_name: string | null;
  is_published: boolean | null;
  review_status: string | null;
};

const REC_STYLES: Record<string, string> = {
  approve: 'bg-green-100 text-green-700',
  reject: 'adm-badge adm-badge-red',
  hide: 'adm-badge adm-badge-amber',
};

const STATE_STYLES: Record<string, string> = {
  proposed: 'adm-badge adm-badge-amber',
  applied: 'bg-green-100 text-green-700',
  dismissed: 'bg-muted text-muted-foreground',
};

const SIGNAL_LABELS: Record<string, string> = {
  contains_link: 'Contains a link',
  contains_email: 'Contains an email',
  contains_phone: 'Contains a phone number',
  shouty: 'Shouting (excessive caps)',
  repeated_chars: 'Repeated characters',
  empty_body: 'No body text',
};

export default function AiReviewPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDecided, setShowDecided] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/trust-safety/moderation/ai-review')
      .then((r) => (r.ok ? r.json() : { proposals: [] }))
      .then((j) => setProposals((j.proposals || []) as Proposal[]))
      .catch(() => setProposals([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runPass = async () => {
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await fetch('/api/admin/trust-safety/moderation/ai-review', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRunMsg(j.error || 'The pass could not run.');
        return;
      }
      setRunMsg(
        `Pass recorded: ${j.run.created} new proposal${j.run.created === 1 ? '' : 's'}` +
          (j.run.skipped ? `, ${j.run.skipped} already proposed` : '') +
          '.'
      );
      load();
    } catch {
      setRunMsg('The pass could not run.');
    } finally {
      setRunning(false);
    }
  };

  const decide = async (id: string, decision: 'applied' | 'dismissed') => {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/trust-safety/moderation/ai-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      });
      if (res.ok) load();
    } catch {
      /* unchanged — the decision was not recorded */
    } finally {
      setBusy(null);
    }
  };

  const visible = proposals.filter((p) => showDecided || p.state === 'proposed');
  const proposedCount = proposals.filter((p) => p.state === 'proposed').length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/trust-safety/moderation" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="size-3.5" /> Content Moderation
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Bot className="size-6" /> AI Content Review
        </h1>
      </div>

      <TrustSafetyNav />

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={runPass}
          disabled={running}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
        >
          <Play className="size-3.5" /> {running ? 'Running…' : 'Run review pass'}
        </button>
        <label className="inline-flex items-center gap-2 text-[13px] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={showDecided} onChange={(e) => setShowDecided(e.target.checked)} />
          Show decided proposals
        </label>
        <span className="text-[13px] text-muted-foreground">{proposedCount} awaiting a decision</span>
        {runMsg && <span className="text-[13px] text-muted-foreground">{runMsg}</span>}
      </div>

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Bot className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No AI proposals waiting</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            Run the review pass over the pending reviews and its proposals will queue here for your decision.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => {
            const activeSignals = p.signals ? Object.keys(p.signals).filter((k) => p.signals?.[k]) : [];
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-foreground">
                        <Star className="size-3.5" /> {p.rating ?? '—'}/5
                      </span>
                      {p.recommendation && (
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${REC_STYLES[p.recommendation] || 'bg-muted text-muted-foreground'}`}>
                          Recommends: {p.recommendation}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${STATE_STYLES[p.state] || 'bg-muted text-muted-foreground'}`}>
                        {p.state}
                      </span>
                    </div>
                    <p className="text-[13px] text-muted-foreground mt-1.5">
                      On <span className="font-medium text-foreground">{p.product_name || 'Unknown product'}</span>
                      {' · '}by {p.author_name || 'Anonymous'}
                      {' · '}Review is currently {p.is_published ? 'visible' : p.review_status === 'rejected' ? 'rejected' : 'pending'}
                    </p>
                    {activeSignals.length > 0 ? (
                      <p className="text-[12px] text-muted-foreground mt-2">
                        Signals: {activeSignals.map((s) => SIGNAL_LABELS[s] || s).join(' · ')}
                      </p>
                    ) : (
                      <p className="text-[12px] text-muted-foreground mt-2">Signals: none</p>
                    )}
                    {p.rationale && <p className="text-[12px] text-muted-foreground mt-1">{p.rationale}</p>}
                  </div>
                  {p.state === 'proposed' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => decide(p.id, 'applied')}
                        disabled={busy === p.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-[12px] font-semibold hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircle2 className="size-3.5" /> Apply
                      </button>
                      <button
                        onClick={() => decide(p.id, 'dismissed')}
                        disabled={busy === p.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-semibold hover:bg-muted disabled:opacity-50 cursor-pointer"
                      >
                        <XCircle className="size-3.5" /> Dismiss
                      </button>
                    </div>
                  )}
                </div>
                {p.title && <p className="text-[14px] font-semibold text-foreground mt-3">{p.title}</p>}
                {p.body && <p className="text-[13px] text-muted-foreground mt-1 whitespace-pre-wrap">{p.body}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

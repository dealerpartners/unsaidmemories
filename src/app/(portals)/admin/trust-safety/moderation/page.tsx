'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageSquareWarning, Star, CheckCircle2, XCircle, EyeOff } from 'lucide-react';
import TrustSafetyNav from '@/components/admin/TrustSafetyNav';

type Review = {
  id: string;
  product_name: string | null;
  product_slug: string | null;
  author_name: string | null;
  customer_email: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  is_verified_purchase: boolean;
  is_published: boolean;
  status: string;
  created_at: string;
};

type Counts = { pending: number; visible: number; rejected: number; total: number };

const TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'visible', label: 'Visible' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
] as const;

export default function ReviewModerationPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, visible: 0, rejected: 0, total: 0 });
  const [tab, setTab] = useState<string>('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((state: string) => {
    setLoading(true);
    fetch(`/api/admin/trust-safety/moderation/reviews?state=${state}`)
      .then((r) => (r.ok ? r.json() : { reviews: [], counts: null }))
      .then((j) => {
        setReviews(j.reviews || []);
        if (j.counts) setCounts(j.counts);
      })
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const act = (id: string, action: 'approve' | 'reject' | 'hide') => {
    setBusy(id);
    fetch('/api/admin/trust-safety/moderation/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
      .then(() => load(tab))
      .catch(() => {})
      .finally(() => setBusy(null));
  };

  const derivedState = (r: Review) =>
    r.is_published ? 'Visible' : r.status === 'rejected' ? 'Rejected' : 'Pending';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/trust-safety" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="size-3.5" /> Trust & Safety
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <MessageSquareWarning className="size-6" /> Content Moderation
        </h1>
      </div>

      <TrustSafetyNav />

      {/* Sibling moderation surfaces */}
      <div className="flex flex-wrap gap-3">
        {[
          { href: '/admin/trust-safety/moderation/forum', label: 'Forum Moderation' },
          { href: '/admin/trust-safety/moderation/photos', label: 'Photo Moderation' },
          { href: '/admin/trust-safety/moderation/flags', label: 'Message Flags' },
          { href: '/admin/trust-safety/moderation/ai-review', label: 'AI Review' },
          { href: '/admin/trust-safety/repeat-offenders', label: 'Repeat Offenders' },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted transition-colors"
          >
            {l.label}
          </Link>
        ))}
      </div>

      {/* State tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors cursor-pointer ${ tab === t.id ? 'bg-brand-teal/10 text-brand-teal border-brand-teal/40' : 'border-border text-muted-foreground hover:text-foreground' }`}
          >
            {t.label} ({t.id === 'all' ? counts.total : counts[t.id as keyof Counts]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : reviews.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <MessageSquareWarning className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">
            {tab === 'pending' ? 'No reviews waiting' : 'No reviews in this state'}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">
            {tab === 'pending'
              ? 'New customer reviews will appear here for a decision before they can show on the shop.'
              : 'Reviews you moderate will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-foreground">
                      <Star className="size-3.5" /> {r.rating}/5
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${ derivedState(r) === 'Visible' ? 'bg-green-100 text-green-700' : derivedState(r) === 'Rejected' ? 'adm-badge adm-badge-red' : 'adm-badge adm-badge-amber' }`}
                    >
                      {derivedState(r)}
                    </span>
                    {r.is_verified_purchase && (
                      <span className="px-2 py-0.5 rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                        Verified purchase
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-muted-foreground mt-1.5">
                    On <span className="font-medium text-foreground">{r.product_name || 'Unknown product'}</span>
                    {' · '}by {r.author_name || 'Anonymous'}
                    {r.customer_email ? ` (${r.customer_email})` : ''}
                    {' · '}
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {derivedState(r) !== 'Visible' && (
                    <button
                      onClick={() => act(r.id, 'approve')}
                      disabled={busy === r.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-[12px] font-semibold hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 className="size-3.5" /> Approve
                    </button>
                  )}
                  {derivedState(r) === 'Visible' && (
                    <button
                      onClick={() => act(r.id, 'hide')}
                      disabled={busy === r.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-semibold hover:bg-muted disabled:opacity-50 cursor-pointer"
                    >
                      <EyeOff className="size-3.5" /> Hide
                    </button>
                  )}
                  {derivedState(r) !== 'Rejected' && (
                    <button
                      onClick={() => act(r.id, 'reject')}
                      disabled={busy === r.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                    >
                      <XCircle className="size-3.5" /> Reject
                    </button>
                  )}
                </div>
              </div>
              {r.title && <p className="text-[14px] font-semibold text-foreground mt-3">{r.title}</p>}
              {r.body && <p className="text-[13px] text-muted-foreground mt-1 whitespace-pre-wrap">{r.body}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

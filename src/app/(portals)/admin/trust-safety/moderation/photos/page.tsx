'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ImageIcon, CheckCircle2, XCircle } from 'lucide-react';
import TrustSafetyNav from '@/components/admin/TrustSafetyNav';

type Photo = {
  id: string;
  listing_title: string | null;
  seller_name: string | null;
  url: string;
  alt_text: string | null;
  is_primary: boolean;
  moderation_status: string;
  created_at: string;
};

type Counts = { pending: number; approved: number; rejected: number; total: number };

const TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
] as const;

const STATUS_STYLES: Record<string, string> = {
  pending: 'adm-badge adm-badge-amber',
  approved: 'bg-green-100 text-green-700',
  rejected: 'adm-badge adm-badge-red',
};

export default function PhotoModerationPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [tab, setTab] = useState<string>('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((state: string) => {
    setLoading(true);
    fetch(`/api/admin/trust-safety/moderation/photos?state=${state}`)
      .then((r) => (r.ok ? r.json() : { photos: [], counts: null }))
      .then((j) => {
        setPhotos(j.photos || []);
        if (j.counts) setCounts(j.counts);
      })
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const act = (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    fetch('/api/admin/trust-safety/moderation/photos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
      .then(() => load(tab))
      .catch(() => {})
      .finally(() => setBusy(null));
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/trust-safety/moderation" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="size-3.5" /> Content Moderation
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <ImageIcon className="size-6" /> Photo Moderation
        </h1>
      </div>

      <TrustSafetyNav />

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
      ) : photos.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <ImageIcon className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">
            {tab === 'pending' ? 'No photos waiting' : 'No photos in this state'}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">
            Photos sellers upload to their listings will appear here for review.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {photos.map((p) => (
            <div key={p.id} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.alt_text || p.listing_title || 'Listing photo'} className="w-full h-44 object-cover bg-muted" />
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-foreground truncate">
                    {p.listing_title || 'Unknown listing'}
                  </p>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize shrink-0 ${STATUS_STYLES[p.moderation_status] || 'bg-muted text-muted-foreground'}`}>
                    {p.moderation_status}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  {p.seller_name || 'Unknown seller'}
                  {p.is_primary ? ' · Primary photo' : ''} · {new Date(p.created_at).toLocaleDateString()}
                </p>
                <div className="flex gap-2 pt-1">
                  {p.moderation_status !== 'approved' && (
                    <button
                      onClick={() => act(p.id, 'approve')}
                      disabled={busy === p.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-[12px] font-semibold hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 className="size-3.5" /> Approve
                    </button>
                  )}
                  {p.moderation_status !== 'rejected' && (
                    <button
                      onClick={() => act(p.id, 'reject')}
                      disabled={busy === p.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                    >
                      <XCircle className="size-3.5" /> Reject
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

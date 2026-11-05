'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessagesSquare } from 'lucide-react';
import TrustSafetyNav from '@/components/admin/TrustSafetyNav';

type Thread = {
  id: string;
  title: string;
  body: string | null;
  status: string;
  seller_name: string | null;
  reply_count: number;
  updated_at: string;
};

type Reply = {
  id: string;
  thread_id: string;
  thread_title: string;
  seller_name: string | null;
  body: string | null;
  moderation_status: string;
  created_at: string;
};

const THREAD_STATUSES = ['open', 'hidden', 'closed', 'removed'];
const REPLY_STATUSES = ['visible', 'hidden', 'removed'];

export default function ForumModerationPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/trust-safety/moderation/forum')
      .then((r) => (r.ok ? r.json() : { threads: [], replies: [] }))
      .then((j) => {
        setThreads(j.threads || []);
        setReplies(j.replies || []);
      })
      .catch(() => {
        setThreads([]);
        setReplies([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (payload: Record<string, string>, key: string) => {
    setBusy(key);
    fetch('/api/admin/trust-safety/moderation/forum', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(() => load())
      .catch(() => {})
      .finally(() => setBusy(null));
  };

  const selectCls = 'text-[11px] border border-border rounded px-2 py-1 bg-card cursor-pointer';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/trust-safety/moderation" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="size-3.5" /> Content Moderation
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <MessagesSquare className="size-6" /> Forum Moderation
        </h1>
      </div>

      <TrustSafetyNav />

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-[15px] font-semibold">Threads</h2>
            </div>
            {threads.length === 0 ? (
              <div className="p-12 text-center">
                <MessagesSquare className="size-10 mx-auto text-muted-foreground/40" />
                <p className="text-[14px] font-medium text-foreground mt-3">No forum threads yet</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  Threads sellers open in the community forum will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {threads.map((t) => (
                  <div key={t.id} className="px-5 py-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-foreground">{t.title}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        {t.seller_name || 'Unknown seller'} · {t.reply_count} replies · updated{' '}
                        {new Date(t.updated_at).toLocaleDateString()}
                      </p>
                      {t.body && (
                        <p className="text-[13px] text-muted-foreground mt-1.5 line-clamp-2">{t.body}</p>
                      )}
                    </div>
                    <select
                      value={t.status}
                      disabled={busy === t.id}
                      onChange={(e) => patch({ kind: 'thread', id: t.id, status: e.target.value }, t.id)}
                      className={selectCls}
                    >
                      {THREAD_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-[15px] font-semibold">Recent replies</h2>
            </div>
            {replies.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-[14px] font-medium text-foreground">No replies yet</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  Forum replies will appear here for individual moderation.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {replies.map((r) => (
                  <div key={r.id} className="px-5 py-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] text-muted-foreground">
                        On <span className="font-medium text-foreground">{r.thread_title}</span> ·{' '}
                        {r.seller_name || 'Unknown seller'} · {new Date(r.created_at).toLocaleDateString()}
                      </p>
                      {r.body && <p className="text-[13px] text-foreground mt-1">{r.body}</p>}
                    </div>
                    <select
                      value={r.moderation_status}
                      disabled={busy === r.id}
                      onChange={(e) =>
                        patch({ kind: 'reply', id: r.id, moderation_status: e.target.value }, r.id)
                      }
                      className={selectCls}
                    >
                      {REPLY_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, BadgeCheck, Send, AlertCircle } from 'lucide-react';
import { ViewHeader, timeAgo, initialsOf } from '@/components/admin/ViewHeader';

// ============================================================================
// /admin/notifications/seller — Seller Notifications (owner's
// DASHBOARD_VIEW.html, View 7). This view IS the page (owner's verdict,
// 2026-11-02: his file replaces the presentation — the legacy K3 seller
// broadcast page that used to render below the alert list is
// unmounted).
//
// The alert list reads seller_performance_alerts (open) + pending
// verification_tasks through /api/admin/dashboard/views — the same
// sources the shell siderail's Seller Notifs badge counts. Performance
// rows acknowledge through the existing A4 API
// (/api/admin/sellers/performance-alerts); verification rows link to
// the verification surface.
//
// The composer region below renders in this view's design, but SENDING
// IS A GAP: its store, public.seller_notifications, does not exist in
// the live database, so a seller broadcast has nowhere to land. The
// send control is present and disabled with the reason stated — it is
// never wired to a fake send. See gap list #6 for the owner's two
// paths to close it (create the table in the shape the seller-
// broadcast API expects, or repoint at user_notifications).
// ============================================================================

type SellerItem = {
  id: string; kind: 'performance' | 'verification';
  title: string; detail: string; at: string | null;
  actionLabel: string; actionApiId: string | null; href: string;
};

const inputCls = 'w-full px-3 py-2 bg-muted/40 border border-border rounded-md text-sm text-foreground outline-none disabled:opacity-60';
const labelCls = 'block text-xs font-semibold text-muted-foreground mb-1';

function SellerBroadcastCard() {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/30">
        <span className="font-semibold text-sm">Broadcast to Sellers</span>
      </div>

      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-start gap-2 text-[13px] border border-border rounded-md px-3 py-2.5 bg-muted/30">
          <AlertCircle className="size-4 mt-0.5 shrink-0" style={{ color: '#ba1a1a' }} />
          <span>
            Seller broadcasts can&apos;t be sent yet — the <code>seller_notifications</code> table doesn&apos;t
            exist in this database, so there is nowhere for seller copies to land. The alert list above is
            live; sending waits on that store (gap list #6).
          </span>
        </div>

        <fieldset disabled className="flex flex-col gap-4">
          <div>
            <label className={labelCls} htmlFor="sb-title">Title</label>
            <input id="sb-title" maxLength={200} placeholder="e.g. Updated commission schedule" className={inputCls} />
          </div>

          <div>
            <label className={labelCls} htmlFor="sb-body">Message</label>
            <textarea id="sb-body" maxLength={2000} rows={4} placeholder="What sellers need to know…" className={`${inputCls} resize-y`} />
          </div>

          <div>
            <label className={labelCls} htmlFor="sb-link">Link (optional)</label>
            <input id="sb-link" maxLength={500} placeholder="/seller/… — opens inside the seller portal" className={inputCls} />
          </div>

          <div>
            <span className={labelCls}>Audience</span>
            <div className="flex items-center gap-2" role="tablist" aria-label="Audience">
              <button
                type="button"
                role="tab"
                aria-selected={true}
                className="px-3 py-1.5 rounded-md text-sm font-semibold border disabled:opacity-60"
                style={{ backgroundColor: '#171420', color: '#ffffff', borderColor: '#171420' }}
              >
                All sellers
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={false}
                className="px-3 py-1.5 rounded-md text-sm font-semibold border border-border disabled:opacity-60"
              >
                Selected sellers
              </button>
            </div>
          </div>

          <div>
            <button
              type="button"
              disabled
              className="px-4 py-1.5 rounded-md text-sm font-semibold text-white shadow-sm inline-flex items-center gap-1.5 disabled:opacity-60"
              style={{ backgroundColor: '#171420' }}
            >
              <Send className="size-4" /> Send broadcast
            </button>
          </div>
        </fieldset>
      </div>
    </div>
  );
}

export default function AdminSellerNotificationsPage() {
  const [items, setItems] = useState<SellerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ackNote, setAckNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/dashboard/views', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems(j.data?.sellers?.items ?? []);
        setTotal(j.data?.counts?.sellers ?? 0);
      }
    } catch { /* honest empty state below */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const acknowledge = async (apiId: string) => {
    setAckNote(null);
    try {
      const res = await fetch('/api/admin/sellers/performance-alerts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge', alert_id: apiId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || 'Acknowledge failed');
      setAckNote('Alert acknowledged.');
      await load();
    } catch (e) {
      setAckNote(e instanceof Error ? e.message : 'Acknowledge failed');
    }
  };

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1400px] mx-auto w-full">
      <ViewHeader title="Seller Notifications">
        <Link href="/admin/payouts" className="px-3 py-1.5 bg-card border border-border rounded-md text-sm font-semibold hover:bg-muted/50">
          Payout Approval Queue
        </Link>
      </ViewHeader>

      {ackNote ? <p className="text-[13px]">{ackNote}</p> : null}

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <span className="font-semibold text-sm">Marketplace Partner &amp; Creator Alerts</span>
          <span className="text-xs text-muted-foreground font-mono">{total} Alerts</span>
        </div>
        <div className="divide-y divide-border text-sm">
          {loading ? (
            <p className="px-5 py-4 text-[13px] text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Loading seller alerts…</p>
          ) : items.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-muted-foreground">
              No open seller alerts — performance alerts (seller_performance_alerts) and pending verifications (verification_tasks) appear here as they are recorded.
            </p>
          ) : (
            items.map((s) => (
              <div key={s.id} className="px-5 py-4 flex items-center justify-between hover:bg-muted/40 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-xs shrink-0"
                    style={{ backgroundColor: s.kind === 'performance' ? '#6b1e28' : '#0e5e6f' }}
                  >
                    {s.kind === 'performance' ? initialsOf(s.title) : <BadgeCheck size={16} />}
                  </span>
                  <div className="min-w-0">
                    <span className="font-semibold block truncate">{s.title}</span>
                    <p className="text-xs text-muted-foreground truncate">{s.detail}{s.at ? ` · ${timeAgo(s.at)}` : ''}</p>
                  </div>
                </div>
                {s.actionApiId ? (
                  <button
                    type="button"
                    onClick={() => acknowledge(s.actionApiId!)}
                    className="px-3 py-1 bg-card border border-border rounded text-xs font-semibold hover:bg-[#171420] hover:text-white shrink-0"
                  >
                    {s.actionLabel}
                  </button>
                ) : (
                  <Link href={s.href} className="px-3 py-1 bg-card border border-border rounded text-xs font-semibold hover:bg-[#171420] hover:text-white shrink-0">
                    {s.actionLabel}
                  </Link>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <SellerBroadcastCard />
    </div>
  );
}

'use client';

// ============================================================================
// NotificationBell — the customer portal's system-notification bell (owner
// ruling: a notification bell INSIDE the portal so customers receive the
// communication of days, copies of their invoices, and copies of their
// orders — every customer-facing email also lands here as an in-app copy).
//
// Polls /api/customer/notifications (every 60s while the portal is open),
// shows the unread count as a badge, and opens a popover with the most
// recent notifications. Clicking one marks it read and follows its deep
// link; "View all" opens the full Notifications page (the notifications
// box IN the customer portal, not analytics).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  CalendarDays,
  Receipt,
  ShoppingBag,
  Repeat,
  UserRound,
  GraduationCap,
  Mail,
  Loader2,
  CheckCheck,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PortalNotification {
  id: string;
  type: 'appointment' | 'invoice' | 'order' | 'subscription' | 'account' | 'learning' | 'message';
  title: string;
  body: string | null;
  link: string | null;
  relatedId: string | null;
  readAt: string | null;
  createdAt: string | null;
}

const TYPE_ICON: Record<PortalNotification['type'], typeof Bell> = {
  appointment: CalendarDays,
  invoice: Receipt,
  order: ShoppingBag,
  subscription: Repeat,
  account: UserRound,
  learning: GraduationCap,
  message: Mail,
};

const TYPE_LABEL: Record<PortalNotification['type'], string> = {
  appointment: 'Appointment',
  invoice: 'Invoice',
  order: 'Order',
  subscription: 'Subscription',
  account: 'Account',
  learning: 'Learning',
  message: 'Message',
};

/** "2h ago" style relative time — falls back to the date for older rows. */
function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const openRef = useRef(false);

  // Keep the ref in sync in an effect (never during render) so the poller
  // below can skip refetches while the popover is open.
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/notifications', { cache: 'no-store' });
      if (!res.ok) return; // signed out / not provisioned — badge stays quiet
      const data = await res.json();
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnread(Number(data.unreadCount || 0));
      setLoadedOnce(true);
    } catch {
      /* transient — the next poll retries */
    }
  }, []);

  // Initial load + 60s poll (keeps the badge fresh while the portal is open;
  // paused while the popover is open so clicks don't fight a refetch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount bootstrap: fetch + interval (repo convention; the fetch resolves async).
    load();
    const t = setInterval(() => {
      if (!openRef.current && document.visibilityState === 'visible') load();
    }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Refresh when the popover opens so the customer always sees the latest.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open-triggered refresh flag; the spinner must paint before the async fetch resolves.
      setLoading(true);
      load().finally(() => setLoading(false));
    }
  }, [open, load]);

  const markRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt || new Date().toISOString() } : n)),
      );
      setUnread((u) => Math.max(0, u - 1));
      fetch('/api/customer/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', id }),
      }).catch(() => {});
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    setUnread(0);
    fetch('/api/customer/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    }).catch(() => {});
  }, []);

  const recent = notifications.slice(0, 8);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={unread > 0 ? `Notifications — ${unread} unread` : 'Notifications'}
          aria-haspopup="dialog"
          className={cn(
            'relative rounded-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            'h-9 w-9 flex items-center justify-center transition-colors duration-150',
            'text-topbar-foreground cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-topbar',
          )}
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className={cn(
                'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1',
                'flex items-center justify-center rounded-full',
                'bg-gold-deep text-on-dark text-[10px] font-bold leading-none',
                'ring-2 ring-topbar',
              )}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0" sideOffset={8}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink">
            Notifications
            {unread > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-gold-deep/10 px-2 py-0.5 text-[10px] font-semibold text-gold-deep">
                {unread} new
              </span>
            )}
          </p>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-ink transition-colors cursor-pointer"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[22rem] overflow-y-auto custom-scrollbar">
          {loading && !loadedOnce ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-[12.5px]">Loading notifications…</span>
            </div>
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 px-6 text-center">
              <Bell className="size-6 text-muted-foreground/50" />
              <p className="text-[13px] font-medium text-ink">You&apos;re all caught up</p>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                Appointment reminders, invoice copies and order updates will appear here — a copy of
                every email we send you.
              </p>
            </div>
          ) : (
            recent.map((n) => {
              const Icon = TYPE_ICON[n.type] || Bell;
              const unreadRow = !n.readAt;
              return (
                <Link
                  key={n.id}
                  href={n.link || '/customer/notifications'}
                  onClick={() => {
                    if (unreadRow) markRead(n.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex gap-3 border-b border-border/60 px-4 py-3 transition-colors',
                    'hover:bg-accent focus-visible:bg-accent outline-none',
                    unreadRow ? 'bg-gold-deep/[0.06]' : 'bg-transparent',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border',
                      unreadRow
                        ? 'border-gold-deep/40 bg-gold-deep/10 text-gold-deep'
                        : 'border-border bg-muted/60 text-muted-foreground',
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                        {TYPE_LABEL[n.type] || 'Update'}
                      </span>
                      <span className="ml-auto text-[10.5px] text-muted-foreground/80">
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 block truncate text-[13px] leading-snug',
                        unreadRow ? 'font-semibold text-ink' : 'font-medium text-ink/80',
                      )}
                      title={n.title}
                    >
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                        {n.body}
                      </span>
                    )}
                  </span>
                  {unreadRow && (
                    <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-gold-deep" />
                  )}
                </Link>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-2">
          <Button
            asChild
            variant="ghost"
            className="w-full h-9 text-[12px] font-semibold text-gold-deep hover:text-gold-deep hover:bg-gold-deep/10"
          >
            <Link href="/customer/notifications" onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

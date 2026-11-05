'use client';

// §12 Notifications — the desk rail panel for the signed-in staffer's
// OWN support_notifications (assignments, SLA warnings, escalations,
// mentions): the read surface over GET/PATCH /api/admin/support/
// notifications, whose contract the employee Support surface set.
// Rows are the caller's own; clicking one marks it read.

import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';

interface StaffNotification {
  id: string;
  kind: string;
  channel: string;
  ticketId: string | null;
  ticketRef: string | null;
  ref: string | null;
  readAt: string | null;
  createdAt: string;
}

const KIND_LABELS: Record<string, string> = {
  assigned: 'Assigned to you',
  sla_warning: 'SLA warning',
  sla_breached: 'SLA breached',
  escalated: 'Escalated',
  mention: 'Mentioned you',
  automation: 'Automation',
};

const kindLabel = (kind: string) =>
  KIND_LABELS[kind] ?? kind.replace(/_/g, ' ');

export default function SupportNotificationsPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StaffNotification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/support/notifications?limit=50');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load notifications');
      setItems(json.notifications ?? []);
      setUnread(json.unread ?? 0);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load notifications');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    try {
      const res = await fetch('/api/admin/support/notifications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Mark-read failed');
      setItems((prev) => (prev ?? []).map((n) =>
        n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n));
      setUnread((u) => Math.max(0, u - 1));
    } catch { /* the row stays unread — the server state is the truth */ }
  };

  const markAllRead = async () => {
    try {
      const res = await fetch('/api/admin/support/notifications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) throw new Error('Mark-read failed');
      setItems((prev) => (prev ?? []).map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      setUnread(0);
    } catch { /* unchanged on failure */ }
  };

  return (
    <div className="mt-4 border-t border-neutral-100 pt-3 px-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg bg-neutral-100 px-2 py-1.5 text-left text-[13px] text-neutral-600 hover:bg-neutral-200"
      >
        <span className="flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5" /> My notifications
        </span>
        {unread > 0 && (
          <span className="rounded-full bg-orange-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      <p className="mt-1 text-[11px] leading-snug text-neutral-400">
        Assignments, SLA warnings and escalations addressed to you (§12).
      </p>
      {open && (
        <div className="mt-2">
          {error && <p className="px-1 text-xs text-red-600">{error}</p>}
          {!error && items === null && (
            <p className="px-1 text-xs text-neutral-400">Loading…</p>
          )}
          {!error && items !== null && items.length === 0 && (
            <p className="px-1 text-xs text-neutral-400">
              No notifications yet — assignments, SLA warnings and escalations land here.
            </p>
          )}
          {items !== null && items.length > 0 && (
            <>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="mb-1 px-1 text-[11px] font-medium text-orange-700 hover:underline"
                >
                  Mark all read
                </button>
              )}
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => { if (!n.readAt) markRead(n.id); }}
                      className={`w-full rounded-lg px-2 py-1.5 text-left hover:bg-neutral-50 ${n.readAt ? 'text-neutral-500' : 'bg-orange-50/60 text-neutral-700'}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={`text-xs ${n.readAt ? '' : 'font-semibold'}`}>
                          {kindLabel(n.kind)}
                        </span>
                        {!n.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-600" />}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-neutral-400">
                        {(n.ticketRef ?? n.ref ?? 'Support')}{' · '}
                        {new Date(n.createdAt).toLocaleString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

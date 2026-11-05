'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Send, Loader2, RefreshCw, CheckCircle2, AlertCircle, TriangleAlert, Package, Headset, ClipboardList } from 'lucide-react';
import { ViewHeader, timeAgo } from '@/components/admin/ViewHeader';

// ============================================================================
// /admin/notifications — Attention Queue (owner's DASHBOARD_VIEW.html,
// View 5). This view IS the page (owner's verdict, 2026-11-02: his file
// replaces the presentation — the legacy K3 broadcast page that used to
// render below the queue is unmounted; the composer now lives INSIDE
// this view's layout as the card under the queue).
//
// Queue items + tab counts come from /api/admin/dashboard/views — the
// same payload the shell siderail's Queues badges read, so the numbers
// agree by construction. Sources: erp_orders SLA breaches,
// commerce_inventory_alerts, unread support_notifications, open
// high-priority crm_tasks. "Mark all resolved" resolves the queue's
// own alert rows (support notifications marked read, inventory alerts
// resolved — the views API's POST); SLA breaches and tasks resolve
// inside their own modules via their rows.
//
// The composer writes through the real staff broadcast path
// (GET/POST /api/admin/notifications/broadcast → one
// employee_notifications row per staff member of the selected tenant).
// ============================================================================

type QueueItem = {
  id: string; kind: string; severity: 'critical' | 'warning' | 'info';
  title: string; detail: string; meta: string; at: string | null;
  actionLabel: string; href: string;
};

const KIND_ICON = { sla: TriangleAlert, stock: Package, ticket: Headset, task: ClipboardList } as const;
const KIND_COLOR = { sla: '#ba1a1a', stock: '#f97316', ticket: '#0077c5', task: '#6b1e28' } as const;

type Staff = { id: string; name: string; email: string | null; role: string; isGroomer: boolean };
type Broadcast = {
  title: string | null;
  body: string | null;
  link: string | null;
  createdAt: string;
  recipients: number;
  readCount: number;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const inputCls = 'w-full px-3 py-2 bg-muted/40 border border-border rounded-md text-sm text-foreground outline-none';
const labelCls = 'block text-xs font-semibold text-muted-foreground mb-1';

function StaffBroadcastCard() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [link, setLink] = useState('');
  const [audience, setAudience] = useState<'all' | 'selected'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/notifications/broadcast', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to load broadcast data');
      setStaff(Array.isArray(j.staff) ? j.staff : []);
      setBroadcasts(Array.isArray(j.broadcasts) ? j.broadcasts : []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load broadcast data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recipientCount = audience === 'all' ? staff.length : selected.size;

  const toggleStaff = (id: string) => {
    setConfirming(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const send = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSending(true);
    setSendError(null);
    setSentNote(null);
    try {
      const res = await fetch('/api/admin/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: bodyText.trim() || undefined,
          link: link.trim() || undefined,
          audience,
          staffIds: audience === 'selected' ? [...selected] : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Send failed');
      setSentNote(`Broadcast sent to ${j.sent} staff member${j.sent === 1 ? '' : 's'}.`);
      setTitle('');
      setBodyText('');
      setLink('');
      setSelected(new Set());
      setConfirming(false);
      await load();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between gap-3">
        <div>
          <span className="font-semibold text-sm">Broadcast to Staff</span>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 bg-card border border-border rounded-md text-sm font-semibold hover:bg-muted/50 disabled:opacity-60 inline-flex items-center gap-1.5 shrink-0"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {loadError ? (
          <div className="flex items-start gap-2 text-[13px]">
            <AlertCircle className="size-4 mt-0.5 shrink-0" style={{ color: '#ba1a1a' }} />
            <span>{loadError}</span>
          </div>
        ) : null}

        <div>
          <label className={labelCls} htmlFor="bc-title">Title</label>
          <input
            id="bc-title"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setConfirming(false); }}
            maxLength={200}
            placeholder="e.g. Holiday hours next week"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="bc-body">Message</label>
          <textarea
            id="bc-body"
            value={bodyText}
            onChange={(e) => { setBodyText(e.target.value); setConfirming(false); }}
            maxLength={2000}
            rows={4}
            placeholder="What staff need to know…"
            className={`${inputCls} resize-y`}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="bc-link">Link (optional)</label>
          <input
            id="bc-link"
            value={link}
            onChange={(e) => { setLink(e.target.value); setConfirming(false); }}
            maxLength={500}
            placeholder="/employee/… — opens inside the employee portal"
            className={inputCls}
          />
        </div>

        <div>
          <span className={labelCls}>Audience</span>
          <div className="flex items-center gap-2" role="tablist" aria-label="Audience">
            {(
              [
                ['all', `All active staff (${staff.length})`],
                ['selected', 'Selected staff'],
              ] as ['all' | 'selected', string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={audience === value}
                onClick={() => { setAudience(value); setConfirming(false); }}
                className="px-3 py-1.5 rounded-md text-sm font-semibold border border-border"
                style={
                  audience === value
                    ? { backgroundColor: '#171420', color: '#ffffff', borderColor: '#171420' }
                    : { backgroundColor: 'transparent', color: 'inherit' }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {audience === 'selected' ? (
            <div className="border border-border rounded-md max-h-56 overflow-y-auto divide-y divide-border mt-3">
              {staff.length === 0 ? (
                <p className="px-3 py-2 text-[13px] text-muted-foreground">No active staff in the selected tenant.</p>
              ) : (
                staff.map((s) => (
                  <label key={s.id} className="flex items-center gap-3 px-3 py-2 text-[13px] cursor-pointer hover:bg-muted/40">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggleStaff(s.id)}
                      className="size-4"
                    />
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground">{s.email || 'no email on file'}</span>
                    <span className="text-muted-foreground">· {s.role}</span>
                  </label>
                ))
              )}
            </div>
          ) : null}
        </div>

        {sendError ? (
          <div className="flex items-start gap-2 text-[13px]">
            <AlertCircle className="size-4 mt-0.5 shrink-0" style={{ color: '#ba1a1a' }} />
            <span>{sendError}</span>
          </div>
        ) : null}
        {sentNote ? (
          <div className="flex items-start gap-2 text-[13px]">
            <CheckCircle2 className="size-4 mt-0.5 shrink-0" style={{ color: '#0a6400' }} />
            <span>{sentNote}</span>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={send}
            disabled={sending || loading || !title.trim() || recipientCount === 0}
            className="px-4 py-1.5 rounded-md text-sm font-semibold text-white shadow-sm inline-flex items-center gap-1.5 disabled:opacity-60"
            style={{ backgroundColor: '#171420' }}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {confirming
              ? `Confirm — send to ${recipientCount} staff member${recipientCount === 1 ? '' : 's'}`
              : 'Send broadcast'}
          </button>
          {confirming && !sending ? (
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-[13px] font-semibold hover:underline"
              style={{ color: '#0077c5' }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border">
        <div className="px-5 py-3.5 bg-muted/30 border-b border-border">
          <span className="text-xs font-bold uppercase tracking-wider">Recent broadcasts</span>
        </div>
        {loading ? (
          <p className="px-5 py-4 text-[13px] text-muted-foreground flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : broadcasts.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted-foreground">
            No broadcasts have been sent yet. Staff notification lists stay empty until the first
            broadcast is sent from here.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {broadcasts.map((b, i) => (
              <div key={`${b.createdAt}-${i}`} className="px-5 py-3.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-sm font-semibold">{b.title || '(untitled)'}</span>
                  <span className="text-xs text-muted-foreground">{when(b.createdAt)}</span>
                </div>
                {b.body ? <p className="text-[13px] text-muted-foreground mt-0.5">{b.body}</p> : null}
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sent to {b.recipients} staff · read by {b.readCount}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [counts, setCounts] = useState<{ attention: number; customers: number; sellers: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/dashboard/views', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems(j.data?.attention?.items ?? []);
        setCounts(j.data?.counts ?? null);
      }
    } catch { /* the empty state below is the honest render */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markAllResolved = async () => {
    setResolving(true);
    setResolveNote(null);
    try {
      const res = await fetch('/api/admin/dashboard/views', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-all-resolved' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Resolve failed');
      setResolveNote(
        `Resolved ${j.data.notificationsRead} support notification(s) and ${j.data.inventoryAlertsResolved} inventory alert(s). ` +
        'SLA breaches and tasks stay open until they are handled in their own modules.',
      );
      await load();
    } catch (e) {
      setResolveNote(e instanceof Error ? e.message : 'Resolve failed');
    } finally { setResolving(false); }
  };

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1400px] mx-auto w-full">
      <ViewHeader title="Attention Queue">
        <button
          type="button"
          onClick={markAllResolved}
          disabled={resolving}
          className="px-4 py-1.5 bg-card border border-border rounded-md text-sm font-semibold hover:bg-muted/50 disabled:opacity-60"
        >
          {resolving ? 'Resolving…' : 'Mark all resolved'}
        </button>
      </ViewHeader>

      <div className="flex items-center gap-6 border-b border-border">
        <span className="pb-2 border-b-2 font-semibold text-sm" style={{ borderColor: '#0a6400', color: '#0a6400' }}>
          System Alerts ({counts?.attention ?? 0})
        </span>
        <Link href="/admin/notifications/customers" className="pb-2 border-b-2 border-transparent text-muted-foreground hover:text-foreground font-medium text-sm">
          Customer Alerts ({counts?.customers ?? 0})
        </Link>
        <Link href="/admin/notifications/seller" className="pb-2 border-b-2 border-transparent text-muted-foreground hover:text-foreground font-medium text-sm">
          Seller Alerts ({counts?.sellers ?? 0})
        </Link>
      </div>

      {resolveNote ? <p className="text-[13px]">{resolveNote}</p> : null}

      <div className="flex flex-col gap-3">
        {loading ? (
          <p className="text-[13px] text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Loading the queue…</p>
        ) : items.length === 0 ? (
          <p className="text-[13px] text-muted-foreground border border-border rounded-xl p-4 bg-card">
            The queue is clear — no SLA breaches, stock alerts, unread support notifications, or high-priority tasks are open.
          </p>
        ) : (
          items.map((it) => {
            const Icon = KIND_ICON[it.kind as keyof typeof KIND_ICON] ?? TriangleAlert;
            const color = KIND_COLOR[it.kind as keyof typeof KIND_COLOR] ?? '#ba1a1a';
            return (
              <div key={it.id} className="flex items-start gap-4 p-4 bg-card border border-border rounded-xl shadow-sm">
                <Icon className="mt-0.5 shrink-0" size={22} style={{ color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1 gap-3">
                    <span className="font-semibold text-sm">{it.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{it.meta || timeAgo(it.at)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{it.detail}</p>
                </div>
                <Link href={it.href} className="px-3 py-1 bg-card border border-border rounded text-xs font-semibold hover:bg-[#171420] hover:text-white shrink-0">
                  {it.actionLabel}
                </Link>
              </div>
            );
          })
        )}
      </div>

      <StaffBroadcastCard />
    </div>
  );
}

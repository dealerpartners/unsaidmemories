'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ViewHeader, timeAgo, initialsOf } from '@/components/admin/ViewHeader';

// ============================================================================
// /admin/notifications/customers — Customer Notifications (owner's
// DASHBOARD_VIEW.html, View 6). This view IS the page (owner's verdict,
// 2026-11-02: his file replaces the presentation — the legacy K3
// broadcast page that used to render below the events list is
// unmounted; the composer now lives INSIDE this view's layout as the
// card under the events list, which the header's "Batch Send Status"
// button anchors to).
//
// The event list + unread count read customer_notifications through
// /api/admin/dashboard/views — the same store the composer writes to,
// and the same count the shell siderail's Queues badge shows. The
// composer sends through the real customer broadcast path
// (GET/POST /api/admin/notifications/customer-broadcast → one
// customer_notifications row per customer; in-app only, no email leg).
// ============================================================================

type CustItem = { id: string; type: string; title: string; body: string; at: string | null; read: boolean };

type Customer = { id: string; name: string; email: string | null };
type Broadcast = { title: string; body: string | null; link: string | null; createdAt: string; recipients: number; readCount: number };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const inputCls = 'w-full px-3 py-2 bg-muted/40 border border-border rounded-md text-sm text-foreground outline-none';
const labelCls = 'block text-xs font-semibold text-muted-foreground mb-1';

function CustomerBroadcastCard() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [population, setPopulation] = useState(0);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [link, setLink] = useState('');
  const [audience, setAudience] = useState<'all' | 'selected'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/notifications/customer-broadcast', { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Load failed');
      setCustomers(d.customers || []);
      setPopulation(d.population || 0);
      setBroadcasts(d.broadcasts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch('/api/admin/notifications/customer-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: bodyText.trim(),
          link: link.trim(),
          audience,
          customerIds: audience === 'selected' ? [...selected] : undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Send failed');
      setNotice(`Broadcast recorded for ${d.sent} customer${d.sent === 1 ? '' : 's'}.`);
      setTitle('');
      setBodyText('');
      setLink('');
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="customer-broadcasts" className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between gap-3">
        <div>
          <span className="font-semibold text-sm">Broadcast to Customers</span>
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
        {error ? (
          <div className="flex items-start gap-2 text-[13px]">
            <AlertCircle className="size-4 mt-0.5 shrink-0" style={{ color: '#ba1a1a' }} />
            <span>{error}</span>
          </div>
        ) : null}
        {notice ? (
          <div className="flex items-start gap-2 text-[13px]">
            <CheckCircle2 className="size-4 mt-0.5 shrink-0" style={{ color: '#0a6400' }} />
            <span>{notice}</span>
          </div>
        ) : null}

        <div>
          <label className={labelCls} htmlFor="cb-title">Title (required)</label>
          <input id="cb-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} />
        </div>

        <div>
          <label className={labelCls} htmlFor="cb-body">Body</label>
          <textarea id="cb-body" value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={3} maxLength={2000} className={`${inputCls} resize-y`} />
        </div>

        <div>
          <label className={labelCls} htmlFor="cb-link">Link (internal path, optional)</label>
          <input id="cb-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="/account/…" maxLength={500} className={inputCls} />
        </div>

        <div>
          <span className={labelCls}>Audience</span>
          <div className="flex items-center gap-2" role="tablist" aria-label="Audience">
            {(
              [
                ['all', `All customers (${population})`],
                ['selected', `Selected (${selected.size})`],
              ] as ['all' | 'selected', string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={audience === value}
                onClick={() => setAudience(value)}
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
              {customers.length === 0 ? (
                <p className="px-3 py-2 text-[13px] text-muted-foreground">No customers in this tenant.</p>
              ) : (
                customers.map((c) => (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2 text-[13px] cursor-pointer hover:bg-muted/40">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="size-4" />
                    <span className="font-medium">{c.name}</span>
                    {c.email ? <span className="text-muted-foreground">{c.email}</span> : null}
                  </label>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div>
          <button
            type="button"
            disabled={busy || loading || !title.trim() || (audience === 'selected' && selected.size === 0)}
            onClick={send}
            className="px-4 py-1.5 rounded-md text-sm font-semibold text-white shadow-sm inline-flex items-center gap-1.5 disabled:opacity-60"
            style={{ backgroundColor: '#171420' }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send broadcast
          </button>
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
          <p className="px-5 py-4 text-[13px] text-muted-foreground">No customer broadcasts have been sent for this tenant.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 font-semibold text-muted-foreground uppercase text-xs">
              <tr>
                <th className="px-5 py-3">When</th>
                <th className="px-5 py-3">Title</th>
                <th className="px-5 py-3 text-right">Recipients</th>
                <th className="px-5 py-3 text-right">Read</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {broadcasts.map((b, i) => (
                <tr key={i} className="hover:bg-muted/40">
                  <td className="px-5 py-3 text-xs text-muted-foreground">{when(b.createdAt)}</td>
                  <td className="px-5 py-3 font-medium">{b.title}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs">{b.recipients}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs">{b.readCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function CustomerNotificationsPage() {
  const [items, setItems] = useState<CustItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/dashboard/views', { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (res.ok) {
          setItems(j.data?.customers?.items ?? []);
          setUnread(j.data?.customers?.unread ?? 0);
        }
      } catch { /* honest empty state below */ }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1400px] mx-auto w-full">
      <ViewHeader title="Customer Notifications">
        <a href="#customer-broadcasts" className="px-3 py-1.5 bg-card border border-border rounded-md text-sm font-semibold hover:bg-muted/50">
          Batch Send Status
        </a>
      </ViewHeader>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <span className="font-semibold text-sm">Incoming Customer Events &amp; Direct Requests</span>
          <span className="text-xs text-muted-foreground font-mono">{unread} Unread</span>
        </div>
        <div className="divide-y divide-border text-sm">
          {loading ? (
            <p className="px-5 py-4 text-[13px] text-muted-foreground">Loading customer events…</p>
          ) : items.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-muted-foreground">
              No customer notifications recorded yet — events land in customer_notifications and appear here as they are written.
            </p>
          ) : (
            items.map((c) => (
              <div key={c.id} className="px-5 py-4 flex items-center justify-between hover:bg-muted/40 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style={{ backgroundColor: 'rgba(10,100,0,0.1)', color: '#0a6400' }}>
                    {initialsOf(c.title)}
                  </span>
                  <div className="min-w-0">
                    <span className="font-semibold block truncate">{c.title}</span>
                    <p className="text-xs text-muted-foreground truncate">{c.body || c.type}</p>
                  </div>
                </div>
                <span className="flex items-center gap-2 shrink-0">
                  {!c.read ? <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#ba1a1a' }} title="Unread" /> : null}
                  <span className="text-xs text-muted-foreground font-mono">{timeAgo(c.at)}</span>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <CustomerBroadcastCard />
    </div>
  );
}

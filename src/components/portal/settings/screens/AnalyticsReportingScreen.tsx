'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { escapeHtmlClient, openPrintDocument } from '@/lib/printing/client';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Percent, 
  Zap, 
  TrendingDown, 
  ShieldAlert, 
  Download, 
  Printer, 
  Calendar,
  Lock,
  RefreshCw,
  Activity,
  Bell,
  CalendarCheck,
  Repeat,
  ShoppingBag,
  Send
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Live event stream — the salon's OWN custom analytics (analytics_events
// table in Supabase), fed by the client-side `track` library. Independent
// of the Google console: booking + ecommerce events land here via
// navigator.sendBeacon while the visitor granted the analytics cookie
// category.
// ---------------------------------------------------------------------------
type LiveEvent = {
  id: string
  createdAt: string
  event: string
  page: string
  sessionId?: string
  value: number | null
  currency?: string
  data: Record<string, unknown>
}
type LiveCounts = { event: string; count: number; totalValue: number }

function LiveEventStream() {
  const [events, setEvents] = useState<LiveEvent[] | null>(null)
  const [counts, setCounts] = useState<LiveCounts[]>([])
  const [sessions, setSessions] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Initial load — results land in the async callbacks only (codebase
  // pattern); `events === null` is the initial loading state.
  useEffect(() => {
    let alive = true
    fetch('/api/analytics/events?limit=50&days=7')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!alive) return
        setEvents(d.recent || [])
        setCounts(d.counts || [])
        setSessions(d.sessions || 0)
      })
      .catch((e: Error) => {
        if (alive) setError(e.message)
      })
    return () => {
      alive = false
    }
  }, [])

  const load = () => {
    setRefreshing(true)
    setError(null)
    fetch('/api/analytics/events?limit=50&days=7')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        setEvents(d.recent || [])
        setCounts(d.counts || [])
        setSessions(d.sessions || 0)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setRefreshing(false))
  }

  const totalEvents = counts.reduce((n, c) => n + c.count, 0)
  const totalValue = counts.reduce((n, c) => n + (c.totalValue || 0), 0)

  return (
    <div className="border border-border bg-card">
      {/* Panel header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
            Live Event Stream — Custom Analytics
          </span>
          <span className="border border-border bg-card px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
            analytics_events · 7 days
          </span>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="flex h-7 items-center gap-1.5 border border-border bg-card px-2.5 text-[9px] font-semibold uppercase tracking-wider text-foreground hover:bg-muted/40 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">
          Event stream unavailable ({error}). The table exists — events appear here as visitors
          with analytics consent browse, add to bag, book, or purchase.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px]">
          {/* Recent events */}
          <div className="max-h-96 overflow-y-auto border-r border-border">
            {events === null ? (
              <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">Loading…</div>
            ) : events.length === 0 ? (
              <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">
                No events recorded in the last 7 days yet.
              </div>
            ) : (
              <table className="w-full text-[10px] tabular-nums">
                <thead className="sticky top-0 bg-muted/60 text-[9px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Time</th>
                    <th className="px-3 py-2 text-left font-semibold">Event</th>
                    <th className="px-3 py-2 text-left font-semibold">Page</th>
                    <th className="px-3 py-2 text-left font-semibold">Detail</th>
                    <th className="px-3 py-2 text-right font-semibold">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-t border-border/50">
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="border border-border bg-muted/40 px-1.5 py-0.5 font-semibold">{e.event}</span>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{e.page || '—'}</td>
                      <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[220px]">
                        {e.data && typeof e.data === 'object'
                          ? (e.data.item_name as string)
                            || ((e.data.items as any[])?.[0]?.item_name as string)
                            || (e.data.step_name as string)
                            || (e.data.booking_flow as string)
                            || (e.data.lead_type as string)
                            || ''
                          : ''}
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold">
                        {e.value != null ? `$${e.value.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Aggregate rail */}
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-border bg-muted/30 p-3">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Events · 7d</div>
                <div className="mt-1 text-[20px] font-semibold tabular-nums">{totalEvents}</div>
              </div>
              <div className="border border-border bg-muted/30 p-3">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Sessions</div>
                <div className="mt-1 text-[20px] font-semibold tabular-nums">{sessions}</div>
              </div>
            </div>
            <div className="mt-3 border border-border bg-muted/30 p-3">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Event value · 7d
              </div>
              <div className="mt-1 text-[20px] font-semibold tabular-nums">${totalValue.toFixed(2)}</div>
            </div>
            <div className="mt-3 space-y-1">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                By event name
              </div>
              {counts.length === 0 ? (
                <div className="text-[10px] text-muted-foreground">—</div>
              ) : (
                counts.slice(0, 14).map((c) => (
                  <div key={c.event} className="flex items-center justify-between text-[10px] tabular-nums">
                    <span className="truncate text-foreground">{c.event}</span>
                    <span className="ml-2 shrink-0 text-muted-foreground">{c.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Email alerts — the Notifications box. The owner's standing ruling: every
// captured business event lands in the salon's inbox as an email alert —
// booking requests (with the exact services), subscription events, and shop
// orders. This panel shows WHERE they land (editable destination), the
// master toggle, live per-type activity from the email_messages audit
// trail, and fires a real test alert end-to-end.
// ---------------------------------------------------------------------------
type NotificationsData = {
  destination: string
  alertsEnabled: boolean
  types: { key: string; label: string; description: string; sent7d: number; sentTotal: number; lastSentAt: string | null }[]
  recent: { id: string; template: string; subject: string; toEmail: string; status: string; createdAt: string }[]
}

const ALERT_TYPE_ICONS: Record<string, typeof CalendarCheck> = {
  booking: CalendarCheck,
  subscription: Repeat,
  order: ShoppingBag,
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function AlertStatusChip({ status }: { status: string }) {
  const s = String(status || '').toUpperCase()
  if (s === 'SENT') {
    return <span className="shrink-0 bg-success text-success-foreground px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">Sent</span>
  }
  if (s === 'FAILED') {
    return <span className="shrink-0 bg-destructive text-destructive-foreground px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">Failed</span>
  }
  return <span className="shrink-0 border border-border bg-muted/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{s || '—'}</span>
}

function NotificationsPanel() {
  const [data, setData] = useState<NotificationsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [emailDraft, setEmailDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [toggling, setToggling] = useState(false)
  const [sending, setSending] = useState(false)
  const [railFeedback, setRailFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const apply = (d: NotificationsData) => {
    setData(d)
    setEmailDraft(d.destination)
  }

  // Initial load — same callback-only pattern as LiveEventStream above;
  // `data === null && !error` is the loading state.
  useEffect(() => {
    let alive = true
    fetch('/api/admin/notifications')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: NotificationsData) => { if (alive) apply(d) })
      .catch((e: Error) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [])

  const refresh = () => {
    setRefreshing(true)
    setError(null)
    fetch('/api/admin/notifications')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: NotificationsData) => apply(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setRefreshing(false))
  }

  const patch = (body: Record<string, unknown>): Promise<{ ok: boolean; data: NotificationsData | null; error?: string }> =>
    fetch('/api/admin/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d as NotificationsData, error: d?.error })))
      .catch((e: Error) => ({ ok: false, data: null, error: e.message }))

  const saveDestination = () => {
    const email = emailDraft.trim()
    if (!email) {
      setSaveFeedback({ ok: false, text: 'Enter an email address first.' })
      return
    }
    setSaving(true)
    setSaveFeedback(null)
    patch({ alertEmail: email }).then(({ ok, data: d, error }) => {
      if (ok && d?.destination) {
        apply(d)
        setSaveFeedback({ ok: true, text: `Saved — every salon alert now routes to ${d.destination}.` })
      } else {
        setSaveFeedback({ ok: false, text: error || 'Save failed.' })
      }
    }).finally(() => setSaving(false))
  }

  const toggleAlerts = () => {
    if (!data) return
    setToggling(true)
    setRailFeedback(null)
    patch({ alertsEnabled: !data.alertsEnabled }).then(({ ok, data: d, error }) => {
      if (ok && d) apply(d)
      else setRailFeedback({ ok: false, text: error || 'Toggle failed.' })
    }).finally(() => setToggling(false))
  }

  const sendTest = () => {
    setSending(true)
    setRailFeedback(null)
    fetch('/api/admin/notifications/test', { method: 'POST' })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok && d?.ok) {
          setRailFeedback({ ok: true, text: `Test alert sent to ${d.destination} — check the inbox.` })
          refresh()
        } else {
          setRailFeedback({ ok: false, text: d?.error || 'Test send failed.' })
        }
      })
      .catch((e: Error) => setRailFeedback({ ok: false, text: e.message }))
      .finally(() => setSending(false))
  }

  const total7d = data ? data.types.reduce((n, t) => n + t.sent7d, 0) : 0
  const totalAll = data ? data.types.reduce((n, t) => n + t.sentTotal, 0) : 0

  return (
    <div className="border border-border bg-card">
      {/* Panel header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
            Email Alerts — Notifications
          </span>
          <span className="border border-border bg-card px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
            email_messages · live
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing || !data}
          className="flex h-7 items-center gap-1.5 border border-border bg-card px-2.5 text-[9px] font-semibold uppercase tracking-wider text-foreground hover:bg-muted/40 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">
          Notifications data unavailable ({error}). The alert senders are still live — only this panel's read of the
          email_messages audit trail failed.
        </div>
      ) : !data ? (
        /* Loading skeletons */
        <div className="p-4 space-y-3">
          <div className="h-8 w-2/3 animate-pulse bg-muted/40" />
          <div className="h-16 animate-pulse bg-muted/30" />
          <div className="h-16 animate-pulse bg-muted/30" />
          <div className="h-16 animate-pulse bg-muted/30" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px]">
            {/* Destination + alert type rows */}
            <div className="space-y-4 border-b border-border p-4 lg:border-b-0 lg:border-r">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Alerts land in</div>
                <div className="mt-1.5 flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    value={emailDraft}
                    onChange={(e) => { setEmailDraft(e.target.value); setSaveFeedback(null) }}
                    placeholder="booking@unsaid.com"
                    aria-label="Alert destination email"
                    className="h-8 min-w-0 flex-1 border border-border bg-card px-2.5 text-[12px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={saveDestination}
                    disabled={saving || emailDraft.trim() === data.destination}
                    className="h-8 shrink-0 border border-border bg-primary px-3 text-[9px] font-semibold uppercase tracking-wider text-primary-foreground transition-none hover:bg-muted disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? 'Saving…' : 'Save destination'}
                  </button>
                </div>
                {saveFeedback && (
                  <div className={`mt-1.5 text-[10px] ${saveFeedback.ok ? 'text-success' : 'text-destructive'}`}>
                    {saveFeedback.text}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {data.types.map((t) => {
                  const Icon = ALERT_TYPE_ICONS[t.key] || Bell
                  return (
                    <div key={t.key} className="flex items-start gap-3 border border-border bg-muted/30 p-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-border bg-card">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold text-foreground">{t.label}</div>
                        <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{t.description}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tabular-nums text-muted-foreground">
                          <span>7d: <span className="font-semibold text-foreground">{t.sent7d}</span></span>
                          <span>all-time: <span className="font-semibold text-foreground">{t.sentTotal}</span></span>
                          <span>last sent: {t.lastSentAt ? relTime(t.lastSentAt) : '—'}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Rail: master toggle + totals + test send */}
            <div className="space-y-3 p-4">
              <div className="border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Alerts enabled</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={data.alertsEnabled}
                    aria-label="Toggle salon email alerts"
                    onClick={toggleAlerts}
                    disabled={toggling}
                    className={`relative h-5 w-9 shrink-0 cursor-pointer border transition-colors disabled:opacity-50 ${
                      data.alertsEnabled ? 'border-primary bg-primary' : 'border-border bg-muted'
                    }`}
                  >
                    <span
                      className={`absolute top-[1px] h-[16px] w-[16px] border border-border bg-card transition-all ${
                        data.alertsEnabled ? 'left-[19px]' : 'left-[1px]'
                      }`}
                    />
                  </button>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  Every booking, subscription, and order event emails the salon. Turning this off silences the salon
                  copies only — customer emails are never affected.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="border border-border bg-muted/30 p-3">
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Alerts · 7d</div>
                  <div className="mt-1 text-[20px] font-semibold tabular-nums">{total7d}</div>
                </div>
                <div className="border border-border bg-muted/30 p-3">
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">All-time</div>
                  <div className="mt-1 text-[20px] font-semibold tabular-nums">{totalAll}</div>
                </div>
              </div>

              <button
                onClick={sendTest}
                disabled={sending}
                className="flex h-8 w-full items-center justify-center gap-1.5 border border-border bg-primary px-3 text-[9px] font-semibold uppercase tracking-wider text-primary-foreground transition-none hover:bg-muted disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-3 w-3" />
                {sending ? 'Sending…' : 'Send test alert'}
              </button>
              {railFeedback && (
                <div className={`text-[10px] leading-relaxed ${railFeedback.ok ? 'text-success' : 'text-destructive'}`}>
                  {railFeedback.text}
                </div>
              )}
            </div>
          </div>

          {/* Recent alerts — last 10 salon-alert emails from the audit trail */}
          <div className="border-t border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent alerts — last 10
              </span>
              <span className="text-[9px] tabular-nums text-muted-foreground">to {data.destination}</span>
            </div>
            {data.recent.length === 0 ? (
              <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">
                No salon alerts recorded yet — they appear here the moment a booking request, subscription event, or
                shop order is captured.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto overflow-x-auto custom-scrollbar">
                <table className="w-full text-[10px] tabular-nums">
                  <thead className="sticky top-0 bg-muted/60 text-[9px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Template</th>
                      <th className="px-3 py-2 text-left font-semibold">Subject</th>
                      <th className="px-3 py-2 text-left font-semibold">To</th>
                      <th className="px-3 py-2 text-left font-semibold">Status</th>
                      <th className="px-3 py-2 text-right font-semibold">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((a) => (
                      <tr key={a.id} className="border-t border-border/50">
                        <td className="px-3 py-1.5">
                          <span className="border border-border bg-muted/40 px-1.5 py-0.5 font-semibold">
                            {a.template.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="max-w-[260px] truncate px-3 py-1.5 text-foreground">{a.subject}</td>
                        <td className="max-w-[150px] truncate px-3 py-1.5 text-muted-foreground">{a.toEmail}</td>
                        <td className="px-3 py-1.5"><AlertStatusChip status={a.status} /></td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">{relTime(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface ScreenProps {
  systemSettings?: any;
  saveSettingsToDb?: (updates: any) => void;
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
}

export const AnalyticsReportingScreen: React.FC<ScreenProps> = ({
  onNavigateScreen,
  selectedLocation,
  onSelectLocation,
}) => {
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // -----------------------------------------------------------------------
  // Live data — every figure on this screen comes from a real admin API:
  //   /api/admin/reports/revenue  → MTD revenue, payment count, avg ticket
  //   /api/admin/dashboard/kpis   → appointments today, new customers (30d),
  //                                 no-show rate (30d), rebook rate (30d)
  //   /api/admin/dashboard/widgets→ staff roster + today's appointments,
  //                                 profile commission rate + accrued
  //                                 commission (crm_commission_entries)
  //   /api/analytics/events       → booking-wizard event telemetry
  // Metrics with no live source (per-stylist billings/ratings) render
  // as honest "No data yet" states — never as invented numbers. Rates
  // are null when their 30-day denominator is 0, and render "No data
  // yet" then too. Each fetch fails independently; a failed slice
  // leaves its panels in the no-data state.
  // The §4.3 PROJECTIONS panel is REMOVED (BL-8, honest-removal horn):
  // no forecasting model exists anywhere in the estate, so the screen
  // no longer carries a panel implying one. If a real projection model
  // is ever built, the panel returns with it — not before.
  // -----------------------------------------------------------------------
  const [range, setRange] = useState(30);
  const [rev, setRev] = useState<{ mtdRevenue: number; mtdPayments: number; avgTicket: number } | null>(null);
  const [kpis, setKpis] = useState<{
    todayAppointments: number; newCustomers30d: number;
    noShowRate30d: number | null; noShowCounts: { noShow: number; total: number } | null;
    rebookRate30d: number | null; rebookCounts: { rebookCustomers: number; totalCustomers: number } | null;
  } | null>(null);
  const [staff, setStaff] = useState<{ id: string; name: string; role: string; todayAppointments: number; commissionRate: number | null; commissionAccrued: number }[] | null>(null);
  const [funnel, setFunnel] = useState<{ counts: LiveCounts[]; sessions: number } | null>(null);
  // §4.3 — comparisons, forecasts and the per-location rollup from
  // /api/admin/analytics/insights (the projections panel previously
  // admitted no model was connected; the rollup was one hardcoded row).
  const [insights, setInsights] = useState<any>(null);

  const loadAll = useCallback((days: number) => {
    fetch('/api/admin/reports/revenue')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setRev({
        mtdRevenue: Number(d?.mtd?.mtd_revenue ?? 0),
        mtdPayments: Number(d?.mtd?.mtd_payments ?? 0),
        avgTicket: Number(d?.mtd?.avg_ticket ?? 0),
      }))
      .catch(() => setRev(null));
    fetch('/api/admin/dashboard/kpis')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setKpis({
        todayAppointments: Number(d?.data?.todayAppointments ?? 0),
        newCustomers30d: Number(d?.data?.newCustomers30d ?? 0),
        noShowRate30d: d?.data?.noShowRate30d != null ? Number(d.data.noShowRate30d) : null,
        noShowCounts: d?.data?.noShowCounts ?? null,
        rebookRate30d: d?.data?.rebookRate30d != null ? Number(d.data.rebookRate30d) : null,
        rebookCounts: d?.data?.rebookCounts ?? null,
      }))
      .catch(() => setKpis(null));
    fetch('/api/admin/dashboard/widgets')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setStaff(Array.isArray(d?.staffSchedules) ? d.staffSchedules : []))
      .catch(() => setStaff(null));
    fetch(`/api/analytics/events?limit=1&days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setFunnel({ counts: d?.counts || [], sessions: Number(d?.sessions ?? 0) }))
      .catch(() => setFunnel(null));
    fetch('/api/admin/analytics/insights')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setInsights(d))
      .catch(() => setInsights(null));
  }, []);

  useEffect(() => {
    loadAll(range);
  }, [loadAll, range]);

  const money = (n: number | null | undefined): string | null =>
    n == null || Number.isNaN(Number(n))
      ? null
      : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const evCount = (name: string): number | null =>
    funnel ? (funnel.counts.find((c) => c.event === name)?.count ?? 0) : null;
  const funnelTotal = funnel ? funnel.counts.reduce((n, c) => n + c.count, 0) : 0;
  const funnelValue = funnel ? funnel.counts.reduce((n, c) => n + (c.totalValue || 0), 0) : 0;
  const beginBooking = evCount('begin_booking');
  const paymentInfo = evCount('add_payment_info');
  const bookingsCreated = evCount('booking_created');
  const staffTodayTotal = staff ? staff.reduce((n, s) => n + (s.todayAppointments || 0), 0) : null;

  // The rollup rows are assembled once and shared by the CSV export
  // and the printed executive rollup, so both always agree.
  const rollupRows = (): string[][] => [
      ['Section', 'Metric', 'Value'],
      ['Revenue', 'Total revenue (MTD)', rev ? money(rev.mtdRevenue) ?? '' : 'No data yet'],
      ['Revenue', 'Payments settled (MTD)', rev ? String(rev.mtdPayments) : 'No data yet'],
      ['Revenue', 'Average ticket (MTD)', rev ? money(rev.avgTicket) ?? '' : 'No data yet'],
      ['Bookings', `Bookings created (${range}d, online wizard)`, bookingsCreated != null ? String(bookingsCreated) : 'No data yet'],
      ['Bookings', 'Appointments today', kpis ? String(kpis.todayAppointments) : 'No data yet'],
      ['Clients', 'New customers (30d)', kpis ? String(kpis.newCustomers30d) : 'No data yet'],
      ['Bookings', 'No-show rate (30d)', kpis?.noShowRate30d != null ? `${kpis.noShowRate30d}%` : 'No data yet'],
      ['Bookings', 'Rebook rate (30d)', kpis?.rebookRate30d != null ? `${kpis.rebookRate30d}%` : 'No data yet'],
      ['Staff', 'Name', 'Role', 'Appointments today', 'Commission rate', 'Commission accrued (pending)'],
      ...(staff ?? []).map((s) => ['Staff', s.name, s.role, String(s.todayAppointments || 0), s.commissionRate != null ? `${s.commissionRate}%` : '', money(s.commissionAccrued) ?? '']),
    ];

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = rollupRows();
    const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unsaid-audit-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`EXPORTED AUDIT LEDGER CSV — ${rows.length - 1} ROWS`);
  };

  // PRINT EXECUTIVE ROLLUP — the same rows as the CSV export, rendered
  // as a letter document and printed on THIS device's printer via the
  // print dialog (replaces a bare window.print() of the settings
  // screen itself).
  const printRollup = async () => {
    const rows = rollupRows().slice(1); // drop the header row
    const metrics = rows.filter((r) => r[0] !== 'Staff'); // staff renders as its own table below
    const staffRows = (staff ?? []).map((s) => [s.name, s.role, String(s.todayAppointments || 0), s.commissionRate != null ? `${s.commissionRate}%` : '—', money(s.commissionAccrued) ?? '—']);
    const body = `
      <h1>Executive Rollup</h1>
      <p class="muted">MTD: ${monthLabel} · Window: last ${range} days · Generated ${new Date().toLocaleString()}</p>
      <table><thead><tr><th>Section</th><th>Metric</th><th>Value</th></tr></thead>
      <tbody>${metrics.map((r) => `<tr><td>${escapeHtmlClient(r[0])}</td><td>${escapeHtmlClient(r[1])}</td><td>${escapeHtmlClient(r[2])}</td></tr>`).join('')}</tbody></table>
      ${staffRows.length > 0 ? `<h2>Staff — appointments today</h2>
      <table><thead><tr><th>Name</th><th>Role</th><th class="r">Appointments today</th><th class="r">Commission rate</th><th class="r">Commission accrued (pending)</th></tr></thead>
      <tbody>${staffRows.map((r) => `<tr><td>${escapeHtmlClient(r[0])}</td><td>${escapeHtmlClient(r[1])}</td><td class="r">${r[2]}</td><td class="r">${r[3]}</td><td class="r">${escapeHtmlClient(r[4])}</td></tr>`).join('')}</tbody></table>` : ''}`;
    await openPrintDocument({ title: 'Executive Rollup', docType: 'document', bodyHtml: body });
  };

  const monthLabel = new Date()
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    .toUpperCase();

  return (
    <div className="w-full bg-card text-foreground font-sans antialiased text-[13px]">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-3 border border-white z-50 flex items-center gap-3 tabular-nums text-[13px] shadow-2xl">
          <span className="w-2 h-2 bg-card animate-pulse"></span>
          <span className="uppercase font-semibold tracking-wider">{toastMsg}</span>
          <button onClick={() => setToastMsg(null)} className="ml-2 text-white hover:opacity-70 cursor-pointer">✕</button>
        </div>
      )}

      {/* SECURITY CLEARANCE & CONTEXT BAR */}
      <div className="w-full bg-primary text-primary-foreground px-4 py-2 flex flex-wrap items-center justify-between border-b border-border text-[10px] tabular-nums tracking-wider uppercase">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-destructive"></span>
          <span className="text-destructive font-semibold tracking-tight">RESTRICTED ACCREDITATION</span>
          <span className="text-muted-foreground">{"//"}</span>
          <span className="text-white">AUTH_SCOPE: SUPER_ADMIN_LEVEL_0</span>
          <span className="text-muted-foreground">{"//"}</span>
          <span className="text-muted-foreground/50">NODE: MEMPHIS-MAIN</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] tabular-nums text-muted-foreground/70">
          <span>SOURCE: LIVE ADMIN APIS</span>
        </div>
      </div>

      {/* BREADCRUMB & EXECUTIVE TOOLBAR */}
      <div className="w-full bg-card border-b border-border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 tabular-nums text-[10px] text-muted-foreground">
            <span>ADMIN SETTINGS</span>
            <span className="text-foreground font-semibold">&gt;&gt;</span>
            <span className="text-foreground font-semibold">ANALYTICS &amp; EXECUTIVE REPORTING</span>
            <span className="text-foreground font-semibold">&gt;&gt;</span>
            <span className="bg-primary text-primary-foreground px-1 text-[9px] font-semibold">SUPER_ADMIN L0</span>
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="font-semibold text-lg md:text-xl tracking-tight uppercase text-foreground">BUSINESS OPS TELEMETRY</h1>
            <span className="tabular-nums text-[11px] text-muted-foreground">{`// MTD: ${monthLabel} · WINDOW: LAST ${range}D`}</span>
          </div>
        </div>
        
        {/* QUICK ACTIONS */}
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={exportCsv}
            className="h-8 px-3 bg-card border border-border text-foreground tabular-nums text-[10px] uppercase hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-none flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            EXPORT AUDIT LEDGER (CSV)
          </button>
          <button 
            onClick={() => setRange((r) => (r === 30 ? 60 : r === 60 ? 90 : 30))}
            className="h-8 px-3 bg-card border border-border text-foreground tabular-nums text-[10px] uppercase hover:bg-muted/40 transition-none flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>WINDOW: LAST {range}D</span>
            <span className="tabular-nums text-[9px]">▼</span>
          </button>
          <button 
            onClick={printRollup}
            className="h-8 px-3 bg-primary text-primary-foreground border border-border tabular-nums text-[10px] uppercase hover:bg-muted transition-none flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            PRINT EXECUTIVE ROLLUP
          </button>
        </div>
      </div>

      {/* RESTRICTED SETTINGS SUB-NAV TAB MATRIX */}
      <div className="w-full bg-muted/40 border-b border-border overflow-x-auto">
        <div className="flex items-stretch min-w-max text-[11px] tabular-nums">
          <button onClick={() => onNavigateScreen?.('org-multiloc')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            01 LOCATIONS &amp; SALONS
          </button>
          <button onClick={() => onNavigateScreen?.('users-staff')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            02 USERS, STAFF &amp; ROLES
          </button>
          <button onClick={() => onNavigateScreen?.('booking-rules')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            03 BOOKING RULES &amp; POLICIES
          </button>
          <button onClick={() => onNavigateScreen?.('revenue-stripe')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            04 REVENUE &amp; STRIPE GATEWAY
          </button>
          <button onClick={() => onNavigateScreen?.('system-telemetry')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            05 SYSTEM HEALTH &amp; SUPABASE
          </button>
          <button onClick={() => onNavigateScreen?.('services-pricing')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            06 SERVICES &amp; PRICING MATRIX
          </button>
          <div className="px-4 py-2 bg-primary text-primary-foreground border-r border-border flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-card inline-block"></span>
            <span>07 ANALYTICS &amp; REPORTING</span>
            <span className="text-[9px] px-1 bg-card text-foreground uppercase font-semibold ml-1">[ACTIVE]</span>
          </div>
          <button onClick={() => onNavigateScreen?.('cms-wizard')} className="px-4 py-2 text-muted-foreground hover:bg-card cursor-pointer">
            08 CMS &amp; BOOKING WIZARD
          </button>
        </div>
      </div>

      {/* KPI TELEMETRY STRIP */}
      <div className="w-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-b border-border bg-card tabular-nums text-[13px]">
        {/* METRIC 01 — real: /api/admin/reports/revenue (commerce_payments MTD) */}
        <div className="p-3 border-r border-b lg: border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
            <span>TOTAL REVENUE [MTD]</span>
            <span className="text-foreground font-semibold">REV.01</span>
          </div>
          <div className="my-2">
            <div className="text-lg md:text-xl font-semibold tracking-tight text-foreground">
              {rev ? money(rev.mtdRevenue) : 'No data yet'}
            </div>
          </div>
          <div className="flex items-center gap-1 tabular-nums text-[10px] text-muted-foreground">
            <span className="text-foreground font-semibold">{rev ? rev.mtdPayments : '—'}</span>
            <span>PAYMENTS SETTLED MTD</span>
          </div>
        </div>

        {/* METRIC 02 — real: booking_created events from analytics_events */}
        <div className="p-3 border-r border-b lg: border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
            <span>BOOKINGS CREATED [{range}D]</span>
            <span className="text-foreground font-semibold">VOL.02</span>
          </div>
          <div className="my-2">
            <div className="text-lg md:text-xl font-semibold tracking-tight text-foreground">
              {bookingsCreated != null ? bookingsCreated : 'No data yet'}
            </div>
          </div>
          <div className="flex items-center gap-1 tabular-nums text-[10px] text-muted-foreground">
            <span className="text-foreground font-semibold">VIA ONLINE BOOKING WIZARD</span>
          </div>
        </div>

        {/* METRIC 03 — real: avg payment MTD from reports/revenue */}
        <div className="p-3 border-r border-b lg: border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
            <span>AVG TICKET SIZE</span>
            <span className="text-foreground font-semibold">ARPU.03</span>
          </div>
          <div className="my-2">
            <div className="text-lg md:text-xl font-semibold tracking-tight text-foreground">
              {rev ? money(rev.avgTicket) : 'No data yet'}
            </div>
          </div>
          <div className="flex items-center gap-1 tabular-nums text-[10px] text-muted-foreground">
            <span className="text-foreground font-semibold">MTD PAYMENT AVERAGE</span>
          </div>
        </div>

        {/* METRIC 04 — real: /api/admin/dashboard/kpis */}
        <div className="p-3 border-r border-b lg: border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
            <span>APPOINTMENTS TODAY</span>
            <span className="text-foreground font-semibold">VOL.04</span>
          </div>
          <div className="my-2">
            <div className="text-lg md:text-xl font-semibold tracking-tight text-foreground">
              {kpis ? kpis.todayAppointments : 'No data yet'}
            </div>
          </div>
          <div className="flex items-center gap-1 tabular-nums text-[10px] text-muted-foreground">
            <span className="text-foreground font-semibold">ON TODAY&apos;S CALENDAR</span>
          </div>
        </div>

        {/* METRIC 05 — real: /api/admin/dashboard/kpis (crm_appointments) */}
        <div className="p-3 border-r border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
            <span>NO-SHOW RATE (30D)</span>
            <span className="text-foreground font-semibold">LOSS.04</span>
          </div>
          <div className="my-2">
            <div className={`text-lg md:text-xl font-semibold tracking-tight ${kpis?.noShowRate30d != null ? 'text-foreground' : 'text-muted-foreground'}`}>
              {kpis?.noShowRate30d != null ? `${kpis.noShowRate30d}%` : 'No data yet'}
            </div>
          </div>
          <div className="flex items-center gap-1 tabular-nums text-[10px] text-muted-foreground">
            <span>
              {kpis?.noShowRate30d != null
                ? `${kpis.noShowCounts?.noShow ?? 0} NO-SHOWS OF ${kpis.noShowCounts?.total ?? 0} RATED APPOINTMENTS`
                : 'NO RATED APPOINTMENTS IN LAST 30 DAYS'}
            </span>
          </div>
        </div>

        {/* METRIC 06 — real: /api/admin/dashboard/kpis (crm_appointments) */}
        <div className="p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
            <span>REBOOK RATE (30D)</span>
            <span className="text-foreground font-semibold">RET.05</span>
          </div>
          <div className="my-2">
            <div className={`text-lg md:text-xl font-semibold tracking-tight ${kpis?.rebookRate30d != null ? 'text-foreground' : 'text-muted-foreground'}`}>
              {kpis?.rebookRate30d != null ? `${kpis.rebookRate30d}%` : 'No data yet'}
            </div>
          </div>
          <div className="flex items-center gap-1 tabular-nums text-[10px] text-muted-foreground">
            <span>
              {kpis?.rebookRate30d != null
                ? `${kpis.rebookCounts?.rebookCustomers ?? 0} OF ${kpis.rebookCounts?.totalCustomers ?? 0} CUSTOMERS REBOOKED ≤30D`
                : 'NO COMPLETED/CONFIRMED CUSTOMERS IN LAST 30 DAYS'}
            </span>
          </div>
        </div>
      </div>

      {/* MAIN OPERATIONAL MATRIX */}
      <div className="w-full flex flex-col">
        {/* ROW 1: SECTION A (FUNNEL) & SECTION D (RETENTION/LTV) */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 border-b border-border">
          
          {/* SECTION A: 30-DAY BOOKINGS FUNNEL CONVERSION (7 COLS) */}
          <div className="lg:col-span-7 bg-card border-b lg: lg:border-r border-border flex flex-col">
            <div className="px-4 py-2 border-b border-border bg-muted/40 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="font-semibold tabular-nums text-[13px] uppercase text-foreground">SEC:A // BOOKING WIZARD EVENT TELEMETRY</span>
              </div>
              <div className="flex items-center gap-2 tabular-nums text-[10px]">
                <span className="border border-border px-1.5 bg-card">EVENTS: {funnel ? funnelTotal : '—'}</span>
                <span className="bg-primary text-primary-foreground px-1.5 font-semibold">BOOKINGS CREATED: {bookingsCreated ?? '—'}</span>
              </div>
            </div>
            
            <div className="p-4 flex-1 flex flex-col justify-between gap-4">
              {/* EVENT STAGE BARS — real counts from /api/analytics/events.
                  Counts are recorded analytics events in the window, not
                  unique visitors; bar widths are relative to the largest
                  stage and labels show each stage's share of all tracked
                  events in the window. */}
              {(() => {
                const stages = [
                  { label: '[STAGE 01] TRACKED SESSIONS', count: funnel ? funnel.sessions : null },
                  { label: '[STAGE 02] BOOKING STARTED — BEGIN_BOOKING', count: beginBooking },
                  { label: '[STAGE 03] PAYMENT INFO ENTERED — ADD_PAYMENT_INFO', count: paymentInfo },
                  { label: '[STAGE 04] BOOKING CREATED — BOOKING_CREATED', count: bookingsCreated },
                ];
                const maxCount = Math.max(1, ...stages.map((s) => s.count ?? 0));
                if (!funnel) {
                  return <div className="text-[11px] text-muted-foreground">Analytics event data unavailable for this window.</div>;
                }
                if (funnelTotal === 0) {
                  return <div className="text-[11px] text-muted-foreground">No analytics events recorded in this window yet.</div>;
                }
                return (
                  <div className="flex flex-col gap-3 tabular-nums text-[13px]">
                    {stages.map((s) => {
                      const pct = s.count != null ? (s.count / Math.max(1, funnelTotal)) * 100 : 0;
                      const width = s.count != null ? Math.max(2, (s.count / maxCount) * 100) : 0;
                      return (
                        <div key={s.label} className="flex flex-col gap-1">
                          <div className="flex justify-between items-baseline text-[10px] font-semibold text-foreground">
                            <span>{s.label}</span>
                            <span>{s.count != null ? `${s.count} EVENTS [${pct.toFixed(1)}%]` : '—'}</span>
                          </div>
                          <div className="w-full h-6 border border-border bg-muted/40 flex items-center p-0.5">
                            <div className="h-full bg-black flex items-center px-2 text-white text-[9px] font-semibold" style={{ width: `${width}%` }}>
                              {s.count != null ? `${pct.toFixed(1)}%` : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

{/* DIAGNOSTIC BREAKDOWN GRID — derived only from the real event counts above */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-border pt-4">
                <div className="border border-border p-3 bg-muted/30 flex flex-col justify-between">
                  <div className="flex justify-between text-[10px] font-semibold uppercase">
                    <span>START → PAYMENT DROP-OFF</span>
                    <span className="font-semibold text-destructive">[EVENTS]</span>
                  </div>
                  <div className="my-2 flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-foreground">
                      {beginBooking != null && paymentInfo != null && beginBooking > 0
                        ? `${Math.max(0, (1 - paymentInfo / beginBooking) * 100).toFixed(1)}%`
                        : 'No data yet'}
                    </span>
                    <span className="tabular-nums text-[10px] text-muted-foreground">DROP BEFORE PAYMENT INFO</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-snug">
                    {beginBooking != null && paymentInfo != null
                      ? `${Math.max(0, beginBooking - paymentInfo)} fewer payment-info events than booking starts in this window.`
                      : 'Event data unavailable for this window.'}
                  </div>
                </div>

                <div className="border border-border p-3 bg-muted/30 flex flex-col justify-between">
                  <div className="flex justify-between text-[10px] font-semibold uppercase">
                    <span>TRACKED EVENT VALUE</span>
                    <span className="font-semibold">[WINDOW TOTAL]</span>
                  </div>
                  <div className="my-2 flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-foreground">{funnel ? money(funnelValue) : 'No data yet'}</span>
                    <span className="tabular-nums text-[10px] text-muted-foreground">SUM OF EVENT VALUES</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-snug">
                    Total of the values attached to tracked events (purchases and bookings) in this window.
                    Device mix is not recorded, so no mobile/desktop split is shown.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION D: CLIENT RETENTION LEDGER (5 COLS) */}
          <div className="lg:col-span-5 bg-card flex flex-col">
            <div className="px-4 py-2 border-b border-border bg-muted/40 flex items-center justify-between">
              <span className="font-semibold tabular-nums text-[13px] uppercase text-foreground">SEC:D // RETENTION, LTV &amp; PRODUCT ATTACHMENT</span>
              <span className="tabular-nums text-[10px] text-muted-foreground">SOURCE: CRM + REPORTS</span>
            </div>

            <div className="p-4 flex-1 flex flex-col justify-between gap-4 tabular-nums text-[13px]">
              <div className="flex flex-col gap-3">
                <div className="border border-border p-3 bg-card">
                  <div className="flex justify-between items-center text-[10px] font-semibold border-b border-border pb-1 mb-2">
                    <span className="uppercase text-foreground">NEW CLIENTS ACQUIRED (30D)</span>
                    <span className="bg-primary text-primary-foreground px-1.5 py-0.5 text-[9px]">{kpis ? `N=${kpis.newCustomers30d} CLIENTS` : '—'}</span>
                  </div>
                  <div className="space-y-1 text-muted-foreground text-[11px]">
                    <div className="flex justify-between">
                      <span>↳ New CRM customer records:</span>
                      <span className="font-semibold text-foreground">{kpis ? `${kpis.newCustomers30d} ACCTS` : 'No data yet'}</span>
                    </div>
                    <div className="text-[11px] leading-snug">
                      Acquisition channel isn&apos;t tracked per customer yet, so no channel split is
                      shown rather than estimated.
                    </div>
                  </div>
                </div>

                {/* FORECASTS — /api/admin/analytics/insights: least-squares
                    trend over the trailing 28 daily points, churn cohort,
                    same-session conversion trend. Method + sample ride
                    along so thin series read as thin. */}
                <div className="border border-border p-3 bg-card">
                  <div className="flex justify-between items-center text-[10px] font-semibold border-b border-border pb-1 mb-2">
                    <span className="uppercase text-foreground">FORECASTS — NEXT 30 DAYS</span>
                    <span className="bg-primary text-primary-foreground px-1.5 py-0.5 text-[9px]">{insights ? 'LIVE MODEL' : '—'}</span>
                  </div>
                  {!insights ? (
                    <div className="text-[11px] text-muted-foreground leading-tight">Loading forecasts…</div>
                  ) : (
                    <div className="space-y-2 text-[11px] text-muted-foreground">
                      <div className="flex justify-between">
                        <span>↳ Revenue projection (next 30d):</span>
                        <span className="font-semibold text-foreground">{money(insights.forecasts.revenue.next30)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>↳ Appointments projection (next 30d):</span>
                        <span className="font-semibold text-foreground">{Math.round(insights.forecasts.appointments.next30)} APPTS</span>
                      </div>
                      <div className="flex justify-between">
                        <span>↳ Staffing need (projected/day):</span>
                        <span className="font-semibold text-foreground">
                          {insights.forecasts.staffing.projectedAppointmentsPerDay} appts
                          {insights.forecasts.staffing.impliedGroomerDaysPerDay != null
                            ? ` · ≈${insights.forecasts.staffing.impliedGroomerDaysPerDay} groomer-days`
                            : ''}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>↳ Churn risk (at risk now → projected 30d):</span>
                        <span className="font-semibold text-foreground">
                          {insights.forecasts.churn.atRiskNow} → {insights.forecasts.churn.projectedAtRisk30d} CLIENTS
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>↳ Booking conversion (sessions, projected):</span>
                        <span className="font-semibold text-foreground">
                          {insights.forecasts.conversions.rate30 != null ? `${insights.forecasts.conversions.rate30}% → ${insights.forecasts.conversions.projectedRateNext30}%` : '—'}
                        </span>
                      </div>
                      <div className="text-[10px] leading-snug border-t border-border pt-1.5">
                        {insights.forecasts.method} Conversion scope: {insights.forecasts.conversions.scope}.
                      </div>
                    </div>
                  )}
                </div>

                {/* COMPARISONS — today vs yesterday + window-vs-prior
                    for customers, no-shows and repeat bookings. */}
                <div className="border border-border p-3 bg-card">
                  <div className="flex justify-between items-center text-[10px] font-semibold border-b border-border pb-1 mb-2">
                    <span className="uppercase text-foreground">COMPARISONS</span>
                    <span className="text-muted-foreground text-[9px]">VS PRIOR PERIOD</span>
                  </div>
                  {!insights ? (
                    <div className="text-[11px] text-muted-foreground leading-tight">Loading comparisons…</div>
                  ) : (
                    <div className="space-y-1 text-[11px] text-muted-foreground">
                      {(() => {
                        const cmp = insights.comparisons;
                        const delta = (v: number | null) => v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`;
                        return (
                          <>
                            <div className="flex justify-between">
                              <span>↳ Revenue today vs yesterday:</span>
                              <span className="font-semibold text-foreground">{money(cmp.todayVsYesterday.revenue.today)} vs {money(cmp.todayVsYesterday.revenue.yesterday)} ({delta(cmp.todayVsYesterday.revenue.changePct)})</span>
                            </div>
                            <div className="flex justify-between">
                              <span>↳ Appointments today vs yesterday:</span>
                              <span className="font-semibold text-foreground">{cmp.todayVsYesterday.appointments.today} vs {cmp.todayVsYesterday.appointments.yesterday} ({delta(cmp.todayVsYesterday.appointments.changePct)})</span>
                            </div>
                            <div className="flex justify-between">
                              <span>↳ New customers (30d vs prior 30d):</span>
                              <span className="font-semibold text-foreground">{cmp.newCustomers.last30} vs {cmp.newCustomers.prev30} ({delta(cmp.newCustomers.changePct)})</span>
                            </div>
                            <div className="flex justify-between">
                              <span>↳ No-show rate (30d vs prior):</span>
                              <span className="font-semibold text-foreground">{cmp.noShowRate.last30 != null ? `${cmp.noShowRate.last30}%` : '—'} vs {cmp.noShowRate.prev30 != null ? `${cmp.noShowRate.prev30}%` : '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>↳ Repeat-booking rate (90d vs prior):</span>
                              <span className="font-semibold text-foreground">{cmp.rebookRate.last90 != null ? `${cmp.rebookRate.last90}%` : '—'} vs {cmp.rebookRate.prev90 != null ? `${cmp.rebookRate.prev90}%` : '—'}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* RETAIL PRODUCT ATTACHMENT RATE — no per-groom source exists */}
                <div className="border border-border p-3 bg-card">
                  <div className="flex justify-between items-center text-[10px] font-semibold border-b border-border pb-1 mb-2">
                    <span className="uppercase text-foreground">PRODUCT UPSELL CONVERSION</span>
                    <span className="border border-border px-1 bg-muted/30 text-[9px] font-semibold">NO LIVE SOURCE</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-snug">
                    No data yet — retail attachment per groom isn&apos;t tracked in a live source, so no
                    rate is shown rather than estimated.
                  </div>
                </div>
              </div>

              {/* SYSTEM AUDIT TRIGGER */}
              <div className="p-2 border border-border bg-muted/40 flex items-center justify-between text-[10px] font-semibold uppercase">
                <span>DATA WINDOW: LAST {range}D</span>
                <span className="text-foreground">[LIVE APIS]</span>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2: SECTION B: MULTI-LOCATION FINANCIAL PERFORMANCE ROLLUP */}
        <div className="w-full bg-card border-b border-border flex flex-col tabular-nums text-[13px]">
          <div className="px-4 py-2 border-b border-border bg-muted/40 flex flex-wrap items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-[13px] uppercase text-foreground">SEC:B // MULTI-LOCATION FINANCIAL PERFORMANCE ROLLUP</span>
              <span className="bg-primary text-primary-foreground px-1.5 py-0.5 text-[9px] font-semibold">{insights ? `${insights.locations.rows.length} LOCATION${insights.locations.rows.length === 1 ? '' : 'S'}` : '—'}</span>
            </div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-3">
              <span>CURRENCY: USD</span>
              <span>SOURCE: INSIGHTS API (30D, PER LOCATION)</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-foreground text-[10px] uppercase font-semibold">
                  <th className="p-3 border-r border-border">FACILITY / SALON DESIGNATION</th>
                  <th className="p-3 border-r border-border text-right">CAPACITY BAYS</th>
                  <th className="p-3 border-r border-border text-right">GROSS REVENUE</th>
                  <th className="p-3 border-r border-border text-right">NET REVENUE</th>
                  <th className="p-3 border-r border-border text-right">UTILIZATION</th>
                  <th className="p-3 border-r border-border text-right">ACTIVE STAFF</th>
                  <th className="p-3 border-r border-border text-right">AVG TICKET</th>
                  <th className="p-3 text-center">SYSTEM STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {!insights ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-muted-foreground">Loading per-location rollup…</td>
                  </tr>
                ) : insights.locations.rows.map((l: any, i: number) => (
                  <tr key={l.id} className="hover:bg-muted/30 transition-none">
                    <td className="p-3 border-r border-border font-semibold">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-black"></span>
                        <span>{String(l.name).toUpperCase()}</span>
                        {i === 0 && <span className="border border-border px-1 bg-muted/40 text-[9px] font-semibold">PRIMARY</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-normal">{l.appointments30d} appointments (30d)</div>
                    </td>
                    <td className="p-3 border-r border-border text-right">—</td>
                    <td className="p-3 border-r border-border text-right font-semibold">{money(l.servicesRevenue30d)}</td>
                    <td className="p-3 border-r border-border text-right">—</td>
                    <td className="p-3 border-r border-border text-right">—</td>
                    <td className="p-3 border-r border-border text-right">{l.activeGroomers30d} GROOMERS</td>
                    <td className="p-3 border-r border-border text-right">{l.avgTicket != null ? money(l.avgTicket) : '—'}</td>
                    <td className="p-3 text-center">
                      <span className="border border-border bg-muted/30 text-[9px] font-semibold px-1.5 py-0.5">OPERATIONAL</span>
                    </td>
                  </tr>
                ))}
                {insights && insights.locations.unassigned.appointments30d > 0 && (
                  <tr className="hover:bg-muted/30 transition-none">
                    <td className="p-3 border-r border-border font-semibold">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-neutral-400"></span>
                        <span>UNASSIGNED (NO LOCATION ON APPOINTMENT)</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-normal">{insights.locations.unassigned.appointments30d} appointments (30d)</div>
                    </td>
                    <td className="p-3 border-r border-border text-right">—</td>
                    <td className="p-3 border-r border-border text-right font-semibold">{money(insights.locations.unassigned.servicesRevenue30d)}</td>
                    <td className="p-3 border-r border-border text-right">—</td>
                    <td className="p-3 border-r border-border text-right">—</td>
                    <td className="p-3 border-r border-border text-right">—</td>
                    <td className="p-3 border-r border-border text-right">—</td>
                    <td className="p-3 text-center">
                      <span className="border border-border bg-muted/30 text-[9px] font-semibold px-1.5 py-0.5">—</span>
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-muted/40 font-semibold  border-border text-foreground">
                  <td className="p-3 border-r border-border uppercase font-semibold text-[10px]">
                    TOTAL CONSOLIDATED ROLLUP
                  </td>
                  <td className="p-3 border-r border-border text-right">—</td>
                  <td className="p-3 border-r border-border text-right tabular-nums font-semibold text-[13px]">{insights ? money(insights.locations.rows.reduce((s: number, l: any) => s + (l.servicesRevenue30d || 0), 0) + (insights.locations.unassigned.servicesRevenue30d || 0)) : '—'}</td>
                  <td className="p-3 border-r border-border text-right">—</td>
                  <td className="p-3 border-r border-border text-right">—</td>
                  <td className="p-3 border-r border-border text-right">{staff ? `${staff.length} STAFF` : '—'}</td>
                  <td className="p-3 border-r border-border text-right">{rev ? money(rev.avgTicket) : '—'}</td>
                  <td className="p-3 text-center">
                    <span className="bg-primary text-primary-foreground px-2 py-0.5 text-[9px] font-semibold">[{insights ? insights.locations.rows.length : '—'} LOCATION{insights && insights.locations.rows.length === 1 ? '' : 'S'}]</span>
                  </td>
                </tr>
              </tfoot>
            </table>
            <div className="px-3 py-2 text-[10px] text-muted-foreground">
              Per-location figures are services revenue from completed appointments (last 30 days) — payments revenue is not
              location-attributed in the schema, so it stays tenant-wide on the revenue reports. Tenant-wide MTD payments
              revenue: {rev ? money(rev.mtdRevenue) : '—'}. Capacity, net revenue, and utilization have no live per-location
              source — shown as — rather than estimated.
            </div>
          </div>
        </div>

        {/* ROW 3: SECTION C: STYLIST PERFORMANCE — REAL ROSTER, TODAY'S WORKLOAD */}
        <div className="w-full bg-card flex flex-col tabular-nums text-[13px]">
          <div className="px-4 py-2 border-b border-border bg-muted/40 flex flex-wrap items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-[13px] uppercase text-foreground">SEC:C // STYLIST PERFORMANCE &amp; WORKLOAD SUMMARY</span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              SOURCE: CRM STAFF + TODAY&apos;S APPOINTMENTS (DASHBOARD WIDGETS API)
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-foreground text-[10px] uppercase font-semibold">
                  <th className="p-3 border-r border-border">STYLIST NAME / ROLE / BRANCH</th>
                  <th className="p-3 border-r border-border text-right">APPOINTMENTS TODAY</th>
                  <th className="p-3 border-r border-border text-right">TOTAL BILLINGS</th>
                  <th className="p-3 border-r border-border text-right">COMMISSION RATE</th>
                  <th className="p-3 border-r border-border text-right">NET COMMISSION PAY</th>
                  <th className="p-3 border-r border-border text-right">CARD / CASH TIPS</th>
                  <th className="p-3 border-r border-border text-right">AVG RATING</th>
                  <th className="p-3 text-right">REBOOK RATE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {staff === null ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-muted-foreground">Staff data unavailable.</td>
                  </tr>
                ) : staff.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-muted-foreground">No staff records yet.</td>
                  </tr>
                ) : (
                  staff.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30 transition-none">
                      <td className="p-3 border-r border-border">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground uppercase">{s.name}</span>
                          <span className="text-[10px] text-muted-foreground">{s.role} {"//"} Main Location</span>
                        </div>
                      </td>
                      <td className="p-3 border-r border-border text-right font-semibold">{s.todayAppointments} TODAY</td>
                      <td className="p-3 border-r border-border text-right">—</td>
                      <td className="p-3 border-r border-border text-right">{s.commissionRate != null ? `${s.commissionRate}%` : '—'}</td>
                      <td className="p-3 border-r border-border text-right">{money(s.commissionAccrued) ?? '—'}</td>
                      <td className="p-3 border-r border-border text-right">—</td>
                      <td className="p-3 border-r border-border text-right">—</td>
                      <td className="p-3 text-right">—</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-muted/40 text-foreground text-[10px] uppercase font-semibold">
                  <td className="p-3 border-r border-border">STAFF ROSTER (LIVE)</td>
                  <td className="p-3 border-r border-border text-right">{staffTodayTotal != null ? `${staffTodayTotal} TODAY` : '—'}</td>
                  <td className="p-3 border-r border-border text-right">—</td>
                  <td className="p-3 border-r border-border text-right">—</td>
                  <td className="p-3 border-r border-border text-right">—</td>
                  <td className="p-3 border-r border-border text-right">—</td>
                  <td className="p-3 border-r border-border text-right">—</td>
                  <td className="p-3 text-right">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border">
            Commission rate is the stylist&apos;s profile rate and net commission pay is commission
            accrued (pending) in the commission ledger. Per-stylist billings, tips, ratings, and
            rebook rates have no live source yet — those cells stay blank rather than estimated.
          </div>
        </div>
      </div>

      {/* EMAIL ALERTS — NOTIFICATIONS: where every captured business event
          lands (booking requests, subscription events, shop orders), the
          master toggle, live alert activity, and the end-to-end test send */}
      <NotificationsPanel />

      {/* LIVE EVENT STREAM — the salon's own custom analytics (real data) */}
      <LiveEventStream />

      {/* SUPER ADMIN SECURITY LOCK FOOTER / HARDWARE ATTESTATION */}
      <div className="w-full bg-muted/30 border-b border-border p-4 flex flex-col md:flex-row items-center justify-between gap-4 select-none tabular-nums text-[13px]">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-primary text-primary-foreground flex items-center justify-center border border-border font-semibold">
            <Lock className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-foreground uppercase">
              <span>SUPER_ADMIN LEVEL 0 // SYSTEM ENCLAVE ACCESS</span>
              <span className="border border-border px-1.5 bg-card text-[9px] font-semibold">[AUDIT LOGGED]</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Changes to ledger allocations, base payroll split percentages, or Stripe merchant hooks require dual-signature multi-factor ratification.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-[10px] uppercase">AUDIT TRAIL:</span>
          <span className="border border-border bg-card px-2 py-0.5 text-foreground font-semibold tabular-nums">PLATFORM AUDIT LOG</span>
          <button 
            onClick={() => showToast('SIGN OUT FROM THE PORTAL HEADER TO END YOUR SESSION')}
            className="h-6 px-3 bg-primary text-primary-foreground text-[10px] uppercase font-semibold hover:bg-muted transition-none cursor-pointer"
          >
            SIGN OUT ENCLAVE
          </button>
        </div>
      </div>

      {/* MONOCHROME TERMINAL STATUS LINE */}
      <div className="w-full bg-primary text-primary-foreground px-4 py-1.5 flex items-center justify-between tabular-nums text-[11px]">
        <div className="flex items-center gap-2">
          <span>&gt; OPS_CONSOLE: READY</span>
          <span className="inline-block w-[7px] h-[14px] bg-card animate-pulse"></span>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground/70">
          <span>DATA: LIVE ADMIN APIS</span>
          <span>{`WINDOW: LAST ${range}D`}</span>
          <span>DAWG-OS KERNEL v2.4.0-PRD</span>
        </div>
      </div>
    </div>
  );
};

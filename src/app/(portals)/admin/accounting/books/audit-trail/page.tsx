'use client';

import React, { useEffect, useState } from 'react';

// /admin/accounting/books/audit-trail — Audit Trail & Activity,
// rebuilt to the owner's spec (audit_trail_activity.html): the
// forensic chronological transaction audit register over
// acct_audit_log, with before/after state inspection and the
// cryptographic hash chain (entry_hash / prev_hash) shown exactly
// as stored — a dash where a row predates the chain, never an
// invented hash.
// Data: GET /api/admin/accounting/audit-trail.

type AuditEvent = {
  id: string; event_time: string; action: string; table_name: string | null;
  record_id: string | null; actor_user_id: string | null;
  before_data: unknown; after_data: unknown;
  entry_hash: string | null; prev_hash: string | null; correlation_id: string | null;
};

const short = (h: string | null) => (h ? (h.length > 16 ? `${h.slice(0, 16)}…` : h) : '—');
const stateText = (v: unknown) => {
  if (v === null || v === undefined) return '—';
  try {
    const s = JSON.stringify(v);
    return s.length > 140 ? `${s.slice(0, 140)}…` : s;
  } catch {
    return String(v);
  }
};

export default function AuditTrailPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = (q: string) => {
    setLoading(true);
    fetch(`/api/admin/accounting/audit-trail${q ? `?search=${encodeURIComponent(q)}` : ''}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => setEvents(Array.isArray(d.events) ? d.events : []))
      .catch(() => setError('The audit trail could not be loaded.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => load(''), []);

  const thCls = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Audit Trail &amp; Activity</h1>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); setAppliedSearch(search); load(search); }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by event, table, record…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-72"
            type="text"
          />
          <button type="submit" className="rounded-lg px-3 h-9 text-[13px] border bg-card border-border text-foreground" data-tip="Run the filter against the audit register">
            Filter
          </button>
        </form>
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        <h2 className="font-display text-base font-semibold mb-2">Forensic Chronological Transaction Audit Register</h2>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr className={thCls}>
                <th className="p-3 border-r border-border">Timestamp (UTC)</th>
                <th className="p-3 border-r border-border">Event Type</th>
                <th className="p-3 border-r border-border">Entity / Ref #</th>
                <th className="p-3 border-r border-border">User ID</th>
                <th className="p-3 border-r border-border">Previous State</th>
                <th className="p-3 border-r border-border">New State</th>
                <th className="p-3 border-r border-border">Cryptographic Hash</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">Loading the audit trail…</td></tr>
              ) : events.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground">
                  {appliedSearch
                    ? 'No audit events match that filter.'
                    : 'No audit events recorded yet. Events are written here as accounting records are created and changed — each with its before/after state, and new events carry a hash that chains to the one before it.'}
                </td></tr>
              ) : events.map((ev) => (
                <React.Fragment key={ev.id}>
                  <tr className="hover:bg-accent/50">
                    <td className="p-3 border-r border-border text-muted-foreground tabular-nums">{ev.event_time.replace('T', ' ').slice(0, 19)}</td>
                    <td className="p-3 border-r border-border font-medium">{ev.action}</td>
                    <td className="p-3 border-r border-border text-muted-foreground">{ev.table_name || '—'}{ev.record_id ? ` · ${ev.record_id}` : ''}</td>
                    <td className="p-3 border-r border-border text-muted-foreground">{ev.actor_user_id ? ev.actor_user_id.slice(0, 8) + '…' : 'system'}</td>
                    <td className="p-3 border-r border-border text-muted-foreground"><span className="break-all">{stateText(ev.before_data)}</span></td>
                    <td className="p-3 border-r border-border text-muted-foreground"><span className="break-all">{stateText(ev.after_data)}</span></td>
                    <td className="p-3 border-r border-border text-muted-foreground tabular-nums" title={ev.entry_hash || undefined}>{short(ev.entry_hash)}</td>
                    <td className="p-3 text-center">
                      <button onClick={() => setExpanded(expanded === ev.id ? null : ev.id)} className="text-[12px] underline" data-tip="Inspect the full before/after diff and hash chain for this event">
                        Inspect Diff
                      </button>
                    </td>
                  </tr>
                  {expanded === ev.id && (
                    <tr>
                      <td colSpan={8} className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Previous State</div>
                            <pre className="text-[12px] whitespace-pre-wrap break-all border border-border rounded-lg p-3 bg-background">{ev.before_data ? JSON.stringify(ev.before_data, null, 2) : '—'}</pre>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">New State</div>
                            <pre className="text-[12px] whitespace-pre-wrap break-all border border-border rounded-lg p-3 bg-background">{ev.after_data ? JSON.stringify(ev.after_data, null, 2) : '—'}</pre>
                          </div>
                        </div>
                        <div className="text-[12px] text-muted-foreground mt-3">
                          Entry hash: <span className="tabular-nums">{ev.entry_hash || '—'}</span> · Previous hash: <span className="tabular-nums">{ev.prev_hash || '—'}</span>
                          {ev.correlation_id ? <> · Correlation: {ev.correlation_id}</> : null}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

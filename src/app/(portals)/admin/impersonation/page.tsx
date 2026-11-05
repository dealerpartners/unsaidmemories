'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserSearch, RefreshCw, Info, ShieldAlert } from 'lucide-react';

type Target = { id: string; label: string; authUserId: string | null; detail: string | null };
type Session = {
  id: string;
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  reason: string;
  status: string;
  adminEmail: string;
  startedAt: string;
  endedAt: string | null;
  endedBy: string | null;
};

const TYPES = ['seller', 'customer', 'employee'] as const;
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function ImpersonationPage() {
  const [active, setActive] = useState<Session[]>([]);
  const [recent, setRecent] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [type, setType] = useState<string>('seller');
  const [q, setQ] = useState('');
  const [targets, setTargets] = useState<Target[]>([]);
  const [selected, setSelected] = useState<Target | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/impersonation');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Load failed');
      setActive(d.active || []);
      setRecent(d.recent || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const search = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/admin/impersonation?type=${type}&q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Search failed');
      setTargets(d.targets || []);
    } catch (e: any) {
      setError(e.message);
    }
  }, [type, q]);

  useEffect(() => {
    search();
  }, [search]);

  const start = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch('/api/admin/impersonation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', targetType: type, targetId: selected.id, reason }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Start failed');
      setNotice(`Impersonation session recorded for ${selected.label}.`);
      setReason('');
      setSelected(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const end = async (s: Session) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/impersonation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', sessionId: s.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'End failed');
      setNotice(`Session for ${s.targetLabel || s.targetId} ended.`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <UserSearch className="w-5 h-5" /> Impersonation
        </h1>
        <button onClick={load} className="inline-flex items-center gap-1.5 text-sm border rounded px-2.5 py-1.5 hover:bg-muted">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>
      <div className="flex items-start gap-2 text-sm border rounded p-3 mb-5 bg-muted/40">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          <strong>A reason is required</strong> — the store itself refuses a blank one, and every start and end is
          written to the audit log. Starting records the session; it does <strong>not</strong> mint a portal session
          for the target. The portal session token carries no impersonation claim, so a minted session would be
          indistinguishable from the target&apos;s own and every act inside it would attribute to the wrong person.
          The marked-token session leg is the named follow-on; until it lands, no unmarked takeover exists anywhere.
        </span>
      </div>

      {error && <div className="border border-red-300 adm-badge adm-badge-red rounded p-3 mb-4 text-sm">{error}</div>}
      {notice && <div className="border rounded p-3 mb-4 text-sm bg-muted/40">{notice}</div>}

      <div className="border rounded mb-6">
        <h2 className="font-semibold mb-3">Start a session</h2>
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => {
                setType(t);
                setSelected(null);
              }}
              className={`px-3 py-1.5 rounded border text-sm capitalize ${type === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${type}s by name or email…`}
          className="w-full border rounded px-2 py-1.5 mb-2"
        />
        <div className="border rounded divide-y max-h-56 overflow-y-auto mb-3">
          {targets.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No {type} records match in this tenant.</p>
          ) : (
            targets.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className={`w-full text-left p-2.5 text-sm flex justify-between gap-3 ${selected?.id === t.id ? 'bg-muted' : 'hover:bg-muted/50'}`}
              >
                <span>{t.label}</span>
                <span className="text-muted-foreground text-xs">{t.detail}</span>
              </button>
            ))
          )}
        </div>
        <label className="block mb-3">
          <span className="text-xs uppercase text-muted-foreground">Reason (required, recorded)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why are you impersonating this account?"
            className="w-full border rounded px-2 py-1.5"
          />
        </label>
        <button
          disabled={busy || !selected || !reason.trim()}
          onClick={start}
          className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
        >
          {selected ? `Record session for ${selected.label}` : 'Select a target'}
        </button>
      </div>

      <h2 className="font-semibold mb-2">Active sessions ({active.length})</h2>
      {loading ? (
        <p className="text-sm text-muted-foreground mb-6">Loading…</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded mb-6">No impersonation sessions are active.</p>
      ) : (
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2.5">Target</th>
              <th className="p-2.5">Admin</th>
              <th className="p-2.5">Reason</th>
              <th className="p-2.5">Started</th>
              <th className="p-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {active.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="p-2.5">
                  {s.targetLabel || s.targetId}
                  <span className="text-muted-foreground"> · {s.targetType}</span>
                </td>
                <td className="p-2.5">{s.adminEmail}</td>
                <td className="p-2.5 text-muted-foreground">{s.reason}</td>
                <td className="p-2.5">{when(s.startedAt)}</td>
                <td className="p-2.5 text-right">
                  <span className="flex justify-end gap-1.5">
                    <a
                      href={`/api/admin/impersonation/enter?sessionId=${s.id}`}
                      className="px-2 py-1 border rounded text-xs bg-primary text-primary-foreground"
                    >
                      Enter as target
                    </a>
                    <button disabled={busy} onClick={() => end(s)} className="px-2 py-1 border rounded text-xs hover:bg-muted">
                      End session
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      <h2 className="font-semibold mb-2">Recent sessions</h2>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5" /> No impersonation has ever been recorded for this tenant.
        </p>
      ) : (
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2.5">Target</th>
              <th className="p-2.5">Admin</th>
              <th className="p-2.5">Status</th>
              <th className="p-2.5">Started</th>
              <th className="p-2.5">Ended</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="p-2.5">
                  {s.targetLabel || s.targetId}
                  <span className="text-muted-foreground"> · {s.targetType}</span>
                </td>
                <td className="p-2.5">{s.adminEmail}</td>
                <td className="p-2.5">{s.status}</td>
                <td className="p-2.5">{when(s.startedAt)}</td>
                <td className="p-2.5">{s.endedAt ? `${when(s.endedAt)} · ${s.endedBy || ''}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

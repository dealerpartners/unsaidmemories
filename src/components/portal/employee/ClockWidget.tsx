'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, Loader2, LogIn, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// ClockWidget — SA-132 / SA-133 against /api/employee/time-clock.
// Shows today's shifts and the one open shift; the button is the real
// clock: POST in/out writes crm_staff_time_clock_entries. A 409 from the
// server (already in / not in) is shown, never swallowed.
// ============================================================================

interface ClockEntry {
  id: string;
  clockIn: string;
  clockOut: string | null;
  source: string;
  open: boolean;
}

const TZ = 'America/Chicago';
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

export function ClockWidget({ userId, compact = false }: { userId?: string; compact?: boolean }) {
  const [entries, setEntries] = useState<ClockEntry[]>([]);
  const [open, setOpen] = useState<ClockEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlinked, setUnlinked] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/employee/time-clock?user_id=${encodeURIComponent(userId)}`, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to load time clock');
      setEntries(Array.isArray(j.entries) ? j.entries : []);
      setOpen(j.open || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load time clock');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const act = async (action: 'in' | 'out') => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/employee/time-clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, user_id: userId }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setUnlinked(true);
        return;
      }
      if (!res.ok) throw new Error(j.error || 'Time clock action failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Time clock action failed');
    } finally {
      setBusy(false);
    }
  };

  if (!userId || unlinked) {
    return (
      <p className="text-[12px] text-muted-foreground">
        {unlinked
          ? 'No staff profile is linked to your login, so the time clock has nowhere to write. Ask a manager to link your employee profile.'
          : 'Sign in to use the time clock.'}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[13px]">
          <Clock className="size-4 text-muted-foreground" />
          {loading ? (
            <span className="text-muted-foreground">Loading today’s shifts…</span>
          ) : open ? (
            <span>
              <span className="font-semibold text-success">On the clock</span>
              <span className="text-muted-foreground"> since {fmtTime(open.clockIn)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Not clocked in</span>
          )}
        </div>
        <button
          onClick={() => act(open ? 'out' : 'in')}
          disabled={busy || loading}
          className={cn(
            'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-60 cursor-pointer',
            open
              ? 'bg-card border border-border text-foreground hover:bg-accent'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : open ? <LogOut className="size-3.5" /> : <LogIn className="size-3.5" />}
          {open ? 'Clock Out' : 'Clock In'}
        </button>
      </div>
      {error && <p className="text-[12px] text-destructive">{error}</p>}
      {!compact && entries.length > 0 && (
        <div className="space-y-1">
          {entries.map((e) => (
            <div key={e.id} className="flex justify-between text-[12px] text-muted-foreground">
              <span>In {fmtTime(e.clockIn)}</span>
              <span>{e.open ? 'Still on the clock' : `Out ${e.clockOut ? fmtTime(e.clockOut) : ''}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

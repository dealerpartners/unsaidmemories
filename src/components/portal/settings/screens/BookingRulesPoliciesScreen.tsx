'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Save, CheckCircle2, Plus, Trash2, CalendarX, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SystemSettings } from '@/lib/settings-types';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  systemSettings?: SystemSettings;
  saveSettingsToDb?: (updates: Partial<SystemSettings>) => Promise<boolean>;
}

// Screen day order (Mon→Sun) with the crm_operating_hours day_of_week
// values (0=Sun … 6=Sat) the org_edit_hours action writes.
const DAYS: { name: string; dow: number }[] = [
  { name: 'Monday', dow: 1 },
  { name: 'Tuesday', dow: 2 },
  { name: 'Wednesday', dow: 3 },
  { name: 'Thursday', dow: 4 },
  { name: 'Friday', dow: 5 },
  { name: 'Saturday', dow: 6 },
  { name: 'Sunday', dow: 0 },
];

// The salon defaults src/lib/booking/availability.ts enforces for any
// weekday with no crm_operating_hours row — shown so the form reflects
// what's actually in force before the owner saves explicit hours.
const defaultFor = (dow: number) => ({
  open: '07:00',
  close: '18:00',
  closed: dow === 1, // closed Mondays by default
});

type DayHours = { open: string; close: string; closed: boolean };
type Blackout = { id: string; name: string; blackout_date: string; end_date: string };

async function postSystemAction(action: string, payload: Record<string, unknown>) {
  const res = await fetch('/api/admin/system/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `Action failed (${res.status})`);
  }
  return data;
}

export const BookingRulesPoliciesScreen: React.FC<ScreenProps> = ({
  systemSettings,
  saveSettingsToDb,
}) => {
  const [form, setForm] = useState<Record<string, any>>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ id: string; name: string } | null>(null);
  const [hours, setHours] = useState<Record<string, DayHours>>({});
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [newBlackout, setNewBlackout] = useState({ name: '', date: '', endDate: '' });
  const [blackoutError, setBlackoutError] = useState<string | null>(null);

  useEffect(() => {
    if (systemSettings) {
      setForm(systemSettings as any);
    }
  }, [systemSettings]);

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings/hours');
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setLocation(data.location ?? null);
      const byDow = new Map<number, any>((data.hours || []).map((h: any) => [Number(h.day_of_week), h]));
      const next: Record<string, DayHours> = {};
      for (const d of DAYS) {
        const row = byDow.get(d.dow);
        next[d.name] = row
          ? {
              open: row.opens_at ? String(row.opens_at).slice(0, 5) : '07:00',
              close: row.closes_at ? String(row.closes_at).slice(0, 5) : '18:00',
              closed: row.is_closed === true,
            }
          : defaultFor(d.dow);
      }
      setHours(next);
      setBlackouts(Array.isArray(data.blackouts) ? data.blackouts : []);
      // The gate's real state (defaults to on when never toggled) — the
      // settings object only carries the key after a first save.
      setForm((prev) => ({ ...prev, online_booking_enabled: data.onlineBookingEnabled !== false }));
    } catch (err) {
      console.error('Failed to load booking rules:', err);
      setSaveError('Could not load operating hours from the database.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRules();
  }, [loadRules]);

  const update = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaveError(null);
    try {
      if (location) {
        for (const d of DAYS) {
          const h = hours[d.name];
          if (!h) continue;
          await postSystemAction('sys_edit_hours', {
            location_id: location.id,
            day_of_week: d.dow,
            opens_at: h.closed ? null : h.open,
            closes_at: h.closed ? null : h.close,
            is_closed: h.closed,
          });
        }
      }
      const ok = saveSettingsToDb ? await saveSettingsToDb(form as Partial<SystemSettings>) : true;
      if (!ok) throw new Error('Settings save was not confirmed by the server.');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || 'Save failed — changes were not confirmed.');
    }
  };

  const handleAddBlackout = async () => {
    setBlackoutError(null);
    if (!newBlackout.date) {
      setBlackoutError('Pick a date for the blackout.');
      return;
    }
    try {
      await postSystemAction('sys_add_blackout', {
        name: newBlackout.name || 'Holiday blackout',
        blackout_date: newBlackout.date,
        end_date: newBlackout.endDate || newBlackout.date,
        location_id: location?.id ?? null,
      });
      setNewBlackout({ name: '', date: '', endDate: '' });
      await loadRules();
    } catch (err: any) {
      setBlackoutError(err?.message || 'Blackout could not be saved.');
    }
  };

  const handleDeleteBlackout = async (b: Blackout) => {
    setBlackoutError(null);
    try {
      await postSystemAction('sys_delete_blackout', { blackout_id: b.id });
      await loadRules();
    } catch (err: any) {
      setBlackoutError(err?.message || 'Blackout could not be removed.');
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground text-[13px]">Loading operating hours...</div>;

  return (
    <div className="p-6 space-y-6 font-bar">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Business & Holiday Hours</h2>
          <p className="text-[13px] text-muted-foreground mt-1">Weekly salon operating hours, weekend blocks, and annual holiday blackout calendar.</p>
        </div>
        <button onClick={handleSave} className={cn('inline-flex items-center gap-1.5 rounded-lg h-9 px-3.5 text-[13px] font-medium shadow-card transition-colors cursor-pointer', saved ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90')}>
          {saved ? (<><CheckCircle2 className="size-4" /> Saved!</>) : (<><Save className="size-4" /> Save Changes</>)}
        </button>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          <AlertTriangle className="size-4 shrink-0" /> {saveError}
        </div>
      )}

      {/* Weekly Operating Hours */}
      <div className="bg-card border border-border rounded-xl shadow-card p-6">
        <h3 className="text-[15px] font-semibold text-foreground mb-1">Weekly Operating Hours</h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          {location ? `For ${location.name}. ` : 'No CRM location found for this tenant yet — hours cannot be saved until one exists. '}
          These are the hours the booking availability check enforces; days never saved use the salon defaults (7:00 AM – 6:00 PM, closed Mondays).
        </p>
        <div className="space-y-3">
          {DAYS.map((day) => {
            const h = hours[day.name] ?? defaultFor(day.dow);
            return (
              <div key={day.name} className="flex items-center gap-4 py-2 border-b border-border last:border-0">
                <div className="w-28">
                  <span className="text-[13px] font-medium text-foreground">{day.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setHours((prev) => ({ ...prev, [day.name]: { ...h, closed: !h.closed } }))}
                  className={cn('inline-flex items-center justify-center h-7 px-2 rounded-lg border text-[12px] font-medium cursor-pointer transition-colors', h.closed ? 'bg-muted text-muted-foreground border-border' : 'bg-success/10 text-success border-success/20')}
                >
                  {h.closed ? 'Closed' : 'Open'}
                </button>
                {!h.closed && (
                  <div className="flex items-center gap-2">
                    <Clock className="size-3.5 text-muted-foreground" />
                    <input type="time" value={h.open} onChange={(e) => setHours((prev) => ({ ...prev, [day.name]: { ...h, open: e.target.value } }))} className="h-8 bg-background border border-input rounded-lg px-2 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring" />
                    <span className="text-[13px] text-muted-foreground">to</span>
                    <input type="time" value={h.close} onChange={(e) => setHours((prev) => ({ ...prev, [day.name]: { ...h, close: e.target.value } }))} className="h-8 bg-background border border-input rounded-lg px-2 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Holiday Blackouts */}
      <div className="bg-card border border-border rounded-xl shadow-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-foreground">Holiday Blackout Calendar</h3>
        </div>
        {/* The calendar rendering of the blackout rows below (the panel
            was titled "Calendar" but only ever listed rows). Shaded
            days are blocked for booking; ranges shade every covered
            day. Month navigation is local view state only. */}
        <BlackoutCalendar blackouts={blackouts} />
        {blackouts.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-2 text-center">No holiday blackouts configured.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {blackouts.map((b) => (
              <div key={b.id} className="flex items-center gap-3 py-2">
                <CalendarX className="size-4 text-warning shrink-0" />
                <span className="text-[13px] font-medium text-foreground tabular-nums">
                  {b.blackout_date}{b.end_date && b.end_date !== b.blackout_date ? ` → ${b.end_date}` : ''}
                </span>
                <span className="flex-1 text-[13px] text-foreground">{b.name}</span>
                <button onClick={() => handleDeleteBlackout(b)} className="inline-flex items-center justify-center size-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer" title="Remove blackout">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
          <input type="date" value={newBlackout.date} onChange={(e) => setNewBlackout((p) => ({ ...p, date: e.target.value }))} className="h-8 bg-background border border-input rounded-lg px-2 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring" />
          <input type="date" value={newBlackout.endDate} onChange={(e) => setNewBlackout((p) => ({ ...p, endDate: e.target.value }))} title="End date (optional)" className="h-8 bg-background border border-input rounded-lg px-2 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring" />
          <input type="text" value={newBlackout.name} onChange={(e) => setNewBlackout((p) => ({ ...p, name: e.target.value }))} placeholder="Holiday name" className="flex-1 min-w-[160px] h-8 bg-background border border-input rounded-lg px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring" />
          <button onClick={handleAddBlackout} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-accent h-8 px-3 text-[12px] font-medium cursor-pointer">
            <Plus className="size-3.5" /> Add Holiday
          </button>
        </div>
        {blackoutError && <p className="text-[12px] text-destructive mt-2">{blackoutError}</p>}
        <p className="text-[11px] text-muted-foreground mt-2">Blackouts block online booking for the whole day(s) — they are mirrored into the booking calendar the moment they are saved.</p>
      </div>


      {/* Online Self-Booking */}
      <div className="bg-card border border-border rounded-xl shadow-card p-6">
        <h3 className="text-[15px] font-semibold text-foreground mb-4">Online Self-Booking</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-[13px] font-medium text-foreground block">Allow Customer Self-Booking</span>
              <span className="text-[11px] text-muted-foreground">Gates the public booking form — when off, customers are told to call instead.</span>
            </div>
            <button type="button" onClick={() => update('online_booking_enabled', !form.online_booking_enabled)} className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors', form.online_booking_enabled ? 'bg-primary' : 'bg-muted')}>
              <span className={cn('inline-block size-3.5 rounded-full bg-white transition-transform', form.online_booking_enabled ? 'translate-x-4' : 'translate-x-1')} />
            </button>
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-[13px] font-medium text-foreground">Allow Customer Self-Cancel</span>
            <button type="button" onClick={() => update('portal_allow_self_cancel', !form.portal_allow_self_cancel)} className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors', form.portal_allow_self_cancel ? 'bg-primary' : 'bg-muted')}>
              <span className={cn('inline-block size-3.5 rounded-full bg-white transition-transform', form.portal_allow_self_cancel ? 'translate-x-4' : 'translate-x-1')} />
            </button>
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-[13px] font-medium text-foreground">Allow Customer Self-Reschedule</span>
            <button type="button" onClick={() => update('portal_allow_self_reschedule', !form.portal_allow_self_reschedule)} className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors', form.portal_allow_self_reschedule ? 'bg-primary' : 'bg-muted')}>
              <span className={cn('inline-block size-3.5 rounded-full bg-white transition-transform', form.portal_allow_self_reschedule ? 'translate-x-4' : 'translate-x-1')} />
            </button>
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-[13px] font-medium text-foreground">Show Pricing Upfront</span>
            <button type="button" onClick={() => update('portal_show_pricing_upfront', !form.portal_show_pricing_upfront)} className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors', form.portal_show_pricing_upfront ? 'bg-primary' : 'bg-muted')}>
              <span className={cn('inline-block size-3.5 rounded-full bg-white transition-transform', form.portal_show_pricing_upfront ? 'translate-x-4' : 'translate-x-1')} />
            </button>
          </label>
        </div>
      </div>
    </div>
  );
};

// Month-grid rendering of crm_holiday_blackouts (the rows managed
// above). Pure view: shading derives from blackout_date → end_date
// ranges; navigation is local state.
const BlackoutCalendar: React.FC<{ blackouts: Blackout[] }> = ({ blackouts }) => {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const coverFor = (dateStr: string) =>
    blackouts.find((b) => dateStr >= b.blackout_date && dateStr <= (b.end_date || b.blackout_date));
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return (
    <div className="mb-5 border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="text-[12px] px-2 py-1 border border-border rounded hover:bg-muted cursor-pointer">← Prev</button>
        <span className="text-[13px] font-semibold">{monthLabel}</span>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="text-[12px] px-2 py-1 border border-border rounded hover:bg-muted cursor-pointer">Next →</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-[10px] font-semibold uppercase text-muted-foreground py-1">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`x-${i}`} />;
          const dateStr = iso(new Date(year, month, day));
          const cover = coverFor(dateStr);
          const isToday = dateStr === iso(new Date());
          return (
            <div key={dateStr} title={cover ? cover.name : undefined}
              className={`py-1.5 rounded text-[12px] tabular-nums ${
                cover ? 'bg-warning/20 text-warning font-semibold' : 'text-foreground'
              } ${isToday ? 'ring-1 ring-primary' : ''}`}>
              {day}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">Shaded days are blackout days (hover for the holiday name). The rows below remain the editable record.</p>
    </div>
  );
};

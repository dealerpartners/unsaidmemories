'use client';

// Staff & Groomer Management — real roster from /api/admin/staff
// (crm_staff + crm_staff_shifts + crm_appointments). This view previously
// rendered STAFF_SCHEDULES from dawg-mock-data: invented 9–5 shifts, an
// invented 50% commission default, invented slot bars. Values that aren't
// in the data now render as "Not set" / "No shift today" — never invented.
//
// The header actions fire the real quick-action backends through the same
// dispatcher the command palette uses:
//   Add Team Member  → staff_add_member  (system actions → add_member)
//   Build Schedule   → staff_build_schedule (scheduleMode header button)
//   Assign Shift     → staff_assign_shifts (scheduleMode, per-card form)

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Clock, DollarSign, Loader2, Phone, Plus, Search, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuickActions } from '@/hooks/useQuickActions';

type StaffRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isGroomer: boolean;
  isActive: boolean;
  commissionRate: number | null;
  payType: string | null;
  todayShift: { startsAt: string; endsAt: string } | null;
  todayAppointments: number;
  weekShiftDays: string[];
};

interface StaffViewProps {
  scheduleMode?: boolean;
}

type RoleFilter = 'all' | 'Groomer' | 'Seller' | 'Manager';

type IncidentRow = {
  id: string;
  severity: string;
  description: string;
  action_taken: string | null;
  created_at: string;
  staff_name: string | null;
  pet_name: string | null;
  appointment_number: string | null;
};

const ROLE_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'All Roles' },
  { value: 'Groomer', label: 'Groomers' },
  { value: 'Seller', label: 'Seller' },
  { value: 'Manager', label: 'Managers' },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

function fmtTime(ts: string): string {
  const m = String(ts).match(/[T ](\d{2}):(\d{2})/);
  if (!m) return ts;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ap}`;
}

const inputCls =
  'bg-background border border-input rounded-lg px-3 h-9 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full';

export const StaffView: React.FC<StaffViewProps> = ({ scheduleMode = false }) => {
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [weekDates, setWeekDates] = useState<string[]>([]);
  const [today, setToday] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ first_name: '', last_name: '', email: '', role: 'groomer' });
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState({ shift_date: '', starts_at: '09:00', ends_at: '17:00' });
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const { execute, isLoading: actionBusy } = useQuickActions();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/staff');
      if (!res.ok) throw new Error(`Staff list failed to load (${res.status})`);
      const data = await res.json();
      setStaffList(Array.isArray(data.staff) ? data.staff : []);
      // Employee-filed incident reports (§5.1) — the admin read side.
      // Best-effort: the roster stands even if this read fails.
      try {
        const ires = await fetch('/api/admin/crm/staff/incidents?limit=10');
        if (ires.ok) {
          const idata = await ires.json();
          setIncidents(Array.isArray(idata.incidents) ? idata.incidents : []);
        }
      } catch { /* roster is the primary surface */ }
      setWeekDates(Array.isArray(data.weekDates) ? data.weekDates : []);
      setToday(typeof data.today === 'string' ? data.today : '');
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Staff list failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredStaff = staffList.filter((staff) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || staff.name.toLowerCase().includes(q) || (staff.role || '').toLowerCase().includes(q);
    const matchesRole =
      roleFilter === 'all' ||
      (roleFilter === 'Groomer' ? staff.isGroomer || (staff.role || '').toLowerCase().includes('groomer') : (staff.role || '').toLowerCase().includes(roleFilter.toLowerCase()));
    return matchesSearch && matchesRole;
  });

  const totalAppointments = staffList.reduce((sum, s) => sum + s.todayAppointments, 0);
  const groomerCount = staffList.filter((s) => s.isGroomer).length;

  const submitAddMember = async () => {
    if (!addForm.first_name.trim() || !addForm.last_name.trim()) {
      setActionMsg('First and last name are required.');
      return;
    }
    try {
      await execute({ domain: 'system', action: 'staff_add_member', payload: { ...addForm, is_service_staff: addForm.role.toLowerCase().includes('groomer') } });
      setActionMsg(`${addForm.first_name} ${addForm.last_name} added to the team (staff profile — portal login is provisioned separately under Settings → Users).`);
      setAddForm({ first_name: '', last_name: '', email: '', role: 'groomer' });
      setShowAddForm(false);
      load();
    } catch { /* toast from useQuickActions carries the error */ }
  };

  const buildSchedule = async () => {
    if (!today || !weekDates.length) return;
    try {
      const res: any = await execute({
        domain: 'system',
        action: 'staff_build_schedule',
        payload: { start_date: today, end_date: weekDates[weekDates.length - 1] },
      });
      setActionMsg(`Schedule built: ${res?.shiftsCreated ?? 0} new shifts for ${res?.staffCount ?? 0} groomers (${today} → ${weekDates[weekDates.length - 1]}). Days that already had a shift were skipped.`);
      load();
    } catch { /* toast carries the error */ }
  };

  const submitAssignShift = async (staffId: string) => {
    if (!assignForm.shift_date) { setActionMsg('Pick a shift date.'); return; }
    try {
      await execute({
        domain: 'system',
        action: 'staff_assign_shifts',
        // Full datetimes — the handler stores starts_at/ends_at as
        // timestamps, so a bare "09:00" would land on today's date
        // instead of the chosen shift date.
        payload: { staff_id: staffId, shift_date: assignForm.shift_date, starts_at: `${assignForm.shift_date}T${assignForm.starts_at}:00`, ends_at: `${assignForm.shift_date}T${assignForm.ends_at}:00` },
      });
      setActionMsg('Shift assigned.');
      setAssignFor(null);
      load();
    } catch { /* toast carries the error */ }
  };

  return (
    <div className="flex flex-col w-full bg-background text-foreground min-h-full">
      {/* STATUS STRIP */}
      <div className="w-full bg-muted/60 border-b border-border px-4 py-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-success animate-pulse shrink-0"></span>
          <span className="font-medium text-[11px] text-muted-foreground">Staff &amp; Groomer Management</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="font-medium">
            Team: <span className="text-foreground font-semibold">{staffList.length}</span>
          </span>
          <span className="font-medium">
            Groomers: <span className="text-foreground font-semibold">{groomerCount}</span>
          </span>
          <span className="font-medium">
            Today&apos;s Appts: <span className="text-primary font-semibold">{totalAppointments}</span>
          </span>
        </div>
      </div>

      {/* PAGE HEADER */}
      <div className="p-6 border-b border-border bg-background flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {scheduleMode ? 'Staff Schedule' : 'Staff & Groomer Management'}
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
              {staffList.length} Members
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            {scheduleMode
              ? 'Real shifts from the schedule store. Build the week for every active groomer, or assign a shift to one person.'
              : 'Shift capacity, appointment distribution, commission tiers, and contact information for your team.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scheduleMode && (
            <button
              onClick={buildSchedule}
              disabled={actionBusy || !today}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-muted h-9 px-3.5 text-[13px] font-medium transition-colors duration-150 cursor-pointer disabled:opacity-50"
            >
              <CalendarPlus className="size-4" />
              Build Schedule (7 Days)
            </button>
          )}
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3.5 text-[13px] font-medium shadow-card transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {showAddForm ? <X className="size-4" /> : <Plus className="size-4" />}
            Add Team Member
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="p-6 space-y-6">
        {actionMsg && (
          <div className="bg-muted/50 border border-border rounded-lg px-4 py-3 text-[13px] text-foreground flex items-start justify-between gap-3">
            <span>{actionMsg}</span>
            <button onClick={() => setActionMsg(null)} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
          </div>
        )}

        {showAddForm && (
          <div className="bg-card border border-border rounded-xl shadow-card p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">Add Team Member</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input aria-label="First name" placeholder="First name *" value={addForm.first_name} onChange={(e) => setAddForm({ ...addForm, first_name: e.target.value })} className={inputCls} />
              <input aria-label="Last name" placeholder="Last name *" value={addForm.last_name} onChange={(e) => setAddForm({ ...addForm, last_name: e.target.value })} className={inputCls} />
              <input aria-label="Email" placeholder="Email" type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} className={inputCls} />
              <input aria-label="Role" placeholder="Role (e.g. groomer)" value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value })} className={inputCls} />
              <button onClick={submitAddMember} disabled={actionBusy} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3.5 text-[13px] font-medium disabled:opacity-50">
                {actionBusy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add Member
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Creates the staff profile and emails them a sign-in invitation — they set their own password and land in the employee portal. Module permissions are granted under Settings → Users.</p>
          </div>
        )}

        {/* FILTERS ROW */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-xl shadow-card p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold text-muted-foreground flex items-center gap-1.5 mr-1">
              <Search className="size-3.5" />
              Search:
            </span>
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or role..."
                className="bg-background border border-input rounded-lg pl-8 pr-3 h-8 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring transition-colors w-64 max-w-full"
              />
            </div>
            <div className="relative inline-flex">
              <select
                aria-label="Filter by role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                className="appearance-none bg-background border border-input hover:border-primary/40 rounded-lg pl-3 pr-8 h-8 text-[12px] font-medium text-foreground cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
          <span className="text-[12px] font-medium text-muted-foreground">
            {filteredStaff.length} of {staffList.length} members
          </span>
        </div>

        {/* STAFF GRID */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-[13px]">Loading team…</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-[14px] font-medium text-foreground">Couldn&apos;t load the team</p>
            <p className="text-[12px] text-muted-foreground mt-1">{loadError}</p>
            <button onClick={load} className="mt-3 text-[12px] font-medium text-primary hover:underline">Retry</button>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Users className="size-6 text-muted-foreground" />
            </div>
            <p className="text-[14px] font-medium text-foreground">No team members found</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              {staffList.length === 0 ? 'No staff profiles exist for this location yet — add the first team member above.' : 'Try adjusting your search or role filter.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in-up">
            {filteredStaff.map((staff) => (
              <div
                key={staff.id}
                className="bg-card border border-border rounded-xl shadow-card p-5 space-y-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-md hover:border-primary/30"
              >
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-semibold text-[11px] shadow-card">
                      {initialsOf(staff.name)}
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-foreground text-[15px]">{staff.name}</h3>
                      <p className="text-[11px] text-muted-foreground font-medium">
                        {staff.role || 'Team member'}{staff.isGroomer ? ' · Groomer' : ''}
                        {!staff.isActive && <span className="ml-1.5 text-destructive font-semibold">Inactive</span>}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-primary border border-primary/20 text-[10px] font-semibold">
                    {staff.todayAppointments} Appts
                  </span>
                </div>

                <div className="border border-border rounded-lg p-3 space-y-2 text-[12px] bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="size-3.5" /> Shift Today
                    </span>
                    <span className="font-medium text-foreground tabular-nums">
                      {staff.todayShift ? `${fmtTime(staff.todayShift.startsAt)} – ${fmtTime(staff.todayShift.endsAt)}` : 'No shift today'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <DollarSign className="size-3.5" /> Commission
                    </span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {staff.commissionRate !== null ? `${staff.commissionRate}%` : 'Not set'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="size-3.5" /> Phone
                    </span>
                    <span className="font-medium text-foreground tabular-nums">{staff.phone || '—'}</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Next 7 Days
                    </p>
                    <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                      {staff.weekShiftDays.length} of 7 days scheduled
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {weekDates.map((d) => {
                      const scheduled = staff.weekShiftDays.includes(d);
                      const dayLabel = new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'narrow' });
                      return (
                        <span
                          key={d}
                          title={`${d}: ${scheduled ? 'Shift scheduled' : 'No shift'}`}
                          className={cn(
                            'flex-1 h-6 rounded-sm flex items-center justify-center text-[9px] font-semibold',
                            scheduled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {dayLabel}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {scheduleMode && (
                  <div>
                    {assignFor === staff.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <input aria-label="Shift date" type="date" value={assignForm.shift_date} onChange={(e) => setAssignForm({ ...assignForm, shift_date: e.target.value })} className={inputCls} />
                          <input aria-label="Start time" type="text" placeholder="09:00" value={assignForm.starts_at} onChange={(e) => setAssignForm({ ...assignForm, starts_at: e.target.value })} className={inputCls} />
                          <input aria-label="End time" type="text" placeholder="17:00" value={assignForm.ends_at} onChange={(e) => setAssignForm({ ...assignForm, ends_at: e.target.value })} className={inputCls} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => submitAssignShift(staff.id)} disabled={actionBusy} className="flex-1 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 text-[12px] font-medium disabled:opacity-50">
                            Save Shift
                          </button>
                          <button onClick={() => setAssignFor(null)} className="inline-flex items-center justify-center rounded-lg border border-border h-8 px-3 text-[12px] font-medium">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAssignFor(staff.id); setAssignForm({ shift_date: today, starts_at: '09:00', ends_at: '17:00' }); }}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border hover:bg-muted h-8 px-3 text-[12px] font-medium transition-colors"
                      >
                        <Clock className="size-3.5" /> Assign Shift
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* INCIDENT REPORTS — filed by employees (§5.1), read here */}
        <div className="bg-card border border-border rounded-xl shadow-card p-4">
          <p className="text-[13px] font-semibold text-foreground mb-1">Incident Reports</p>
          <p className="text-[11px] text-muted-foreground mb-3">Filed by team members from their portal. Newest first.</p>
          {incidents.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No incident reports filed.</p>
          ) : (
            <div className="space-y-2">
              {incidents.map((inc) => (
                <div key={inc.id} className="border border-border rounded-lg p-3 bg-muted/30">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] font-semibold text-foreground">{inc.staff_name || 'Team member'}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border border-border bg-background text-foreground uppercase tracking-wide">{inc.severity}</span>
                  </div>
                  <p className="text-[12px] text-foreground mt-1 leading-relaxed">{inc.description}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {inc.pet_name ? `Pet: ${inc.pet_name} · ` : ''}{inc.appointment_number ? `Appt ${inc.appointment_number} · ` : ''}{new Date(inc.created_at).toLocaleString()}
                  </p>
                  {inc.action_taken && <p className="text-[11px] text-muted-foreground mt-0.5">Action taken: {inc.action_taken}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

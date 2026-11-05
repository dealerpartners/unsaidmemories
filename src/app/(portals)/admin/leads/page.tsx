'use client';

import { useEffect, useState } from 'react';
import { Search, UserPlus, CalendarClock } from 'lucide-react';

type Lead = {
  id: string;
  contact_name: string;
  email: string;
  phone: string | null;
  lead_source: string;
  lead_type: string | null;
  status: string;
  booking_outcome: string | null;
  lost_reason: string | null;
  lead_owner_id: string | null;
  first_contact_at: string | null;
  last_activity_at: string | null;
  conversion_date: string | null;
  notes: string | null;
  next_follow_up_at: string | null;
  created_at: string;
};

type LeadActivity = {
  id: string;
  activity_type: string;
  occurred_at: string;
  notes: string | null;
};

// Real crm_leads.status CHECK vocabulary (there is no 'closed' status).
const STATUSES = ['all', 'new', 'contacted', 'qualified', 'booking_pending', 'booked', 'converted', 'lost', 'no_response'] as const;

// B.1.16 booking outcomes (crm_leads.booking_outcome CHECK).
const BOOKING_OUTCOMES = [
  { value: 'booked', label: 'Booked' },
  { value: 'pending', label: 'Pending' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'lost', label: 'Lost' },
  { value: 'no_response', label: 'No Response' },
] as const;

// B.1.17 lost reasons (crm_leads.lost_reason CHECK — keys of the seeded
// crm_lost_reasons config vocabulary).
const LOST_REASONS = [
  { value: 'price', label: 'Price' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'location', label: 'Location' },
  { value: 'no_availability', label: 'No Availability' },
  { value: 'found_another_groomer', label: 'Found Another Provider' },
  { value: 'other', label: 'Other' },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  partner_grooming: 'Service Partner',
  partner_vet: 'Vet Partner',
  partner_pharmacy: 'Pharmacy Partner',
  partner_seller: 'Seller Partner',
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    new: 'bg-brand-teal/10 text-brand-teal dark:bg-brand-teal/20 dark:text-brand-teal',
    contacted: 'adm-badge adm-badge-amber',
    qualified: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    converted: 'adm-badge adm-badge-green',
    booked: 'adm-badge adm-badge-green',
    booking_pending: 'adm-badge adm-badge-amber',
    lost: 'adm-badge adm-badge-red',
    no_response: 'adm-badge',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${styles[status] || styles.no_response}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);
  // Lead Owner picker (§1.15.1) — real staff from crm_staff, the same
  // source the customer profile's owner picker uses.
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);

  useEffect(() => {
    fetch('/api/admin/crm/staff')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStaffOptions((d?.staff || []).map((s: any) => ({ id: s.id, name: s.displayName || [s.firstName, s.lastName].filter(Boolean).join(' ') || s.id }))))
      .catch(() => {});
  }, []);

  // Activity feed for the open lead (§1.15.4) — crm_lead_activities via
  // the leads GET ?id= read leg.
  useEffect(() => {
    if (!selected) { setActivities([]); return; }
    fetch(`/api/admin/leads?id=${encodeURIComponent(selected.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setActivities(Array.isArray(j?.activities) ? j.activities : []))
      .catch(() => setActivities([]));
  }, [selected]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (q) params.set('q', q);
      const r = await fetch(`/api/admin/leads?${params}`);
      const j = await r.json();
      setLeads(j.leads || []);
      setMissing(!!j.missing);
      const c: Record<string, number> = { all: 0 };
      (j.counts || []).forEach((x: { status: string; n: string }) => {
        c[x.status] = parseInt(x.n, 10);
        c.all += parseInt(x.n, 10);
      });
      setCounts(c);
    } catch {
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const save = async (patch: Partial<Lead>) => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, ...patch }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || 'That change could not be saved — nothing was updated.');
        return;
      }
      setSelected(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  if (missing) {
    return (
      <div className="">
        <h1 className="text-xl font-bold">Leads</h1>
        <p className="mt-2 text-sm text-neutral-500">
          The <code>crm_leads</code> table has not been created yet. Run the SQL from the 2.4 gaps package in the Supabase SQL Editor.
        </p>
      </div>
    );
  }

  return (
    <div className="">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Leads
          </h1>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Search name, email…"
            className="rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${ status === s ? 'bg-brand-teal/10 text-brand-teal dark:bg-brand-teal/20 dark:text-brand-teal' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300' }`}
          >
            {s.replace('_', ' ')} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead className="bg-neutral-50 dark:bg-neutral-900/60">
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3">Follow-up</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">Loading…</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">No leads yet. Partner applications will appear here automatically.</td></tr>
            ) : (
              leads.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setSelected(l)}
                  className="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900/40"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.contact_name}</div>
                    <div className="text-xs text-neutral-500">{l.email}{l.phone ? ` · ${l.phone}` : ''}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{SOURCE_LABELS[l.lead_source] || l.lead_source}</td>
                  <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {l.booking_outcome ? (
                      <span className="capitalize">{l.booking_outcome.replace('_', ' ')}{l.booking_outcome === 'lost' && l.lost_reason ? ` · ${LOST_REASONS.find((r) => r.value === l.lost_reason)?.label || l.lost_reason}` : ''}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {l.next_follow_up_at ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {new Date(l.next_follow_up_at).toLocaleDateString()}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">{new Date(l.created_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table></div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{selected.contact_name}</h2>
            <p className="text-sm text-neutral-500">{selected.email}{selected.phone ? ` · ${selected.phone}` : ''}</p>
            {selected.notes && <p className="mt-3 rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-800">{selected.notes}</p>}

            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Status</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {STATUSES.filter((s) => s !== 'all').map((s) => (
                  <button
                    key={s}
                    onClick={() => save({ status: s })}
                    disabled={saving}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${ selected.status === s ? 'bg-brand-teal/10 text-brand-teal dark:bg-brand-teal/20 dark:text-brand-teal' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300' }`}
                  >
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* B.1.15.1 lead owner — assignable; validated server-side against crm_staff */}
            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Lead Owner</label>
              <select
                value={selected.lead_owner_id || ''}
                disabled={saving}
                onChange={(e) => save({ lead_owner_id: e.target.value || null } as Partial<Lead>)}
                className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              >
                <option value="">— Unassigned —</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                {selected.lead_owner_id && !staffOptions.some((s) => s.id === selected.lead_owner_id) && (
                  <option value={selected.lead_owner_id}>Current owner (inactive)</option>
                )}
              </select>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Next follow-up</label>
              <input
                type="date"
                defaultValue={selected.next_follow_up_at ? selected.next_follow_up_at.slice(0, 10) : ''}
                onChange={(e) => e.target.value && save({ next_follow_up_at: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
            </div>

            {/* B.1.16 booking outcome + B.1.17 lost reason — stored on the lead row */}
            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Booking Outcome</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {BOOKING_OUTCOMES.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => save({ booking_outcome: o.value, ...(o.value === 'lost' ? {} : { lost_reason: null }) } as Partial<Lead>)}
                    disabled={saving}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${ selected.booking_outcome === o.value ? 'bg-brand-teal/10 text-brand-teal dark:bg-brand-teal/20 dark:text-brand-teal' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300' }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {selected.booking_outcome === 'lost' && (
                <div className="mt-3">
                  <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Lost Reason</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {LOST_REASONS.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => save({ booking_outcome: 'lost', lost_reason: r.value } as Partial<Lead>)}
                        disabled={saving}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${ selected.lost_reason === r.value ? 'bg-red-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300' }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* B.1.15 lead fields on record (read-only facts from the lead row) */}
            <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-neutral-500">
              <div>
                <div className="font-semibold uppercase tracking-wide">First Contact</div>
                <div className="mt-0.5 text-sm text-neutral-700 dark:text-neutral-300">{selected.first_contact_at ? new Date(selected.first_contact_at).toLocaleDateString() : '—'}</div>
              </div>
              <div>
                <div className="font-semibold uppercase tracking-wide">Last Activity</div>
                <div className="mt-0.5 text-sm text-neutral-700 dark:text-neutral-300">{selected.last_activity_at ? new Date(selected.last_activity_at).toLocaleDateString() : '—'}</div>
              </div>
              <div>
                <div className="font-semibold uppercase tracking-wide">Conversion Date</div>
                <div className="mt-0.5 text-sm text-neutral-700 dark:text-neutral-300">{selected.conversion_date ? new Date(selected.conversion_date).toLocaleDateString() : '—'}</div>
              </div>
            </div>

            {/* B.1.15.4 activity feed — crm_lead_activities rows for this lead */}
            {activities.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Recent Activity</div>
                <ul className="mt-1 space-y-1">
                  {activities.slice(0, 8).map((a) => (
                    <li key={a.id} className="flex items-baseline justify-between gap-3 text-xs text-neutral-600 dark:text-neutral-300">
                      <span className="capitalize">{a.activity_type.replace('_', ' ')}{a.notes ? ` — ${a.notes.slice(0, 60)}` : ''}</span>
                      <span className="shrink-0 text-neutral-400">{new Date(a.occurred_at).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={() => setSelected(null)}
              className="mt-6 w-full rounded-lg bg-neutral-100 py-2 text-sm font-semibold dark:bg-neutral-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

// ============================================================================
// /admin/sellers/remediation — Admin Tree A4 · Remediation plans desk.
//
// The seller_remediation_plans store existed with no surface at all
// (census A4). This desk is the flow over /api/admin/sellers/remediation:
// put a seller on a plan (seller + trigger — KPI, violation, or manual —
// with requirements and a deadline), track every plan's status, edit an
// active plan, and complete / expire / cancel it. Plans past their
// deadline are expired by the API on read, so what renders here is the
// recorded state. Real store only; an empty store renders an honest
// empty state.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, Plus, CheckCircle2, XCircle, Clock } from 'lucide-react';

type Plan = {
  id: string; seller_id: string; seller_name: string | null;
  status: string; trigger_type: string | null; trigger_ref: string | null;
  kpi_key: string | null; violation_id: string | null; title: string | null;
  requirements: string; deadline: string | null; notes: string | null;
  completed_at: string | null; created_at: string; updated_at: string;
};
type SellerOption = { id: string; name: string };

const STATUS_STYLES: Record<string, string> = {
  active: 'adm-badge adm-badge-amber',
  completed: 'bg-green-100 text-green-700',
  expired: 'adm-badge adm-badge-red',
  cancelled: 'bg-muted text-muted-foreground',
};
const TERMINAL = ['completed', 'expired', 'cancelled'];

const fmtDate = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

export default function RemediationPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [msg, setMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    seller_id: '', trigger_type: 'kpi', kpi_key: '', violation_id: '',
    title: '', requirements: '', deadline: '', notes: '',
  });
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [editDeadline, setEditDeadline] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/sellers/remediation', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((j) => { setPlans(j.plans || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/admin/sellers', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j: any) => {
        const rows = (j.rows || j.sellers || []) as any[];
        setSellers(rows.map((s) => ({ id: s.id, name: s.display_name || s.legal_name || s.name || s.id })));
      })
      .catch(() => {});
  }, []);

  const create = async () => {
    if (!form.seller_id) { setMsg('Pick a seller first.'); return; }
    if (!form.requirements.trim()) { setMsg('Requirements are required — a plan without them is not a plan.'); return; }
    if (!form.deadline) { setMsg('A deadline is required.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/sellers/remediation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_id: form.seller_id,
          trigger_type: form.trigger_type,
          kpi_key: form.trigger_type === 'kpi' ? form.kpi_key || undefined : undefined,
          violation_id: form.trigger_type === 'violation' ? form.violation_id || undefined : undefined,
          title: form.title || undefined,
          requirements: form.requirements,
          deadline: form.deadline,
          notes: form.notes || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error || 'Could not create the plan.'); return; }
      setMsg('Remediation plan created.');
      setShowForm(false);
      setForm({ seller_id: '', trigger_type: 'kpi', kpi_key: '', violation_id: '', title: '', requirements: '', deadline: '', notes: '' });
      load();
    } catch (e: any) { setMsg(e.message); } finally { setSaving(false); }
  };

  const act = async (p: Plan, action: 'complete' | 'expire' | 'cancel' | 'update') => {
    const body: Record<string, unknown> = { id: p.id, action };
    if (action === 'update') {
      if (editNotes[p.id] !== undefined) body.notes = editNotes[p.id] || null;
      if (editDeadline[p.id]) body.deadline = editDeadline[p.id];
      if (body.notes === undefined && !body.deadline) { setMsg('Nothing to save — set a note or a new deadline first.'); return; }
    }
    if (action !== 'update' && !confirm(`${action === 'complete' ? 'Complete' : action === 'expire' ? 'Expire' : 'Cancel'} the remediation plan for ${p.seller_name || 'this seller'}?`)) return;
    try {
      const res = await fetch('/api/admin/sellers/remediation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error || 'Update failed.'); return; }
      setMsg(`Plan ${j.plan?.status || 'updated'}.`);
      load();
    } catch (e: any) { setMsg(e.message); }
  };

  const shown = plans.filter((p) => statusFilter === 'all' || p.status === statusFilter);
  const counts = {
    all: plans.length,
    active: plans.filter((p) => p.status === 'active').length,
    completed: plans.filter((p) => p.status === 'completed').length,
    expired: plans.filter((p) => p.status === 'expired').length,
    cancelled: plans.filter((p) => p.status === 'cancelled').length,
  };

  return (
    <div className="max-w-6xl mx-auto">
      <Link href="/admin/sellers" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:underline">
        <ArrowLeft className="w-3.5 h-3.5" /> Seller Management
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mt-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardList className="size-6" /> Remediation plans
          </h1>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-xs font-semibold text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5">
          <Plus className="w-3.5 h-3.5" /> New plan
        </button>
      </div>

      {msg && <p className="text-xs mt-3 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />{msg}</p>}

      {showForm && (
        <section className="border mt-4 space-y-3 bg-card">
          <h2 className="text-sm font-semibold">Put a seller on a remediation plan</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="font-medium">Seller</span>
              <select value={form.seller_id} onChange={(e) => setForm({ ...form, seller_id: e.target.value })} className="border px-2 py-1.5 bg-background">
                <option value="">Select a seller…</option>
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Trigger</span>
              <select value={form.trigger_type} onChange={(e) => setForm({ ...form, trigger_type: e.target.value })} className="border px-2 py-1.5 bg-background">
                <option value="kpi">Missed KPI</option>
                <option value="violation">Violation</option>
                <option value="manual">Manual (admin judgement)</option>
              </select>
            </label>
            {form.trigger_type === 'kpi' && (
              <label className="flex flex-col gap-1">
                <span className="font-medium">KPI key (e.g. late_shipment_rate)</span>
                <input value={form.kpi_key} onChange={(e) => setForm({ ...form, kpi_key: e.target.value })} className="border px-2 py-1.5" placeholder="late_shipment_rate" />
              </label>
            )}
            {form.trigger_type === 'violation' && (
              <label className="flex flex-col gap-1">
                <span className="font-medium">Violation ID (must belong to the seller)</span>
                <input value={form.violation_id} onChange={(e) => setForm({ ...form, violation_id: e.target.value })} className="border px-2 py-1.5" placeholder="seller_violations id" />
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="font-medium">Title (optional)</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="border px-2 py-1.5" placeholder="Late shipment remediation" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Deadline</span>
              <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="border px-2 py-1.5" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Requirements</span>
            <textarea value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} rows={3} className="border px-2 py-1.5 w-full" placeholder="What the seller must do, and to what standard, by the deadline." />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Notes (optional)</span>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="border px-2 py-1.5 w-full" />
          </label>
          <div className="flex gap-2">
            <button onClick={create} disabled={saving} className="rounded border border-border bg-card px-3 py-1.5 text-xs font-semibold text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create plan'}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded border px-3 py-1.5 text-xs">Cancel</button>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2 mt-5">
        {(['all', 'active', 'completed', 'expired', 'cancelled'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium border capitalize ${statusFilter === s ? 'bg-brand-teal/10 text-brand-teal' : 'bg-background'}`}>
            {s} · {counts[s]}
          </button>
        ))}
      </div>

      <div className="border mt-3 overflow-x-auto">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className="text-left text-[10px] uppercase text-muted-foreground border-b">
              <th className="p-2.5 font-medium">Seller</th>
              <th className="p-2.5 font-medium">Trigger</th>
              <th className="p-2.5 font-medium">Requirements</th>
              <th className="p-2.5 font-medium">Deadline</th>
              <th className="p-2.5 font-medium">Status</th>
              <th className="p-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-foreground">
                No remediation plans {statusFilter !== 'all' ? `with status “${statusFilter}” ` : ''}recorded. Plans opened from this desk appear here.
              </td></tr>
            )}
            {shown.map((p) => (
              <tr key={p.id} className="border-b align-top">
                <td className="p-2.5">
                  <div className="font-medium">{p.seller_name || p.seller_id.slice(0, 8)}</div>
                  {p.title && <div className="text-muted-foreground">{p.title}</div>}
                  <div className="text-muted-foreground">opened {fmtDate(p.created_at)}</div>
                </td>
                <td className="p-2.5">
                  <div className="capitalize">{p.trigger_type || 'manual'}</div>
                  {p.kpi_key && <div className="text-muted-foreground">{p.kpi_key}</div>}
                  {p.violation_id && <div className="text-muted-foreground">violation {p.violation_id.slice(0, 8)}…</div>}
                  {p.trigger_ref && <div className="text-muted-foreground">{p.trigger_ref}</div>}
                </td>
                <td className="p-2.5 max-w-72">
                  <div className="whitespace-pre-wrap">{p.requirements}</div>
                  {p.notes && <div className="text-muted-foreground mt-1 whitespace-pre-wrap">{p.notes}</div>}
                </td>
                <td className="p-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(p.deadline)}</span>
                  {p.completed_at && <div className="text-muted-foreground">completed {fmtDate(p.completed_at)}</div>}
                </td>
                <td className="p-2.5">
                  <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[p.status] || 'bg-muted'}`}>{p.status}</span>
                </td>
                <td className="p-2.5">
                  {TERMINAL.includes(p.status) ? (
                    <span className="text-muted-foreground">Closed</span>
                  ) : (
                    <div className="flex flex-col gap-1.5 min-w-48">
                      <input type="date" value={editDeadline[p.id] || ''} onChange={(e) => setEditDeadline({ ...editDeadline, [p.id]: e.target.value })} className="border px-2 py-1 text-xs w-full" />
                      <input value={editNotes[p.id] || ''} onChange={(e) => setEditNotes({ ...editNotes, [p.id]: e.target.value })} placeholder="Note (optional)" className="border px-2 py-1 text-xs w-full" />
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => act(p, 'update')} className="px-2 py-1 text-[11px] font-medium border">Save edit</button>
                        <button onClick={() => act(p, 'complete')} className="px-2 py-1 text-[11px] font-medium bg-green-700 text-white inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Complete</button>
                        <button onClick={() => act(p, 'expire')} className="px-2 py-1 text-[11px] font-medium border">Expire</button>
                        <button onClick={() => act(p, 'cancel')} className="px-2 py-1 text-[11px] font-medium bg-red-700 text-white inline-flex items-center gap-1"><XCircle className="w-3 h-3" />Cancel</button>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

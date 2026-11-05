'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FileSearch, Search, Eye, ArrowLeft, Plus } from 'lucide-react';
import TrustSafetyNav from '@/components/admin/TrustSafetyNav';
import { INVESTIGATION_TYPES, INVESTIGATION_TYPE_LABELS, type InvestigationType } from '@/lib/trust-safety';

// Status/priority vocabulary is the live seller_investigations vocabulary —
// the same one the Trust & Safety console summary counts (open / in_progress).
type Investigation = {
  id: string;
  sellerId: string | null;
  sellerName: string | null;
  investigationType: InvestigationType | null;
  status: string;
  priority: string | null;
  findings: string | null;
  notes: string | null;
  violationId: string | null;
  orderId: string | null;
  investigatorId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type SellerOption = { id: string; display_name: string };

const STATUS_STYLES: Record<string, string> = {
  open: 'adm-badge adm-badge-red',
  in_progress: 'adm-badge adm-badge-amber',
  closed: 'bg-green-100 text-green-700',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  closed: 'Closed',
};

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'adm-badge adm-badge-red',
  high: 'bg-orange-100 text-orange-700',
  medium: 'adm-badge adm-badge-amber',
  low: 'bg-green-100 text-green-700',
};

function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export default function InvestigationsPage() {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ status: string; priority: string; findings: string; notes: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // F3 per-type queues ride ?type= (the node's leaves in the §F nav).
  const [type, setType] = useState<string>('all');
  // Open-investigation form (the store's writer — POST on the same route).
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [form, setForm] = useState<{ seller_id: string; investigation_type: string; priority: string; violation_id: string; notes: string }>({
    seller_id: '',
    investigation_type: INVESTIGATION_TYPES[0],
    priority: 'medium',
    violation_id: '',
    notes: '',
  });
  const [showForm, setShowForm] = useState(false);
  const [openMsg, setOpenMsg] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setType(q.get('type') || 'all');
    // Deep-link prefill from a violation/case row's Investigate action.
    const seller = q.get('seller');
    const violation = q.get('violation');
    const t = q.get('type');
    if (seller || violation) {
      setForm((f) => ({
        ...f,
        seller_id: seller || f.seller_id,
        violation_id: violation || f.violation_id,
        investigation_type: t && (INVESTIGATION_TYPES as readonly string[]).includes(t) ? t : f.investigation_type,
      }));
      setShowForm(true);
    }
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const qs = type !== 'all' ? `?type=${type}` : '';
    fetch(`/api/admin/trust-safety/investigations${qs}`)
      .then((r) => (r.ok ? r.json() : { investigations: [] }))
      .then((j) => {
        const rows = (j.investigations || []) as any[];
        setInvestigations(
          rows.map((r) => ({
            id: r.id,
            sellerId: r.seller_id ?? null,
            sellerName: r.seller_name ?? null,
            investigationType: (r.investigation_type ?? null) as InvestigationType | null,
            status: r.status || 'open',
            priority: r.priority ?? null,
            findings: r.findings ?? null,
            notes: r.notes ?? null,
            violationId: r.violation_id ?? null,
            orderId: r.order_id ?? null,
            investigatorId: r.investigator_id ?? null,
            createdAt: r.created_at ?? null,
            updatedAt: r.updated_at ?? null,
          }))
        );
      })
      .catch(() => setInvestigations([]))
      .finally(() => setLoading(false));
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/admin/sellers')
      .then((r) => (r.ok ? r.json() : {}))
      .then((j: any) => {
        const rows = (j.sellers || j.rows || []) as any[];
        setSellers(rows.map((r) => ({ id: r.id, display_name: r.display_name || r.legal_name || r.id })));
      })
      .catch(() => setSellers([]));
  }, []);

  const switchType = (t: string) => {
    setType(t);
    window.history.replaceState(null, '', t === 'all' ? '/admin/trust-safety/investigations' : `/admin/trust-safety/investigations?type=${t}`);
  };

  const openInvestigation = async () => {
    setOpening(true);
    setOpenMsg(null);
    try {
      const res = await fetch('/api/admin/trust-safety/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_id: form.seller_id,
          investigation_type: form.investigation_type,
          priority: form.priority,
          violation_id: form.violation_id || null,
          notes: form.notes || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.investigation) {
        setOpenMsg(j.error || 'The investigation could not be opened.');
        return;
      }
      setOpenMsg('Investigation opened.');
      setForm((f) => ({ ...f, violation_id: '', notes: '' }));
      if (type !== 'all' && type !== form.investigation_type) switchType(form.investigation_type);
      load();
    } catch {
      setOpenMsg('The investigation could not be opened.');
    } finally {
      setOpening(false);
    }
  };

  const openCase = (inv: Investigation) => {
    if (expandedId === inv.id) {
      setExpandedId(null);
      setDraft(null);
      setSaveMsg(null);
      return;
    }
    setExpandedId(inv.id);
    setDraft({
      status: inv.status,
      priority: inv.priority || '',
      findings: inv.findings || '',
      notes: inv.notes || '',
    });
    setSaveMsg(null);
  };

  const saveCase = async (id: string) => {
    if (!draft) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/admin/trust-safety/investigations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status: draft.status,
          priority: draft.priority || null,
          findings: draft.findings,
          notes: draft.notes,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.updated) {
        setSaveMsg(j.error || 'Save failed — the change was not recorded.');
        return;
      }
      setSaveMsg('Saved.');
      load();
    } catch {
      setSaveMsg('Save failed — the change was not recorded.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = investigations.filter((i) => {
    if (search && !(i.id.toLowerCase().includes(search.toLowerCase()) || (i.sellerName || '').toLowerCase().includes(search.toLowerCase()))) return false;
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && i.priority !== priorityFilter) return false;
    return true;
  });

  const tabCls = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors cursor-pointer ${
      active ? 'bg-brand-teal/10 text-brand-teal border-brand-teal/40' : 'border-border text-muted-foreground hover:text-foreground bg-card'
    }`;
  const inputCls = 'border border-border rounded-lg px-3 py-2 text-[13px] bg-card w-full';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/trust-safety" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="size-3.5" /> Trust & Safety
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <FileSearch className="size-6" /> Investigations
        </h1>
      </div>

      <TrustSafetyNav />

      {/* F3 per-type queues */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => switchType('all')} className={tabCls(type === 'all')}>
          All investigations
        </button>
        {INVESTIGATION_TYPES.map((t) => (
          <button key={t} onClick={() => switchType(t)} className={tabCls(type === t)}>
            {INVESTIGATION_TYPE_LABELS[t]}
          </button>
        ))}
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
        >
          <Plus className="size-3.5" /> Open investigation
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-[15px] font-semibold">Open a typed investigation</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Seller</label>
              <select value={form.seller_id} onChange={(e) => setForm({ ...form, seller_id: e.target.value })} className={inputCls}>
                <option value="">Select a seller…</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>{s.display_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Type</label>
              <select value={form.investigation_type} onChange={(e) => setForm({ ...form, investigation_type: e.target.value })} className={inputCls}>
                {INVESTIGATION_TYPES.map((t) => (
                  <option key={t} value={t}>{INVESTIGATION_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputCls}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Linked violation ID (optional)</label>
              <input
                value={form.violation_id}
                onChange={(e) => setForm({ ...form, violation_id: e.target.value })}
                placeholder="Violation UUID — must belong to the seller"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Opening notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className={inputCls}
              placeholder="Why this investigation is being opened…"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openInvestigation}
              disabled={opening || !form.seller_id}
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-[13px] font-medium cursor-pointer disabled:opacity-50"
            >
              {opening ? 'Opening…' : 'Open investigation'}
            </button>
            {openMsg && <span className="text-[12px] text-muted-foreground">{openMsg}</span>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search case or seller…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-border rounded-lg pl-9 pr-3 py-2 text-[13px] w-56 bg-card"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-[13px] bg-card cursor-pointer"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-[13px] bg-card cursor-pointer"
        >
          <option value="all">All priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <FileSearch className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No investigations in this queue</p>
          <p className="text-[13px] text-muted-foreground mt-1">Open one from this desk or from a violation row — opened cases will appear here by type.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Case ID</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Seller</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Priority</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Updated</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <Fragment key={i.id}>
                  <tr className="border-t border-border hover:bg-muted/50">
                    <td className="p-3 font-medium" title={i.id}>{i.id.slice(0, 8)}…</td>
                    <td className="p-3 text-muted-foreground">
                      {i.investigationType ? INVESTIGATION_TYPE_LABELS[i.investigationType] : 'Untyped'}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {i.sellerName ? `Seller: ${i.sellerName}` : '—'}
                      {i.orderId && <div>Escalated from order <span className="font-mono">{i.orderId.slice(0, 8)}…</span></div>}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${STATUS_STYLES[i.status] || 'bg-muted text-muted-foreground'}`}>{STATUS_LABELS[i.status] || i.status}</span>
                    </td>
                    <td className="p-3">
                      {i.priority ? (
                        <span className={`px-2 py-1 rounded text-xs font-semibold capitalize ${PRIORITY_STYLES[i.priority] || 'bg-muted text-muted-foreground'}`}>{i.priority}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{fmtDate(i.updatedAt || i.createdAt)}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => openCase(i)}
                        className="inline-flex items-center gap-1 text-primary hover:underline text-[11px] cursor-pointer"
                      >
                        <Eye className="size-3.5" /> {expandedId === i.id ? 'Close' : 'View'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === i.id && draft && (
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={7} className="">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-3">
                            <div>
                              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Status</label>
                              <select
                                value={draft.status}
                                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                                className="border border-border rounded-lg px-3 py-2 text-[13px] bg-card cursor-pointer w-full"
                              >
                                <option value="open">Open</option>
                                <option value="in_progress">In progress</option>
                                <option value="closed">Closed</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Priority</label>
                              <select
                                value={draft.priority}
                                onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                                className="border border-border rounded-lg px-3 py-2 text-[13px] bg-card cursor-pointer w-full"
                              >
                                <option value="">Not set</option>
                                <option value="critical">Critical</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                              </select>
                            </div>
                            <div className="text-[12px] text-muted-foreground space-y-1">
                              <p>Case: <span className="font-mono">{i.id}</span></p>
                              <p>Type: {i.investigationType ? INVESTIGATION_TYPE_LABELS[i.investigationType] : 'Untyped'}</p>
                              <p>Linked violation: {i.violationId ? <span className="font-mono">{i.violationId}</span> : 'None'}</p>
                              <p>Linked order: {i.orderId ? <span className="font-mono">{i.orderId}</span> : 'None'}</p>
                              <p>Investigator: {i.investigatorId ? <span className="font-mono">{i.investigatorId}</span> : 'Unassigned'}</p>
                              <p>Opened: {fmtDate(i.createdAt)}</p>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Findings</label>
                              <textarea
                                value={draft.findings}
                                onChange={(e) => setDraft({ ...draft, findings: e.target.value })}
                                rows={4}
                                className="border border-border rounded-lg px-3 py-2 text-[13px] bg-card w-full"
                                placeholder="What the investigation found…"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Internal notes</label>
                              <textarea
                                value={draft.notes}
                                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                                rows={3}
                                className="border border-border rounded-lg px-3 py-2 text-[13px] bg-card w-full"
                                placeholder="Working notes on this case…"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-4">
                          <button
                            onClick={() => saveCase(i.id)}
                            disabled={saving}
                            className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-[13px] font-medium cursor-pointer disabled:opacity-50"
                          >
                            {saving ? 'Saving…' : 'Save case'}
                          </button>
                          {saveMsg && <span className="text-[12px] text-muted-foreground">{saveMsg}</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

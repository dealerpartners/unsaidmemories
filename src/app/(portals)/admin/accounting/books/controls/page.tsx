'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { thCls } from '../../reports/_shared';

// /admin/accounting/books/controls — Controls & Compliance
// register (owner's controls_compliance.html): the internal
// controls matrix over acct_controls. Every row is a control an
// admin registered here — its rule, threshold, owner,
// enforcement, frequency, status, and the audit-evidence file
// that proves it (acct_attachments). The register ships empty:
// nothing is attested until it is registered and evaluated here.

type Control = {
  id: string; controlCode: string; domain: string; process: string | null;
  policyRule: string; threshold: string | null; ownerRole: string | null;
  enforcement: string | null; frequency: string | null; status: string;
  evidenceAttachmentId: string | null; evidenceFileName: string | null;
  lastEvaluatedAt: string | null;
};
type Attachment = { id: string; file_name: string };

const STATUSES = ['Active', 'Active & Enforced', 'Compliant', 'At Risk', 'Exception', 'Inactive'];
const FREQUENCIES = ['Continuous / Real-Time', 'Per-Transaction', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual'];
const ENFORCEMENTS = ['Automated System Hard-Lock', 'RBAC Access Control', 'Automated Escalation', 'API Webhook Gating', 'Manual Review'];
const DOMAINS = ['General Ledger & Close', 'Purchases & Disbursements', 'Banking & Treasury', 'Revenue & ASC 606', 'System & Audit Trail', 'Tax & Compliance', 'Inventory & Fulfillment', 'Sales & Receivables'];

const emptyForm = {
  control_code: '', domain: '', process: '', policy_rule: '', threshold: '',
  owner_role: '', enforcement: '', frequency: '', status: 'Active', evidence_attachment_id: '',
};

const statusChip = (s: string) => {
  const cls = s === 'At Risk' || s === 'Exception' ? 'bg-red-100 text-red-900'
    : s === 'Inactive' ? 'bg-muted text-foreground'
    : 'bg-emerald-100 text-emerald-900';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{s}</span>;
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function ControlsPage() {
  const [controls, setControls] = useState<Control[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/controls', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => { setControls(Array.isArray(d.controls) ? d.controls : []); setAttachments(Array.isArray(d.attachments) ? d.attachments : []); })
      .catch(() => setError('The controls register could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    if (!search.trim()) return controls;
    const q = search.toLowerCase();
    return controls.filter((c) => [c.controlCode, c.domain, c.process || '', c.policyRule, c.ownerRole || '', c.status].join(' ').toLowerCase().includes(q));
  }, [controls, search]);

  const domains = useMemo(() => new Set(controls.map((c) => c.domain)).size, [controls]);
  const atRisk = controls.filter((c) => c.status === 'At Risk' || c.status === 'Exception').length;

  const startEdit = (c: Control) => {
    setEditingId(c.id);
    setForm({
      control_code: c.controlCode, domain: c.domain, process: c.process || '', policy_rule: c.policyRule,
      threshold: c.threshold || '', owner_role: c.ownerRole || '', enforcement: c.enforcement || '',
      frequency: c.frequency || '', status: c.status, evidence_attachment_id: c.evidenceAttachmentId || '',
    });
    setShowForm(true);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.control_code.trim() || !form.domain.trim() || !form.policy_rule.trim()) {
      setError('Control ID, domain, and the policy rule are required.');
      return;
    }
    setBusy('save'); setError(null); setNotice(null);
    try {
      const payload: Record<string, unknown> = { ...form, evidence_attachment_id: form.evidence_attachment_id || null };
      if (editingId) { payload.action = 'update'; payload.id = editingId; }
      const r = await fetch('/api/admin/accounting/controls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Save failed');
      setNotice(editingId ? `Control ${form.control_code} updated.` : `Control ${form.control_code} registered.`);
      setShowForm(false); setEditingId(null); setForm(emptyForm);
      load();
    } catch (e: any) { setError(e?.message || 'Save failed'); }
    finally { setBusy(null); }
  };

  const evaluate = async (c: Control) => {
    setBusy(c.id); setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/accounting/controls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'evaluate', id: c.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Evaluate failed');
      setNotice(`${c.controlCode} marked evaluated today.`);
      load();
    } catch (e: any) { setError(e?.message || 'Evaluate failed'); }
    finally { setBusy(null); }
  };

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const kpi = (label: string, value: string, foot: string) => (
    <div className="border border-border rounded-xl bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
      <div className="text-[12px] text-muted-foreground">{foot}</div>
    </div>
  );

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Controls &amp; Compliance</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search control, domain, owner…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
          <button type="button" onClick={() => { setShowForm((s) => !s); setEditingId(null); setForm(emptyForm); }}
            data-tip="Registers a new internal control in this matrix"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium">
            <Plus className="size-4" /> Register Control
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        {kpi('Registered Controls', String(controls.length), 'in the compliance matrix')}
        {kpi('Domains Covered', String(domains), 'across the accounting operation')}
        {kpi('Exceptions & At Risk', String(atRisk), atRisk ? 'need attention' : 'none flagged')}
      </div>

      {showForm && (
        <form onSubmit={submit} className="border border-border rounded-xl bg-card p-4 mt-4">
          <div className="font-semibold text-[14px] mb-3">{editingId ? 'Edit Control' : 'Register a Control'}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className={labelCls}>Control ID</label>
              <input value={form.control_code} onChange={(e) => setForm({ ...form, control_code: e.target.value })} placeholder="CTRL-GL-01" className={inputCls} required /></div>
            <div><label className={labelCls}>Domain</label>
              <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} list="ctrl-domains" className={inputCls} required />
              <datalist id="ctrl-domains">{DOMAINS.map((d) => <option key={d} value={d} />)}</datalist></div>
            <div><label className={labelCls}>Process</label>
              <input value={form.process} onChange={(e) => setForm({ ...form, process: e.target.value })} placeholder="Record-to-Report" className={inputCls} /></div>
            <div className="md:col-span-2"><label className={labelCls}>Policy Rule</label>
              <input value={form.policy_rule} onChange={(e) => setForm({ ...form, policy_rule: e.target.value })} placeholder="Preparer cannot approve their own journal entries" className={inputCls} required /></div>
            <div><label className={labelCls}>Threshold</label>
              <input value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} placeholder="Dual authorization > $10,000" className={inputCls} /></div>
            <div><label className={labelCls}>Assigned Owner / Role</label>
              <input value={form.owner_role} onChange={(e) => setForm({ ...form, owner_role: e.target.value })} placeholder="Controller" className={inputCls} /></div>
            <div><label className={labelCls}>Enforcement Mechanism</label>
              <input value={form.enforcement} onChange={(e) => setForm({ ...form, enforcement: e.target.value })} list="ctrl-enforcement" className={inputCls} />
              <datalist id="ctrl-enforcement">{ENFORCEMENTS.map((d) => <option key={d} value={d} />)}</datalist></div>
            <div><label className={labelCls}>Frequency</label>
              <input value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} list="ctrl-frequency" className={inputCls} />
              <datalist id="ctrl-frequency">{FREQUENCIES.map((d) => <option key={d} value={d} />)}</datalist></div>
            <div><label className={labelCls}>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div><label className={labelCls}>Audit Evidence (attachment)</label>
              <select value={form.evidence_attachment_id} onChange={(e) => setForm({ ...form, evidence_attachment_id: e.target.value })} className={inputCls}>
                <option value="">No evidence file linked</option>
                {attachments.map((a) => <option key={a.id} value={a.id}>{a.file_name}</option>)}
              </select></div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" disabled={busy === 'save'} data-tip="Saves this control into the register below"
              className="h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">
              {busy === 'save' ? 'Saving…' : editingId ? 'Save Changes' : 'Register Control'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}
              className="h-9 px-4 rounded-lg border border-border bg-card text-[13px] font-medium">Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 mb-4">{notice}</div>}
        <div className="font-semibold text-[15px] mb-2">Financial Internal Controls Matrix</div>
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={thCls}>
              <th className="p-3 border-r border-border">Control ID</th>
              <th className="p-3 border-r border-border">Domain • Process</th>
              <th className="p-3 border-r border-border">Policy Threshold &amp; Rule</th>
              <th className="p-3 border-r border-border">Assigned Owner / Role</th>
              <th className="p-3 border-r border-border">Enforcement Mechanism</th>
              <th className="p-3 border-r border-border">Frequency</th>
              <th className="p-3 border-r border-border">Status</th>
              <th className="p-3 border-r border-border">Audit Evidence</th>
              <th className="p-3 text-center">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={9} className="p-3 text-center text-muted-foreground">Loading the register…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={9} className="p-3 text-center text-muted-foreground">
                  {controls.length === 0
                    ? 'No controls registered yet. This matrix starts empty on purpose: a control appears here only when an admin registers it with Register Control — nothing is attested, certified, or compliant until it is recorded and evaluated here.'
                    : 'No controls match this search.'}
                </td></tr>
              ) : shown.map((c) => (
                <tr key={c.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-medium whitespace-nowrap">{c.controlCode}</td>
                  <td className="p-3 border-r border-border">
                    <div className="font-medium">{c.domain}</div>
                    <div className="text-[11px] text-muted-foreground">{c.process || ''}</div>
                  </td>
                  <td className="p-3 border-r border-border">
                    <div>{c.policyRule}</div>
                    {c.threshold ? <div className="text-[11px] text-muted-foreground">{c.threshold}</div> : null}
                  </td>
                  <td className="p-3 border-r border-border">{c.ownerRole || '—'}</td>
                  <td className="p-3 border-r border-border">{c.enforcement || '—'}</td>
                  <td className="p-3 border-r border-border">{c.frequency || '—'}</td>
                  <td className="p-3 border-r border-border">
                    {statusChip(c.status)}
                    <div className="text-[11px] text-muted-foreground mt-1">evaluated {fmtDate(c.lastEvaluatedAt)}</div>
                  </td>
                  <td className="p-3 border-r border-border">{c.evidenceFileName || <span className="text-muted-foreground">None linked</span>}</td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <button type="button" disabled={busy === c.id} onClick={() => startEdit(c)} data-tip="Edits this control's rule, owner, enforcement, and status"
                      className="text-[12px] underline mr-3 disabled:opacity-50">Edit</button>
                    <button type="button" disabled={busy === c.id} onClick={() => evaluate(c)} data-tip="Stamps today as the last date this control was checked and found working"
                      className="text-[12px] underline disabled:opacity-50">Mark Evaluated</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
        <p className="text-[12px] text-muted-foreground mt-3">
          Evidence files come from the accounting attachment store; a control can be registered first and linked to its
          evidence when the file exists. Statuses here are recorded by the control owner — this register records
          attestations, it does not manufacture them.
        </p>
      </div>
    </div>
  );
}

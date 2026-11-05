'use client';

import { Fragment, useEffect, useState } from 'react';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type AiIncident = {
  id: string;
  title: string | null;
  description: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low';
  model_name: string | null;
  status: 'open' | 'investigating' | 'resolved';
  root_cause: string | null;
  remediation: string | null;
  post_mortem: string | null;
  created_at: string;
};
type Opt = { id: string; name: string };

const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-background';

export default function AiIncidentsPage() {
  const [incidents, setIncidents] = useState<AiIncident[]>([]);
  const [models, setModels] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', severity: 'medium', model_id: '' });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fields, setFields] = useState({ root_cause: '', remediation: '', post_mortem: '' });
  const [savingFields, setSavingFields] = useState(false);

  const saveFields = async (i: AiIncident) => {
    setSavingFields(true); setError(null);
    try {
      const res = await fetch(`/api/admin/ai-ops/incidents/${i.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root_cause: fields.root_cause.trim() ? fields.root_cause : null,
          remediation: fields.remediation.trim() ? fields.remediation : null,
          post_mortem: fields.post_mortem.trim() ? fields.post_mortem : null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      await load();
    } catch (e: any) { setError(e.message); } finally { setSavingFields(false); }
  };

  const load = () =>
    Promise.all([
      fetch('/api/admin/ai-ops/incidents').then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `HTTP ${r.status}`); return r.json(); }),
      fetch('/api/admin/ai-ops/models').then(r => r.ok ? r.json() : { models: [] }),
    ])
      .then(([i, m]) => { setIncidents(i.incidents || []); setModels(m.models || []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const report = async () => {
    if (!form.title.trim()) { setError('Incident title is required.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/admin/ai-ops/incidents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, model_id: form.model_id || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setForm({ title: '', description: '', severity: 'medium', model_id: '' });
      setShowForm(false);
      await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const setStatus = async (i: AiIncident, status: AiIncident['status']) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/ai-ops/incidents/${i.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const severityVariant = (s: AiIncident['severity']) =>
    s === 'critical' ? 'destructive' : s === 'high' ? 'destructive' : s === 'medium' ? 'secondary' : 'outline';

  const statusVariant = (s: AiIncident['status']) =>
    s === 'resolved' ? 'default' : s === 'investigating' ? 'secondary' : 'destructive';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <AlertTriangle className="size-6" /> AI Incidents
          </h1>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[13px] font-semibold flex items-center gap-2 cursor-pointer">
          {showForm ? <X className="size-4" /> : <Plus className="size-4" />} Report Incident
        </button>
      </div>

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <select className={inputCls} value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>
            <select className={inputCls} value={form.model_id} onChange={e => setForm({ ...form, model_id: e.target.value })}>
              <option value="">No model</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <textarea className={inputCls} rows={3} placeholder="Description (optional)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <button onClick={report} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-semibold cursor-pointer disabled:opacity-50">
            {saving ? 'Saving…' : 'Report incident'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : incidents.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <AlertTriangle className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No AI incidents.</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            Incidents will appear here as they are reported or detected.
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Incident</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Severity</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Model</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Opened</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map(i => (
                <Fragment key={i.id}>
                  <tr className="border-t border-border hover:bg-muted/50">
                    <td className="p-3 font-medium">{i.title ?? '—'}</td>
                    <td className="p-3"><Badge variant={severityVariant(i.severity)}>{i.severity}</Badge></td>
                    <td className="p-3 text-muted-foreground">{i.model_name ?? '—'}</td>
                    <td className="p-3"><Badge variant={statusVariant(i.status)}>{i.status}</Badge></td>
                    <td className="p-3 text-muted-foreground">{new Date(i.created_at).toLocaleString()}</td>
                    <td className="p-3 text-right space-x-3">
                      <button onClick={() => { const next = expanded === i.id ? null : i.id; setExpanded(next); if (next) setFields({ root_cause: i.root_cause ?? '', remediation: i.remediation ?? '', post_mortem: i.post_mortem ?? '' }); }} className="text-primary hover:underline text-[11px] cursor-pointer">View</button>
                      {i.status === 'open' && <button onClick={() => setStatus(i, 'investigating')} className="text-primary hover:underline text-[11px] cursor-pointer">Investigate</button>}
                      {i.status !== 'resolved' && <button onClick={() => setStatus(i, 'resolved')} className="text-primary hover:underline text-[11px] cursor-pointer">Resolve</button>}
                      {i.status === 'resolved' && <button onClick={() => setStatus(i, 'open')} className="text-primary hover:underline text-[11px] cursor-pointer">Reopen</button>}
                    </td>
                  </tr>
                  {expanded === i.id && (
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={6} className="p-3 space-y-3">
                        <p className="text-[12px] text-muted-foreground">{i.description || 'No description recorded for this incident.'}</p>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                          <label className="block">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Root cause</span>
                            <textarea className={inputCls + ' mt-1'} rows={3} value={fields.root_cause} onChange={(e) => setFields({ ...fields, root_cause: e.target.value })} placeholder="What actually caused it" />
                          </label>
                          <label className="block">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Remediation</span>
                            <textarea className={inputCls + ' mt-1'} rows={3} value={fields.remediation} onChange={(e) => setFields({ ...fields, remediation: e.target.value })} placeholder="What was done about it" />
                          </label>
                          <label className="block">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Post-mortem</span>
                            <textarea className={inputCls + ' mt-1'} rows={3} value={fields.post_mortem} onChange={(e) => setFields({ ...fields, post_mortem: e.target.value })} placeholder="The post-mortem record" />
                          </label>
                        </div>
                        <button onClick={() => saveFields(i)} disabled={savingFields} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[12px] font-semibold cursor-pointer disabled:opacity-50">
                          {savingFields ? 'Saving…' : 'Save record fields'}
                        </button>
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

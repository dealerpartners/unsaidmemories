'use client';

import { Fragment, useEffect, useState } from 'react';
import { Plus, Cpu, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type AiModel = {
  id: string;
  name: string;
  provider: string | null;
  model_ref: string | null;
  version: string | null;
  status: 'active' | 'deprecated' | 'experimental';
  config: { purpose?: string } | null;
  invocations: number;
  costed_invocations: number;
  avg_latency_ms: number | null;
  cost_per_1k: number | null;
};

const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-background';

export default function AiModelsPage() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', provider: '', model_ref: '', version: '', purpose: '' });
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = () =>
    fetch('/api/admin/ai-ops/models')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setModels(d.models || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const register = async () => {
    if (!form.name.trim()) { setError('Model name is required.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/admin/ai-ops/models', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setForm({ name: '', provider: '', model_ref: '', version: '', purpose: '' });
      setShowForm(false);
      await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const setStatus = async (m: AiModel, status: AiModel['status']) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/ai-ops/models/${m.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const statusVariant = (s: AiModel['status']) =>
    s === 'active' ? 'default' : s === 'deprecated' ? 'destructive' : 'secondary';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Cpu className="size-6" /> AI Models
          </h1>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[13px] font-semibold flex items-center gap-2 cursor-pointer">
          {showForm ? <X className="size-4" /> : <Plus className="size-4" />} Register Model
        </button>
      </div>

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Name (e.g. Kinnect Assistant)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className={inputCls} placeholder="Provider (e.g. OpenAI)" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} />
            <input className={inputCls} placeholder="Model ref (e.g. gpt-4o)" value={form.model_ref} onChange={e => setForm({ ...form, model_ref: e.target.value })} />
            <input className={inputCls} placeholder="Version (optional)" value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} />
            <input className={inputCls} placeholder="Purpose (optional)" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} />
          </div>
          <button onClick={register} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-semibold cursor-pointer disabled:opacity-50">
            {saving ? 'Saving…' : 'Register model'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : models.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Cpu className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No AI models registered.</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            Register a model to track latency, cost, and incidents.
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Model</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Provider</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Purpose</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Avg latency</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Cost/1k tokens</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {models.map(m => (
                <Fragment key={m.id}>
                  <tr className="border-t border-border hover:bg-muted/50">
                    <td className="p-3 font-medium">{m.name}{m.model_ref ? <span className="block text-[11px] text-muted-foreground font-mono">{m.model_ref}{m.version ? ` · ${m.version}` : ''}</span> : null}</td>
                    <td className="p-3 text-muted-foreground">{m.provider ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">{m.config?.purpose ?? '—'}</td>
                    <td className="p-3"><Badge variant={statusVariant(m.status)}>{m.status}</Badge></td>
                    <td className="p-3 text-muted-foreground">{m.avg_latency_ms != null ? `${Math.round(m.avg_latency_ms)} ms` : '—'}</td>
                    <td className="p-3 text-muted-foreground">{m.cost_per_1k != null ? `$${Number(m.cost_per_1k).toFixed(4)}` : '—'}</td>
                    <td className="p-3 text-right space-x-3">
                      <button onClick={() => setExpanded(expanded === m.id ? null : m.id)} className="text-primary hover:underline text-[11px] cursor-pointer">View</button>
                      {m.status !== 'active' && <button onClick={() => setStatus(m, 'active')} className="text-primary hover:underline text-[11px] cursor-pointer">Activate</button>}
                      {m.status !== 'deprecated' && <button onClick={() => setStatus(m, 'deprecated')} className="text-primary hover:underline text-[11px] cursor-pointer">Deprecate</button>}
                    </td>
                  </tr>
                  {expanded === m.id && (
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={7} className="p-3 text-[12px] text-muted-foreground">
                        {m.invocations} invocation{m.invocations === 1 ? '' : 's'} attributed to this model
                        (linked at write time, or matched by the recorded model ref/label — the invocation
                        logger's own rule). Latency is computed from those invocations. Cost per 1k stays
                        blank until a call records a cost — {m.costed_invocations} of {m.invocations} attributed
                        calls recorded one; an unrecorded cost is not a $0 cost.
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

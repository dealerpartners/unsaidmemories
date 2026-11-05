'use client';

import { Fragment, useEffect, useState } from 'react';
import { Plus, FileText, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type AiPrompt = {
  id: string;
  name: string;
  feature: string | null;
  prompt_text: string | null;
  version: number;
  status: 'draft' | 'active' | 'archived';
  updated_at: string;
};

const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-background';

export default function AiPromptsPage() {
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', feature: '', prompt_text: '', status: 'draft' });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const load = () =>
    fetch('/api/admin/ai-ops/prompts')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setPrompts(d.prompts || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) { setError('Prompt name is required.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/admin/ai-ops/prompts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setForm({ name: '', feature: '', prompt_text: '', status: 'draft' });
      setShowForm(false);
      await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const patch = async (p: AiPrompt, body: Record<string, unknown>) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/ai-ops/prompts/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const statusVariant = (s: AiPrompt['status']) =>
    s === 'active' ? 'default' : s === 'archived' ? 'destructive' : 'secondary';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <FileText className="size-6" /> Prompt Templates
          </h1>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[13px] font-semibold flex items-center gap-2 cursor-pointer">
          {showForm ? <X className="size-4" /> : <Plus className="size-4" />} New Prompt
        </button>
      </div>

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className={inputCls} placeholder="Feature (e.g. kinnect_chat)" value={form.feature} onChange={e => setForm({ ...form, feature: e.target.value })} />
          </div>
          <textarea className={inputCls} rows={4} placeholder="Prompt text" value={form.prompt_text} onChange={e => setForm({ ...form, prompt_text: e.target.value })} />
          <div className="flex items-center gap-3">
            <select className={inputCls + ' w-40'} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="archived">archived</option>
            </select>
            <button onClick={create} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-semibold cursor-pointer disabled:opacity-50">
              {saving ? 'Saving…' : 'Create prompt'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : prompts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <FileText className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No prompt templates yet.</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            Create a prompt template to start versioning AI instructions per feature.
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Feature</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Version</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Updated</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map(p => (
                <Fragment key={p.id}>
                  <tr className="border-t border-border hover:bg-muted/50">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-muted-foreground">{p.feature ?? '—'}</td>
                    <td className="p-3 text-muted-foreground font-mono text-[12px]">v{p.version}</td>
                    <td className="p-3 text-muted-foreground">{new Date(p.updated_at).toLocaleString()}</td>
                    <td className="p-3"><Badge variant={statusVariant(p.status)}>{p.status}</Badge></td>
                    <td className="p-3 text-right space-x-3">
                      <button onClick={() => { setExpanded(expanded === p.id ? null : p.id); setEditText(p.prompt_text ?? ''); }} className="text-primary hover:underline text-[11px] cursor-pointer">View / Edit</button>
                      {p.status !== 'active' && <button onClick={() => patch(p, { status: 'active' })} className="text-primary hover:underline text-[11px] cursor-pointer">Activate</button>}
                      {p.status !== 'archived' && <button onClick={() => patch(p, { status: 'archived' })} className="text-primary hover:underline text-[11px] cursor-pointer">Archive</button>}
                    </td>
                  </tr>
                  {expanded === p.id && (
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={6} className="p-3 space-y-2">
                        <textarea className={inputCls} rows={4} value={editText} onChange={e => setEditText(e.target.value)} />
                        <button onClick={() => patch(p, { prompt_text: editText })} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[12px] font-semibold cursor-pointer">
                          Save as v{p.version + 1}
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

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type AiFunctionDef = {
  key: string; label: string; surface: string; subjects: string[]; subjectRequired: boolean; gate: string; blurb: string;
};
type AiTask = {
  id: string; function: string; subject_type: string | null; subject_id: string | null;
  subject_label: string | null; model_name: string | null; prompt_name: string | null;
  output_text: string | null; output: Record<string, unknown> | null;
  state: 'proposed' | 'applied' | 'dismissed' | 'recorded';
  decided_at: string | null; created_at: string;
};
type Count = { function: string; state: string; n: number };

const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-background';

export default function AiFunctionsPage() {
  const [functions, setFunctions] = useState<AiFunctionDef[]>([]);
  const [tasks, setTasks] = useState<AiTask[]>([]);
  const [counts, setCounts] = useState<Count[]>([]);
  const [selected, setSelected] = useState<string>('support_reply');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ subject_type: '', subject_id: '', output_text: '' });

  const load = () =>
    fetch('/api/admin/ai-ops/tasks')
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `HTTP ${r.status}`); return r.json(); })
      .then((d) => { setFunctions(d.functions || []); setTasks(d.tasks || []); setCounts(d.counts || []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const def = useMemo(() => functions.find((f) => f.key === selected) ?? null, [functions, selected]);
  const fnTasks = useMemo(() => tasks.filter((t) => t.function === selected), [tasks, selected]);
  const countFor = (key: string, state: string) => counts.find((c) => c.function === key && c.state === state)?.n ?? 0;
  const proposedFor = (key: string) => countFor(key, 'proposed');

  const record = async () => {
    if (!def) return;
    if (def.subjectRequired && (!form.subject_type || !form.subject_id.trim())) { setError('Subject type and subject ID are required for this function.'); return; }
    if (!form.output_text.trim()) { setError('The AI output being recorded is required.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/admin/ai-ops/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          function: def.key,
          subject_type: form.subject_type || null,
          subject_id: form.subject_id.trim() || null,
          output_text: form.output_text,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setForm({ subject_type: '', subject_id: '', output_text: '' });
      setShowForm(false);
      await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const decide = async (t: AiTask, decision: 'applied' | 'dismissed' | 'recorded') => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/ai-ops/tasks/${t.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const stateVariant = (s: AiTask['state']) =>
    s === 'applied' ? 'default' : s === 'dismissed' ? 'destructive' : s === 'recorded' ? 'secondary' : 'outline';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Bot className="size-6" /> AI Functions
        </h1>
      </div>

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {functions.map((f) => (
          <button
            key={f.key}
            onClick={() => { setSelected(f.key); setForm({ subject_type: '', subject_id: '', output_text: '' }); setShowForm(false); }}
            className={`px-3 py-2 rounded-lg text-[12px] font-medium border cursor-pointer ${selected === f.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:border-primary/40'}`}
          >
            {f.label}
            {proposedFor(f.key) > 0 && <span className="ml-2 font-mono">{proposedFor(f.key)} proposed</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : def ? (
        <>
          <div className="bg-card border border-border rounded-xl p-5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">{def.label}</h2>
                <p className="text-[11px] text-muted-foreground font-mono">{def.surface}</p>
              </div>
              <button onClick={() => setShowForm((v) => !v)} className="px-3 py-1.5 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer">
                {showForm ? <X className="size-3.5" /> : <Plus className="size-3.5" />} Record AI output
              </button>
            </div>
            <p className="text-[13px] text-muted-foreground">{def.blurb}</p>
            <p className="text-[12px] text-foreground/80 border-l-2 border-primary pl-3">{def.gate}</p>
            <p className="text-[12px] text-muted-foreground">
              {countFor(def.key, 'proposed')} proposed · {countFor(def.key, 'applied')} applied ·{' '}
              {countFor(def.key, 'recorded')} recorded · {countFor(def.key, 'dismissed')} dismissed
            </p>
          </div>

          {showForm && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select className={inputCls} value={form.subject_type} onChange={(e) => setForm({ ...form, subject_type: e.target.value })}>
                  <option value="">Subject type{def.subjectRequired ? '' : ' (optional)'}</option>
                  {def.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input className={inputCls} placeholder="Subject ID (uuid of the ticket / application / claim / item / review)" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })} />
              </div>
              <textarea className={inputCls} rows={4} placeholder="The AI output being recorded (draft text, or the check findings)" value={form.output_text} onChange={(e) => setForm({ ...form, output_text: e.target.value })} />
              <button onClick={record} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-semibold cursor-pointer disabled:opacity-50">
                {saving ? 'Saving…' : 'Record as proposed'}
              </button>
            </div>
          )}

          {fnTasks.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Bot className="size-10 mx-auto text-muted-foreground/40" />
              <p className="text-[14px] font-medium text-foreground mt-3">No AI work recorded for this function yet.</p>
              <p className="text-[13px] text-muted-foreground mt-1">
                Checks, proposals, and drafts land here as <span className="font-mono text-[12px]">ai_tasks</span> rows when the function runs or a desk records its output.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {fnTasks.map((t) => (
                <div key={t.id} className="bg-card border border-border rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-[13px] font-medium text-foreground">
                      {t.subject_label ?? (t.subject_type ? `${t.subject_type} ${t.subject_id ?? ''}` : 'No subject')}
                    </p>
                    <Badge variant={stateVariant(t.state)}>{t.state}</Badge>
                  </div>
                  {t.output_text && <p className="text-[13px] text-muted-foreground whitespace-pre-wrap">{t.output_text}</p>}
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(t.created_at).toLocaleString()}
                    {t.model_name ? ` · model ${t.model_name}` : ''}
                    {t.prompt_name ? ` · prompt ${t.prompt_name}` : ''}
                    {t.decided_at ? ` · decided ${new Date(t.decided_at).toLocaleString()}` : ''}
                  </p>
                  {t.state === 'proposed' && (
                    <div className="flex gap-3 pt-1">
                      <button onClick={() => decide(t, 'applied')} className="text-primary hover:underline text-[12px] cursor-pointer">Mark applied at the desk</button>
                      <button onClick={() => decide(t, 'recorded')} className="text-primary hover:underline text-[12px] cursor-pointer">File as recorded</button>
                      <button onClick={() => decide(t, 'dismissed')} className="text-destructive hover:underline text-[12px] cursor-pointer">Dismiss</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

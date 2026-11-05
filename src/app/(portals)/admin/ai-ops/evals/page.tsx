'use client';

import { useEffect, useState } from 'react';
import { FlaskConical, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type AiEval = {
  id: string;
  eval_name: string | null;
  model_name: string | null;
  prompt_name: string | null;
  dataset_ref: string | null;
  score: number | null;
  results: { pass_rate?: number } | null;
  created_at: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
};
type Opt = { id: string; name: string };
type Regression = {
  eval_name: string | null; model_name: string | null; runs: number;
  latest_score: number | null; previous_score: number | null; delta: number | null; regressed: boolean;
};

const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-background';

export default function AiEvalsPage() {
  const [evals, setEvals] = useState<AiEval[]>([]);
  const [regressions, setRegressions] = useState<Regression[]>([]);
  const [models, setModels] = useState<Opt[]>([]);
  const [prompts, setPrompts] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ eval_name: '', model_id: '', prompt_id: '', dataset_ref: '', score: '', pass_rate: '', status: 'pending' });

  const load = () =>
    Promise.all([
      fetch('/api/admin/ai-ops/evals').then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `HTTP ${r.status}`); return r.json(); }),
      fetch('/api/admin/ai-ops/models').then(r => r.ok ? r.json() : { models: [] }),
      fetch('/api/admin/ai-ops/prompts').then(r => r.ok ? r.json() : { prompts: [] }),
    ])
      .then(([e, m, p]) => { setEvals(e.evals || []); setRegressions(e.regressions || []); setModels(m.models || []); setPrompts(p.prompts || []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const record = async () => {
    if (!form.eval_name.trim()) { setError('Eval name is required.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/admin/ai-ops/evals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eval_name: form.eval_name,
          model_id: form.model_id || null,
          prompt_id: form.prompt_id || null,
          dataset_ref: form.dataset_ref || null,
          score: form.score === '' ? null : Number(form.score),
          pass_rate: form.pass_rate === '' ? null : Number(form.pass_rate),
          status: form.status,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setForm({ eval_name: '', model_id: '', prompt_id: '', dataset_ref: '', score: '', pass_rate: '', status: 'pending' });
      setShowForm(false);
      await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const statusVariant = (s: AiEval['status']) =>
    s === 'passed' ? 'default' : s === 'failed' ? 'destructive' : 'secondary';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <FlaskConical className="size-6" /> Evaluations
          </h1>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[13px] font-semibold flex items-center gap-2 cursor-pointer">
          {showForm ? <X className="size-4" /> : <Plus className="size-4" />} Record Eval Run
        </button>
      </div>

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Eval name (e.g. Quality check suite)" value={form.eval_name} onChange={e => setForm({ ...form, eval_name: e.target.value })} />
            <input className={inputCls} placeholder="Dataset ref (optional)" value={form.dataset_ref} onChange={e => setForm({ ...form, dataset_ref: e.target.value })} />
            <select className={inputCls} value={form.model_id} onChange={e => setForm({ ...form, model_id: e.target.value })}>
              <option value="">No model</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select className={inputCls} value={form.prompt_id} onChange={e => setForm({ ...form, prompt_id: e.target.value })}>
              <option value="">No prompt</option>
              {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input className={inputCls} type="number" step="0.01" placeholder="Score (optional)" value={form.score} onChange={e => setForm({ ...form, score: e.target.value })} />
            <input className={inputCls} type="number" step="0.01" min="0" max="1" placeholder="Pass rate 0–1 (optional)" value={form.pass_rate} onChange={e => setForm({ ...form, pass_rate: e.target.value })} />
            <select className={inputCls} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="pending">pending</option>
              <option value="running">running</option>
              <option value="passed">passed</option>
              <option value="failed">failed</option>
            </select>
          </div>
          <button onClick={record} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-semibold cursor-pointer disabled:opacity-50">
            {saving ? 'Saving…' : 'Record run'}
          </button>
        </div>
      )}

      {!loading && regressions.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-[14px] font-semibold text-foreground">Regression tracking</h2>
          <p className="text-[12px] text-muted-foreground mt-1">
            Each suite's latest scored run against its previous scored run, computed from the recorded runs.
          </p>
          <div className="mt-3 space-y-2">
            {regressions.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-[13px] flex-wrap gap-2">
                <span className="font-medium text-foreground">{r.eval_name ?? '—'}{r.model_name ? <span className="text-muted-foreground font-normal"> · {r.model_name}</span> : null}</span>
                <span className="text-muted-foreground">
                  {r.runs} scored run{r.runs === 1 ? '' : 's'} · latest {r.latest_score !== null ? r.latest_score.toFixed(2) : '—'}
                  {r.delta !== null ? (
                    <> · Δ {r.delta >= 0 ? '+' : ''}{r.delta.toFixed(2)} <Badge variant={r.regressed ? 'destructive' : 'default'}>{r.regressed ? 'REGRESSED' : 'STEADY / IMPROVED'}</Badge></>
                  ) : ' · no prior scored run to compare'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : evals.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <FlaskConical className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No evaluations run yet.</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            Run an eval suite against a registered model to see scores here.
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Eval suite</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Model</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Score</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Pass rate</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Run date</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {evals.map(e => (
                <tr key={e.id} className="border-t border-border hover:bg-muted/50">
                  <td className="p-3 font-medium">{e.eval_name ?? '—'}{e.dataset_ref ? <span className="block text-[11px] text-muted-foreground font-mono">{e.dataset_ref}</span> : null}</td>
                  <td className="p-3 text-muted-foreground">{e.model_name ?? '—'}</td>
                  <td className="p-3 text-muted-foreground">{e.score != null ? Number(e.score).toFixed(2) : '—'}</td>
                  <td className="p-3 text-muted-foreground">{e.results?.pass_rate != null ? `${(e.results.pass_rate * 100).toFixed(1)}%` : '—'}</td>
                  <td className="p-3 text-muted-foreground">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="p-3"><Badge variant={statusVariant(e.status)}>{e.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

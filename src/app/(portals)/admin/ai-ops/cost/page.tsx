'use client';

import { useEffect, useState } from 'react';
import { Wallet, Cpu, Layers, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type CostBreakdown = { label: string; amount: number; invocations: number };
type TenantBreakdown = { tenant_id: string; tenant_name: string | null; amount: number; invocations: number; costed_invocations: number; tokens: number };
type CostData = {
  total30d: number; invocations30d: number; costedInvocations30d: number; tokens30d: number;
  byModel: CostBreakdown[]; byFeature: CostBreakdown[];
  byTenant: TenantBreakdown[] | null;
  budget: { limitUsd: number | null; spend30d: number; state: 'not_set' | 'within' | 'over'; pctUsed: number | null; lastAlert: { id: string; period: string; limit_usd: number; observed_spend: number; notified_count: number; created_at: string } | null };
  recentInvocations: Array<{
    id: string; feature: string; status: string; input_tokens: number; output_tokens: number;
    cost: number; latency_ms: number | null; created_at: string; model_name: string | null; prompt_name: string | null;
  }>;
};
type Opt = { id: string; name: string };

const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-background';

export default function AiCostPage() {
  const [data, setData] = useState<CostData | null>(null);
  const [models, setModels] = useState<Opt[]>([]);
  const [prompts, setPrompts] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [checkingAlert, setCheckingAlert] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ feature: '', model_id: '', prompt_id: '', input_tokens: '', output_tokens: '', cost: '', latency_ms: '', status: 'success' });

  const load = () =>
    Promise.all([
      fetch('/api/admin/ai-ops/cost').then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `HTTP ${r.status}`); return r.json(); }),
      fetch('/api/admin/ai-ops/models').then(r => r.ok ? r.json() : { models: [] }),
      fetch('/api/admin/ai-ops/prompts').then(r => r.ok ? r.json() : { prompts: [] }),
    ])
      .then(([c, m, p]) => { setData(c); setModels(m.models || []); setPrompts(p.prompts || []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const logInvocation = async () => {
    if (!form.feature.trim()) { setError('Feature is required to log an invocation.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/admin/ai-ops/invocations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: form.feature,
          model_id: form.model_id || null,
          prompt_id: form.prompt_id || null,
          input_tokens: form.input_tokens === '' ? null : Number(form.input_tokens),
          output_tokens: form.output_tokens === '' ? null : Number(form.output_tokens),
          cost: form.cost === '' ? null : Number(form.cost),
          latency_ms: form.latency_ms === '' ? null : Number(form.latency_ms),
          status: form.status,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setForm({ feature: '', model_id: '', prompt_id: '', input_tokens: '', output_tokens: '', cost: '', latency_ms: '', status: 'success' });
      setShowForm(false);
      await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const saveBudget = async (clear: boolean) => {
    setSavingBudget(true); setError(null);
    try {
      const res = await fetch('/api/admin/ai-ops/cost', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthly_limit_usd: clear ? null : Number(budgetInput) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setBudgetInput('');
      await load();
    } catch (e: any) { setError(e.message); } finally { setSavingBudget(false); }
  };

  const checkAlert = async () => {
    setCheckingAlert(true); setCheckMsg(null); setError(null);
    try {
      const res = await fetch('/api/admin/ai-ops/cost/alerts', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setCheckMsg(
        d.alerted
          ? `Alert recorded for ${d.period}: ${d.notifiedCount} staff notified.`
          : d.alreadyAlerted
            ? `Already alerted for ${d.period} — one alert per period.`
            : d.state === 'over'
              ? 'Over budget, but no new alert was recorded.'
              : d.state === 'not_set'
                ? 'No budget is set — nothing to alert on.'
                : 'Within budget — no alert sent.',
      );
      await load();
    } catch (e: any) { setError(e.message); } finally { setCheckingAlert(false); }
  };

  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const byModel = data?.byModel ?? [];
  const byFeature = data?.byFeature ?? [];
  const max = Math.max(0, ...byModel.map(b => b.amount), ...byFeature.map(b => b.amount));

  const barRow = (b: CostBreakdown) => (
    <div key={b.label} className="flex items-center gap-3">
      <span className="text-[12px] text-muted-foreground w-32 truncate">{b.label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: max > 0 ? `${(b.amount / max) * 100}%` : '0%' }}
        />
      </div>
      <span className="text-[12px] font-medium w-16 text-right">{fmt(b.amount)}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Wallet className="size-6" /> AI Cost
          </h1>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[13px] font-semibold flex items-center gap-2 cursor-pointer">
          {showForm ? <X className="size-4" /> : <Plus className="size-4" />} Log Invocation
        </button>
      </div>

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Feature (e.g. kinnect_chat)" value={form.feature} onChange={e => setForm({ ...form, feature: e.target.value })} />
            <select className={inputCls} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="success">success</option>
              <option value="error">error</option>
              <option value="timeout">timeout</option>
            </select>
            <select className={inputCls} value={form.model_id} onChange={e => setForm({ ...form, model_id: e.target.value })}>
              <option value="">No model</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select className={inputCls} value={form.prompt_id} onChange={e => setForm({ ...form, prompt_id: e.target.value })}>
              <option value="">No prompt</option>
              {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input className={inputCls} type="number" placeholder="Input tokens" value={form.input_tokens} onChange={e => setForm({ ...form, input_tokens: e.target.value })} />
            <input className={inputCls} type="number" placeholder="Output tokens" value={form.output_tokens} onChange={e => setForm({ ...form, output_tokens: e.target.value })} />
            <input className={inputCls} type="number" step="0.0001" placeholder="Cost (USD)" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} />
            <input className={inputCls} type="number" placeholder="Latency (ms)" value={form.latency_ms} onChange={e => setForm({ ...form, latency_ms: e.target.value })} />
          </div>
          <button onClick={logInvocation} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-semibold cursor-pointer disabled:opacity-50">
            {saving ? 'Saving…' : 'Log invocation'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : data ? (
        <>
          <div className="bg-card border border-border rounded-xl">
            <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Total spend (30d)</p>
            <p className="text-3xl font-semibold tracking-tight text-foreground mt-2">{fmt(data.total30d)}</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              {data.invocations30d} invocation{data.invocations30d === 1 ? '' : 's'} · {data.tokens30d.toLocaleString()} tokens in the last 30 days
            </p>
            <p className="text-[12px] text-muted-foreground mt-1">
              Cost is recorded on {data.costedInvocations30d} of {data.invocations30d} invocations in this
              period — the total sums recorded cost only. The AI call paths (Kinnect gateway, classroom
              router) log tokens and latency today, not price.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl">
              <h2 className="text-[14px] font-semibold text-foreground">Monthly budget</h2>
              {data.budget.state === 'not_set' ? (
                <p className="text-[13px] text-muted-foreground mt-2">
                  No budget recorded. Set a monthly limit and this face reports the recorded spend against
                  it. When a check finds spend over the limit, the alert is recorded and the tenant&apos;s
                  active staff are notified — once per period.
                </p>
              ) : (
                <p className="text-[13px] text-muted-foreground mt-2">
                  Limit {fmt(data.budget.limitUsd ?? 0)} / month · recorded 30d spend {fmt(data.budget.spend30d)}
                  {data.budget.pctUsed !== null ? ` (${data.budget.pctUsed}% of the limit)` : ''}
                </p>
              )}
              <div className="mt-3">
                <Badge variant={data.budget.state === 'over' ? 'destructive' : data.budget.state === 'within' ? 'default' : 'secondary'}>
                  {data.budget.state === 'over' ? 'OVER BUDGET' : data.budget.state === 'within' ? 'WITHIN BUDGET' : 'NO BUDGET SET'}
                </Badge>
              </div>
              <div className="flex gap-2 mt-4">
                <input className={inputCls} type="number" min="0" step="0.01" placeholder="Monthly limit (USD)" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} />
                <button onClick={() => saveBudget(false)} disabled={savingBudget || budgetInput === ''} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-[12px] font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap">
                  {savingBudget ? 'Saving…' : 'Set budget'}
                </button>
                {data.budget.state !== 'not_set' && (
                  <button onClick={() => saveBudget(true)} disabled={savingBudget} className="px-3 py-2 border border-border rounded-lg text-[12px] font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap">
                    Clear
                  </button>
                )}
                <button onClick={checkAlert} disabled={checkingAlert} className="px-3 py-2 border border-border rounded-lg text-[12px] font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap">
                  {checkingAlert ? 'Checking…' : 'Check budget alert'}
                </button>
              </div>
              <p className="text-[12px] text-muted-foreground mt-3">
                {checkMsg ? checkMsg : data.budget.lastAlert
                  ? `Last alert: ${data.budget.lastAlert.period} — spend ${fmt(data.budget.lastAlert.observed_spend)} over the ${fmt(data.budget.lastAlert.limit_usd)} limit; ${data.budget.lastAlert.notified_count} staff notified on ${new Date(data.budget.lastAlert.created_at).toLocaleDateString()}.`
                  : 'No budget alert has been recorded for this tenant.'}
              </p>
            </div>

            {data.byTenant !== null && (
              <div className="bg-card border border-border rounded-xl">
                <h2 className="text-[14px] font-semibold text-foreground">Per-tenant cost (30d)</h2>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Platform view — every tenant's recorded AI usage. Shown only on the platform tenant's seat.
                </p>
                <div className="mt-4 space-y-3">
                  {data.byTenant.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">No invocations recorded in the last 30 days.</p>
                  ) : data.byTenant.map((t) => (
                    <div key={t.tenant_id} className="flex items-center justify-between text-[13px]">
                      <span className="text-foreground font-medium">{t.tenant_name ?? t.tenant_id}</span>
                      <span className="text-muted-foreground">{t.invocations} calls · {t.tokens.toLocaleString()} tokens · {fmt(t.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl">
              <h2 className="text-[14px] font-semibold text-foreground flex items-center gap-2">
                <Cpu className="size-4" /> By model
              </h2>
              <div className="mt-4 space-y-3">
                {byModel.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No model spend recorded.</p>
                ) : (
                  byModel.map(barRow)
                )}
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl">
              <h2 className="text-[14px] font-semibold text-foreground flex items-center gap-2">
                <Layers className="size-4" /> By feature
              </h2>
              <div className="mt-4 space-y-3">
                {byFeature.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No feature spend recorded.</p>
                ) : (
                  byFeature.map(barRow)
                )}
              </div>
            </div>
          </div>

          {data.recentInvocations.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead>
                  <tr>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Feature</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Model</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tokens</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Cost</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentInvocations.map(i => (
                    <tr key={i.id} className="border-t border-border hover:bg-muted/50">
                      <td className="p-3 font-medium">{i.feature}</td>
                      <td className="p-3 text-muted-foreground">{i.model_name ?? '—'}</td>
                      <td className="p-3 text-muted-foreground">{(i.input_tokens + i.output_tokens).toLocaleString()}</td>
                      <td className="p-3 text-muted-foreground">${Number(i.cost).toFixed(4)}</td>
                      <td className="p-3"><Badge variant={i.status === 'success' ? 'default' : 'destructive'}>{i.status}</Badge></td>
                      <td className="p-3 text-muted-foreground">{new Date(i.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </>
      ) : null}

      <div className="bg-muted/50 border border-border rounded-xl">
        <p className="text-[13px] text-muted-foreground">
          Cost is computed from rows in <span className="font-mono text-[12px]">ai_invocations</span>. Log a call
          with the button above or POST to <span className="font-mono text-[12px]">/api/admin/ai-ops/invocations</span> so
          every AI call is auditable and costed.
        </p>
      </div>
    </div>
  );
}

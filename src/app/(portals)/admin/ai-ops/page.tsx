'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cpu, FileText, FlaskConical, AlertTriangle, Wallet, Activity, ArrowUpRight, Bot, FileCheck, Radar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type Overview = {
  counts: { models: number; prompts: number; evals: number; open_incidents: number; invocations: number; tasks_proposed: number; disclosures: number; ab_tests?: number; agents?: number };
  spend30d: number;
  recentInvocations: Array<{
    id: string; feature: string; status: string; input_tokens: number; output_tokens: number;
    cost: number; latency_ms: number | null; created_at: string; model_name: string | null; prompt_name: string | null;
  }>;
};

export default function AiOpsOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/ai-ops')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const stats = data
    ? [
        { label: 'Models', value: String(data.counts.models), icon: Cpu, href: '/admin/ai-ops/models', description: 'AI models registered' },
        { label: 'Prompts', value: String(data.counts.prompts), icon: FileText, href: '/admin/ai-ops/prompts', description: 'Prompt templates' },
        { label: 'Evals run', value: String(data.counts.evals), icon: FlaskConical, href: '/admin/ai-ops/evals', description: 'Evaluation suites executed' },
        { label: 'Open incidents', value: String(data.counts.open_incidents), icon: AlertTriangle, href: '/admin/ai-ops/incidents', description: 'Unresolved incidents' },
        { label: 'Spend (30d)', value: `$${data.spend30d.toFixed(2)}`, icon: Wallet, href: '/admin/ai-ops/cost', description: 'Last 30 days' },
        { label: 'Functions — proposed', value: String(data.counts.tasks_proposed), icon: Bot, href: '/admin/ai-ops/functions', description: 'AI work awaiting a human decision' },
        { label: 'Disclosures', value: String(data.counts.disclosures), icon: FileCheck, href: '/admin/ai-ops/disclosures', description: 'Registry records (J6)' },
        { label: 'A/B tests', value: String(data.counts.ab_tests ?? 0), icon: FlaskConical, href: '/admin/ai-ops/ab-tests', description: 'Prompt experiments (J2)' },
        { label: 'AI agents', value: String(data.counts.agents ?? 0), icon: Bot, href: '/admin/ai-ops/agents', description: 'Agent + MCP registries (J6)' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Activity className="size-6" /> AI Ops
        </h1>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : error ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <p className="text-[14px] font-medium text-foreground">Could not load AI Ops data.</p>
          <p className="text-[13px] text-muted-foreground mt-1">{error}</p>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map(s => (
              <Link
                key={s.label}
                href={s.href}
                className="bg-card border border-border rounded-xl p-5 hover:border-primary/40 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <s.icon className="size-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <ArrowUpRight className="size-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </div>
                <p className="text-2xl font-semibold tracking-tight text-foreground mt-3">{s.value}</p>
                <p className="text-[12px] font-medium text-foreground mt-0.5">{s.label}</p>
                <p className="text-[11px] text-muted-foreground">{s.description}</p>
              </Link>
            ))}
          </div>

          <Link
            href="/admin/ai-ops/operator"
            className="block bg-card border border-border rounded-xl p-5 hover:border-primary/40 transition-colors group"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[14px] font-semibold text-foreground flex items-center gap-2">
                  <Radar className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  The Operator — scanner, responses, directed actions
                </p>
                <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl">
                  The AI works here, not just answers: a fraud scanner over recorded facts (refunds, disputes,
                  SLA/stuck orders, repeat DMCA, opt-out listings, review bursts, seller risk), governed
                  responses applied by a human with a cited policy (open case, freeze payout, notify,
                  temporary suspension), register-open event responses, and click-to-do directed actions —
                  build a category, calculate change, open a high-risk seller&apos;s file.
                </p>
              </div>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/40 group-hover:text-primary transition-colors" />
            </div>
          </Link>

          {data.recentInvocations.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Activity className="size-10 mx-auto text-muted-foreground/40" />
              <p className="text-[14px] font-medium text-foreground mt-3">No AI invocations logged yet</p>
              <p className="text-[13px] text-muted-foreground mt-1 max-w-md mx-auto">
                No rows exist in <span className="font-mono text-[12px]">ai_invocations</span> for this
                tenant yet. Invocations logged through the Cost page or the logging API will appear here.
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead>
                  <tr>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Feature</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Model</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tokens</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Cost</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Latency</th>
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
                      <td className="p-3 text-muted-foreground">{i.latency_ms != null ? `${i.latency_ms} ms` : '—'}</td>
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
    </div>
  );
}

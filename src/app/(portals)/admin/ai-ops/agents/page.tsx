'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, Plug } from 'lucide-react';

type Agent = {
  id: string; key: string; name: string; description: string | null;
  capabilities: string[]; status: string; created_at: string;
};
type Mcp = {
  id: string; name: string; endpoint_url: string; transport: string; status: string;
  last_checked_at: string | null; last_check_ok: boolean | null;
  last_latency_ms: number | null; last_error: string | null;
};

const inputCls = 'rounded-lg border px-2 py-1.5 text-[13px] w-full';
const btn = 'rounded-lg border px-2 py-1 text-[12px] font-medium hover:bg-muted';

// J6 · AI agent registry + MCP connections. 'Connected' is only ever the
// result of a real probe (Check) — a registered connection says exactly
// that until one is measured.
export default function AiAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [mcp, setMcp] = useState<Mcp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentForm, setAgentForm] = useState({ key: '', name: '', description: '', capabilities: '' });
  const [mcpForm, setMcpForm] = useState({ name: '', endpoint_url: '', transport: 'http' });
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/ai-ops/agents', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setAgents(j.agents || []);
      setMcp(j.mcp_connections || []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/admin/ai-ops/agents', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  };

  const createAgent = async () => {
    setBusy(true); setError(null);
    try {
      await post({
        action: 'create_agent', key: agentForm.key, name: agentForm.name,
        description: agentForm.description || null,
        capabilities: agentForm.capabilities.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setAgentForm({ key: '', name: '', description: '', capabilities: '' });
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const createMcp = async () => {
    setBusy(true); setError(null);
    try {
      await post({ action: 'create_mcp', name: mcpForm.name, endpoint_url: mcpForm.endpoint_url, transport: mcpForm.transport });
      setMcpForm({ name: '', endpoint_url: '', transport: 'http' });
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const check = async (id: string) => {
    setChecking(id); setError(null);
    try {
      await post({ action: 'check_mcp', id });
      await load();
    } catch (e: any) { setError(e.message); } finally { setChecking(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/ai-ops" className="inline-flex items-center gap-1.5 text-[13px] font-medium underline underline-offset-2">
          <ArrowLeft className="size-4" /> AI Ops
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2 mt-3">
          <Bot className="size-6" /> AI Agents &amp; MCP Connections
        </h1>
      </div>

      {error && <div className="text-[13px] text-red-600">{error}</div>}

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border"><h2 className="text-[14px] font-semibold">Agent registry</h2></div>
        {loading ? <p className="px-5 py-6 text-[13px] text-muted-foreground">Loading…</p>
          : agents.length === 0 ? <p className="px-5 py-6 text-[13px] text-muted-foreground">No agents registered yet.</p>
          : (
            <div className="adm-table-wrap"><table className="adm-table">
              <thead className="border-b border-border bg-muted/40"><tr>
                <th className="px-5 py-3 font-medium text-muted-foreground">Agent</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Key</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Capabilities</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td className="px-5 py-3"><span className="font-medium">{a.name}</span>{a.description && <span className="block text-[12px] text-muted-foreground">{a.description}</span>}</td>
                    <td className="px-5 py-3 font-mono text-[12px]">{a.key}</td>
                    <td className="px-5 py-3">{Array.isArray(a.capabilities) && a.capabilities.length ? a.capabilities.join(', ') : '—'}</td>
                    <td className="px-5 py-3 capitalize">{a.status}</td>
                    <td className="px-5 py-3">
                      <button className={btn} onClick={async () => { try { await post({ action: 'set_agent_status', id: a.id, status: a.status === 'active' ? 'disabled' : 'active' }); await load(); } catch (e: any) { setError(e.message); } }}>
                        {a.status === 'active' ? 'Disable' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        <div className="border-t border-border px-5 py-4">
          <h3 className="text-[13px] font-semibold mb-2">Register an agent</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-[12px] text-muted-foreground">Key<input className={inputCls} value={agentForm.key} onChange={(e) => setAgentForm({ ...agentForm, key: e.target.value })} placeholder="e.g. kinnect" /></label>
            <label className="text-[12px] text-muted-foreground">Name<input className={inputCls} value={agentForm.name} onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })} /></label>
            <label className="text-[12px] text-muted-foreground md:col-span-2">Description<input className={inputCls} value={agentForm.description} onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })} /></label>
            <label className="text-[12px] text-muted-foreground md:col-span-2">Capabilities (comma-separated)<input className={inputCls} value={agentForm.capabilities} onChange={(e) => setAgentForm({ ...agentForm, capabilities: e.target.value })} placeholder="chat, product_search" /></label>
          </div>
          <button onClick={createAgent} disabled={busy} className="mt-3 rounded-lg border border-border bg-card px-4 py-2 text-[13px] font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">Register agent</button>
        </div>
      </section>

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Plug className="size-4 text-muted-foreground" />
          <h2 className="text-[14px] font-semibold">MCP connections</h2>
        </div>
        {loading ? <p className="px-5 py-6 text-[13px] text-muted-foreground">Loading…</p>
          : mcp.length === 0 ? <p className="px-5 py-6 text-[13px] text-muted-foreground">No MCP connections registered yet. Register one below — it will read &lsquo;registered&rsquo; until a probe reaches it.</p>
          : (
            <div className="adm-table-wrap"><table className="adm-table">
              <thead className="border-b border-border bg-muted/40"><tr>
                <th className="px-5 py-3 font-medium text-muted-foreground">Name</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Endpoint</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Transport</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Last probe</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {mcp.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-3 font-medium">{m.name}</td>
                    <td className="px-5 py-3 font-mono text-[12px]">{m.endpoint_url}</td>
                    <td className="px-5 py-3">{m.transport}</td>
                    <td className="px-5 py-3 capitalize">{m.status}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {m.last_checked_at ? `${m.last_check_ok ? 'reached' : 'failed'} · ${m.last_latency_ms ?? '—'} ms · ${new Date(m.last_checked_at).toLocaleString()}${m.last_error ? ` · ${m.last_error}` : ''}` : 'never probed'}
                    </td>
                    <td className="px-5 py-3"><button className={btn} disabled={checking === m.id} onClick={() => check(m.id)}>{checking === m.id ? 'Probing…' : 'Check'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        <div className="border-t border-border px-5 py-4">
          <h3 className="text-[13px] font-semibold mb-2">Register an MCP connection</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-[12px] text-muted-foreground">Name<input className={inputCls} value={mcpForm.name} onChange={(e) => setMcpForm({ ...mcpForm, name: e.target.value })} /></label>
            <label className="text-[12px] text-muted-foreground">Endpoint URL<input className={inputCls} value={mcpForm.endpoint_url} onChange={(e) => setMcpForm({ ...mcpForm, endpoint_url: e.target.value })} placeholder="https://…" /></label>
            <label className="text-[12px] text-muted-foreground">Transport
              <select className={inputCls} value={mcpForm.transport} onChange={(e) => setMcpForm({ ...mcpForm, transport: e.target.value })}>
                <option value="http">http</option>
                <option value="sse">sse</option>
                <option value="stdio">stdio</option>
              </select>
            </label>
          </div>
          <button onClick={createMcp} disabled={busy} className="mt-3 rounded-lg border border-border bg-card px-4 py-2 text-[13px] font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">Register connection</button>
        </div>
      </section>
    </div>
  );
}

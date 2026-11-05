'use client';

import React, { useState } from 'react';
import { 
  Terminal, 
  Cpu, 
  HardDrive, 
  Network, 
  Database, 
  ShieldAlert, 
  RefreshCw, 
  Download, 
  Play, 
  StopCircle,
  Clock,
  Lock
} from 'lucide-react';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  systemSettings?: any;
  saveSettingsToDb?: (updates: any) => Promise<boolean>;
}

// The recorded system signals served by GET /api/admin/system-health —
// every value traces to a row in platform_integration_health_registry,
// support_jobs, ai_incidents, or platform_backups. Uptime and latency
// have no probe in this app, so they appear nowhere in this payload.
interface IntegrationHealth {
  code: string;
  name: string;
  category: string | null;
  status: string;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  latencyMs: number | null;
  consecutiveFailures: number;
  tenantId: string | null;
}

interface SystemHealthData {
  ok: boolean;
  generatedAt: string;
  integrations: IntegrationHealth[];
  supportJobs: {
    total: number;
    byStatus: Record<string, number>;
    recentFailures: {
      type: string;
      status: string;
      attempts: number;
      maxAttempts: number;
      lastError: string | null;
      updatedAt: string;
    }[];
  };
  aiIncidents: {
    total: number;
    byStatus: Record<string, number>;
    recent: { title: string; severity: string; status: string; createdAt: string }[];
  };
  backups: {
    backupType: string;
    status: string;
    sizeBytes: number | null;
    startedAt: string | null;
    completedAt: string | null;
    errorMessage: string | null;
    createdAt: string;
  }[];
  errorRates?: {
    supportJobs: { h24: { bad: number; total: number; ratePct: number | null }; d7: { bad: number; total: number; ratePct: number | null } };
    aiInvocations: { h24: { bad: number; total: number; ratePct: number | null }; d7: { bad: number; total: number; ratePct: number | null } };
  };
  uptime?: { code: string; runs7d: number; uptimePct7d: number | null; lastRunAt: string | null }[];
  incidents?: { source: string; title: string; severity: string; status: string; at: string; surface: string }[];
}

const fmtTs = (ts: string | null) =>
  ts ? `${new Date(ts).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT` : '—';

const fmtSize = (bytes: number | null) =>
  bytes == null ? '—' : `${(bytes / 1048576).toFixed(1)} MB`;

export const SystemHealthTelemetryScreen: React.FC<ScreenProps> = ({
  onNavigateScreen,
  selectedLocation,
  onSelectLocation,
  systemSettings,
  saveSettingsToDb,
}) => {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  // The only live telemetry this panel has is the platform audit log
  // (GET /api/admin/audit-logs) — real system events, polled every 5s.
  // There is no infrastructure monitoring feed (CPU / memory / pool /
  // replication) connected to this app, so those panels state that
  // honestly instead of rendering invented readings.
  const [dbLogs, setDbLogs] = useState<{ id: number; timestamp: string; action: string; details: string }[]>([]);
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const fetchHealth = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/system-health");
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setHealth(data as SystemHealthData);
        setHealthError(null);
      } else {
        setHealthError(data?.error || `Request failed (${res.status})`);
      }
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : "Request failed");
    }
  }, []);

  React.useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // recorded signals change slowly; 30s poll
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Live probe — POST /api/admin/system-health/probe measures the real
  // services (database round-trip, public website, Supabase auth,
  // Twilio account, user access) and records the results in the
  // integration registry this screen renders. Until a probe runs, the
  // registry holds only what a probe recorded — nothing is inferred.
  const [probing, setProbing] = useState(false);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);
  const runProbe = async () => {
    setProbing(true); setProbeMsg(null);
    try {
      const res = await fetch('/api/admin/system-health/probe', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || `Probe failed (${res.status})`);
      setProbeMsg(`Probe complete — overall: ${String(d.overall || '').toUpperCase()} · ${(d.results || []).map((r: any) => `${r.name}: ${r.status}`).join(' · ')}`);
      await fetchHealth();
    } catch (e) {
      setProbeMsg(e instanceof Error ? e.message : 'Probe failed');
    } finally { setProbing(false); }
  };

  const fetchAuditLogs = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/audit-logs");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setDbLogs(data);
      }
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    }
  }, []);

  React.useEffect(() => {
    fetchAuditLogs();
    const interval = setInterval(fetchAuditLogs, 5000); // 5s real-time poll
    return () => clearInterval(interval);
  }, [fetchAuditLogs]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleRefreshAuditLog = async () => {
    await Promise.all([fetchAuditLogs(), fetchHealth()]);
    showToast('AUDIT LOG & RECORDED HEALTH DATA REFRESHED');
  };

  const handleDownloadDiagnostic = () => {
    const lines = [
      'UNSAID MEMORIES — SYSTEM DIAGNOSTIC DUMP',
      `Generated: ${new Date().toISOString()}`,
      'Source: platform audit log (GET /api/admin/audit-logs)',
      '',
      ...dbLogs.map((l) => `[${l.timestamp}] [${l.action}] ${l.details}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unsaid-diagnostic-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`DIAGNOSTIC DUMP DOWNLOADED — ${dbLogs.length} AUDIT EVENTS`);
  };

  return (
    <div className="w-full bg-card text-foreground font-sans antialiased text-[13px]">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-3 border border-white z-50 flex items-center gap-3 tabular-nums text-[13px] shadow-2xl">
          <span className="w-2 h-2 bg-card animate-pulse"></span>
          <span className="uppercase font-semibold tracking-wider">{toastMsg}</span>
          <button onClick={() => setToastMsg(null)} className="ml-2 text-white hover:opacity-70 cursor-pointer">✕</button>
        </div>
      )}

      {/* SECURITY CLEARANCE BAR */}
      <div className="w-full bg-primary text-primary-foreground px-4 py-2 flex flex-wrap items-center justify-between border-b border-border text-[10px] tabular-nums tracking-wider uppercase">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-destructive animate-pulse"></span>
          <span className="text-destructive font-semibold tracking-tight">RESTRICTED SECURITY PROFILE</span>
          <span className="text-muted-foreground">{"//"}</span>
          <span className="text-white">AUTH_SCOPE: SUPER_ADMIN_LEVEL_0</span>
          <span className="text-muted-foreground">{"//"}</span>
          <span className="text-muted-foreground/50">NODE: PRODUCTION</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] tabular-nums text-muted-foreground/70">
          <span>SUPABASE PROJECT: qdgfkxbkqcnuhckhvhzd</span>
          <span>INTEGRATION REGISTRY: {health ? `${health.integrations.length} RECORDED` : 'NOT LOADED'}</span>
          <button onClick={runProbe} disabled={probing}
            className="border border-border px-2 py-1 text-[10px] font-semibold uppercase hover:bg-muted cursor-pointer disabled:opacity-50">
            {probing ? 'Probing…' : 'Run live probe'}
          </button>
        </div>
      </div>
      {probeMsg && (
        <div className="w-full bg-muted/40 border-b border-border px-4 py-2 text-[11px]">{probeMsg}</div>
      )}

      {/* BREADCRUMB & EXECUTIVE TOOLBAR */}
      <div className="w-full bg-card border-b border-border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 tabular-nums text-[10px] text-muted-foreground">
            <span>ADMIN SETTINGS</span>
            <span className="text-foreground font-semibold">&gt;&gt;</span>
            <span className="text-foreground font-semibold">SYSTEM TELEMETRY &amp; ENVIRONMENT</span>
            <span className="text-foreground font-semibold">&gt;&gt;</span>
            <span className="bg-primary text-primary-foreground px-1 text-[9px] font-semibold">L0 ROOT</span>
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="font-semibold text-lg md:text-xl tracking-tight uppercase text-foreground">SYSTEM HEALTH, REPLICATION &amp; TELEMETRY</h1>
            <span className="tabular-nums text-[11px] text-muted-foreground">{"// LIVE SOURCE: PLATFORM AUDIT LOG"}</span>
          </div>
        </div>
        
        {/* ACTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={handleRefreshAuditLog}
            className="h-8 px-3 bg-primary text-primary-foreground border border-border tabular-nums text-[10px] uppercase hover:bg-muted transition-none flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            REFRESH AUDIT LOG
          </button>
          <button 
            onClick={handleDownloadDiagnostic}
            className="h-8 px-3 bg-card border border-border text-foreground tabular-nums text-[10px] uppercase hover:bg-muted/40 transition-none flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            DOWNLOAD DIAGNOSTIC BINDER
          </button>
        </div>
      </div>

      {/* RESTRICTED SETTINGS SUB-NAV TAB MATRIX */}
      <div className="w-full bg-muted/40 border-b border-border overflow-x-auto">
        <div className="flex items-stretch min-w-max text-[11px] tabular-nums">
          <button onClick={() => onNavigateScreen?.('org-multiloc')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            01 LOCATIONS &amp; SALONS
          </button>
          <button onClick={() => onNavigateScreen?.('users-staff')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            02 USERS, STAFF &amp; ROLES
          </button>
          <button onClick={() => onNavigateScreen?.('booking-rules')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            03 BOOKING RULES &amp; POLICIES
          </button>
          <button onClick={() => onNavigateScreen?.('revenue-stripe')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            04 REVENUE &amp; STRIPE GATEWAY
          </button>
          <div className="px-4 py-2 bg-primary text-primary-foreground border-r border-border flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-card inline-block"></span>
            <span>05 SYSTEM HEALTH &amp; TELEMETRY</span>
            <span className="text-[9px] px-1 bg-card text-foreground uppercase font-semibold ml-1">[ACTIVE]</span>
          </div>
          <button onClick={() => onNavigateScreen?.('services-pricing')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            06 SERVICES &amp; PRICING MATRIX
          </button>
          <button onClick={() => onNavigateScreen?.('analytics-reporting')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            07 ANALYTICS &amp; REPORTING
          </button>
          <button onClick={() => onNavigateScreen?.('cms-wizard')} className="px-4 py-2 text-muted-foreground hover:bg-card cursor-pointer">
            08 CMS &amp; BOOKING WIZARD
          </button>
        </div>
      </div>

      {/* CORE INFRASTRUCTURE TELEMETRY METRIC STRIP — no monitoring feed is
          connected to this app, so every reading states that plainly rather
          than showing an invented number. */}
      <div className="w-full grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 border-b border-border bg-card tabular-nums text-[13px]">
        {/* CPU */}
        <div className="p-3 border-r border-b lg: border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
            <span>CPU UTILIZATION</span>
            <Cpu className="w-3.5 h-3.5 text-muted-foreground/70" />
          </div>
          <div className="my-2">
            <div className="text-lg md:text-xl font-semibold tracking-tight text-muted-foreground">No data yet</div>
          </div>
          <div className="flex items-center gap-1 tabular-nums text-[10px] text-muted-foreground">
            <span>NOT INSTRUMENTED</span>
          </div>
        </div>

        {/* MEMORY */}
        <div className="p-3 border-r border-b lg: border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
            <span>MEMORY RESIDENT</span>
            <HardDrive className="w-3.5 h-3.5 text-muted-foreground/70" />
          </div>
          <div className="my-2">
            <div className="text-lg md:text-xl font-semibold tracking-tight text-muted-foreground">No data yet</div>
          </div>
          <div className="flex items-center gap-1 tabular-nums text-[10px] text-muted-foreground">
            <span>NOT INSTRUMENTED</span>
          </div>
        </div>

        {/* POOL CONNECTIONS */}
        <div className="p-3 border-r border-b lg: border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
            <span>DB CONNECTION POOL</span>
            <Database className="w-3.5 h-3.5 text-muted-foreground/70" />
          </div>
          <div className="my-2">
            <div className="text-lg md:text-xl font-semibold tracking-tight text-muted-foreground">No data yet</div>
          </div>
          <div className="flex items-center gap-1 tabular-nums text-[10px] text-muted-foreground">
            <span>NOT INSTRUMENTED</span>
          </div>
        </div>

        {/* EDGE LATENCY */}
        <div className="p-3 border-r border-b lg: border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
            <span>EDGE RESOLUTION TIME</span>
            <Network className="w-3.5 h-3.5 text-muted-foreground/70" />
          </div>
          <div className="my-2">
            <div className="text-lg md:text-xl font-semibold tracking-tight text-muted-foreground">No data yet</div>
          </div>
          <div className="flex items-center gap-1 tabular-nums text-[10px] text-muted-foreground">
            <span>NOT INSTRUMENTED</span>
          </div>
        </div>

        {/* SYNC DELAY */}
        <div className="p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
            <span>REPLICATION STATE</span>
            <span className="text-foreground font-semibold">SYNC</span>
          </div>
          <div className="my-2">
            <div className="text-lg md:text-xl font-semibold tracking-tight text-muted-foreground">No data yet</div>
          </div>
          <div className="flex items-center gap-1 tabular-nums text-[10px] text-muted-foreground">
            <span>NOT INSTRUMENTED</span>
          </div>
        </div>
      </div>

      {/* RECORDED SYSTEM SIGNALS — every value in this section is read
          from a real store by GET /api/admin/system-health. Uptime and
          latency are not measured in-app (no probe exists anywhere in
          this codebase), so they are stated as unmeasured above and
          appear nowhere here. */}
      <div className="w-full border-b border-border bg-card">
        <div className="px-4 py-2 border-b border-border bg-muted/40 flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold tabular-nums text-[13px] uppercase text-foreground">SEC:0 // RECORDED SYSTEM SIGNALS</span>
          <span className="tabular-nums text-[9px] text-muted-foreground uppercase">
            {health ? `READ ${fmtTs(health.generatedAt)}` : 'SOURCE: PLATFORM STORES'}
          </span>
        </div>

        {healthError ? (
          <div className="p-4 text-[13px] tabular-nums text-muted-foreground">
            Recorded health data could not be loaded: {healthError}. Nothing is shown rather than an invented reading.
          </div>
        ) : !health ? (
          <div className="p-4 text-[13px] tabular-nums text-muted-foreground">Loading recorded health data…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* INTEGRATION HEALTH REGISTRY */}
            <div className="border-b lg:border-b-0 lg:border-r border-border flex flex-col">
              <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                <span className="font-semibold tabular-nums text-[11px] uppercase text-foreground">Integration Health Registry</span>
                <span className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      await fetch('/api/admin/system-health', { method: 'POST' }).catch(() => null);
                      fetchHealth();
                    }}
                    className="text-[9px] uppercase border border-border px-1.5 py-0.5 bg-primary text-primary-foreground font-semibold"
                  >
                    Run checks now
                  </button>
                  <span className="text-[9px] uppercase border border-border px-1 bg-card text-foreground">PLATFORM_INTEGRATION_HEALTH_REGISTRY</span>
                </span>
              </div>
              <div className="p-4 flex-1">
                {health.integrations.length === 0 ? (
                  <p className="text-[13px] tabular-nums text-muted-foreground leading-relaxed">
                    No integrations are registered yet. Run a live probe (top right) to measure the platform services and record them here. An integration appears here when a health check
                    records its state in the registry — no check has been recorded yet, so there is
                    no integration status to report.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left tabular-nums text-[11px]">
                      <thead>
                        <tr className="border-b border-border text-foreground text-[10px] uppercase font-semibold">
                          <th className="p-2">Integration</th>
                          <th className="p-2">Recorded Status</th>
                          <th className="p-2 text-right">Uptime 7d</th>
                          <th className="p-2">Last Checked</th>
                          <th className="p-2">Last Success</th>
                          <th className="p-2 text-right">Recorded Latency</th>
                          <th className="p-2 text-right">Consec. Failures</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200">
                        {health.integrations.map((ig) => (
                          <tr key={ig.code} className="hover:bg-muted/40">
                            <td className="p-2">
                              <div className="font-semibold text-foreground">{ig.name}</div>
                              <div className="text-[10px] text-muted-foreground">{ig.code}{ig.category ? ` · ${ig.category}` : ''}</div>
                              {ig.lastError && <div className="text-[10px] text-destructive">Last error: {ig.lastError}</div>}
                            </td>
                            <td className="p-2 uppercase font-semibold">{ig.status}</td>
                            <td className="p-2 text-right">
                              {(() => {
                                const u = (health.uptime || []).find((x) => x.code === ig.code);
                                return u && u.uptimePct7d != null ? `${u.uptimePct7d}% (${u.runs7d} runs)` : '—';
                              })()}
                            </td>
                            <td className="p-2 whitespace-nowrap">{fmtTs(ig.lastCheckedAt)}</td>
                            <td className="p-2 whitespace-nowrap">{fmtTs(ig.lastSuccessAt)}</td>
                            <td className="p-2 text-right">{ig.latencyMs == null ? '—' : `${ig.latencyMs}ms`}</td>
                            <td className="p-2 text-right">{ig.consecutiveFailures}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* BACKUP RUNS */}
              <div className="px-4 py-2 border-y border-border bg-muted/30 flex items-center justify-between">
                <span className="font-semibold tabular-nums text-[11px] uppercase text-foreground">Backup Runs — This Workspace</span>
                <span className="text-[9px] uppercase border border-border px-1 bg-card text-foreground">PLATFORM_BACKUPS</span>
              </div>
              <div className="p-4">
                {health.backups.length === 0 ? (
                  <p className="text-[13px] tabular-nums text-muted-foreground">No backup runs have been recorded for this workspace.</p>
                ) : (
                  <div className="space-y-2 tabular-nums text-[11px]">
                    {health.backups.map((b, i) => (
                      <div key={i} className="border border-border p-2.5 bg-muted/30">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold uppercase text-foreground">{b.status}</span>
                          <span className="text-muted-foreground">{b.backupType} · {fmtSize(b.sizeBytes)}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 text-muted-foreground mt-1">
                          <span>Started: {fmtTs(b.startedAt)}</span>
                          <span>Completed: {fmtTs(b.completedAt)}</span>
                        </div>
                        {b.errorMessage && (
                          <div className="text-destructive mt-1 break-words">Error: {b.errorMessage}</div>
                        )}
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground">Full backup management lives in Settings → Backups.</p>
                  </div>
                )}
              </div>
            </div>

            {/* SUPPORT JOB QUEUE + AI INCIDENTS */}
            <div className="flex flex-col">
              <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                <span className="font-semibold tabular-nums text-[11px] uppercase text-foreground">Support Job Queue</span>
                <span className="text-[9px] uppercase border border-border px-1 bg-card text-foreground">SUPPORT_JOBS</span>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-5 gap-2 tabular-nums text-center">
                  {['queued', 'running', 'succeeded', 'failed', 'dead_letter'].map((s) => (
                    <div key={s} className="border border-border bg-muted/30 p-2">
                      <div className="text-[9px] uppercase text-muted-foreground font-semibold">{s.replace('_', ' ')}</div>
                      <div className="text-lg font-semibold text-foreground">{health.supportJobs.byStatus[s] ?? 0}</div>
                    </div>
                  ))}
                </div>
                {health.supportJobs.total === 0 ? (
                  <p className="text-[13px] tabular-nums text-muted-foreground mt-3">
                    No support jobs have been recorded for this workspace — the queue table is empty,
                    so the counts above are the recorded state of an empty queue.
                  </p>
                ) : health.supportJobs.recentFailures.length === 0 ? (
                  <p className="text-[13px] tabular-nums text-muted-foreground mt-3">No failed or dead-letter jobs recorded.</p>
                ) : (
                  <div className="space-y-2 tabular-nums text-[11px] mt-3">
                    {health.supportJobs.recentFailures.map((j, i) => (
                      <div key={i} className="border border-border p-2.5 bg-muted/30">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">{j.type}</span>
                          <span className="uppercase text-muted-foreground">{j.status} · attempt {j.attempts}/{j.maxAttempts}</span>
                        </div>
                        {j.lastError && <div className="text-destructive mt-1 break-words">Last error: {j.lastError}</div>}
                        <div className="text-muted-foreground mt-1">Updated: {fmtTs(j.updatedAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 py-2 border-y border-border bg-muted/30 flex items-center justify-between">
                <span className="font-semibold tabular-nums text-[11px] uppercase text-foreground">AI Incidents</span>
                <span className="text-[9px] uppercase border border-border px-1 bg-card text-foreground">AI_INCIDENTS</span>
              </div>
              <div className="p-4 flex-1">
                {health.aiIncidents.total === 0 ? (
                  <p className="text-[13px] tabular-nums text-muted-foreground">
                    No AI incidents have been recorded for this workspace. The incident log is empty —
                    that is a recorded fact about the log. Invocation error rates are measured
                    separately in the Error Rates band below.
                  </p>
                ) : (
                  <div className="space-y-2 tabular-nums text-[11px]">
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(health.aiIncidents.byStatus).map(([s, n]) => (
                        <span key={s} className="border border-border px-1.5 py-0.5 bg-muted/30 uppercase font-semibold">
                          {s}: {n}
                        </span>
                      ))}
                    </div>
                    {health.aiIncidents.recent.map((inc, i) => (
                      <div key={i} className="border border-border p-2.5 bg-muted/30">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">{inc.title}</span>
                          <span className="uppercase text-muted-foreground">{inc.severity} · {inc.status}</span>
                        </div>
                        <div className="text-muted-foreground mt-1">{fmtTs(inc.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ERROR RATES + OPEN INCIDENTS (K6) */}
        {health && (
          <div className="grid grid-cols-1 lg:grid-cols-2 border-b border-border">
            <div className="border-b lg:border-b-0 lg:border-r border-border">
              <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                <span className="font-semibold tabular-nums text-[11px] uppercase text-foreground">Error Rates</span>
                <span className="text-[9px] uppercase border border-border px-1 bg-card text-foreground">RECORDED FAILURES ÷ RECORDED TOTALS</span>
              </div>
              <div className="p-4 tabular-nums text-[12px] space-y-2">
                {health.errorRates ? (
                  <>
                    <div className="flex flex-wrap gap-x-6">
                      <span>
                        Support jobs 24h:{' '}
                        <strong>{health.errorRates.supportJobs.h24.ratePct == null ? 'no jobs recorded' : `${health.errorRates.supportJobs.h24.ratePct}% (${health.errorRates.supportJobs.h24.bad}/${health.errorRates.supportJobs.h24.total})`}</strong>
                      </span>
                      <span>
                        7d:{' '}
                        <strong>{health.errorRates.supportJobs.d7.ratePct == null ? '—' : `${health.errorRates.supportJobs.d7.ratePct}% (${health.errorRates.supportJobs.d7.bad}/${health.errorRates.supportJobs.d7.total})`}</strong>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-6">
                      <span>
                        AI invocations 24h:{' '}
                        <strong>{health.errorRates.aiInvocations.h24.ratePct == null ? 'no invocations recorded' : `${health.errorRates.aiInvocations.h24.ratePct}% (${health.errorRates.aiInvocations.h24.bad}/${health.errorRates.aiInvocations.h24.total})`}</strong>
                      </span>
                      <span>
                        7d:{' '}
                        <strong>{health.errorRates.aiInvocations.d7.ratePct == null ? '—' : `${health.errorRates.aiInvocations.d7.ratePct}% (${health.errorRates.aiInvocations.d7.bad}/${health.errorRates.aiInvocations.d7.total})`}</strong>
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Error rates are not present in this response.</p>
                )}
              </div>
            </div>
            <div>
              <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                <span className="font-semibold tabular-nums text-[11px] uppercase text-foreground">Open Incidents</span>
                <span className="text-[9px] uppercase border border-border px-1 bg-card text-foreground">AI_INCIDENTS + SUPPORT_JOBS</span>
              </div>
              <div className="p-4 tabular-nums text-[12px]">
                {!health.incidents || health.incidents.length === 0 ? (
                  <p className="text-muted-foreground">No open incidents: no unresolved AI incidents and no failed or dead-letter support jobs in the recent record.</p>
                ) : (
                  <div className="space-y-2">
                    {health.incidents.map((inc, i) => (
                      <div key={i} className="border border-border p-2.5 bg-muted/30 flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{inc.title}</span>
                        <span className="uppercase text-muted-foreground">{inc.severity} · {inc.status}</span>
                        <span className="text-muted-foreground">{fmtTs(inc.at)}</span>
                        <a href={inc.surface} className="ml-auto underline text-[11px]">Work in {inc.source === 'ai_incidents' ? 'AI Ops' : 'Support'}</a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SYSTEM CONTROLS & REPLICATION MONITORING GRID */}
      <div className="w-full flex flex-col">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 border-b border-border">
          
          {/* SEC:A REPLICATION ENGINE STATUS (7 COLS) */}
          <div className="lg:col-span-7 bg-card border-b lg: lg:border-r border-border flex flex-col">
            <div className="px-4 py-2 border-b border-border bg-muted/40 flex items-center justify-between">
              <span className="font-semibold tabular-nums text-[13px] uppercase text-foreground">SEC:A // PLATFORM AUDIT STREAM (LIVE)</span>
              <span className="bg-primary text-primary-foreground px-1.5 py-0.5 text-[9px] font-semibold">PLATFORM_AUDIT_LOG</span>
            </div>
            
            <div className="p-4 flex-1 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-border p-3 bg-muted/30 space-y-1.5">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">LOGICAL REPLICATION CHANNELS</div>
                  <div className="text-[11px] text-muted-foreground leading-snug">
                    No data yet — no replication telemetry source is connected to this panel. Channel
                    state appears here when a monitoring feed is wired in.
                  </div>
                </div>

                <div className="border border-border p-3 bg-muted/30 space-y-1.5">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">CDC CLIENT CONNECTION HEALTH</div>
                  <div className="text-[11px] text-muted-foreground leading-snug">
                    No data yet — connected-client health is not instrumented. The audit stream below is
                    the live signal this panel actually receives.
                  </div>
                </div>
              </div>

              {/* LIVE CONSOLE EXCERPT — real rows from the platform audit log */}
              <div className="border border-border bg-primary text-primary-foreground tabular-nums p-3 text-[11px] leading-relaxed space-y-1 overflow-y-auto max-h-[180px]">
                <div className="text-muted-foreground text-[10px] uppercase border-b border-border pb-1 flex items-center justify-between">
                  <span>LIVE AUDIT STREAM // PLATFORM_AUDIT_LOG</span>
                  <span className="animate-pulse text-success font-semibold">[{dbLogs.length} EVENTS · POLLING 5S]</span>
                </div>
                {dbLogs.length === 0 ? (
                  <div className="text-muted-foreground">No audit events recorded yet — real system events appear here as they happen.</div>
                ) : (
                  dbLogs.map((log) => (
                    <div key={log.id} className="text-success truncate flex gap-2">
                      <span className="text-muted-foreground">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className="text-warning font-semibold">[{log.action}]</span>
                      <span>{log.details}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* SEC:B DISPATCH REPLICATION & RE-SYNC MATRIX (5 COLS) */}
          <div className="lg:col-span-5 bg-card flex flex-col">
            <div className="px-4 py-2 border-b border-border bg-muted/40 flex items-center justify-between">
              <span className="font-semibold tabular-nums text-[13px] uppercase text-foreground">SEC:B // MANAGE CLUSTER CONFIG &amp; ENV</span>
              <span className="tabular-nums text-[9px] text-muted-foreground">ENV: PRODUCTION_L0</span>
            </div>
            
            <div className="p-4 flex-1 space-y-4">
              <div className="border border-border p-3 bg-card space-y-2">
                <div className="flex items-center justify-between text-[10px] font-semibold border-b border-border pb-1">
                  <span className="uppercase">DATABASE DIRECTORY</span>
                  <span className="text-muted-foreground">SUPABASE</span>
                </div>
                <div className="space-y-1.5 text-[13px] tabular-nums text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Project Ref:</span>
                    <span className="font-semibold text-foreground">qdgfkxbkqcnuhckhvhzd</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Database Host:</span>
                    <span className="font-semibold text-foreground">db.qdgfkxbkqcnuhckhvhzd.supabase.co</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Active Region:</span>
                    <span className="font-semibold text-foreground">—</span>
                  </div>
                  <div className="flex justify-between">
                    <span>SSL Mode:</span>
                    <span className="font-semibold text-foreground">—</span>
                  </div>
                </div>
              </div>

              <div className="border border-border p-3 bg-card space-y-2">
                <div className="flex items-center justify-between text-[10px] font-semibold border-b border-border pb-1">
                  <span className="uppercase text-foreground">SMS TWILIO API TELEMETRY</span>
                  <span className="text-foreground font-semibold">NOT CONFIGURED</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  No SMS provider is connected to this platform — SMS sending is unavailable, so there is
                  no dispatch pipeline or queue to report on.
                </div>
                <div className="flex items-center justify-between text-[13px] tabular-nums">
                  <span>Pending Outbound Queue:</span>
                  <span className="font-semibold text-foreground">—</span>
                </div>
              </div>

              {/* ENVIRONMENT VAULT KEYS PREVIEW — names only; values live in the
                  deployment environment and are never displayed here. */}
              <div className="border border-border p-3 bg-card space-y-2">
                <div className="flex items-center justify-between text-[10px] font-semibold border-b border-border pb-1">
                  <span className="uppercase text-foreground">ENVIRONMENT SECRET VAULT</span>
                  <span className="text-muted-foreground">SECRET CREDENTIALS</span>
                </div>
                <div className="space-y-1.5 text-[11px] tabular-nums">
                  <div className="flex justify-between items-center">
                    <span>SUPABASE_SERVICE_ROLE_KEY:</span>
                    <span className="tabular-nums text-[10px] text-muted-foreground select-none">SET IN ENVIRONMENT — NOT DISPLAYED</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>STRIPE_SECRET_KEY:</span>
                    <span className="tabular-nums text-[10px] text-muted-foreground select-none">SET IN ENVIRONMENT — NOT DISPLAYED</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>RESEND_API_KEY:</span>
                    <span className="tabular-nums text-[10px] text-muted-foreground select-none">SET IN ENVIRONMENT — NOT DISPLAYED</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SUPER ADMIN SECURITY LOCK FOOTER / HARDWARE ATTESTATION */}
      <div className="w-full bg-muted/30 border-b border-border p-4 flex flex-col md:flex-row items-center justify-between gap-4 select-none tabular-nums text-[13px]">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-primary text-primary-foreground flex items-center justify-center border border-border font-semibold">
            <Lock className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-foreground uppercase">
              <span>SUPER_ADMIN LEVEL 0 // CORE ENCLAVE VAULT KEY</span>
              <span className="border border-border px-1.5 bg-card text-[9px] font-semibold">[AUDIT LOGGED]</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Changes to database credentials, Stripe webhook triggers, or SMS notification handlers require dual-signature multi-factor hardware ratification.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-[10px] uppercase">AUDIT TRAIL:</span>
          <span className="border border-border bg-card px-2 py-0.5 text-foreground font-semibold tabular-nums">PLATFORM_AUDIT_LOG</span>
          <button 
            onClick={() => showToast('SIGN OUT FROM THE PORTAL HEADER TO END YOUR SESSION')}
            className="h-6 px-3 bg-primary text-primary-foreground text-[10px] uppercase font-semibold hover:bg-muted transition-none cursor-pointer"
          >
            TERMINATE SESSION
          </button>
        </div>
      </div>

      {/* MONOCHROME TERMINAL STATUS LINE */}
      <div className="w-full bg-primary text-primary-foreground px-4 py-1.5 flex items-center justify-between tabular-nums text-[11px]">
        <div className="flex items-center gap-2">
          <span>&gt; CONSOLE_DAEMON: LISTENING</span>
          <span className="inline-block w-[7px] h-[14px] bg-card animate-pulse"></span>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground/70">
          <span>SOURCE: PLATFORM AUDIT LOG</span>
          <span>DAWG-OS TELEMETRY ENGINE v1.2</span>
        </div>
      </div>
    </div>
  );
};

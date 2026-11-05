'use client';

import React, { useState } from 'react';
import { ShieldAlert, RefreshCw, Database, Lock, Eye, ListChecks } from 'lucide-react';
import {
  PLATFORM_LAYERS,
  RESIDUALS,
  SNAPSHOT_AUDIT_DATE,
  type SecurityPostureData,
} from '@/lib/security-posture';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  systemSettings?: any;
  saveSettingsToDb?: (updates: any) => Promise<boolean>;
}

const fmtTs = (ts: string | null) =>
  ts ? `${new Date(ts).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT` : '—';

const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('en-US'));

// Admin → Settings → Security Posture (Health & Threat).
// Four panels, one rule: real data or honest states only.
//  1. Database hardening — live catalog counts from
//     GET /api/admin/security-posture; when the live read fails the
//     API returns the audited census snapshot and every value here is
//     labeled with its audit date (2026-10-15/16) — never as live.
//  2. Platform layers — PLATFORM-INHERITED-UNVERIFIED / ABSENT /
//     PARTIAL exactly as the audit states. No checkmarks, no
//     "healthy" badges for anything not measured.
//  3. Threat / audit — exact counts from real stores only; failed
//     sign-ins state "no instrumentation" because no store exists.
//  4. Residuals — owner-only open items, shown, not hidden.
export const SecurityPostureScreen: React.FC<ScreenProps> = ({ onNavigateScreen }) => {
  const [data, setData] = useState<SecurityPostureData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/security-posture');
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setData(json as SecurityPostureData);
        setError(null);
      } else {
        setError(json?.error || `Request failed (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  }, []);

  React.useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const isLive = data?.source === 'live';

  return (
    <div className="w-full bg-card text-foreground font-sans antialiased text-[13px]">
      {/* Header */}
      <div className="w-full bg-card border-b border-border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 tabular-nums text-[10px] text-muted-foreground">
            <span>ADMIN SETTINGS</span>
            <span className="text-foreground font-semibold">&gt;&gt;</span>
            <span className="text-foreground font-semibold">HEALTH &amp; THREAT — SECURITY POSTURE</span>
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="font-semibold text-lg md:text-xl tracking-tight uppercase text-foreground">
              Security Posture
            </h1>
            <span className="tabular-nums text-[11px] text-muted-foreground">
              {'// COMPANION TO SYSTEM HEALTH & TELEMETRY — THIS SURFACE IS THE SECURITY POSITION, NOT INFRASTRUCTURE TELEMETRY'}
            </span>
          </div>
          {data && (
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {isLive ? (
                <>Source: LIVE catalog read · {fmtTs(data.generatedAt)}</>
              ) : (
                <>
                  Source: AUDITED SNAPSHOT — audit date {SNAPSHOT_AUDIT_DATE}. {data.sourceNote}
                </>
              )}
            </p>
          )}
        </div>
        <button
          onClick={fetchData}
          className="h-8 px-3 bg-primary text-primary-foreground border border-border tabular-nums text-[10px] uppercase hover:bg-muted transition-none flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> REFRESH
        </button>
      </div>

      {/* Sub-nav back to sibling settings surfaces */}
      <div className="w-full bg-muted/40 border-b border-border overflow-x-auto">
        <div className="flex items-stretch min-w-max text-[11px] tabular-nums">
          <button onClick={() => onNavigateScreen?.('system-telemetry')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            SYSTEM HEALTH &amp; TELEMETRY
          </button>
          <div className="px-4 py-2 bg-primary text-primary-foreground border-r border-border flex items-center gap-1.5">
            <span>SECURITY POSTURE</span>
            <span className="text-[9px] px-1 bg-card text-foreground uppercase font-semibold ml-1">[ACTIVE]</span>
          </div>
        </div>
      </div>

      {error ? (
        <div className="p-4 text-[13px] tabular-nums text-muted-foreground">
          Security posture data could not be loaded: {error}. Nothing is shown rather than an invented reading.
        </div>
      ) : !data ? (
        <div className="p-4 text-[13px] tabular-nums text-muted-foreground">Loading security posture…</div>
      ) : (
        <>
          {/* ── PANEL 1: DATABASE HARDENING ─────────────────────────── */}
          <div className="w-full border-b border-border bg-card">
            <div className="px-4 py-2 border-b border-border bg-muted/40 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold tabular-nums text-[13px] uppercase text-foreground flex items-center gap-2">
                <Database className="w-4 h-4" /> SEC:1 // DATABASE HARDENING
              </span>
              <span className="tabular-nums text-[9px] text-muted-foreground uppercase">
                {isLive ? 'LIVE — pg_constraint / pg_class / role_table_grants' : `SNAPSHOT — AUDIT DATE ${SNAPSHOT_AUDIT_DATE}, NOT LIVE`}
              </span>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-4 tabular-nums text-[11px]">
                <span>Total FKs (app schemas): <strong className="text-foreground">{num(data.totals.fkTotal)}</strong></span>
                <span>Composite FKs: <strong className="text-foreground">{data.totals.fkComposite == null ? '— (not stated as a single audited total in the snapshot)' : num(data.totals.fkComposite)}</strong></span>
                <span>pgAudit setting: <strong className="text-foreground">{data.pgAuditSetting ?? '—'}</strong></span>
                <span>SSL: <strong className="text-foreground">{data.sslSetting ?? '—'}</strong></span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left tabular-nums text-[11px]">
                  <thead>
                    <tr className="border-b border-border text-foreground text-[10px] uppercase font-semibold">
                      <th className="p-2">Schema</th>
                      <th className="p-2 text-right">FKs</th>
                      <th className="p-2 text-right">Composite FKs</th>
                      <th className="p-2 text-right">Tables with RLS off</th>
                      <th className="p-2 text-right">Non-SELECT grants to anon/authenticated</th>
                      <th className="p-2 text-right">NOT-VALID constraints</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {data.hardening.map((s) => (
                      <tr key={s.schema} className="hover:bg-muted/40">
                        <td className="p-2 font-semibold text-foreground">{s.schema}</td>
                        <td className="p-2 text-right">{num(s.fkTotal)}</td>
                        <td className="p-2 text-right">{num(s.fkComposite)}</td>
                        <td className="p-2 text-right">
                          {num(s.tablesRlsOff)}
                          {s.rlsOffTables.length > 0 && (
                            <div className="text-[10px] text-destructive text-left">{s.rlsOffTables.join(', ')}</div>
                          )}
                        </td>
                        <td className="p-2 text-right">{num(s.nonSelectGrantsAnonAuth)}</td>
                        <td className="p-2 text-right">{s.notValidConstraints == null ? '— (not in snapshot)' : num(s.notValidConstraints)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Composite FKs are the platform&apos;s tenant-binding pattern —{' '}
                <span className="tabular-nums">(tenant_id, parent_id) → parent (tenant_id, id)</span> — a child row
                cannot point at another tenant&apos;s parent. Counts measure that a constraint exists; they do
                not prove every relationship that should be constrained is (the clinical composite program and
                its blocked items are listed under Residuals).
              </p>
            </div>
          </div>

          {/* ── PANEL 2: PLATFORM LAYERS ────────────────────────────── */}
          <div className="w-full border-b border-border bg-card">
            <div className="px-4 py-2 border-b border-border bg-muted/40 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold tabular-nums text-[13px] uppercase text-foreground flex items-center gap-2">
                <Lock className="w-4 h-4" /> SEC:2 // PLATFORM LAYERS
              </span>
              <span className="tabular-nums text-[9px] text-muted-foreground uppercase">
                LABELED EXACTLY AS THE AUDIT STATES — NOTHING HERE IS MEASURED LIVE BY THIS PANEL
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {PLATFORM_LAYERS.map((l) => (
                <div key={l.layer} className="border-b lg:border-r border-border p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[12px] uppercase text-foreground">{l.layer}</span>
                    <span className="text-[9px] uppercase border border-border px-1.5 py-0.5 bg-muted/30 font-semibold text-foreground whitespace-nowrap">
                      {l.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{l.detail}</p>
                  {l.dashboardCheck && (
                    <p className="text-[10px] tabular-nums text-muted-foreground">Owner check: {l.dashboardCheck}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── PANEL 3: THREAT / AUDIT ─────────────────────────────── */}
          <div className="w-full border-b border-border bg-card">
            <div className="px-4 py-2 border-b border-border bg-muted/40 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold tabular-nums text-[13px] uppercase text-foreground flex items-center gap-2">
                <Eye className="w-4 h-4" /> SEC:3 // THREAT &amp; AUDIT — REAL STORES ONLY
              </span>
              <span className="tabular-nums text-[9px] text-muted-foreground uppercase">
                {isLive ? 'LIVE EXACT COUNTS' : `SNAPSHOT — AUDIT DATE ${SNAPSHOT_AUDIT_DATE}, NOT LIVE`}
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2">
              <div className="border-b lg:border-b-0 lg:border-r border-border p-4 space-y-2">
                <div className="font-semibold tabular-nums text-[11px] uppercase text-foreground">Audit-store volumes</div>
                <table className="w-full border-collapse text-left tabular-nums text-[11px]">
                  <tbody className="divide-y divide-neutral-200">
                    {data.auditStores.map((s) => (
                      <tr key={s.store}>
                        <td className="p-2">
                          <div className="text-foreground">{s.label}</div>
                          <div className="text-[10px] text-muted-foreground">{s.store}</div>
                          {s.note && <div className="text-[10px] text-muted-foreground">{s.note}</div>}
                        </td>
                        <td className="p-2 text-right font-semibold">{s.rows == null ? 'could not be read' : num(s.rows)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="p-2">
                        <div className="text-foreground">Platform audit harness — audit runs / control results</div>
                        <div className="text-[10px] text-muted-foreground">platform_audit.audit_runs / platform_audit.control_results</div>
                      </td>
                      <td className="p-2 text-right font-semibold">
                        {num(data.platformAuditHarness.auditRuns)} / {num(data.platformAuditHarness.controlResults)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="p-4 space-y-3">
                <div className="font-semibold tabular-nums text-[11px] uppercase text-foreground">Threat counts (this workspace)</div>
                <div className="grid grid-cols-2 gap-2 tabular-nums text-center">
                  <div className="border border-border bg-muted/30 p-2">
                    <div className="text-[9px] uppercase text-muted-foreground font-semibold">Seller violations — total</div>
                    <div className="text-lg font-semibold text-foreground">{data.threat.sellerViolationsTotal == null ? '—' : num(data.threat.sellerViolationsTotal)}</div>
                    <div className="text-[9px] text-muted-foreground">public.seller_violations</div>
                  </div>
                  <div className="border border-border bg-muted/30 p-2">
                    <div className="text-[9px] uppercase text-muted-foreground font-semibold">Seller violations — open</div>
                    <div className="text-lg font-semibold text-foreground">{data.threat.sellerViolationsOpen == null ? '—' : num(data.threat.sellerViolationsOpen)}</div>
                    <div className="text-[9px] text-muted-foreground">status = open</div>
                  </div>
                  <div className="border border-border bg-muted/30 p-2">
                    <div className="text-[9px] uppercase text-muted-foreground font-semibold">AI incidents — total</div>
                    <div className="text-lg font-semibold text-foreground">{data.threat.aiIncidentsTotal == null ? '—' : num(data.threat.aiIncidentsTotal)}</div>
                    <div className="text-[9px] text-muted-foreground">public.ai_incidents</div>
                  </div>
                  <div className="border border-border bg-muted/30 p-2">
                    <div className="text-[9px] uppercase text-muted-foreground font-semibold">AI incidents — not resolved</div>
                    <div className="text-lg font-semibold text-foreground">{data.threat.aiIncidentsOpen == null ? '—' : num(data.threat.aiIncidentsOpen)}</div>
                    <div className="text-[9px] text-muted-foreground">status &lt;&gt; resolved</div>
                  </div>
                </div>
                {!isLive && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Threat counts are not part of the hardening snapshot — they appear here only on a live read.
                    The dashes above mean &quot;not measured&quot;, not zero.
                  </p>
                )}
                <div className="border border-border p-3 bg-muted/30 space-y-1">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" /> Failed sign-ins
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{data.threat.failedSignInsNote}</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  App-layer audit is PARTIAL: CRM / accounting / commerce logs hold real rows, while the
                  telemedicine log&apos;s recorded rows are test probes and the admin-access and
                  portal-permission logs have recorded nothing (see volumes). Database-level audit is ABSENT —
                  see Platform Layers.
                </p>
              </div>
            </div>
          </div>

          {/* ── PANEL 4: RESIDUALS ──────────────────────────────────── */}
          <div className="w-full border-b border-border bg-card">
            <div className="px-4 py-2 border-b border-border bg-muted/40 flex items-center justify-between">
              <span className="font-semibold tabular-nums text-[13px] uppercase text-foreground flex items-center gap-2">
                <ListChecks className="w-4 h-4" /> SEC:4 // RESIDUALS — OWNER-ONLY OPEN ITEMS
              </span>
              <span className="tabular-nums text-[9px] text-muted-foreground uppercase">{RESIDUALS.length} OPEN</span>
            </div>
            <div className="p-4 space-y-2">
              {RESIDUALS.map((r, i) => (
                <div key={r.title} className="border border-border p-3 bg-muted/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[12px] text-foreground">{i + 1}. {r.title}</span>
                    <span className="text-[9px] uppercase border border-border px-1.5 py-0.5 bg-card font-semibold">{r.owner}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{r.detail}</p>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                These items are open by design of this panel: they are presented, not hidden, and none of them
                can be closed from app code — each needs the owner action named on it.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

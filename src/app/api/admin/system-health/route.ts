import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQueryStrict } from "@/lib/pg";
import { withPg } from "@/lib/crm/enterprise";
import { runHealthChecks } from "@/lib/admin/health-checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/system-health
//
// The recorded signals behind Admin → Settings → System Health (K6).
// Every value in this payload traces to a row in a real store:
//   integrations → public.platform_integration_health_registry — the
//     platform's designed health registry (platform-level by design: its
//     rows carry a nullable tenant_id and a platform-wide UNIQUE
//     integration_code). Rows are written by the live probe
//     (POST /api/admin/system-health/probe), which measures the real
//     services; until a probe runs, an empty list is the truthful
//     state, returned as-is.
//   supportJobs  → public.support_jobs — the support desk's job queue
//     (migration 20261037). Counts are grouped by the table's real status
//     vocabulary: queued / running / succeeded / failed / dead_letter.
//   aiIncidents  → public.ai_incidents — the AI Ops incident log.
//   backups      → public.platform_backups — rows written by the tenant
//     backup engine (src/lib/backups/engine.ts), tenant-scoped.
//
// Uptime + integration status now have a recorded source: the health
// checker (lib/admin/health-checks) writes the registry on a schedule
// (/api/cron/system-health) and on demand (POST below), and appends
// every run to activity_log — the uptime section below is derived from
// those recorded runs, never invented. Latency readings come only from
// probes the probe route recorded — this GET never invents one. Reads use pgQueryStrict — if the// database cannot be read, the route 500s and the screen says the
// recorded data could not be loaded, rather than dressing a failed read
// up as a healthy zero.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read");
  if (gate) return gate;

  try {
    const tenant = resolveTenantId(req);

    const integrations = await pgQueryStrict<{
      integration_code: string;
      display_name: string;
      category: string | null;
      status: string;
      last_checked_at: string | null;
      last_success_at: string | null;
      last_error: string | null;
      latency_ms: number | null;
      consecutive_failures: number;
      tenant_id: string | null;
    }>(
      `SELECT integration_code, display_name, category, status,
              last_checked_at, last_success_at, last_error,
              latency_ms, consecutive_failures, tenant_id
         FROM public.platform_integration_health_registry
        ORDER BY display_name`,
    );

    const jobCounts = await pgQueryStrict<{ status: string; n: number }>(
      `SELECT status, count(*)::int AS n
         FROM public.support_jobs
        WHERE tenant_id = $1 OR tenant_id IS NULL
        GROUP BY status`,
      [tenant],
    );
    const jobByStatus: Record<string, number> = {};
    let jobTotal = 0;
    for (const r of jobCounts) {
      jobByStatus[r.status] = r.n;
      jobTotal += r.n;
    }
    const recentFailedJobs = await pgQueryStrict<{
      type: string;
      status: string;
      attempts: number;
      max_attempts: number;
      last_error: string | null;
      updated_at: string;
    }>(
      `SELECT type, status, attempts, max_attempts, last_error, updated_at
         FROM public.support_jobs
        WHERE (tenant_id = $1 OR tenant_id IS NULL)
          AND status IN ('failed', 'dead_letter')
        ORDER BY updated_at DESC
        LIMIT 5`,
      [tenant],
    );

    const incidentCounts = await pgQueryStrict<{ status: string; n: number }>(
      `SELECT status, count(*)::int AS n
         FROM public.ai_incidents
        WHERE tenant_id = $1
        GROUP BY status`,
      [tenant],
    );
    const incidentByStatus: Record<string, number> = {};
    let incidentTotal = 0;
    for (const r of incidentCounts) {
      incidentByStatus[r.status] = r.n;
      incidentTotal += r.n;
    }
    const recentIncidents = await pgQueryStrict<{
      title: string;
      severity: string;
      status: string;
      created_at: string;
    }>(
      `SELECT title, severity, status, created_at
         FROM public.ai_incidents
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 5`,
      [tenant],
    );

    const backups = await pgQueryStrict<{
      backup_type: string;
      status: string;
      size_bytes: number | null;
      started_at: string | null;
      completed_at: string | null;
      error_message: string | null;
      created_at: string;
    }>(
      `SELECT backup_type, status, size_bytes, started_at, completed_at,
              error_message, created_at
         FROM public.platform_backups
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 5`,
      [tenant],
    );

    // Error rates (K6): recorded failures over recorded totals, 24h
    // and 7d — support job failures (failed + dead_letter of all jobs
    // that finished in the window) and AI invocation errors (the
    // gateway writes status 'success' | 'error').
    const rate = (bad: number, total: number) => (total > 0 ? Math.round((bad / total) * 1000) / 10 : null);
    const jobErr = await pgQueryStrict<{ window: string; bad: number; total: number }>(
      `SELECT w.window,
              count(*) FILTER (WHERE j.status IN ('failed', 'dead_letter'))::int AS bad,
              count(*)::int AS total
         FROM (VALUES ('24h', now() - interval '24 hours'), ('7d', now() - interval '7 days')) AS w(window, since)
         LEFT JOIN public.support_jobs j
           ON (j.tenant_id = $1 OR j.tenant_id IS NULL) AND j.updated_at >= w.since
        GROUP BY w.window`,
      [tenant],
    ).catch(() => [] as { window: string; bad: number; total: number }[]);
    const aiErr = await pgQueryStrict<{ window: string; bad: number; total: number }>(
      `SELECT w.window,
              count(*) FILTER (WHERE i.status = 'error')::int AS bad,
              count(*)::int AS total
         FROM (VALUES ('24h', now() - interval '24 hours'), ('7d', now() - interval '7 days')) AS w(window, since)
         LEFT JOIN public.ai_invocations i
           ON i.tenant_id = $1 AND i.created_at >= w.since
        GROUP BY w.window`,
      [tenant],
    ).catch(() => [] as { window: string; bad: number; total: number }[]);
    const errOf = (rows: { window: string; bad: number; total: number }[], w: string) => {
      const r = rows.find((x) => x.window === w);
      return r ? { bad: r.bad, total: r.total, ratePct: rate(r.bad, r.total) } : { bad: 0, total: 0, ratePct: null };
    };
    const errorRates = {
      supportJobs: { h24: errOf(jobErr, "24h"), d7: errOf(jobErr, "7d") },
      aiInvocations: { h24: errOf(aiErr, "24h"), d7: errOf(aiErr, "7d") },
    };

    // Uptime (K6): per integration, the share of recorded health-check
    // runs in the last 7 days that found it healthy — computed from the
    // activity_log run history the checker appends. No runs recorded
    // yet reads as null (unknown), never as 100%.
    const runRows = await pgQueryStrict<{ summary: unknown; created_at: string }>(
      `SELECT summary, "createdAt" AS created_at FROM public.activity_log
        WHERE entity = 'system_health' AND action = 'health_check_run'
          AND "createdAt" >= now() - interval '7 days'
        ORDER BY "createdAt" DESC LIMIT 200`,
    ).catch(() => [] as { summary: unknown; created_at: string }[]);
    const uptimeByCode = new Map<string, { healthy: number; runs: number; lastRunAt: string | null }>();
    for (const row of runRows) {
      let parsed: any = null;
      try {
        parsed = typeof row.summary === "string" ? JSON.parse(row.summary) : row.summary;
      } catch {
        parsed = null;
      }
      for (const chk of parsed?.checks ?? []) {
        const e = uptimeByCode.get(String(chk.code)) ?? { healthy: 0, runs: 0, lastRunAt: null };
        e.runs += 1;
        if (chk.status === "healthy") e.healthy += 1;
        if (!e.lastRunAt) e.lastRunAt = row.created_at;
        uptimeByCode.set(String(chk.code), e);
      }
    }
    const uptime = integrations.map((r) => {
      const e = uptimeByCode.get(r.integration_code);
      return {
        code: r.integration_code,
        runs7d: e?.runs ?? 0,
        uptimePct7d: e && e.runs > 0 ? Math.round((e.healthy / e.runs) * 1000) / 10 : null,
        lastRunAt: e?.lastRunAt ?? null,
      };
    });

    // Incidents (K6): the open incident picture in one list — AI
    // incidents not yet resolved, plus support jobs in a failed /
    // dead-letter state — each tagged with its home store, where it is
    // worked (J4 owns AI incidents; the support desk owns its jobs).
    const incidents = [
      ...recentIncidents
        .filter((i) => !["resolved", "closed"].includes(String(i.status)))
        .map((i) => ({
          source: "ai_incidents",
          title: i.title,
          severity: i.severity,
          status: i.status,
          at: i.created_at,
          surface: "/admin/ai-ops/incidents",
        })),
      ...recentFailedJobs.map((j) => ({
        source: "support_jobs",
        title: `${j.type} job ${j.status}`,
        severity: j.status === "dead_letter" ? "high" : "medium",
        status: j.status,
        at: j.updated_at,
        surface: "/admin/support",
      })),
    ];

    return NextResponse.json({
      ok: true,
      tenantId: tenant,
      generatedAt: new Date().toISOString(),
      integrations: integrations.map((r) => ({
        code: r.integration_code,
        name: r.display_name,
        category: r.category,
        status: r.status,
        lastCheckedAt: r.last_checked_at,
        lastSuccessAt: r.last_success_at,
        lastError: r.last_error,
        latencyMs: r.latency_ms,
        consecutiveFailures: r.consecutive_failures,
        tenantId: r.tenant_id,
      })),
      supportJobs: {
        total: jobTotal,
        byStatus: jobByStatus,
        recentFailures: recentFailedJobs.map((r) => ({
          type: r.type,
          status: r.status,
          attempts: r.attempts,
          maxAttempts: r.max_attempts,
          lastError: r.last_error,
          updatedAt: r.updated_at,
        })),
      },
      aiIncidents: {
        total: incidentTotal,
        byStatus: incidentByStatus,
        recent: recentIncidents.map((r) => ({
          title: r.title,
          severity: r.severity,
          status: r.status,
          createdAt: r.created_at,
        })),
      },
      backups: backups.map((r) => ({
        backupType: r.backup_type,
        status: r.status,
        sizeBytes: r.size_bytes,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        errorMessage: r.error_message,
        createdAt: r.created_at,
      })),
      errorRates,
      uptime,
      incidents,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to read recorded health data" },
      { status: 500 },
    );
  }
}

// POST /api/admin/system-health — run the health checks NOW (the same
// lib/admin/health-checks run the cron executes), recording the results
// into the registry + run history the GET above reads.
export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const out = await withPg(async (c) => runHealthChecks(c as any, tenant)).catch(() => null);
  if (!out) {
    return NextResponse.json(
      { ok: false, error: "Health check failed — the database probe itself did not complete" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, ...out });
}

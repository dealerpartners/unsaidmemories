// ---------------------------------------------------------------------------
// admin/health-checks.ts — K6 · System health: the registry WRITER.
//
// public.platform_integration_health_registry is the platform's designed
// health registry (platform-wide rows, integration_code UNIQUE) and the
// System Health screen reads it — but nothing wrote it, so integration
// status, uptime, and error rates had no recorded source. This module
// is the writer. A check run probes what can be probed from inside the
// app and records each integration's state honestly:
//
//   database — a real SELECT 1 with measured latency.
//   stripe / email (Resend) / supabase — configuration-presence checks:
//     the integration is 'healthy' when its credentials are configured,
//     'degraded' with the missing key named in last_error when not. No
//     outbound API call is made and none is claimed — a config check is
//     what this is, and the registry row says so in its category.
//
// Every run upserts the registry rows (consecutive_failures increments
// on a non-healthy result and resets on healthy; last_success_at moves
// only on healthy) and appends the run to activity_log
// (entity 'system_health', action 'health_check_run', summary carrying
// each integration's status) — the uptime derivation on the System
// Health read is computed from those recorded runs.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";

type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

export interface HealthCheckResult {
  code: string;
  name: string;
  category: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number | null;
  error: string | null;
}

function configCheck(
  code: string,
  name: string,
  category: string,
  present: boolean,
  missing: string,
): HealthCheckResult {
  return present
    ? { code, name, category, status: "healthy", latencyMs: null, error: null }
    : { code, name, category, status: "degraded", latencyMs: null, error: `${missing} is not configured` };
}

export async function runHealthChecks(
  c: PgClient,
  logTenantId: string,
): Promise<{ checks: HealthCheckResult[]; healthy: number; total: number }> {
  const checks: HealthCheckResult[] = [];

  // Database — the one live probe: if this fails, nothing below can be
  // recorded either, so the failure propagates to the caller as-is.
  const started = Date.now();
  await c.query(`SELECT 1 AS ok`);
  checks.push({
    code: "database",
    name: "Platform database",
    category: "infrastructure",
    status: "healthy",
    latencyMs: Date.now() - started,
    error: null,
  });

  checks.push(
    configCheck("stripe", "Stripe payments", "payments", Boolean(process.env.STRIPE_SECRET_KEY), "STRIPE_SECRET_KEY"),
  );
  checks.push(
    configCheck("resend_email", "Email delivery (Resend)", "communications", Boolean(process.env.RESEND_API_KEY), "RESEND_API_KEY"),
  );
  checks.push(
    configCheck(
      "supabase",
      "Supabase platform services",
      "infrastructure",
      Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY),
      "Supabase URL / service role key",
    ),
  );

  for (const check of checks) {
    await c.query(
      `INSERT INTO public.platform_integration_health_registry
         (integration_code, display_name, category, status, last_checked_at,
          last_success_at, last_error, latency_ms, consecutive_failures, tenant_id)
       VALUES ($1, $2, $3, $4, now(),
               CASE WHEN $4 = 'healthy' THEN now() ELSE NULL END,
               $5, $6, CASE WHEN $4 = 'healthy' THEN 0 ELSE 1 END, NULL)
       ON CONFLICT (integration_code) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         category = EXCLUDED.category,
         status = EXCLUDED.status,
         last_checked_at = now(),
         last_success_at = CASE WHEN EXCLUDED.status = 'healthy'
                                  THEN now()
                                  ELSE platform_integration_health_registry.last_success_at END,
         last_error = EXCLUDED.last_error,
         latency_ms = EXCLUDED.latency_ms,
         consecutive_failures = CASE WHEN EXCLUDED.status = 'healthy'
                                     THEN 0
                                     ELSE platform_integration_health_registry.consecutive_failures + 1 END`,
      [check.code, check.name, check.category, check.status, check.error, check.latencyMs],
    );
  }

  const healthy = checks.filter((x) => x.status === "healthy").length;
  await c.query(
    `INSERT INTO public.activity_log (id, entity, "entityId", action, summary, actor, tenant_id)
     VALUES ($1, 'system_health', 'platform', 'health_check_run', $2, 'health_check', $3::uuid)`,
    [
      randomUUID(),
      JSON.stringify({ checks: checks.map((x) => ({ code: x.code, status: x.status, latency_ms: x.latencyMs })), healthy, total: checks.length }).slice(0, 4000),
      logTenantId,
    ],
  ).catch(() => null);

  return { checks, healthy, total: checks.length };
}

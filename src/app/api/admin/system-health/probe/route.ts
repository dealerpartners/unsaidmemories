import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery, pgExec } from "@/lib/pg";
import { getTwilioConfig } from "@/lib/support/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/admin/system-health/probe — run LIVE health probes and
// record the results in platform_integration_health_registry.
//
// §4.0 Health leaves (System Health Live / Platform Status–User Access /
// Login Status / All Operational / Website→Live / SMS→Connected): the
// registry existed by design but NOTHING ever wrote it, so the System
// Health screen could only ever show an empty recorded list and the
// overview statuses were inference, not measurement. This route is the
// missing writer. Every check measures the real thing:
//   database    — SELECT 1 round-trip, timed
//   website     — HTTP GET of this deployment's public origin, timed
//   auth        — Supabase GoTrue /auth/v1/health
//   twilio_sms  — the tenant's Twilio config resolved the same way the
//                 sender resolves it, then the Twilio account resource
//                 itself; unconfigured reports 'not_configured', never
//                 a dressed-up "connected"
//   user_access — active portal users + memberships actually present
// Results upsert by integration_code (platform-wide rows, tenant_id
// NULL per the registry's design) with consecutive_failures tracked.
// ============================================================================

type ProbeResult = {
  code: string;
  name: string;
  category: string;
  status: "operational" | "degraded" | "down" | "not_configured";
  latencyMs: number | null;
  error: string | null;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
}

async function fetchStatus(url: string, init?: RequestInit): Promise<number> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal, cache: "no-store" });
    return res.status;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const results: ProbeResult[] = [];

  // database
  try {
    const { ms } = await timed(() => pgQuery(`SELECT 1 AS ok`, []));
    results.push({ code: "database", name: "Supabase Database", category: "platform", status: "operational", latencyMs: ms, error: null });
  } catch (e) {
    results.push({ code: "database", name: "Supabase Database", category: "platform", status: "down", latencyMs: null, error: e instanceof Error ? e.message : String(e) });
  }

  // website (this deployment's public origin)
  try {
    const origin = new URL(req.url).origin;
    const { value: status, ms } = await timed(() => fetchStatus(`${origin}/`));
    results.push({
      code: "website", name: "Public Website", category: "platform",
      status: status < 400 ? "operational" : status < 500 ? "degraded" : "down",
      latencyMs: ms, error: status >= 400 ? `HTTP ${status} from ${origin}/` : null,
    });
  } catch (e) {
    results.push({ code: "website", name: "Public Website", category: "platform", status: "down", latencyMs: null, error: e instanceof Error ? e.message : String(e) });
  }

  // auth (Supabase GoTrue health)
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) throw new Error("Supabase URL/anon key not configured in this deployment's env");
    const { value: status, ms } = await timed(() =>
      fetchStatus(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`, { headers: { apikey: anonKey } }),
    );
    results.push({
      code: "auth", name: "Login & Authentication", category: "platform",
      status: status === 200 ? "operational" : "down",
      latencyMs: ms, error: status === 200 ? null : `GoTrue health returned HTTP ${status}`,
    });
  } catch (e) {
    results.push({ code: "auth", name: "Login & Authentication", category: "platform", status: "down", latencyMs: null, error: e instanceof Error ? e.message : String(e) });
  }

  // twilio sms
  try {
    const shim = {
      query: async (text: string, params: unknown[]) => ({ rows: await pgQuery(text, params as any[]) }),
    };
    const cfg = await getTwilioConfig(shim as any, tenant);
    if (!cfg.configured || !cfg.accountSid || !cfg.authToken) {
      results.push({ code: "twilio_sms", name: "SMS (Twilio)", category: "messaging", status: "not_configured", latencyMs: null, error: "No Twilio credentials configured for this tenant or the platform" });
    } else {
      const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
      const { value: status, ms } = await timed(() =>
        fetchStatus(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}.json`, { headers: { Authorization: `Basic ${auth}` } }),
      );
      results.push({
        code: "twilio_sms", name: "SMS (Twilio)", category: "messaging",
        status: status === 200 ? "operational" : "down",
        latencyMs: ms, error: status === 200 ? null : `Twilio account fetch returned HTTP ${status}`,
      });
    }
  } catch (e) {
    results.push({ code: "twilio_sms", name: "SMS (Twilio)", category: "messaging", status: "down", latencyMs: null, error: e instanceof Error ? e.message : String(e) });
  }

  // customer portal (enablement setting + reachability of the portal
  // entry on this deployment's origin)
  try {
    const gateRows = await pgQuery<{ value_text: string | null }>(
      `SELECT value_text FROM public.cms_global_content
        WHERE tenant_id = $1 AND content_key = 'online_booking_enabled' AND locale = 'en-US' LIMIT 1`,
      [tenant],
    );
    const enabled = gateRows.length ? gateRows[0].value_text !== "false" : true;
    if (!enabled) {
      results.push({ code: "customer_portal", name: "Customer Portal", category: "platform", status: "not_configured", latencyMs: null, error: "Customer portal is disabled in settings (online_booking_enabled = false)" });
    } else {
      const origin = new URL(req.url).origin;
      const { value: status, ms } = await timed(() => fetchStatus(`${origin}/customer/appointments`));
      results.push({
        code: "customer_portal", name: "Customer Portal", category: "platform",
        status: status < 500 ? "operational" : "down",
        latencyMs: ms, error: status < 500 ? null : `Portal entry returned HTTP ${status}`,
      });
    }
  } catch (e) {
    results.push({ code: "customer_portal", name: "Customer Portal", category: "platform", status: "down", latencyMs: null, error: e instanceof Error ? e.message : String(e) });
  }

  // user access (real identities present and active)
  try {
    const rows = await pgQuery<{ portal_active: number; members: number }>(
      `SELECT (SELECT count(*)::int FROM public.portal_users WHERE tenant_id = $1 AND is_active = true) AS portal_active,
              (SELECT count(*)::int FROM public.tenant_memberships WHERE tenant_id = $1) AS members`,
      [tenant],
    );
    const active = (rows[0]?.portal_active ?? 0) + (rows[0]?.members ?? 0);
    results.push({
      code: "user_access", name: "User Access", category: "platform",
      status: active > 0 ? "operational" : "degraded",
      latencyMs: null,
      error: active > 0 ? null : "No active portal users or memberships found for this tenant",
    });
  } catch (e) {
    results.push({ code: "user_access", name: "User Access", category: "platform", status: "down", latencyMs: null, error: e instanceof Error ? e.message : String(e) });
  }

  // record — pgExec returns 0 on failure, so an ignored result used to
  // report ok:true while nothing was recorded. Capture every write.
  const writeErrors: string[] = [];
  let recorded = 0;
  for (const r of results) {
    const ok = r.status === "operational";
    // The registry's status CHECK only allows healthy/degraded/down/
    // unknown/disabled, while probe results speak operational/
    // not_configured. Writing the probe vocabulary verbatim violated the
    // CHECK on every row, so nothing was ever recorded (previously hidden
    // behind ok:true). Map to the registry vocabulary for the WRITE only;
    // results[] and overall keep the probe vocabulary.
    const registryStatus =
      r.status === "operational" ? "healthy"
      : r.status === "not_configured" ? "unknown"
      : ["healthy", "degraded", "down", "unknown", "disabled"].includes(r.status) ? r.status
      : "unknown";
    const written = await pgExec(
      `INSERT INTO public.platform_integration_health_registry
         (integration_code, display_name, category, tenant_id, status,
          last_checked_at, last_success_at, last_error, latency_ms, consecutive_failures)
       VALUES ($1, $2, $3, NULL, $4, now(), CASE WHEN $5 THEN now() ELSE NULL END, $6, $7, CASE WHEN $5 THEN 0 ELSE 1 END)
       ON CONFLICT (integration_code) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          category = EXCLUDED.category,
          status = EXCLUDED.status,
          last_checked_at = now(),
          last_success_at = CASE WHEN $5 THEN now() ELSE platform_integration_health_registry.last_success_at END,
          last_error = $6,
          latency_ms = $7,
          consecutive_failures = CASE WHEN $5 THEN 0 ELSE platform_integration_health_registry.consecutive_failures + 1 END`,
      [r.code, r.name, r.category, registryStatus, ok, r.error, r.latencyMs],
    );
    if (written > 0) recorded++;
    else writeErrors.push(r.code);
  }

  const down = results.filter((r) => r.status === "down").length;
  const degraded = results.filter((r) => r.status === "degraded" || r.status === "not_configured").length;
  if (results.length > 0 && recorded === 0) {
    return NextResponse.json({
      ok: false,
      probedAt: new Date().toISOString(),
      overall: down > 0 ? "down" : degraded > 0 ? "degraded" : "operational",
      results,
      recorded,
      writeErrors,
      error: "No probe results were recorded",
    }, { status: 500 });
  }
  return NextResponse.json({
    ok: writeErrors.length === 0,
    probedAt: new Date().toISOString(),
    overall: down > 0 ? "down" : degraded > 0 ? "degraded" : "operational",
    results,
    recorded,
    writeErrors,
  });
}

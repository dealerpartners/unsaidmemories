import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQueryStrict } from "@/lib/pg";
import {
  SNAPSHOT_AUDIT_DATE,
  SNAPSHOT_AUDIT_STORES,
  SNAPSHOT_HARDENING,
  SNAPSHOT_HARNESS,
  SNAPSHOT_SOURCES,
  SNAPSHOT_THREAT,
  type AuditStoreVolume,
  type SchemaHardening,
  type SecurityPostureData,
} from "@/lib/security-posture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/security-posture
//
// The live half of Admin → Settings → Security Posture (Health & Threat).
// Every live value is read in THIS request from the Postgres catalogs
// through the app's pg layer (pgQueryStrict, src/lib/pg.ts):
//   FK / composite counts   → pg_constraint (contype 'f')
//   RLS-off tables          → pg_class.relrowsecurity
//   non-SELECT grants      → information_schema.role_table_grants
//                             (grantee anon / authenticated)
//   NOT-VALID constraints   → pg_constraint.convalidated = false
//   pgAudit / SSL settings  → pg_settings
//   audit / threat volumes  → exact count(*) on the real stores
//
// If the catalog reads fail (database degraded), the route does NOT
// 500 and does NOT dress the failure up as zeros: it returns the
// audited snapshot from the 2026-10-15/16 hardening census, with
// source: "snapshot" and the audit date, and the screen labels every
// value as a snapshot. Individual store counts that fail degrade to
// null ("could not be read") rather than failing the whole payload.

const APP_SCHEMAS = ["public", "clinical", "lms", "platform_audit"];

async function tryCount(sql: string, params: unknown[] = []): Promise<number | null> {
  try {
    const rows = await pgQueryStrict<{ n: number }>(sql, params);
    return rows[0]?.n ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read");
  if (gate) return gate;

  const tenant = resolveTenantId(req);
  const generatedAt = new Date().toISOString();

  // ── 1. Catalog hardening (the deciding live read) ─────────────────
  let hardening: SchemaHardening[] | null = null;
  let pgAuditSetting: string | null = null;
  let sslSetting: string | null = null;
  try {
    const fkRows = await pgQueryStrict<{ schema: string; total: number; composite: number }>(
      `SELECT n.nspname AS schema,
              count(*)::int AS total,
              count(*) FILTER (WHERE array_length(c.conkey, 1) > 1)::int AS composite
         FROM pg_constraint c
         JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.contype = 'f' AND n.nspname = ANY($1)
        GROUP BY n.nspname`,
      [APP_SCHEMAS],
    );
    const rlsRows = await pgQueryStrict<{ schema: string; n: number }>(
      `SELECT n.nspname AS schema, count(*)::int AS n
         FROM pg_class cl
         JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE cl.relkind = 'r' AND NOT cl.relrowsecurity AND n.nspname = ANY($1)
        GROUP BY n.nspname`,
      [APP_SCHEMAS],
    );
    const rlsNames = await pgQueryStrict<{ schema: string; tbl: string }>(
      `SELECT n.nspname AS schema, cl.relname AS tbl
         FROM pg_class cl
         JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE cl.relkind = 'r' AND NOT cl.relrowsecurity AND n.nspname = ANY($1)
        ORDER BY n.nspname, cl.relname LIMIT 50`,
      [APP_SCHEMAS],
    );
    const grantRows = await pgQueryStrict<{ schema: string; n: number }>(
      `SELECT table_schema AS schema, count(*)::int AS n
         FROM information_schema.role_table_grants
        WHERE grantee IN ('anon', 'authenticated')
          AND privilege_type <> 'SELECT'
          AND table_schema = ANY($1)
        GROUP BY table_schema`,
      [APP_SCHEMAS],
    );
    const notValidRows = await pgQueryStrict<{ schema: string; n: number }>(
      `SELECT n.nspname AS schema, count(*)::int AS n
         FROM pg_constraint c
         JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE NOT c.convalidated AND n.nspname = ANY($1)
        GROUP BY n.nspname`,
      [APP_SCHEMAS],
    );
    const by = <T,>(rows: T[], pick: (r: T) => string) => {
      const m = new Map<string, T>();
      for (const r of rows) m.set(pick(r), r);
      return m;
    };
    const fkBy = by(fkRows, (r) => r.schema);
    const rlsBy = by(rlsRows, (r) => r.schema);
    const grantBy = by(grantRows, (r) => r.schema);
    const nvBy = by(notValidRows, (r) => r.schema);
    hardening = APP_SCHEMAS.map((schema) => ({
      schema,
      fkTotal: fkBy.get(schema)?.total ?? 0,
      fkComposite: fkBy.get(schema)?.composite ?? 0,
      tablesRlsOff: rlsBy.get(schema)?.n ?? 0,
      rlsOffTables: rlsNames.filter((r) => r.schema === schema).map((r) => r.tbl),
      nonSelectGrantsAnonAuth: grantBy.get(schema)?.n ?? 0,
      notValidConstraints: nvBy.get(schema)?.n ?? 0,
    }));

    const settings = await pgQueryStrict<{ name: string; setting: string }>(
      `SELECT name, setting FROM pg_settings WHERE name IN ('pgaudit.log', 'ssl')`,
    ).catch(() => [] as { name: string; setting: string }[]);
    pgAuditSetting = settings.find((s) => s.name === "pgaudit.log")?.setting ?? null;
    sslSetting = settings.find((s) => s.name === "ssl")?.setting ?? null;
  } catch {
    hardening = null;
  }

  if (!hardening) {
    // DB could not be read — return the labeled audited snapshot.
    const payload: SecurityPostureData = {
      ok: true,
      generatedAt,
      source: "snapshot",
      sourceNote: `Live catalog read failed — showing the audited snapshot from ${SNAPSHOT_SOURCES}, audit date ${SNAPSHOT_AUDIT_DATE}. These are census values, not live readings.`,
      hardening: SNAPSHOT_HARDENING,
      totals: {
        fkTotal: SNAPSHOT_HARDENING.reduce((a, s) => a + (s.fkTotal ?? 0), 0),
        fkComposite: SNAPSHOT_HARDENING.every((s) => s.fkComposite != null)
          ? SNAPSHOT_HARDENING.reduce((a, s) => a + (s.fkComposite ?? 0), 0)
          : null,
      },
      auditStores: SNAPSHOT_AUDIT_STORES,
      platformAuditHarness: SNAPSHOT_HARNESS,
      threat: SNAPSHOT_THREAT,
      pgAuditSetting: "none (per audit — pgaudit.log = 'none')",
      sslSetting: "on (per audit)",
    };
    return NextResponse.json(payload);
  }

  // ── 2. Audit-store volumes (exact counts; null = could not read) ──
  const storeDefs: { store: string; label: string; sql: string; note?: string }[] = [
    { store: "public.crm_audit_log", label: "CRM audit log", sql: `SELECT count(*)::int AS n FROM public.crm_audit_log` },
    { store: "public.acct_audit_log", label: "Accounting audit log", sql: `SELECT count(*)::int AS n FROM public.acct_audit_log` },
    { store: "public.commerce_audit_log", label: "Commerce audit log", sql: `SELECT count(*)::int AS n FROM public.commerce_audit_log` },
    { store: "public.seller_audit_log", label: "Seller audit log", sql: `SELECT count(*)::int AS n FROM public.seller_audit_log` },
    { store: "public.activity_log", label: "Activity log", sql: `SELECT count(*)::int AS n FROM public.activity_log` },
    { store: "lms.platform_audit_log", label: "LMS platform audit log", sql: `SELECT count(*)::int AS n FROM lms.platform_audit_log` },
    { store: "clinical.telemed_audit_log", label: "Telemedicine audit log (PHI)", sql: `SELECT count(*)::int AS n FROM clinical.telemed_audit_log` },
    { store: "clinical.pharmacy_audit_log", label: "Pharmacy audit log (PHI)", sql: `SELECT count(*)::int AS n FROM clinical.pharmacy_audit_log` },
    { store: "public.platform_admin_access_log", label: "Platform admin access log", sql: `SELECT count(*)::int AS n FROM public.platform_admin_access_log` },
    { store: "public.portal_permission_audit_log", label: "Portal permission audit log", sql: `SELECT count(*)::int AS n FROM public.portal_permission_audit_log` },
  ];
  const auditStores: AuditStoreVolume[] = [];
  for (const d of storeDefs) {
    auditStores.push({ store: d.store, label: d.label, rows: await tryCount(d.sql), note: null });
  }
  const harness = {
    auditRuns: await tryCount(`SELECT count(*)::int AS n FROM platform_audit.audit_runs`),
    controlResults: await tryCount(`SELECT count(*)::int AS n FROM platform_audit.control_results`),
  };

  // ── 3. Threat counts — only stores that really exist ──────────────
  const threat = {
    sellerViolationsTotal: await tryCount(
      `SELECT count(*)::int AS n FROM public.seller_violations WHERE tenant_id = $1`, [tenant]),
    sellerViolationsOpen: await tryCount(
      `SELECT count(*)::int AS n FROM public.seller_violations WHERE tenant_id = $1 AND status = 'open'`, [tenant]),
    aiIncidentsTotal: await tryCount(
      `SELECT count(*)::int AS n FROM public.ai_incidents WHERE tenant_id = $1`, [tenant]),
    aiIncidentsOpen: await tryCount(
      `SELECT count(*)::int AS n FROM public.ai_incidents WHERE tenant_id = $1 AND status <> 'resolved'`, [tenant]),
    failedSignIns: null,
    failedSignInsNote:
      "No instrumentation — no failed-sign-in store exists in this app, so no count is shown.",
  };

  const payload: SecurityPostureData = {
    ok: true,
    generatedAt,
    source: "live",
    sourceNote: "Live — read from the Postgres catalogs and audit stores in this request.",
    hardening,
    totals: {
      fkTotal: hardening.reduce((a, s) => a + (s.fkTotal ?? 0), 0),
      fkComposite: hardening.reduce((a, s) => a + (s.fkComposite ?? 0), 0),
    },
    auditStores,
    platformAuditHarness: harness,
    threat,
    pgAuditSetting,
    sslSetting,
  };
  return NextResponse.json(payload);
}

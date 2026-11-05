// Security posture — shared evidence model for Admin → Settings →
// Security Posture (Health & Threat).
//
// Two kinds of numbers live here, and they are never blended:
//   LIVE     — read at request time by GET /api/admin/security-posture
//              from the Postgres catalogs through src/lib/pg.ts.
//   SNAPSHOT — the audited counts from the hardening census
//              (~/workspace/unsaid-tree-census/db-hardening.md and
//              clinical-hardening.md, audit dates 2026-10-15 / 2026-10-16).
//              The screen labels every snapshot value with its audit
//              date. A snapshot value is NEVER presented as live.
//
// Platform layers that cannot be measured from SQL or app code carry
// the audit's own labels, verbatim in spirit:
//   PLATFORM-INHERITED-UNVERIFIED — inherited from the Supabase
//     platform; nothing in SQL or this app proves it for this project.
//   ABSENT — measured absent (pgAudit at the DB level, SIEM/export).
//   PARTIAL — measured, with a named gap (app-layer audit, app
//     identity, TLS).
// There is deliberately no "healthy" / checkmark state for anything
// that was not measured live in the same request.

export const SNAPSHOT_AUDIT_DATE = "2026-10-16";
export const SNAPSHOT_SOURCES =
  "db-hardening.md + clinical-hardening.md (catalog census, 2026-10-15/16)";

export interface SchemaHardening {
  schema: string;
  fkTotal: number | null;
  fkComposite: number | null;
  tablesRlsOff: number | null;
  rlsOffTables: string[];
  nonSelectGrantsAnonAuth: number | null;
  notValidConstraints: number | null;
}

export interface AuditStoreVolume {
  store: string;
  label: string;
  rows: number | null;
  note: string | null;
}

export interface ThreatCounts {
  sellerViolationsTotal: number | null;
  sellerViolationsOpen: number | null;
  aiIncidentsTotal: number | null;
  aiIncidentsOpen: number | null;
  failedSignIns: number | null; // always null: no store exists (see note)
  failedSignInsNote: string;
}

export interface SecurityPostureData {
  ok: boolean;
  generatedAt: string;
  /** 'live' when the catalog queries answered in this request;
   *  'snapshot' when they did not and the audited census is shown. */
  source: "live" | "snapshot";
  sourceNote: string;
  hardening: SchemaHardening[];
  totals: { fkTotal: number | null; fkComposite: number | null };
  auditStores: AuditStoreVolume[];
  platformAuditHarness: { auditRuns: number | null; controlResults: number | null };
  threat: ThreatCounts;
  pgAuditSetting: string | null;
  sslSetting: string | null;
}

// ── Audited snapshot (2026-10-15/16 census, post-hardening state as
// reported in the census close-out) ──────────────────────────────────
// public FKs 1,552 of which 568 composite; clinical FKs 99; lms FKs 667.
// anon/authenticated non-SELECT grants = 0 across public/clinical/lms.
// RLS on in every application schema, platform_audit included (9/9).
// Composite splits for clinical/lms and NOT-VALID counts were not
// stated as single audited totals in the census close-out, so they
// stay null in the snapshot rather than being reconstructed.
export const SNAPSHOT_HARDENING: SchemaHardening[] = [
  { schema: "public", fkTotal: 1552, fkComposite: 568, tablesRlsOff: 0, rlsOffTables: [], nonSelectGrantsAnonAuth: 0, notValidConstraints: null },
  { schema: "clinical", fkTotal: 99, fkComposite: null, tablesRlsOff: 0, rlsOffTables: [], nonSelectGrantsAnonAuth: 0, notValidConstraints: null },
  { schema: "lms", fkTotal: 667, fkComposite: null, tablesRlsOff: 0, rlsOffTables: [], nonSelectGrantsAnonAuth: 0, notValidConstraints: null },
  { schema: "platform_audit", fkTotal: null, fkComposite: null, tablesRlsOff: 0, rlsOffTables: [], nonSelectGrantsAnonAuth: 0, notValidConstraints: null },
];

export const SNAPSHOT_AUDIT_STORES: AuditStoreVolume[] = [
  { store: "public.crm_audit_log", label: "CRM audit log", rows: 253, note: null },
  { store: "public.acct_audit_log", label: "Accounting audit log", rows: 113, note: null },
  { store: "public.commerce_audit_log", label: "Commerce audit log", rows: 70, note: null },
  { store: "public.seller_audit_log", label: "Seller audit log", rows: 10, note: null },
  { store: "public.activity_log", label: "Activity log", rows: 16, note: null },
  { store: "lms.platform_audit_log", label: "LMS platform audit log", rows: 16, note: null },
  { store: "clinical.telemed_audit_log", label: "Telemedicine audit log (PHI)", rows: 3, note: "All 3 rows are \"probe\": true test rows — no real clinical audit event has been written." },
  { store: "clinical.pharmacy_audit_log", label: "Pharmacy audit log (PHI)", rows: 0, note: null },
  { store: "public.platform_admin_access_log", label: "Platform admin access log", rows: 0, note: "An admin-access log that had never recorded an access at audit time." },
  { store: "public.portal_permission_audit_log", label: "Portal permission audit log", rows: 0, note: "Permission changes unaudited in practice at audit time." },
];

export const SNAPSHOT_HARNESS = { auditRuns: 2, controlResults: 0 };

export const SNAPSHOT_THREAT: ThreatCounts = {
  sellerViolationsTotal: null,
  sellerViolationsOpen: null,
  aiIncidentsTotal: null,
  aiIncidentsOpen: null,
  failedSignIns: null,
  failedSignInsNote:
    "No instrumentation — no failed-sign-in store exists in this app, so no count is shown.",
};

// ── Platform layers — exactly as the evidence states ────────────────
export type PlatformLayerStatus =
  | "PLATFORM-INHERITED-UNVERIFIED"
  | "ABSENT"
  | "PARTIAL";

export interface PlatformLayer {
  layer: string;
  status: PlatformLayerStatus;
  detail: string;
  dashboardCheck: string | null;
}

export const PLATFORM_LAYERS: PlatformLayer[] = [
  {
    layer: "Encryption at rest",
    status: "PLATFORM-INHERITED-UNVERIFIED",
    detail:
      "Supabase inherits AWS volume encryption at the platform level; nothing in SQL proves it for this project. In-database tooling (pgcrypto, pgsodium, supabase_vault) is present and used for secrets — that is not at-rest storage encryption.",
    dashboardCheck: "Supabase Dashboard: Project Settings → Infrastructure",
  },
  {
    layer: "Backups & PITR",
    status: "PLATFORM-INHERITED-UNVERIFIED",
    detail:
      "Daily-backup retention and whether the PITR add-on is enabled decide the recovery posture. Nothing in the catalog evidences a backup ever being taken or tested. (App-level rows in public.platform_backups are tenant backup-engine runs, not platform backups.)",
    dashboardCheck: "Supabase Dashboard: Project Settings → Database → Backups",
  },
  {
    layer: "Network allowlist / VPC posture",
    status: "PLATFORM-INHERITED-UNVERIFIED",
    detail:
      "Supabase standard projects are not VPC-peered; the compensating control is the DB network-restriction allowlist. Whether the direct port is allowlisted is not visible from SQL.",
    dashboardCheck: "Supabase Dashboard: Project Settings → Database → Network restrictions",
  },
  {
    layer: "PostgREST exposed schemas",
    status: "PLATFORM-INHERITED-UNVERIFIED",
    detail:
      "Grants and schema USAGE are measurable from SQL; the exposed-schemas list itself is a dashboard/API-config item and cannot be read from here, so which grant surface is live API surface is unverified from this panel.",
    dashboardCheck: "Supabase Dashboard: Settings → API → Exposed schemas",
  },
  {
    layer: "pgAudit (database-level audit)",
    status: "ABSENT",
    detail:
      "ABSENT at the DB level per audit: pgaudit is in shared_preload_libraries but pgaudit.log = 'none' and pgaudit.role is unset — it records nothing. Server log_statement = 'ddl' only. There is no database-level audit trail of who read or changed any row, including PHI and money rows. App-layer audit is PARTIAL (see Threat / Audit panel).",
    dashboardCheck: "Owner action: enable via Supabase Dashboard / CLI (platform-managed setting)",
  },
  {
    layer: "SIEM / log export",
    status: "ABSENT",
    detail:
      "NOT FOUND anywhere searched at audit time: no SIEM or log-shipping integration in the codebase, no pg_cron export job, no Vercel cron exporting logs. Database logs live and die inside the platform.",
    dashboardCheck: null,
  },
  {
    layer: "Application identity (least privilege)",
    status: "PARTIAL",
    detail:
      "The app connects as postgres (BYPASSRLS, CREATEROLE, CREATEDB) on static, long-lived credentials, and the service_role key (also BYPASSRLS) is used in route files. RLS binds the public API surface; it does not bind the application itself. API-user JWTs are short-lived (app.settings.jwt_exp = 3600, measured). IAM / short-lived database credentials are ABSENT.",
    dashboardCheck: null,
  },
  {
    layer: "TLS to the database",
    status: "PARTIAL",
    detail:
      "Server ssl = on (measured) and the app data layer uses TLS to the pooler, but src/lib/pg.ts sets ssl rejectUnauthorized: false — encryption without certificate verification. The TLS version floor on the pooler is a platform config item, unverified from SQL.",
    dashboardCheck: null,
  },
];

// ── Residuals — owner-only open items from the audit ────────────────
export interface ResidualItem {
  title: string;
  detail: string;
  owner: string;
}

export const RESIDUALS: ResidualItem[] = [
  {
    title: "Enable pgAudit at the platform level",
    detail:
      "pgaudit.log is a platform-managed setting on Supabase; turning real audit logging on is a dashboard/CLI action by the owner, not app DDL. Until then SOC 2 CC7.2 cannot be answered at the database layer.",
    owner: "Project owner (Supabase dashboard)",
  },
  {
    title: "Migrate the app off the postgres / BYPASSRLS identity",
    detail:
      "The application's own connections are the least-privilege gap: a least-privilege app role is the fix. This is a design decision for the owner, not a constraint add. The Algolia connector role and supabase_read_only_user also hold BYPASSRLS.",
    owner: "Project owner (design decision)",
  },
  {
    title: "Clinical Batch-3 dispositions (blocked constraints)",
    detail:
      "Two clinical relationships are staged NOT VALID pending disposition: clinical.vet_knowledge_base.tenant_id (6 of 8 rows carry tenant ids that are not tenants — global content stamped with the nil-tenant sentinel) and clinical.telemed_audit_log (tenant_id, consultation_session_id) (3 of 3 rows are \"probe\": true test artifacts referencing a session that never existed). No validation until each is dispositioned.",
    owner: "Project owner (ruling per relationship)",
  },
  {
    title: "Verify the PostgREST exposed-schemas list",
    detail:
      "Whether lms (and any other schema) is in the exposed list decides if its grant surface is live API surface. Dashboard-only check; clinical carries no anon/authenticated grants regardless.",
    owner: "Project owner (Supabase dashboard)",
  },
  {
    title: "Default privileges under the supabase_admin grantor",
    detail:
      "pg_default_acl still contains broad per-schema defaults under the supabase_admin grantor; postgres cannot alter them (42501). Tightening that half needs the dashboard / Supabase-support path, or new tables minted on the dashboard path inherit broad grants.",
    owner: "Project owner (dashboard / Supabase support)",
  },
  {
    title: "Run the platform_audit harness",
    detail:
      "The compliance harness (platform_audit) was built and has barely run at audit time: 2 audit runs, 0 control results recorded. Its 9 tables carry RLS (post-hardening audit state) but no control result exists to cite.",
    owner: "Project owner / platform operator",
  },
  {
    title: "Confirm backups / PITR and at-rest encryption in the dashboard",
    detail:
      "See the Platform Layers panel: both are PLATFORM-INHERITED-UNVERIFIED until the owner checks Project Settings and records the result. Nothing in this panel can confirm them.",
    owner: "Project owner (Supabase dashboard)",
  },
];

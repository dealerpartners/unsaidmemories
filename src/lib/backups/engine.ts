// ---------------------------------------------------------------------------
// Per-tenant backup engine — backups are a PAID add-on.
//
// Every tenant gets a backup scenario, but only tenants who purchased the
// add-on (public.tenants.backup_addon_enabled = true) can run one. The gate
// is enforced HERE, in the engine, so every caller (Settings API, nightly
// cron, the system "Run Backup" quick action) inherits it — hiding a button
// in the UI is not the gate.
//
// What a backup is: a point-in-time JSON snapshot of the tenant's rows from
// the core operational tables (BACKUP_TABLE_SPECS below — each table scoped
// the way it actually carries tenancy: its own tenant_id, a parent row, or
// platform-global), plus a manifest (tenant, timestamp, per-table row
// counts, total rows, sha256). The archive is uploaded to the
// PRIVATE `tenant-backups` storage bucket at <tenant_id>/<timestamp>.json
// and recorded in public.platform_backups. A backup is only ever marked
// 'completed' after the archive object is confirmed stored; any failure
// records status='failed' with the real error — never a false completed.
//
// Transport: the service-role Supabase REST + Storage APIs (the same
// supabaseConfig used by the customer-documents flow in
// src/app/api/admin/crm/documents/route.ts), so the engine runs identically
// on Vercel and from a local script — there is no second code path.
// ---------------------------------------------------------------------------

import { createHash } from "crypto";
import { supabaseConfig, supabaseReady } from "@/lib/repo";

export const BACKUP_BUCKET = "tenant-backups";

export const BACKUP_UPSELL_MESSAGE =
  "Backup & storage is a paid add-on for this tenant. Enable the backup add-on to run nightly backups and download archives.";

export class BackupNotEntitledError extends Error {
  code = "BACKUP_NOT_ENTITLED";
  constructor() {
    super(BACKUP_UPSELL_MESSAGE);
    this.name = "BackupNotEntitledError";
  }
}

// Core operational tables exported for every tenant backup, each with the
// rule for how its rows belong to a tenant. The rule is per-table because
// tenancy is per-table in this schema — determined from information_schema
// live (2026-10-14), never assumed:
//
//   scope "tenant" — the table carries its own tenant_id column; rows are
//     filtered tenant_id = <tenant>. 43 of the 44 tables below.
//   scope "parent" — the table carries NO tenant_id; its rows belong to a
//     tenant through a parent row. The engine fetches the parent table's
//     tenant-scoped ids first (the parent must appear earlier in this
//     list) and selects this table's rows by its FK to that parent.
//     acct_ar_invoice_lines is the one such table today: its lines scope
//     through invoice_id → acct_ar_invoices.tenant_id. (Verified live:
//     lines has no tenant_id column; its invoice_id FK references
//     acct_ar_invoices.id. Filtering it by tenant_id is what killed the
//     2026-10-14 nightly run — platform_backups 2322b522, SQL 42703.)
//   scope "global" — the table is platform-global and carries no tenancy
//     at all; the whole table is snapshotted. NO table in this list is
//     global today; the strategy exists so a future global table is
//     scoped explicitly here instead of being silently tenant-filtered
//     (which would snapshot zero rows and record a false 0 in the
//     manifest) or silently dropped.
//
// Before any data moves, runTenantBackup PROBES every spec against the
// live schema through PostgREST (the scoping column must exist). A table
// whose rule no longer matches the schema fails the whole run loudly —
// the backup record names every unscopable table — instead of dying
// mid-list with the remaining tables unproven, or worse, completing with
// a table quietly missing from the manifest.
//
// Order is stable so archives diff cleanly.
export interface BackupTableSpec {
  table: string;
  scope: "tenant" | "parent" | "global";
  /** scope "parent" only: the FK column on this table referencing the parent. */
  parentKey?: string;
  /** scope "parent" only: the table (earlier in this list) whose tenant-scoped row ids scope this table. */
  parentTable?: string;
}

export const BACKUP_TABLE_SPECS: readonly BackupTableSpec[] = [
  // CRM
  { table: "crm_customers", scope: "tenant" },
  { table: "crm_party_dependents", scope: "tenant" },
  { table: "crm_appointment_services", scope: "tenant" },
  { table: "crm_services", scope: "tenant" },
  { table: "crm_service_packages", scope: "tenant" },
  { table: "crm_staff", scope: "tenant" },
  { table: "crm_documents", scope: "tenant" },
  { table: "crm_notes", scope: "tenant" },
  { table: "crm_activity", scope: "tenant" },
  { table: "crm_messages", scope: "tenant" },
  { table: "crm_leads", scope: "tenant" },
  // AAPawZ grooming tables (bookings, dogs, crm_pets, crm_appointments,
  // crm_appointment_pets, crm_grooming_records) do not exist in this
  // schema — listing them failed backup validation on every run.
  // Removed 2026-11-02.
  // Shop storefront records
  { table: "customers", scope: "tenant" },
  // Commerce
  { table: "commerce_orders", scope: "tenant" },
  { table: "commerce_order_items", scope: "tenant" },
  { table: "commerce_payments", scope: "tenant" },
  { table: "commerce_sales", scope: "tenant" },
  { table: "commerce_deposits", scope: "tenant" },
  { table: "commerce_refunds", scope: "tenant" },
  { table: "commerce_gift_cards", scope: "tenant" },
  { table: "commerce_shipping_labels", scope: "tenant" },
  { table: "commerce_catalog_items", scope: "tenant" },
  // Invoicing (single invoice record — enterprise AR; the duplicate
  // storefront invoices/invoice_items tables were consolidated into
  // these and dropped 2026-10-13)
  { table: "acct_ar_invoices", scope: "tenant" },
  // Lines carry no tenant_id — they belong to a tenant through their
  // invoice (invoice_id → acct_ar_invoices). See the scope rules above.
  { table: "acct_ar_invoice_lines", scope: "parent", parentKey: "invoice_id", parentTable: "acct_ar_invoices" },
  { table: "acct_ar_receipts", scope: "tenant" },
  // Communications
  { table: "communications", scope: "tenant" },
  { table: "email_messages", scope: "tenant" },
  { table: "customer_notifications", scope: "tenant" },
  // Accounting core (the books)
  { table: "acct_chart_of_accounts", scope: "tenant" },
  { table: "acct_journal_entries", scope: "tenant" },
  { table: "acct_journal_lines", scope: "tenant" },
  { table: "acct_bank_accounts", scope: "tenant" },
  // Inventory + purchasing
  { table: "erp_inventory_balances", scope: "tenant" },
  { table: "erp_inventory_movements", scope: "tenant" },
  { table: "erp_purchase_orders", scope: "tenant" },
  { table: "erp_purchase_order_lines", scope: "tenant" },
  // Tenant operations
  { table: "order_cases", scope: "tenant" },
  { table: "ship_from_addresses", scope: "tenant" },
  { table: "tenant_locations", scope: "tenant" },
];

/** The ordered table names, derived from the specs (kept for callers that only need the list). */
export const BACKUP_TABLES: readonly string[] = BACKUP_TABLE_SPECS.map((s) => s.table);

/** One-line description of a spec's scoping rule, recorded in manifests and failure rows. */
export function describeScope(spec: BackupTableSpec): string {
  if (spec.scope === "tenant") return "tenant_id";
  if (spec.scope === "parent") return `parent:${spec.parentTable}.${spec.parentKey}`;
  return "global";
}

const PAGE_SIZE = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BACKUP_TYPES = new Set(["full", "incremental", "export", "pre_migration"]);

export interface BackupRow {
  id: string;
  tenant_id: string;
  backup_type: string;
  scope: string;
  status: string;
  storage_url: string | null;
  size_bytes: number | null;
  checksum_sha256: string | null;
  row_counts: Record<string, number>;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  requested_by: string | null;
  created_at: string;
}

export interface BackupResult {
  id: string;
  tenantId: string;
  status: "completed";
  storagePath: string;
  sizeBytes: number;
  checksumSha256: string;
  rowCounts: Record<string, number>;
  totalRows: number;
  tableCount: number;
  startedAt: string;
  completedAt: string;
}

function requireConfig() {
  if (!supabaseReady || !supabaseConfig.url || !supabaseConfig.key) {
    throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing) — backup cannot run.");
  }
  return { url: supabaseConfig.url.replace(/\/$/, ""), key: supabaseConfig.key as string };
}

function restHeaders(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function restJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = requireConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: restHeaders(key, (init.headers as Record<string, string>) || {}) });
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText);
    throw new Error(`Supabase REST ${init.method || "GET"} ${path.split("?")[0]} failed (${res.status}): ${t.slice(0, 400)}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ---------------------------------------------------------------------------
// Entitlement
// ---------------------------------------------------------------------------

export async function getBackupEntitlement(tenantId: string): Promise<{ entitled: boolean; tenantName: string | null }> {
  const rows = await restJson<Array<{ name: string | null; backup_addon_enabled: boolean }>>(
    `tenants?id=eq.${encodeURIComponent(tenantId)}&select=name,backup_addon_enabled`,
  );
  if (!rows || rows.length === 0) return { entitled: false, tenantName: null };
  return { entitled: rows[0].backup_addon_enabled === true, tenantName: rows[0].name ?? null };
}

export async function listEntitledTenants(): Promise<Array<{ id: string; name: string | null }>> {
  return restJson<Array<{ id: string; name: string | null }>>(
    `tenants?backup_addon_enabled=eq.true&select=id,name&order=created_at.asc`,
  );
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every row matching one PostgREST filter (or the whole table when null), paginated past the cap. */
async function fetchPagedRows(table: string, filter: string | null): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const page = await restJson<Record<string, unknown>[]>(
      filter
        ? `${table}?${filter}&select=*&limit=${PAGE_SIZE}&offset=${offset}`
        : `${table}?select=*&limit=${PAGE_SIZE}&offset=${offset}`,
    );
    const rows = Array.isArray(page) ? page : [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
}

/** Rows of a tenant-scoped table belonging to the tenant (its own tenant_id column). */
async function fetchTenantRows(table: string, tenantId: string): Promise<Record<string, unknown>[]> {
  return fetchPagedRows(table, `tenant_id=eq.${encodeURIComponent(tenantId)}`);
}

/**
 * Rows of a parent-scoped table belonging to the tenant: the rows whose FK
 * points at one of the parent table's tenant-scoped rows. Parent ids are
 * chunked so the in.(...) filter stays well inside URL limits.
 */
async function fetchParentRows(spec: BackupTableSpec, parentIds: string[]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const CHUNK = 200;
  for (let i = 0; i < parentIds.length; i += CHUNK) {
    const chunk = parentIds.slice(i, i + CHUNK);
    out.push(...(await fetchPagedRows(spec.table, `${spec.parentKey}=in.(${chunk.join(",")})`)));
  }
  return out;
}

/**
 * Preflight: probe every spec's scoping column against the live schema
 * through PostgREST itself (select the column, limit 0 — a missing column
 * is a 400). ALL failures are collected and thrown together, naming every
 * unscopable table, so a schema drift fails the run at minute zero with
 * the full list instead of dying at the first bad table with the rest of
 * the list unproven. A parent spec also requires its parent table to be
 * listed (and listed earlier — the run fetches in list order).
 */
async function assertSpecsScopable(): Promise<void> {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const spec of BACKUP_TABLE_SPECS) {
    const column = spec.scope === "tenant" ? "tenant_id" : spec.scope === "parent" ? spec.parentKey : null;
    if (spec.scope === "parent" && (!spec.parentKey || !spec.parentTable || !seen.has(spec.parentTable))) {
      problems.push(`${spec.table}: parent scope requires parentKey and a parentTable listed earlier (got parentTable=${spec.parentTable ?? "none"})`);
      seen.add(spec.table);
      continue;
    }
    if (column) {
      try {
        await restJson(`${spec.table}?select=${encodeURIComponent(column)}&limit=0`);
      } catch (e) {
        problems.push(`${spec.table}: cannot scope by ${describeScope(spec)} — probe of column ${column} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    seen.add(spec.table);
  }
  if (problems.length > 0) {
    throw new Error(`Backup table scoping does not match the live schema (${problems.length} problem${problems.length === 1 ? "" : "s"}): ${problems.join(" | ")}`);
  }
}

export async function listTenantBackups(tenantId: string, limit = 50): Promise<BackupRow[]> {
  const rows = await restJson<BackupRow[]>(
    `platform_backups?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*&order=created_at.desc&limit=${Math.min(Math.max(limit, 1), 200)}`,
  );
  return Array.isArray(rows) ? rows : [];
}

export async function getTenantBackup(tenantId: string, backupId: string): Promise<BackupRow | null> {
  if (!UUID_RE.test(backupId)) return null;
  const rows = await restJson<BackupRow[]>(
    `platform_backups?id=eq.${encodeURIComponent(backupId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=*&limit=1`,
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

async function insertBackupRow(row: Record<string, unknown>): Promise<BackupRow> {
  const rows = await restJson<BackupRow[]>("platform_backups", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!rows || rows.length === 0) throw new Error("platform_backups insert returned no row");
  return rows[0];
}

async function updateBackupRow(id: string, patch: Record<string, unknown>): Promise<void> {
  await restJson(`platform_backups?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

async function uploadArchive(storagePath: string, body: Buffer): Promise<void> {
  const { url, key } = requireConfig();
  const res = await fetch(`${url}/storage/v1/object/${BACKUP_BUCKET}/${storagePath}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "x-upsert": "false" },
    // Copy into a plain Uint8Array — fetch's BodyInit rejects Node's Buffer type.
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText);
    throw new Error(`Storage upload to ${BACKUP_BUCKET}/${storagePath} failed (${res.status}): ${t.slice(0, 400)}`);
  }
}

export interface RunBackupOptions {
  /** auth.users id of the admin who asked, when known (platform_backups.requested_by FK). */
  requestedBy?: string | null;
  /** platform_backups.backup_type vocabulary; the snapshot itself is always full. */
  backupType?: string;
  /** Where the run came from ("settings" | "cron" | "quick_action") — recorded in the manifest. */
  source?: string;
}

export async function runTenantBackup(tenantId: string, opts: RunBackupOptions = {}): Promise<BackupResult> {
  requireConfig();

  // The add-on gate lives in the engine: no caller can run a backup for a
  // tenant who hasn't purchased it.
  const { entitled, tenantName } = await getBackupEntitlement(tenantId);
  if (!entitled) throw new BackupNotEntitledError();

  const backupType = opts.backupType && BACKUP_TYPES.has(opts.backupType) ? opts.backupType : "full";
  const startedAt = new Date();
  const startedIso = startedAt.toISOString();
  const stamp = startedIso.replace(/[:.]/g, "-");
  const storagePath = `${tenantId}/${stamp}.json`;

  // Record the attempt up front so a crash mid-run leaves a truthful
  // 'running'/'failed' row, not silence. requested_by is an FK to
  // auth.users — if the caller's id isn't one, retry without it rather than
  // failing the whole backup on the audit field.
  const baseRow: Record<string, unknown> = {
    tenant_id: tenantId,
    backup_type: backupType,
    scope: "tenant",
    status: "running",
    started_at: startedIso,
    row_counts: {},
  };
  let record: BackupRow;
  try {
    record = await insertBackupRow(
      opts.requestedBy && UUID_RE.test(opts.requestedBy) ? { ...baseRow, requested_by: opts.requestedBy } : baseRow,
    );
  } catch {
    record = await insertBackupRow(baseRow);
  }

  // Declared outside the try so a failed run's record can still carry the
  // partial row counts — the manifest accounting for every table it reached.
  const data: Record<string, Record<string, unknown>[]> = {};
  const rowCounts: Record<string, number> = {};
  let totalRows = 0;
  try {
    // Every spec must match the live schema before any data moves.
    await assertSpecsScopable();

    for (const spec of BACKUP_TABLE_SPECS) {
      let rows: Record<string, unknown>[];
      try {
        if (spec.scope === "tenant") {
          rows = await fetchTenantRows(spec.table, tenantId);
        } else if (spec.scope === "parent") {
          const parentRows = data[spec.parentTable as string] || [];
          const parentIds = parentRows.map((r) => String(r.id)).filter((v) => UUID_RE.test(v));
          rows = await fetchParentRows(spec, parentIds);
        } else {
          rows = await fetchPagedRows(spec.table, null);
        }
      } catch (e) {
        throw new Error(
          `Backup table ${spec.table} (scope: ${describeScope(spec)}) failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      data[spec.table] = rows;
      rowCounts[spec.table] = rows.length;
      totalRows += rows.length;
    }

    const completedAt = new Date();
    const archive = {
      format: "unsaid-tenant-backup",
      version: 1,
      backup_id: record.id,
      tenant_id: tenantId,
      tenant_name: tenantName,
      created_at: completedAt.toISOString(),
      source: opts.source || "manual",
      snapshot: "full",
      manifest: {
        tables: rowCounts,
        // How each table was scoped, so the archive itself records the
        // tenancy rule every count was produced under.
        scopes: Object.fromEntries(BACKUP_TABLE_SPECS.map((s) => [s.table, describeScope(s)])),
        total_rows: totalRows,
        table_count: BACKUP_TABLE_SPECS.length,
      },
      data,
    };
    const body = Buffer.from(JSON.stringify(archive), "utf8");
    const checksum = createHash("sha256").update(body).digest("hex");

    // The row is marked completed ONLY after the archive object is stored.
    await uploadArchive(storagePath, body);

    await updateBackupRow(record.id, {
      status: "completed",
      storage_url: storagePath,
      size_bytes: body.byteLength,
      checksum_sha256: checksum,
      row_counts: rowCounts,
      completed_at: completedAt.toISOString(),
      error_message: null,
    });

    return {
      id: record.id,
      tenantId,
      status: "completed",
      storagePath,
      sizeBytes: body.byteLength,
      checksumSha256: checksum,
      rowCounts,
      totalRows,
      tableCount: BACKUP_TABLES.length,
      startedAt: startedIso,
      completedAt: completedAt.toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Best-effort: record the failure truthfully — the error names the
    // table (or every unscopable table, from preflight), and the partial
    // row_counts account for the tables snapshotted before the failure.
    // The original error is what propagates either way.
    await updateBackupRow(record.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: message.slice(0, 1000),
      row_counts: rowCounts,
    }).catch(() => null);
    const wrapped = new Error(message) as Error & { backupId?: string };
    wrapped.backupId = record.id;
    throw wrapped;
  }
}

// ---------------------------------------------------------------------------
// Downloads — 1-hour signed URLs, minted only for the owning tenant's rows.
// ---------------------------------------------------------------------------

export async function signBackupDownload(
  tenantId: string,
  backupId: string,
): Promise<{ url: string; expiresIn: number; backup: BackupRow }> {
  const backup = await getTenantBackup(tenantId, backupId);
  if (!backup) throw new Error("Backup not found for this tenant");
  if (backup.status !== "completed" || !backup.storage_url) {
    throw new Error(`Backup is not downloadable (status: ${backup.status})`);
  }
  const { url, key } = requireConfig();
  const res = await fetch(`${url}/storage/v1/object/sign/${BACKUP_BUCKET}`, {
    method: "POST",
    headers: restHeaders(key),
    body: JSON.stringify({ expiresIn: 3600, paths: [backup.storage_url] }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText);
    throw new Error(`Could not sign download URL (${res.status}): ${t.slice(0, 300)}`);
  }
  const rows = (await res.json()) as Array<{ path?: string; signedURL?: string }>;
  const signed = rows?.find((r) => r.path === backup.storage_url)?.signedURL || rows?.[0]?.signedURL;
  if (!signed) throw new Error("Could not sign download URL (empty response)");
  return { url: `${url}/storage/v1${signed}`, expiresIn: 3600, backup };
}

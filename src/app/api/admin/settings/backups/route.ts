import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { resolveTenantId } from "@/lib/admin-api";
import {
  BACKUP_UPSELL_MESSAGE,
  BackupNotEntitledError,
  getBackupEntitlement,
  listTenantBackups,
  runTenantBackup,
  type BackupRow,
} from "@/lib/backups/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Admin → Settings → Backups. Tenant-scoped throughout: resolveTenantId picks
// the tenant the caller is administering, and every read/write is filtered to
// that tenant — a tenant admin can only ever see, run, or download their own
// tenant's backups. The paid add-on gate is enforced server-side here AND in
// the engine; the UI upsell state is presentation, not the gate.

function presentBackup(r: BackupRow) {
  const rowCounts = r.row_counts || {};
  return {
    id: r.id,
    status: r.status,
    backupType: r.backup_type,
    sizeBytes: r.size_bytes,
    checksumSha256: r.checksum_sha256,
    rowCounts,
    totalRows: Object.values(rowCounts).reduce((s, n) => s + (Number(n) || 0), 0),
    tableCount: Object.keys(rowCounts).length,
    storagePath: r.storage_url,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    errorMessage: r.error_message,
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read");
  if (gate) return gate;

  try {
    const tenant = resolveTenantId(req);
    const { entitled, tenantName } = await getBackupEntitlement(tenant);
    const backups = await listTenantBackups(tenant, 50);
    const presented = backups.map(presentBackup);
    return NextResponse.json({
      ok: true,
      entitled,
      upsellMessage: entitled ? null : BACKUP_UPSELL_MESSAGE,
      tenant: { id: tenant, name: tenantName },
      lastBackup: presented.find((b) => b.status === "completed") || null,
      backups: presented,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load backups" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write");
  if (gate) return gate;

  try {
    const tenant = resolveTenantId(req);
    const { entitled } = await getBackupEntitlement(tenant);
    if (!entitled) {
      return NextResponse.json({ ok: false, upsell: true, error: BACKUP_UPSELL_MESSAGE }, { status: 403 });
    }
    const result = await runTenantBackup(tenant, { source: "settings" });
    return NextResponse.json({
      ok: true,
      backup: {
        id: result.id,
        status: result.status,
        sizeBytes: result.sizeBytes,
        totalRows: result.totalRows,
        tableCount: result.tableCount,
        storagePath: result.storagePath,
        completedAt: result.completedAt,
      },
      message: `Backup completed — ${result.tableCount} tables, ${result.totalRows.toLocaleString()} rows archived.`,
    });
  } catch (e: any) {
    if (e instanceof BackupNotEntitledError) {
      return NextResponse.json({ ok: false, upsell: true, error: BACKUP_UPSELL_MESSAGE }, { status: 403 });
    }
    return NextResponse.json(
      { ok: false, error: e?.message || "Backup failed", backupId: e?.backupId || null },
      { status: 500 },
    );
  }
}

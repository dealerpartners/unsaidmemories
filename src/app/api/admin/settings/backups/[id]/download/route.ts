import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { resolveTenantId } from "@/lib/admin-api";
import { signBackupDownload } from "@/lib/backups/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/settings/backups/[id]/download — a 1-hour signed URL for a
// completed backup archive. The backup is looked up by id AND the caller's
// resolved tenant: another tenant's backup id returns 404, never a URL.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("administration", "read");
  if (gate) return gate;

  try {
    const { id } = await params;
    const tenant = resolveTenantId(req);
    const { url, expiresIn } = await signBackupDownload(tenant, id);
    return NextResponse.json({ ok: true, url, expiresIn });
  } catch (e: any) {
    const msg = e?.message || "Failed to create download link";
    const status = /not found/i.test(msg) ? 404 : /not downloadable/i.test(msg) ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { isMissingSyncJobsTable, listSyncJobs } from "@/lib/sync/jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// GET /api/admin/sync-jobs — the sync triangle's record set, read for the
// admin surface: recent sync_jobs for this tenant (newest first), with each
// job's lifecycle state, attempts, and last error. This is the operator's
// proof surface for "did the sync actually happen."
//
// While migration 20261080 is unapplied the table does not exist; the
// route answers 200 with migrationPending: true and an empty list — an
// explicit pending state, never a fabricated job list.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("products_services", "read")
  if (gate) return gate

  const limitRaw = Number(new URL(req.url).searchParams.get("limit") || 50)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50

  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const jobs = await listSyncJobs(c as any, tenant, limit)
      return NextResponse.json({ jobs, migrationPending: false })
    })
    return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    if (isMissingSyncJobsTable(e)) {
      return NextResponse.json({ jobs: [], migrationPending: true })
    }
    throw e
  }
}

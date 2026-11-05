import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import {
  getQueueHealth, listJobFailures, listDeadLetters, getIngestQuarantine,
} from "@/lib/support/ops"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ===========================================================================
// GET /api/admin/support/ops — the desk's §13 operations surface:
// queue health over support_jobs, failure + dead-letter inspection, and
// the failed-ingest quarantine view. READ-ONLY: queued jobs are claimed
// and retried by the §13 consumer (jobs.ts, driven by the sweep and
// /api/cron/support-jobs) — retry discipline is automatic, so no manual
// requeue action is offered here.
//
// Scoping: job rows are tenant-stamped by every writer today. A
// franchisee reads only its own tenant's jobs. The MASTER tenant's desk
// may pass scope=all — the same widening condition the ticket queue and
// §17 reporting use — to read the platform-wide ledger (rows carry their
// tenantId so nothing is silently merged). Gated on the 'support'
// module (read), like every desk surface.
// ===========================================================================

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate

  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const scopeAll =
      req.nextUrl.searchParams.get("scope") === "all" &&
      tenant === (process.env.SUPABASE_TENANT_ID || "")

    const health = await getQueueHealth(c, tenant, scopeAll)
    const failures = await listJobFailures(c, tenant, scopeAll)
    const deadLetters = await listDeadLetters(c, tenant, scopeAll)
    const quarantine = await getIngestQuarantine(c, tenant, scopeAll)

    return NextResponse.json({
      scope: scopeAll ? "all" : "tenant",
      tenantId: tenant,
      health,
      failures,
      deadLetters,
      quarantine,
    })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

// §9 Actions & Approvals — the tenant-wide approvals queue: actions
// pending decision (oldest first) and the most recently decided, with
// the caller's authority and the tenant's threshold line. The desk's
// /admin/messages/approvals page reads here; decisions themselves go
// through the per-ticket decide route.

import { NextRequest, NextResponse } from "next/server"
import { withPg } from "@/lib/crm/enterprise"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { resolveActingStaff } from "@/lib/support/actor"
import {
  listActionsByStatus, getSupportAuthority, resolveApprovalLineCents,
} from "@/lib/support/approvals"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("support", "read")
  if (denied) return denied
  const tenantId = resolveTenantId(req)
  try {
    const __out = await withPg(async (c) => {
      const userId = await getActorIdFromRequest(req)
      const staff = userId ? await resolveActingStaff() : null
      const [pending, executed, rejected, failed, authority, thresholdCents] = await Promise.all([
        listActionsByStatus(c as any, tenantId, "requested", 100),
        listActionsByStatus(c as any, tenantId, "executed", 25),
        listActionsByStatus(c as any, tenantId, "rejected", 25),
        listActionsByStatus(c as any, tenantId, "failed", 25),
        getSupportAuthority(c as any, tenantId, staff?.staffId ?? null),
        resolveApprovalLineCents(c as any, tenantId),
      ])
      const decided = [...executed, ...rejected, ...failed]
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .slice(0, 25)
      return NextResponse.json({ pending, decided, authority, thresholdCents })
    });
    return __out ?? NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  } catch (error) {
    console.error("[api/admin/support/actions]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}

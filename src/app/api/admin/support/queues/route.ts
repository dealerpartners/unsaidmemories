import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import {
  canWriteQueue, createQueue, listQueuesForStaff, QueueError,
  type SupportQueueView,
} from "@/lib/support/queues"
import { resolveActingStaff } from "@/lib/support/actor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/queues — §10 SAVED VIEWS over the desk queue.
//   GET  → the views this staffer can see (master globals, tenant
//          globals, their teams', their own), each with canWrite so
//          the desk rail renders edit affordances only where real.
//   POST → create a tenant view { name, filter, ownerType,
//          ownerTeamId?, isShared?, sortOrder? }. The filter is
//          validated against the desk's own filter vocabulary in the
//          lib — a view can never carry a filter the desk can't apply.
// ============================================================================

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const staff = await resolveActingStaff()
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const views = await listQueuesForStaff(c, tenant, staff?.staffId ?? null)
    const withRights: (SupportQueueView & { canWrite: boolean })[] = []
    for (const v of views) {
      withRights.push({
        ...v,
        canWrite: staff ? await canWriteQueue(c, tenant, staff.staffId, v) : false,
      })
    }
    return NextResponse.json({ views: withRights })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const payload = await req.json().catch(() => null)
  if (!payload) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  const staff = await resolveActingStaff()
  const ownerType = payload.ownerType === "team" || payload.ownerType === "global"
    ? payload.ownerType : "personal"
  if (ownerType === "personal" && !staff) {
    return NextResponse.json(
      { ok: false, error: "A personal view needs a signed-in staff identity" },
      { status: 400 },
    )
  }
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    try {
      const view = await createQueue(c, tenant, staff?.staffId ?? "", {
        name: String(payload.name || ""),
        filter: payload.filter ?? {},
        ownerType,
        ownerTeamId: payload.ownerTeamId ?? null,
        isShared: payload.isShared === true,
        sortOrder: typeof payload.sortOrder === "number" ? payload.sortOrder : undefined,
      })
      return NextResponse.json({ ok: true, view })
    } catch (e: any) {
      if (e instanceof QueueError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
      }
      throw e
    }
  })
  return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
}

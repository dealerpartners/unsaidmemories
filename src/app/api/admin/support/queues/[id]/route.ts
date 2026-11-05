import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import {
  canWriteQueue, deleteQueue, getQueue, QueueError, updateQueue,
} from "@/lib/support/queues"
import { resolveActingStaff } from "@/lib/support/actor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/queues/[id]
//   PATCH  → rename / refilter / share / reorder a view the caller
//            can write (owner, team member, or tenant global).
//            Master-scope and master-locked views are read-only here.
//   DELETE → remove a writable tenant view.
// ============================================================================

async function ctxId(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return id
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const id = await ctxId(ctx)
  const payload = await req.json().catch(() => null)
  if (!payload) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  const staff = await resolveActingStaff()
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const view = await getQueue(c, tenant, id)
    if (!view) return NextResponse.json({ ok: false, error: "View not found" }, { status: 404 })
    if (!staff || !(await canWriteQueue(c, tenant, staff.staffId, view))) {
      return NextResponse.json(
        { ok: false, error: "This view is read-only for you (master-defined, master-locked, or owned by someone else)" },
        { status: 403 },
      )
    }
    try {
      const updated = await updateQueue(c, tenant, id, {
        name: payload.name,
        filter: payload.filter,
        isShared: payload.isShared,
        sortOrder: payload.sortOrder,
      })
      return NextResponse.json({ ok: true, view: updated })
    } catch (e: any) {
      if (e instanceof QueueError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
      }
      throw e
    }
  })
  return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const id = await ctxId(ctx)
  const staff = await resolveActingStaff()
  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const view = await getQueue(c, tenant, id)
    if (!view) return NextResponse.json({ ok: false, error: "View not found" }, { status: 404 })
    if (!staff || !(await canWriteQueue(c, tenant, staff.staffId, view))) {
      return NextResponse.json(
        { ok: false, error: "This view is read-only for you (master-defined, master-locked, or owned by someone else)" },
        { status: 403 },
      )
    }
    const removed = await deleteQueue(c, tenant, id)
    return NextResponse.json({ ok: removed })
  })
  return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
}

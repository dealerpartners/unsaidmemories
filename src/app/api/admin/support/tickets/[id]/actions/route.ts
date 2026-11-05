// §9 Actions & Approvals — the ticket's action record (tree lines
// 147–150). GET lists the ticket's support_actions rows with the
// caller's approval authority and the tenant's threshold line; POST
// requests an action. The lib decides the flow: approver authority or
// under-threshold self-approves and executes in one call; otherwise
// the row lands 'requested' pending an approver. Thin route; the
// record, gate, and executors live in src/lib/support/approvals.ts.

import { NextRequest, NextResponse } from "next/server"
import { withPg } from "@/lib/crm/enterprise"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { getTicketById } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import {
  listTicketActions, requestSupportAction, getSupportAuthority,
  resolveApprovalLineCents, SupportActionError, type SupportActionActor,
} from "@/lib/support/approvals"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function actorFor(req: NextRequest, tenantId: string): Promise<SupportActionActor> {
  const userId = await getActorIdFromRequest(req)
  const staff = userId ? await resolveActingStaff() : null
  return {
    userId,
    staffId: staff?.staffId ?? null,
    name: staff?.name ?? staff?.email ?? (userId ? "Admin" : "System"),
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  }
}

function fail(error: unknown) {
  if (error instanceof SupportActionError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error("[api/admin/support/tickets/[id]/actions]", error)
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Internal server error" },
    { status: 500 },
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireModuleApi("support", "read")
  if (denied) return denied
  const tenantId = resolveTenantId(req)
  const { id } = await params
  try {
    const __out = await withPg(async (c) => {
      const ticket = await getTicketById(c as any, tenantId, id)
      if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
      const actor = await actorFor(req, tenantId)
      const [actions, authority, thresholdCents] = await Promise.all([
        listTicketActions(c as any, tenantId, id),
        getSupportAuthority(c as any, tenantId, actor.staffId),
        resolveApprovalLineCents(c as any, tenantId),
      ])
      return NextResponse.json({ actions, authority, thresholdCents })
    });
    return __out ?? NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  } catch (error) {
    return fail(error)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireModuleApi("support", "write")
  if (denied) return denied
  const tenantId = resolveTenantId(req)
  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }
  try {
    const __out = await withPg(async (c) => {
      const ticket = await getTicketById(c as any, tenantId, id)
      if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
      const actor = await actorFor(req, tenantId)
      const authority = await getSupportAuthority(c as any, tenantId, actor.staffId)
      const result = await requestSupportAction(c as any, tenantId, ticket, {
        actionType: String(body.actionType ?? ""),
        targetRef: body.targetRef != null ? String(body.targetRef) : null,
        amount: body.amount != null && body.amount !== "" ? Number(body.amount) : null,
        idempotencyKey: body.idempotencyKey != null ? String(body.idempotencyKey) : null,
        note: body.note != null ? String(body.note) : null,
      }, actor, authority)
      return NextResponse.json({ ok: true, ...result })
    });
    return __out ?? NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  } catch (error) {
    return fail(error)
  }
}

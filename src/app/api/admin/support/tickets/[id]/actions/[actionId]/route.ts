// §9 Actions & Approvals — decide a pended request (approve /
// reject). Approve runs the action through the lib's single
// approve-and-execute path; reject records the reason and the action
// never executes. Approver authority (support at full level, or the
// owner role — 'support.actions_approve') is enforced in the lib;
// a requester can never decide their own request.

import { NextRequest, NextResponse } from "next/server"
import { withPg } from "@/lib/crm/enterprise"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { getTicketById } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import {
  decideSupportAction, getSupportAuthority, SupportActionError,
  type SupportActionActor,
} from "@/lib/support/approvals"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; actionId: string }> },
) {
  const denied = await requireModuleApi("support", "write")
  if (denied) return denied
  const tenantId = resolveTenantId(req)
  const { id, actionId } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const decision = body.decision === "approve" ? "approve" : body.decision === "reject" ? "reject" : null
  if (!decision) return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 })
  try {
    const __out = await withPg(async (c) => {
      const ticket = await getTicketById(c as any, tenantId, id)
      if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
      const userId = await getActorIdFromRequest(req)
      const staff = userId ? await resolveActingStaff() : null
      const actor: SupportActionActor = {
        userId,
        staffId: staff?.staffId ?? null,
        name: staff?.name ?? staff?.email ?? (userId ? "Admin" : "System"),
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
      }
      const authority = await getSupportAuthority(c as any, tenantId, actor.staffId)
      const action = await decideSupportAction(
        c as any, tenantId, ticket, actionId, decision,
        body.reason != null && String(body.reason).trim() ? String(body.reason).trim().slice(0, 1000) : null,
        actor, authority,
      )
      return NextResponse.json({ ok: true, action })
    });
    return __out ?? NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[api/admin/support/tickets/[id]/actions/[actionId]]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}

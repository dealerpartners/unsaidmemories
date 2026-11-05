// §12 Notifications — the desk-side read surface for the signed-in
// staffer's OWN support_notifications (mentions, assignments, SLA
// warnings, escalations — the single path in lib/support/notifications).
//
// Same contract the employee Support surface established
// (api/employee/modules/support/notifications): GET → { notifications,
// unread }; PATCH { id } | { all: true } → { ok, marked }. Rows are
// predicated on the tenant AND the caller's own staff id in every
// statement — a person reads and marks only what was addressed to
// them. Mark-read is the caller's own inbox state, so both verbs sit
// behind the desk's read gate (the employee surface's precedent).
//
// A caller with no crm_staff row (a platform admin working the desk
// without a staff identity) has no personal inbox: GET answers an
// honest empty list rather than someone else's notifications.

import { NextRequest, NextResponse } from "next/server"
import { withPg } from "@/lib/crm/enterprise"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { resolveActingStaff } from "@/lib/support/actor"
import {
  listStaffNotifications, markStaffNotificationsRead,
} from "@/lib/support/notifications"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("support", "read")
  if (denied) return denied
  const tenantId = resolveTenantId(req)
  const limit = parseInt(new URL(req.url).searchParams.get("limit") || "50", 10) || 50
  try {
    const __out = await withPg(async (c) => {
      const staff = await resolveActingStaff()
      if (!staff) return NextResponse.json({ notifications: [], unread: 0, staff: null })
      const { notifications, unread } = await listStaffNotifications(
        c as any, tenantId, staff.staffId, limit,
      )
      return NextResponse.json({
        notifications, unread,
        staff: { staffId: staff.staffId, name: staff.name },
      })
    });
    return __out ?? NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  } catch (error) {
    console.error("[api/admin/support/notifications GET]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("support", "read")
  if (denied) return denied
  const tenantId = resolveTenantId(req)
  const payload = await req.json().catch(() => null)
  const id = typeof payload?.id === "string" ? payload.id : null
  const all = payload?.all === true
  if (!id && !all) {
    return NextResponse.json({ ok: false, error: "id or all:true is required" }, { status: 400 })
  }
  try {
    const __out = await withPg(async (c) => {
      const staff = await resolveActingStaff()
      if (!staff) return NextResponse.json({ ok: true, marked: 0 })
      const marked = await markStaffNotificationsRead(
        c as any, tenantId, staff.staffId, all ? { all: true } : { id: id as string },
      )
      return NextResponse.json({ ok: true, marked })
    });
    return __out ?? NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  } catch (error) {
    console.error("[api/admin/support/notifications PATCH]", error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { mapTicket } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// GET /api/admin/support/tickets — the Support Desk queue.
// Platform-wide: every user type's tickets in one queue (customer,
// employee, seller, vet, pharmacy, franchise, external/DMCA), tenant-
// scoped, gated on the 'support' module. Server-side faceted filtering,
// sorting, and pagination over the real support_tickets rows — the desk
// table is an enterprise grid, so the counts it shows are computed with
// the same filters it lists (minus the status facet, per convention).
// ============================================================================

const SORTS: Record<string, string> = {
  recent: "COALESCE(t.last_message_at, t.created_at) DESC",
  oldest: "COALESCE(t.last_message_at, t.created_at) ASC",
  created_desc: "t.created_at DESC",
  created_asc: "t.created_at ASC",
  priority: "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END ASC, COALESCE(t.last_message_at, t.created_at) DESC",
  sla: "COALESCE(t.resolution_due_at, t.first_response_due_at) ASC NULLS LAST, t.created_at ASC",
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate

  const sp = req.nextUrl.searchParams
  const status = sp.get("status") || ""
  const type = sp.get("type") || ""
  const category = sp.get("category") || ""
  const priority = sp.get("priority") || ""
  const assignee = sp.get("assignee") || ""
  const q = (sp.get("q") || "").trim()
  const sort = SORTS[sp.get("sort") || "recent"] || SORTS.recent
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20", 10) || 20))

  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const me = assignee === "me" ? await resolveActingStaff() : null

    // Franchise model: a tenant's desk is scoped to that tenant. The
    // MASTER tenant's desk may widen to scope=all — every ticket across
    // tenants, with the owning tenant named on each row.
    const scopeAll = sp.get("scope") === "all" && tenant === (process.env.SUPABASE_TENANT_ID || "")

    // Shared facet filters (everything except status — status gets counts).
    // §5: a tenant's queue also carries tickets shared INTO it by an
    // ACTIVE access grant (marked accessGrantLevel on the row). With
    // no grants the EXISTS is empty and the queue is exactly as
    // before; scope=all (master) already sees every ticket.
    const where: string[] = scopeAll
      ? ["TRUE"]
      : [`(t.tenant_id = $1 OR EXISTS (SELECT 1 FROM public.support_ticket_access_grants g
            WHERE g.ticket_id = t.id AND g.grantee_tenant_id = $1 AND g.revoked_at IS NULL))`]
    const args: any[] = scopeAll ? [] : [tenant]
    const grantLevelExpr = scopeAll
      ? "NULL::text AS grant_level"
      : `(CASE WHEN t.tenant_id = $1 THEN NULL ELSE
          (SELECT g.level FROM public.support_ticket_access_grants g
            WHERE g.ticket_id = t.id AND g.grantee_tenant_id = $1 AND g.revoked_at IS NULL
            ORDER BY g.granted_at DESC LIMIT 1) END) AS grant_level`
    if (type) { args.push(type); where.push(`t.requester_type = $${args.length}`) }
    if (category) { args.push(category); where.push(`t.category = $${args.length}`) }
    if (priority) { args.push(priority); where.push(`t.priority = $${args.length}`) }
    if (assignee === "unassigned") where.push("t.assigned_staff_id IS NULL")
    else if (assignee === "me") {
      if (me) { args.push(me.staffId); where.push(`t.assigned_staff_id = $${args.length}::uuid`) }
      else where.push("FALSE") // "mine" with no staff profile = none
    } else if (assignee) { args.push(assignee); where.push(`t.assigned_staff_id = $${args.length}::uuid`) }
    if (q) {
      args.push(`%${q}%`)
      where.push(`(t.subject ILIKE $${args.length} OR t.ticket_ref ILIKE $${args.length} OR t.requester_name ILIKE $${args.length} OR t.requester_email ILIKE $${args.length})`)
    }
    const facetWhere = where.join(" AND ")

    const counts = await c.query(
      `SELECT status, COUNT(*)::int AS n FROM public.support_tickets t WHERE ${facetWhere} GROUP BY status`,
      args,
    )
    const byStatus: Record<string, number> = { open: 0, pending: 0, resolved: 0, closed: 0 }
    for (const r of counts.rows as any[]) byStatus[r.status] = r.n

    const listWhere = status ? `${facetWhere} AND t.status = $${args.length + 1}` : facetWhere
    const listArgs = status ? [...args, status] : args
    const totalRes = await c.query(
      `SELECT COUNT(*)::int AS n FROM public.support_tickets t WHERE ${listWhere}`,
      listArgs,
    )
    const total = totalRes.rows[0]?.n ?? 0

    const rows = await c.query(
      `SELECT t.id::text AS id, t.tenant_id::text AS tenant_id, tn.name AS tenant_name, t.ticket_ref, t.requester_type,
              t.requester_customer_id::text AS requester_customer_id,
              t.requester_staff_id::text AS requester_staff_id,
              t.requester_seller_id::text AS requester_seller_id,
              t.requester_user_id::text AS requester_user_id,
              t.requester_name, t.requester_email, t.subject, t.category,
              t.status, t.priority,
              t.assigned_staff_id::text AS assigned_staff_id,
              a.display_name AS assignee_name,
              t.visibility_level,
              t.assigned_team_id::text AS assigned_team_id,
              tm.name AS team_name,
              t.sla_policy_id::text AS sla_policy_id,
              t.first_response_due_at::text AS first_response_due_at,
              t.next_reply_due_at::text AS next_reply_due_at,
              t.resolution_due_at::text AS resolution_due_at,
              t.first_response_breached_at::text AS first_response_breached_at,
              t.resolution_breached_at::text AS resolution_breached_at,
              t.conversation_id::text AS conversation_id,
              ${grantLevelExpr},
              t.first_public_reply_at::text AS first_public_reply_at,
              t.merged_into_id::text AS merged_into_id,
              t.last_message_at::text AS last_message_at,
              t.resolved_at::text AS resolved_at, t.closed_at::text AS closed_at,
              t.created_at::text AS created_at, t.updated_at::text AS updated_at,
              (SELECT COUNT(*)::int FROM public.crm_messages m WHERE m.conversation_id = t.conversation_id) AS message_count,
              (SELECT m.body FROM public.crm_messages m WHERE m.conversation_id = t.conversation_id
                ORDER BY COALESCE(m.sent_at, m.created_at) DESC LIMIT 1) AS last_message_preview
         FROM public.support_tickets t
         LEFT JOIN public.crm_staff a ON a.id = t.assigned_staff_id
         LEFT JOIN public.support_teams tm ON tm.id = t.assigned_team_id
         LEFT JOIN public.tenants tn ON tn.id = t.tenant_id
        WHERE ${listWhere}
        ORDER BY ${sort}
        LIMIT $${listArgs.length + 1} OFFSET $${listArgs.length + 2}`,
      [...listArgs, pageSize, (page - 1) * pageSize],
    )

    const assignees = await c.query(
      `SELECT id::text AS id, display_name, role FROM public.crm_staff
        WHERE tenant_id = $1 AND is_active ORDER BY display_name ASC`,
      [tenant],
    )

    return NextResponse.json({
      tickets: rows.rows.map((r: any) => ({
        ...mapTicket(r),
        accessGrantLevel: r.grant_level ?? null,
        tenantName: r.tenant_name ?? null,
        assigneeName: r.assignee_name ?? null,
        messageCount: r.message_count ?? 0,
        lastMessagePreview: r.last_message_preview ?? null,
        // Engine state (rewire): the queue renders SLA + visibility
        // from the ticket's real stamped fields — no computed fiction.
        visibilityLevel: r.visibility_level ?? "standard",
        assignedTeamId: r.assigned_team_id ?? null,
        teamName: r.team_name ?? null,
        slaPolicyId: r.sla_policy_id ?? null,
        firstResponseDueAt: r.first_response_due_at ?? null,
        nextReplyDueAt: r.next_reply_due_at ?? null,
        resolutionDueAt: r.resolution_due_at ?? null,
        firstResponseBreachedAt: r.first_response_breached_at ?? null,
        resolutionBreachedAt: r.resolution_breached_at ?? null,
      })),
      total,
      page,
      pageSize,
      counts: byStatus,
      assignees: assignees.rows,
    })
  })

  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

// ===========================================================================
// POST /api/admin/support/tickets — create a ticket from the desk (the
// v2 comp's New Ticket modal). Runs the same engine createTicket() the
// public intake uses: real conversation row, contact resolution, SLA
// stamping. Body: { subject, requesterName?, requesterEmail?, priority?,
// channel?, teamId? }.
// ===========================================================================

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const body = await req.json().catch(() => null)
  const subject = String(body?.subject ?? "").trim()
  if (!subject) return NextResponse.json({ ok: false, error: "A subject is required" }, { status: 400 })
  const { createTicket } = await import("@/lib/support/tickets")
  try {
    const { withPgStrict } = await import("@/lib/crm/enterprise")
    const ticket = await withPgStrict(async (c) => createTicket(c, resolveTenantId(req), {
      requesterType: "customer",
      requesterName: body?.requesterName ? String(body.requesterName) : null,
      requesterEmail: body?.requesterEmail ? String(body.requesterEmail) : null,
      subject,
      priority: ["low", "normal", "high", "urgent"].includes(body?.priority) ? body.priority : "normal",
      channel: body?.channel ? String(body.channel) : "email",
    } as any))
    return NextResponse.json({ ok: true, ticket: mapTicket(ticket as any) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Create failed" }, { status: 500 })
  }
}

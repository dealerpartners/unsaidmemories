import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById, logTicketEvent } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import {
  RegulatedError, listCounterNotices, listStrikes, listTakedownLog,
  recordDmcaTransition, rescindStrike, stampCounterNotice, type RegulatedActor,
} from "@/lib/support/regulated"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET  /api/admin/support/tickets/[id]/dmca — the full §6 case file:
//   the dmca_details row, its counter notices, its strikes, and the
//   append-only takedown log.
// POST /api/admin/support/tickets/[id]/dmca — advance the DMCA
//   sub-workflow on a dmca_details row (needs_info → under_review →
//   actioned_takedown → uploader_notified → counter_notice_window →
//   restored / closed). Enforcement itself (unpublishing a listing)
//   stays with the existing moderation/Trust & Safety paths — this
//   endpoint records the workflow state and its dated stamps on the
//   case file, and resolves the target seller/listing during review.
//   If a takedown becomes a seller violation, staff open the
//   governance case in the Trust Center; this ticket remains the
//   communication record.
//
//   B2 additions: every material transition also appends to the
//   append-only dmca_takedown_log; actioned_takedown stamps
//   takedown_at/takedown_by (§6 columns), snapshots the target, and
//   issues the seller's strike — at the repeat-infringer threshold
//   the strike opens a governance case in seller_violations (the
//   suspension itself stays a Trust Center act). restored stamps
//   restored_by. Two desk actions ride the same POST:
//     { counterNoticeAction: { id, action: 'forward' | 'suit_notice' } }
//       — forward stamps the counter notice and computes the §512(g)
//         restore window (10–14 business days) on the case; suit_notice
//         records the complainant's court filing.
//     { rescindStrikeId } — rescinds an active strike on this ticket.

const WORKFLOW = [
  "needs_info", "under_review", "actioned_takedown", "rejected_no_action",
  "uploader_notified", "counter_notice_window", "restored", "closed_no_restore", "closed",
]

async function actorFor(req: NextRequest): Promise<RegulatedActor> {
  const staff = await resolveActingStaff()
  return {
    userId: await getActorIdFromRequest(req),
    staffId: staff?.staffId ?? null,
    ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
    userAgent: req.headers.get("user-agent"),
  }
}

function fail(e: unknown) {
  if (e instanceof RegulatedError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
  }
  const msg = e instanceof Error ? e.message : String(e)
  if (/violates|duplicate key|invalid input/i.test(msg)) {
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
  console.error("[support-dmca] write failed:", msg)
  return NextResponse.json({ ok: false, error: "DMCA write failed" }, { status: 500 })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const { id } = await ctx.params

  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const ticket = await getTicketById(c, tenant, id)
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    const cur = await c.query(
      `SELECT * FROM public.dmca_details WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
      [tenant, ticket.id],
    )
    if (cur.rows.length === 0) {
      return NextResponse.json({ error: "Ticket has no DMCA details" }, { status: 404 })
    }
    const [counterNotices, strikes, takedownLog] = await Promise.all([
      listCounterNotices(c, tenant, ticket.id),
      listStrikes(c, tenant, ticket.id),
      listTakedownLog(c, tenant, ticket.id),
    ])
    return NextResponse.json({ dmca: cur.rows[0], counterNotices, strikes, takedownLog })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id } = await ctx.params
  const payload = await req.json().catch(() => null)
  if (!payload) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
  const staff = await resolveActingStaff()
  const actor = await actorFor(req)

  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const ticket = await getTicketById(c, tenant, id)
      if (!ticket) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 })
      const cur = await c.query(
        `SELECT * FROM public.dmca_details WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
        [tenant, ticket.id],
      )
      if (cur.rows.length === 0) {
        return NextResponse.json({ ok: false, error: "Ticket has no DMCA details" }, { status: 404 })
      }
      const d = cur.rows[0] as any

      // ── Desk action: counter-notice forward / suit notice ──────
      if (payload.counterNoticeAction) {
        const { id: cnId, action } = payload.counterNoticeAction as { id?: string; action?: string }
        if (!cnId || (action !== "forward" && action !== "suit_notice")) {
          return NextResponse.json({ ok: false, error: "counterNoticeAction requires an id and action 'forward' | 'suit_notice'" }, { status: 400 })
        }
        const res = await stampCounterNotice(c, tenant, ticket, d, cnId, action, actor)
        await logTicketEvent(c, tenant, ticket.id, {
          type: "dmca_updated", actorStaffId: staff?.staffId ?? null, actorLabel: staff?.name ?? null,
          detail: { counterNoticeId: cnId, action, restoreWindow: res.restoreWindow },
        }).catch(() => {})
        const after = await c.query(
          `SELECT * FROM public.dmca_details WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
          [tenant, ticket.id],
        )
        return NextResponse.json({ ok: true, counterNotice: res.counterNotice, restoreWindow: res.restoreWindow, dmca: after.rows[0] })
      }

      // ── Desk action: rescind a strike ────────────────────────────
      if (payload.rescindStrikeId) {
        const strike = await rescindStrike(c, tenant, ticket, String(payload.rescindStrikeId), actor)
        await logTicketEvent(c, tenant, ticket.id, {
          type: "dmca_updated", actorStaffId: staff?.staffId ?? null, actorLabel: staff?.name ?? null,
          detail: { strikeRescinded: String(payload.rescindStrikeId) },
        }).catch(() => {})
        return NextResponse.json({ ok: true, strike, dmca: d })
      }

      // ── Workflow advance ─────────────────────────────────────────
      // args[0] = tenant ($1), args[1] = ticket ($2); pushed values
      // take $3… in order.
      const sets: string[] = ["updated_at = now()", "row_version = row_version + 1"]
      const args: any[] = [tenant, ticket.id]
      if (payload.workflowStatus !== undefined) {
        if (!WORKFLOW.includes(payload.workflowStatus)) {
          return NextResponse.json({ ok: false, error: `Unknown workflow status "${payload.workflowStatus}"` }, { status: 400 })
        }
        args.push(payload.workflowStatus); sets.push(`workflow_status = $${args.length}`)
        if (payload.workflowStatus !== "under_review" && payload.workflowStatus !== "needs_info") {
          sets.push("reviewed_at = COALESCE(reviewed_at, now())")
        }
        if (payload.workflowStatus === "actioned_takedown") {
          sets.push("actioned_at = now()", "takedown_at = now()")
          if (staff?.staffId) { args.push(staff.staffId); sets.push(`takedown_by = $${args.length}::uuid`) }
        }
        if (payload.workflowStatus === "uploader_notified") sets.push("uploader_notified_at = now()")
        if (payload.workflowStatus === "restored") {
          sets.push("restored_at = now()")
          if (staff?.staffId) { args.push(staff.staffId); sets.push(`restored_by = $${args.length}::uuid`) }
        }
        if (payload.workflowStatus === "counter_notice_window" && payload.counterNoticeDueAt) {
          args.push(payload.counterNoticeDueAt); sets.push(`counter_notice_due_at = $${args.length}::timestamptz`)
        }
      }
      if (payload.targetSellerId !== undefined) {
        if (payload.targetSellerId === null) sets.push("target_seller_id = NULL")
        else { args.push(payload.targetSellerId); sets.push(`target_seller_id = $${args.length}::uuid`) }
      }
      if (payload.targetListingRef !== undefined) {
        args.push(payload.targetListingRef || null); sets.push(`target_listing_ref = $${args.length}`)
      }

      await c.query(
        `UPDATE public.dmca_details SET ${sets.join(", ")} WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
        args,
      )
      await logTicketEvent(c, tenant, ticket.id, {
        type: "dmca_updated", actorStaffId: staff?.staffId ?? null, actorLabel: staff?.name ?? null,
        detail: {
          from: d.workflow_status, to: payload.workflowStatus ?? d.workflow_status,
          targetSellerId: payload.targetSellerId ?? d.target_seller_id,
          targetListingRef: payload.targetListingRef ?? d.target_listing_ref,
        },
      }).catch(() => {})

      const after = await c.query(
        `SELECT * FROM public.dmca_details WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid`,
        [tenant, ticket.id],
      )
      const afterRow = after.rows[0] as any
      // §6 transition effects: takedown log, target snapshot, strike.
      const effects = await recordDmcaTransition(c, tenant, ticket, d, afterRow, actor)
        .catch((e) => { console.error("[support-dmca] transition effects failed:", e); return { strike: null } })

      return NextResponse.json({ ok: true, dmca: afterRow, strike: effects.strike })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

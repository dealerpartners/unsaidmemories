import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit"
import { notifySeller } from "@/lib/sellers/notify"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// A2 · Seller Verification + B4 · Brand Registry — the admin decision desk
// for the two queues sellers file into from their own portal:
//
//   1. verification_tasks (seller-keyed) — the KYC filings from seller
//      onboarding: Step 4 files 'business_verification' (the bank-grade
//      packet summary rides in the task's notes), Step 9 files
//      'tax_verification'. Tasks are filed with status 'pending'.
//   2. seller_brand_authorizations — brand declarations (Sunny's ruling:
//      sellers declare the brands they want to sell; the platform verifies
//      and authorizes — that decision is the no-Amazon control). Filed as
//      'pending'; the store's status CHECK is
//      pending / approved / rejected / expired, and the seller's listing
//      gate opens only on an approved, in-window row.
//
// Decisions stamp the row itself (status + reviewed_by + reviewed_at) —
// that IS the state the seller reads back (data graph A1/A2: seller
// submits → admin reviews; the contract is bidirectional). A rejection
// carries its reason on the channel the seller's read consumes:
//   - tasks: appended to the task's notes (the seller's onboarding read
//     and health & compliance surface render status + notes).
//   - brand authorizations: the row has NO seller-visible reason field,
//     so the reason rides a seller_notifications row (the store the
//     seller's notification reader consumes), typed 'brand_authorization'.
//
// Tenancy: verification_tasks carries tenant_id (a predicate in every
// statement). seller_brand_authorizations carries NO tenant_id — tenancy
// flows through the sellers row, so every brand statement joins sellers
// and predicates on sellers.tenant_id.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SELLER_SNIPPET = `
  s.id AS seller_id, s.display_name AS seller_display_name,
  s.legal_name AS seller_legal_name, s.email AS seller_email,
  s.seller_type, s.status AS seller_status
`

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read")
  if (denied) return denied
  const tenant = resolveTenantId(req)

  const out = await withPg(async (c) => {
    const tasks = (
      await c.query(
        `SELECT t.id, t.task_type, t.status, t.evidence_url, t.notes, t.created_at,
                ${SELLER_SNIPPET}
           FROM public.verification_tasks t
           JOIN public.sellers s
             ON s.id = t.seller_id AND s.tenant_id = t.tenant_id
          WHERE t.tenant_id = $1 AND t.status = 'pending'
          ORDER BY t.created_at ASC
          LIMIT 100`,
        [tenant],
      )
    ).rows
    const brands = (
      await c.query(
        `SELECT a.id, a.brand_id, a.authorization_type, a.evidence_url, a.status,
                a.proof_type, a.ticket_ref,
                a.created_at, b.name AS brand_name, ${SELLER_SNIPPET}
           FROM public.seller_brand_authorizations a
           JOIN public.sellers s ON s.id = a.seller_id
           JOIN public.brands b ON b.id = a.brand_id AND b.tenant_id = $1
          WHERE s.tenant_id = $1 AND a.status = 'pending'
          ORDER BY a.created_at ASC
          LIMIT 100`,
        [tenant],
      )
    ).rows
    const decidedTasks = (
      await c.query(
        `SELECT t.id, t.task_type, t.status, t.reviewed_at, t.created_at,
                ${SELLER_SNIPPET}
           FROM public.verification_tasks t
           JOIN public.sellers s
             ON s.id = t.seller_id AND s.tenant_id = t.tenant_id
          WHERE t.tenant_id = $1 AND t.status <> 'pending'
          ORDER BY t.reviewed_at DESC NULLS LAST
          LIMIT 15`,
        [tenant],
      )
    ).rows
    const decidedBrands = (
      await c.query(
        `SELECT a.id, a.brand_id, a.authorization_type, a.status, a.reviewed_at,
                a.proof_type, a.ticket_ref,
                a.created_at, b.name AS brand_name, ${SELLER_SNIPPET}
           FROM public.seller_brand_authorizations a
           JOIN public.sellers s ON s.id = a.seller_id
           JOIN public.brands b ON b.id = a.brand_id AND b.tenant_id = $1
          WHERE s.tenant_id = $1 AND a.status <> 'pending'
          ORDER BY a.reviewed_at DESC NULLS LAST
          LIMIT 15`,
        [tenant],
      )
    ).rows
    return {
      counts: { tasks: tasks.length, brands: brands.length },
      tasks,
      brands,
      decidedTasks,
      decidedBrands,
    }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write")
  if (denied) return denied
  const b = await req.json().catch(() => ({}))
  const tenant = resolveTenantId(req)
  const actorId = await getActorIdFromRequest(req)
  const ipAddress = requestIp(req)
  const action = typeof b.action === "string" ? b.action : ""
  const decision = typeof b.decision === "string" ? b.decision : ""
  const reason =
    typeof b.reason === "string" ? b.reason.trim().slice(0, 500) : ""
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json(
      { error: "Decision must be 'approve' or 'reject'" },
      { status: 400 },
    )
  }
  const decidedStatus = decision === "approve" ? "approved" : "rejected"

  // ---- Verification task decision (A2) -----------------------------------
  if (action === "decide_task") {
    const taskId = typeof b.task_id === "string" ? b.task_id.trim() : ""
    if (!taskId || !UUID_RE.test(taskId)) {
      return NextResponse.json({ error: "Missing task id" }, { status: 400 })
    }
    const result = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT t.id, t.seller_id, t.task_type, t.status, t.notes
           FROM public.verification_tasks t
          WHERE t.tenant_id = $1 AND t.id = $2::uuid LIMIT 1`,
        [tenant, taskId],
      )
      const task = rows[0]
      if (!task) return { error: "Verification task not found", status: 404 }
      if (task.status !== "pending") {
        return { error: `Task already decided (${task.status})`, status: 400 }
      }
      // The rejection reason rides the task's notes — the field the
      // seller's own read surfaces render next to the status.
      const notes =
        decision === "reject"
          ? [task.notes || "", `Rejected${reason ? `: ${reason}` : ""}`]
              .filter(Boolean)
              .join("\n")
          : task.notes
      const { rows: updated } = await c.query(
        `UPDATE public.verification_tasks
            SET status = $3, reviewed_by = $4::uuid, reviewed_at = now(),
                notes = $5, updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid AND status = 'pending'
          RETURNING id, status, reviewed_at`,
        [
          tenant,
          taskId,
          decidedStatus,
          actorId && UUID_RE.test(actorId) ? actorId : null,
          notes,
        ],
      )
      if (!updated[0]) return { error: "Task already decided", status: 409 }
      await writeSellerAudit(c, {
        tenantId: tenant,
        sellerId: task.seller_id,
        actorId,
        ipAddress,
        action:
          decision === "approve"
            ? "verification_task.approve"
            : "verification_task.reject",
        entityType: "verification_task",
        entityId: taskId,
        beforeState: { status: task.status, task_type: task.task_type },
        afterState: {
          status: decidedStatus,
          reason: decision === "reject" ? reason || null : null,
        },
      })
      return { ok: true, task: updated[0] }
    })
    if (!result) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    return NextResponse.json(result, {
      status: "error" in result ? result.status || 400 : 200,
    })
  }

  // ---- Brand authorization decision (B4) ---------------------------------
  if (action === "decide_brand") {
    const authId =
      typeof b.authorization_id === "string" ? b.authorization_id.trim() : ""
    if (!authId || !UUID_RE.test(authId)) {
      return NextResponse.json(
        { error: "Missing authorization id" },
        { status: 400 },
      )
    }
    const result = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT a.id, a.seller_id, a.brand_id, a.authorization_type, a.status,
                a.proof_type, a.ticket_ref,
                b.name AS brand_name
           FROM public.seller_brand_authorizations a
           JOIN public.sellers s ON s.id = a.seller_id
           JOIN public.brands b ON b.id = a.brand_id AND b.tenant_id = $2
          WHERE a.id = $1::uuid AND s.tenant_id = $2 LIMIT 1`,
        [authId, tenant],
      )
      const auth = rows[0]
      if (!auth) return { error: "Brand authorization not found", status: 404 }
      if (auth.status !== "pending") {
        return {
          error: `Authorization already decided (${auth.status})`,
          status: 400,
        }
      }
      const { rows: updated } = await c.query(
        `UPDATE public.seller_brand_authorizations a
            SET status = $3, reviewed_by = $4, reviewed_at = now(),
                valid_from = CASE WHEN $3 = 'approved'
                                  THEN COALESCE(a.valid_from, CURRENT_DATE)
                                  ELSE a.valid_from END,
                updated_at = now()
          WHERE a.id = $1::uuid AND a.status = 'pending'
            AND EXISTS (SELECT 1 FROM public.sellers s
                         WHERE s.id = a.seller_id AND s.tenant_id = $2)
          RETURNING a.id, a.status, a.reviewed_at`,
        [authId, tenant, decidedStatus, actorId || null],
      )
      if (!updated[0]) return { error: "Authorization already decided", status: 409 }
      await writeSellerAudit(c, {
        tenantId: tenant,
        sellerId: auth.seller_id,
        actorId,
        ipAddress,
        action:
          decision === "approve"
            ? "brand_authorization.approve"
            : "brand_authorization.reject",
        entityType: "seller_brand_authorization",
        entityId: authId,
        beforeState: { status: auth.status, brand_id: auth.brand_id },
        afterState: {
          status: decidedStatus,
          brand_id: auth.brand_id,
          brand_name: auth.brand_name,
          reason: decision === "reject" ? reason || null : null,
        },
      })
      // The authorization row has no seller-visible reason field, so a
      // rejection's reason rides the seller's notification store — the
      // honest channel the seller actually reads.
      if (decision === "reject") {
        // Through the comms layer (event "governance" — an
        // authorization standing decision) so preferences and the
        // email leg apply; same type/title/body/link as before.
        await notifySeller(
          {
            tenantId: tenant,
            sellerId: String(auth.seller_id),
            event: "governance",
            type: "brand_authorization",
            title: `Brand authorization rejected: ${auth.brand_name}`,
            body: reason
              ? `Your authorization to sell ${auth.brand_name} was rejected: ${reason}`
              : `Your authorization to sell ${auth.brand_name} was rejected. You can declare the brand again with new evidence from your brands page.`,
            link: "/seller/brands/authorizations",
          },
          c,
        )
      }
      // Self-serve brand gate (2026-10-22): an approval here VERIFIES
      // the authorization — the seller's listings held under this
      // brand release through the listing writers' own publish path,
      // the proof ticket's thread records the decision, and the
      // seller is told. A denial leaves the holds in place; the
      // seller can submit new proof (a fresh pending record).
      let released = { released: 0, skipped: 0 }
      if (decision === "approve") {
        const { releaseHeldBrandListings } = await import("@/lib/sellers/brand-registry")
        released = await releaseHeldBrandListings(c, tenant, String(auth.seller_id), String(auth.brand_name))
          .catch(() => ({ released: 0, skipped: 0 }))
        if (auth.ticket_ref || released.released > 0) {
          await notifySeller(
            {
              tenantId: tenant,
              sellerId: String(auth.seller_id),
              event: "governance",
              type: "brand_authorization",
              title: `Brand authorization verified: ${auth.brand_name}`,
              body: released.released > 0
                ? `Your authorization to sell ${auth.brand_name} is verified. ${released.released} held listing${released.released === 1 ? "" : "s"} released and now live.`
                : `Your authorization to sell ${auth.brand_name} is verified — you can list under this brand now.`,
              link: "/seller/brands/authorizations",
            },
            c,
          ).catch(() => null)
        }
      }
      if (auth.ticket_ref) {
        const { appendToTicketByRef } = await import("@/lib/onboarding/desk-ticket")
        await appendToTicketByRef(
          c,
          tenant,
          String(auth.ticket_ref),
          decision === "approve"
            ? `Authorization VERIFIED at the desk for ${auth.brand_name}. ${released.released} held listing(s) released${released.skipped ? `, ${released.skipped} could not be released and remain held` : ""}. The seller has been notified.`
            : `Authorization DENIED at the desk for ${auth.brand_name}${reason ? `: ${reason}` : ""}. Held listings for this brand remain on hold; the seller can submit new proof.`,
        ).catch(() => false)
      }
      return { ok: true, authorization: updated[0], released }
    })
    if (!result) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    return NextResponse.json(result, {
      status: "error" in result ? result.status || 400 : 200,
    })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

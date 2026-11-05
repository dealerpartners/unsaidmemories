import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit"
import { notifySeller } from "@/lib/sellers/notify"
import { provisionSellerGrants } from "@/lib/sellers/provisioning"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// A3 · Reinstatements — the dedicated workflow, queue, and request record
// the census found missing. The request record ALREADY has a designed
// store: seller_appeals with appeal_type 'reinstatement' (CHECK-enforced
// vocabulary, DDL 20261072; census F2 lists reinstatement requests as a
// shipped queue type). Sellers file them from their governance portal;
// an admin can also record a request here on a suspended/closed seller's
// behalf (the filing is labeled as admin-recorded in its text + audit).
//
// GET  — the queue: every reinstatement appeal (pending first), joined
//        to its seller, PLUS the eligible population with no pending
//        request: sellers in 'suspended'/'closed' whose approved_at is
//        set (prior approved history — the A1 reactivations definition).
// POST — record_request { seller_id, appeal_text } files a pending
//        reinstatement appeal for an eligible seller (one pending per
//        seller — a second filing would fork the decision).
//        decide { appeal_id, decision: 'approve'|'deny', reason? }
//        stamps the appeal exactly as the Trust & Safety appeals desk
//        stamps decisions (status + decision + decided_by + decided_at),
//        and on approve flips the seller suspended/closed → 'approved'
//        (approved_at restamped, grants provisioned — the same
//        post-approval leg the sellers route runs) and writes
//        seller_audit_log for BOTH the appeal decision and the seller
//        status flip. Deny leaves the seller's status untouched.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read")
  if (denied) return denied
  const tenant = resolveTenantId(req)

  const out = await withPg(async (c) => {
    const requests = (
      await c.query(
        `SELECT a.id::text AS id, a.seller_id::text AS seller_id, a.status,
                a.appeal_text, a.decision, a.decided_by::text AS decided_by,
                a.decided_at::text AS decided_at,
                a.created_at::text AS created_at,
                s.display_name AS seller_name, s.legal_name AS seller_legal_name,
                s.status AS seller_status, s.approved_at::text AS seller_approved_at
           FROM public.seller_appeals a
           LEFT JOIN public.sellers s ON s.id = a.seller_id AND s.tenant_id = a.tenant_id
          WHERE a.tenant_id = $1 AND a.appeal_type = 'reinstatement'
          ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'under_review' THEN 1 ELSE 2 END,
                   a.created_at ASC
          LIMIT 200`,
        [tenant],
      )
    ).rows
    const eligible = (
      await c.query(
        `SELECT s.id::text AS id, s.display_name, s.legal_name, s.email, s.status,
                s.approved_at::text AS approved_at
           FROM public.sellers s
          WHERE s.tenant_id = $1
            AND s.status IN ('suspended', 'closed')
            AND s.approved_at IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM public.seller_appeals a
               WHERE a.tenant_id = s.tenant_id AND a.seller_id = s.id
                 AND a.appeal_type = 'reinstatement'
                 AND a.status IN ('pending', 'under_review')
            )
          ORDER BY s.updated_at DESC LIMIT 100`,
        [tenant],
      )
    ).rows
    return {
      requests,
      eligible,
      counts: {
        pending: requests.filter((r: any) => r.status === "pending" || r.status === "under_review").length,
        decided: requests.filter((r: any) => r.status === "approved" || r.status === "denied").length,
        eligibleWithoutRequest: eligible.length,
      },
      note:
        requests.length === 0 && eligible.length === 0
          ? "No reinstatement requests are recorded and no suspended/closed seller with prior approved history is waiting. Requests filed by sellers in their governance portal (appeal type 'reinstatement') appear here."
          : null,
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

  if (action === "record_request") {
    const sellerId = typeof b.seller_id === "string" ? b.seller_id.trim() : ""
    if (!sellerId || !UUID_RE.test(sellerId)) {
      return NextResponse.json({ error: "Missing seller id" }, { status: 400 })
    }
    const appealText =
      typeof b.appeal_text === "string" && b.appeal_text.trim()
        ? b.appeal_text.trim().slice(0, 2000)
        : "Reinstatement requested (recorded by admin on the seller's behalf)."
    const result = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT id, status, approved_at FROM public.sellers
          WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
        [tenant, sellerId],
      )
      const seller = rows[0]
      if (!seller) return { error: "Seller not found", status: 404 }
      if (!["suspended", "closed"].includes(seller.status) || !seller.approved_at) {
        return {
          error: `Seller is '${seller.status}' — reinstatement requires a suspended/closed seller with prior approved history.`,
          status: 400,
        }
      }
      const { rows: open } = await c.query(
        `SELECT id FROM public.seller_appeals
          WHERE tenant_id = $1 AND seller_id = $2::uuid
            AND appeal_type = 'reinstatement' AND status IN ('pending', 'under_review')
          LIMIT 1`,
        [tenant, sellerId],
      )
      if (open[0]) return { error: "A reinstatement request for this seller is already pending.", status: 409 }
      const { rows: ins } = await c.query(
        `INSERT INTO public.seller_appeals
           (tenant_id, seller_id, status, appeal_type, appeal_text, evidence_urls)
         VALUES ($1, $2::uuid, 'pending', 'reinstatement', $3, '[]'::jsonb)
         RETURNING id::text AS id, status, created_at::text AS created_at`,
        [tenant, sellerId, appealText],
      )
      if (!ins[0]) throw new Error("Reinstatement request insert did not land");
      await writeSellerAudit(c, {
        tenantId: tenant, sellerId, actorId, ipAddress,
        action: "seller_reinstatement.requested", entityType: "seller_appeal", entityId: ins[0].id,
        afterState: { appeal_type: "reinstatement", recorded_by: "admin", seller_status: seller.status },
      })
      return { ok: true as const, request: ins[0] }
    })
    if (!result) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result, { status: 201 })
  }

  if (action === "decide") {
    const appealId = typeof b.appeal_id === "string" ? b.appeal_id.trim() : ""
    const decision = typeof b.decision === "string" ? b.decision : ""
    const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 500) : ""
    if (!appealId || !UUID_RE.test(appealId)) {
      return NextResponse.json({ error: "Missing appeal id" }, { status: 400 })
    }
    if (decision !== "approve" && decision !== "deny") {
      return NextResponse.json({ error: "Decision must be 'approve' or 'deny'" }, { status: 400 })
    }
    if (decision === "deny" && !reason) {
      return NextResponse.json({ error: "Denying a reinstatement requires a reason" }, { status: 400 })
    }
    const nextAppealStatus = decision === "approve" ? "approved" : "denied"

    const result = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT a.id, a.seller_id::text AS seller_id, a.status,
                s.status AS seller_status, s.display_name, s.legal_name
           FROM public.seller_appeals a
           LEFT JOIN public.sellers s ON s.id = a.seller_id AND s.tenant_id = a.tenant_id
          WHERE a.tenant_id = $1 AND a.id = $2::uuid AND a.appeal_type = 'reinstatement'
          LIMIT 1`,
        [tenant, appealId],
      )
      const appeal = rows[0]
      if (!appeal) return { error: "Reinstatement request not found", status: 404 }
      if (!["pending", "under_review"].includes(appeal.status)) {
        return { error: `Request already decided (${appeal.status})`, status: 400 }
      }

      if (decision === "approve") {
        // Eligibility first — the appeal decision is stamped only when
        // the seller flip can actually follow (withPg is not
        // transactional; stamping before validating could record an
        // approval with no reinstatement behind it).
        if (!appeal.seller_id) {
          return { error: "This request carries no seller — it cannot reinstate an account.", status: 400 }
        }
        if (!["suspended", "closed"].includes(appeal.seller_status)) {
          return {
            error: `Seller is '${appeal.seller_status ?? "unknown"}' — only a suspended/closed seller can be reinstated. Nothing was decided; reopen the queue and file a fresh request if the seller's state changed.`,
            status: 400,
          }
        }
      }

      const { rows: updated } = await c.query(
        `UPDATE public.seller_appeals
            SET status = $3, decision = $3, decided_by = $4::uuid, decided_at = now(), updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid AND status IN ('pending', 'under_review')
          RETURNING id::text AS id, status`,
        [tenant, appealId, nextAppealStatus, actorId && UUID_RE.test(actorId) ? actorId : null],
      )
      if (!updated[0]) return { error: "Request was decided concurrently", status: 409 }

      await writeSellerAudit(c, {
        tenantId: tenant, sellerId: appeal.seller_id, actorId, ipAddress,
        action: decision === "approve" ? "seller_reinstatement.approve" : "seller_reinstatement.deny",
        entityType: "seller_appeal", entityId: appealId,
        beforeState: { status: appeal.status },
        afterState: { status: nextAppealStatus, reason: reason || null },
      })

      let sellerFlip: { id: string; status: string } | null = null
      if (decision === "approve") {
        const { rows: flipped } = await c.query(
          `UPDATE public.sellers
              SET status = 'approved', approved_at = now(), updated_at = now()
            WHERE tenant_id = $1 AND id = $2::uuid AND status IN ('suspended', 'closed')
            RETURNING id::text AS id, status`,
          [tenant, appeal.seller_id],
        )
        if (!flipped[0]) return { error: "Seller status changed concurrently — no flip was made.", status: 409 }
        sellerFlip = flipped[0]
        await writeSellerAudit(c, {
          tenantId: tenant, sellerId: appeal.seller_id, actorId, ipAddress,
          action: "seller.reinstate", entityType: "seller", entityId: appeal.seller_id,
          beforeState: { status: appeal.seller_status },
          afterState: { status: "approved", via: "reinstatement", appeal_id: appealId },
        })
        await provisionSellerGrants(c, {
          tenantId: tenant, sellerId: appeal.seller_id, actorId, ipAddress,
        })
        // The seller reads the outcome through the comms layer
        // (event "governance" — an account-standing outcome) so
        // preferences and the email leg apply.
        await notifySeller(
          {
            tenantId: tenant,
            sellerId: String(appeal.seller_id),
            event: "governance",
            type: "reinstatement",
            title: "Your seller account has been reinstated",
            body: "Your reinstatement request was approved and your seller account is approved again.",
            link: "/seller/governance",
          },
          c,
        )
      } else if (appeal.seller_id) {
        await notifySeller(
          {
            tenantId: tenant,
            sellerId: String(appeal.seller_id),
            event: "governance",
            type: "reinstatement",
            title: "Reinstatement request denied",
            body: `Your reinstatement request was denied: ${reason}`,
            link: "/seller/governance",
          },
          c,
        )
      }

      return { ok: true as const, appeal: updated[0], seller: sellerFlip }
    })
    if (!result) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result)
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

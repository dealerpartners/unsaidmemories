import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit"
import { notifySeller } from "@/lib/sellers/notify"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// B4 · Brand Registry — the brand opt-out claims queue (Sunny's ruling,
// 2026-10-14; the store public.brand_opt_outs is LIVE via migration
// 20261060, approved by Sunny and applied by the parent).
//
// Claims are RECORDED by the public intake (POST /api/support/brand-opt-out)
// in 'filed' state, linked both ways to their Support Desk case (the row's
// claim_ticket_ref; the ticket's metadata carries the claim id). Claims
// whose brand did not resolve against the registry exist only as desk
// cases — they never appear here; a human matches them during
// verification. This queue is where recorded claims are DECIDED:
//
//   verify   filed    → verified  (stamps verified_by / verified_at)
//   apply    verified → applied   (stamps applied_at; the store's partial
//                                  UNIQUE — one applied opt-out per
//                                  (tenant, brand) — is the enforcer: a
//                                  second apply surfaces 23505 as an
//                                  honest 409, never a silent failure)
//   reject   filed|verified → rejected (decision_reason REQUIRED)
//   withdraw filed|verified → withdrawn
//
// Every decision is a state-guarded UPDATE (decide-once, the M2/B1 idiom)
// and is audited via writeSellerAudit. APPLYING NEVER TOUCHES
// seller_brand_authorizations — the revalidate_brand trigger defect makes
// authorization mutation unsafe, and enforcement is a CHECK at the seller
// brand gate, not a mutation of the seller's record. On apply, the
// sellers holding APPROVED authorizations for the brand are notified
// through seller_notifications (brand + strength named; NO claimant PII)
// so they learn from the platform that the brand's opt-out overrides
// their authorization — not at a refused listing.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CLAIM_COLS = `
  o.id::text AS id, o.brand_id::text AS brand_id,
  b.name AS brand_name, b.slug AS brand_slug,
  o.strength, o.status, o.claimant_name, o.claimant_email,
  o.claimant_phone, o.claimant_company, o.is_agent, o.represented_owner,
  o.trademark_registration, o.attestation_authority, o.attestation_accuracy,
  (o.signature_text IS NOT NULL) AS signed,
  o.claim_ticket_ref, o.details, o.verified_by,
  o.verified_at::text AS verified_at, o.applied_at::text AS applied_at,
  o.decision_reason,
  o.created_at::text AS created_at, o.updated_at::text AS updated_at`

type ClaimRow = Record<string, unknown>

type AiCheck = { state: string; output_text: string | null; created_at: string }

const mapClaim = (o: ClaimRow, aiCheck?: { count: number; latest: AiCheck | null }) => ({
  id: o.id,
  brandId: o.brand_id,
  brandName: o.brand_name,
  brandSlug: o.brand_slug,
  strength: o.strength,
  status: o.status,
  claimant: {
    name: o.claimant_name,
    email: o.claimant_email,
    phone: o.claimant_phone ?? null,
    company: o.claimant_company ?? null,
    isAgent: o.is_agent === true,
    representedOwner: o.represented_owner ?? null,
  },
  trademarkRegistration: o.trademark_registration ?? null,
  attestation: {
    authority: o.attestation_authority === true,
    accuracy: o.attestation_accuracy === true,
    signed: o.signed === true,
  },
  claimTicketRef: o.claim_ticket_ref ?? null,
  details: o.details ?? null,
  verifiedBy: o.verified_by ?? null,
  verifiedAt: o.verified_at ?? null,
  appliedAt: o.applied_at ?? null,
  decisionReason: o.decision_reason ?? null,
  createdAt: o.created_at,
  updatedAt: o.updated_at,
  // §J AI Ops — the recorded brand_optout_check findings for this claim
  // (public.ai_tasks). The AI check records element findings only; the
  // decisions above remain this queue's alone.
  aiChecks: aiCheck ?? { count: 0, latest: null },
})

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read")
  if (denied) return denied
  const tenant = resolveTenantId(req)

  const out = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT ${CLAIM_COLS}
         FROM public.brand_opt_outs o
         JOIN public.brands b ON b.id = o.brand_id AND b.tenant_id = o.tenant_id
        WHERE o.tenant_id = $1
        ORDER BY CASE o.status
                   WHEN 'filed' THEN 0 WHEN 'verified' THEN 1
                   WHEN 'applied' THEN 2 ELSE 3 END,
                 o.created_at ASC
        LIMIT 200`,
      [tenant],
    )
    const countsRes = await c.query(
      `SELECT status, count(*)::int AS n FROM public.brand_opt_outs
        WHERE tenant_id = $1 GROUP BY status`,
      [tenant],
    )
    const counts: Record<string, number> = {
      filed: 0, verified: 0, applied: 0, rejected: 0, withdrawn: 0,
    }
    for (const r of countsRes.rows as { status: string; n: number }[]) {
      counts[r.status] = Number(r.n)
    }
    const claimIds = (rows as ClaimRow[]).map((r) => String(r.id))
    const checksByClaim = new Map<string, { count: number; latest: AiCheck | null }>()
    if (claimIds.length) {
      const checksRes = await c.query(
        `SELECT subject_id::text AS claim_id, state, output_text, created_at::text AS created_at
           FROM public.ai_tasks
          WHERE tenant_id = $1 AND function = 'brand_optout_check'
            AND subject_type = 'brand_opt_out' AND subject_id = ANY($2::uuid[])
          ORDER BY created_at DESC`,
        [tenant, claimIds],
      )
      for (const r of checksRes.rows as { claim_id: string; state: string; output_text: string | null; created_at: string }[]) {
        const entry = checksByClaim.get(r.claim_id) ?? { count: 0, latest: null }
        entry.count += 1
        if (!entry.latest) entry.latest = { state: r.state, output_text: r.output_text, created_at: r.created_at }
        checksByClaim.set(r.claim_id, entry)
      }
    }
    return {
      claims: (rows as ClaimRow[]).map((o) => mapClaim(o, checksByClaim.get(String(o.id)))),
      counts,
      note:
        rows.length === 0
          ? "No opt-out claims are recorded. Claims filed on the public page (/brand-opt-out) are recorded here when the claimed brand resolves against the registry; claims that do not resolve are worked as Support Desk cases."
          : null,
    }
  })

  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json(out)
}

const ACTIONS = ["verify", "apply", "reject", "withdraw"] as const
type ClaimAction = (typeof ACTIONS)[number]

const FROM_STATES: Record<ClaimAction, string[]> = {
  verify: ["filed"],
  apply: ["verified"],
  reject: ["filed", "verified"],
  withdraw: ["filed", "verified"],
}
const TO_STATE: Record<ClaimAction, string> = {
  verify: "verified",
  apply: "applied",
  reject: "rejected",
  withdraw: "withdrawn",
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write")
  if (denied) return denied
  const b = await req.json().catch(() => ({}))
  const tenant = resolveTenantId(req)
  const actorId = await getActorIdFromRequest(req)
  const ipAddress = requestIp(req)

  const action = typeof b.action === "string" ? b.action : ""
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json(
      { error: "Action must be 'verify', 'apply', 'reject' or 'withdraw'" },
      { status: 400 },
    )
  }
  const act = action as ClaimAction
  const claimId = typeof b.claim_id === "string" ? b.claim_id.trim() : ""
  if (!claimId || !UUID_RE.test(claimId)) {
    return NextResponse.json({ error: "Missing claim id" }, { status: 400 })
  }
  const reason =
    typeof b.reason === "string" ? b.reason.trim().slice(0, 1000) : ""
  if (act === "reject" && !reason) {
    return NextResponse.json(
      { error: "Rejecting a claim requires a decision reason" },
      { status: 400 },
    )
  }

  const out = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT ${CLAIM_COLS}
         FROM public.brand_opt_outs o
         JOIN public.brands b ON b.id = o.brand_id AND b.tenant_id = o.tenant_id
        WHERE o.tenant_id = $1 AND o.id = $2::uuid LIMIT 1`,
      [tenant, claimId],
    )
    const claim = rows[0] as ClaimRow | undefined
    if (!claim) return { error: "Opt-out claim not found", status: 404 }
    const fromStates = FROM_STATES[act]
    if (!fromStates.includes(String(claim.status))) {
      return {
        error: `Claim is '${claim.status}' — ${act} requires ${fromStates.join(" or ")}`,
        status: 400,
      }
    }

    const setClauses: string[] = ["status = $3", "updated_at = now()"]
    const params: unknown[] = [tenant, claimId, TO_STATE[act]]
    if (act === "verify") {
      setClauses.push("verified_by = $4", "verified_at = now()")
      params.push(actorId || null)
    } else if (act === "apply") {
      setClauses.push("applied_at = now()")
    } else if (act === "reject") {
      setClauses.push("decision_reason = $4")
      params.push(reason)
    } else if (act === "withdraw" && reason) {
      setClauses.push("decision_reason = $4")
      params.push(reason)
    }

    let updated: ClaimRow[]
    try {
      const res = await c.query(
        `UPDATE public.brand_opt_outs o
            SET ${setClauses.join(", ")}
          WHERE o.tenant_id = $1 AND o.id = $2::uuid
            AND o.status = ANY($${params.length + 1}::text[])
          RETURNING o.id`,
        [...params, fromStates],
      )
      updated = res.rows as ClaimRow[]
    } catch (e) {
      // The partial UNIQUE (one applied opt-out per tenant+brand) is the
      // enforcer on apply: surface the conflict honestly — the claim
      // stays 'verified' and the reviewer sees why.
      if ((e as { code?: string })?.code === "23505") {
        return {
          error:
            "Another opt-out for this brand is already applied — only one applied opt-out can stand per brand. This claim remains verified; withdraw or reject it, or withdraw the applied one first.",
          status: 409,
        }
      }
      throw e
    }
    if (!updated[0]) {
      return { error: "Claim was decided concurrently", status: 409 }
    }

    // On apply: tell every seller holding an APPROVED authorization for
    // this brand that the brand's own opt-out now overrides it. Brand +
    // strength only — no claimant PII ever rides a seller notification.
    let notifiedSellerIds: string[] = []
    if (act === "apply") {
      const brandName = String(claim.brand_name)
      const body =
        claim.strength === "ever"
          ? `The owner of ${brandName} has opted out of this platform entirely (never sell). The brand's opt-out outranks your approved authorization to sell ${brandName}: the brand gate refuses listings of this brand while the opt-out stands.`
          : `The owner of ${brandName} has opted out of open selling on this platform (by approval only). The brand's opt-out outranks your approved authorization: nothing of this brand sells unless the brand approves it, and the brand gate refuses listings of this brand unless the brand has recorded that approval.`
      // The affected-seller set is exactly the set the old
      // INSERT…SELECT targeted (approved authorizations for this
      // brand, tenant-joined); each seller is now notified through
      // the comms layer (event "governance") so preferences and the
      // email leg apply per seller.
      const { rows: notified } = await c.query(
        `SELECT DISTINCT a.seller_id::text AS seller_id
           FROM public.seller_brand_authorizations a
           JOIN public.sellers s ON s.id = a.seller_id AND s.tenant_id = $1
          WHERE a.brand_id = $2::uuid AND a.status = 'approved'`,
        [tenant, claim.brand_id],
      )
      notifiedSellerIds = (notified as { seller_id: string }[]).map(
        (r) => r.seller_id,
      )
      for (const sellerId of notifiedSellerIds) {
        await notifySeller(
          {
            tenantId: tenant,
            sellerId,
            event: "governance",
            type: "brand_opt_out",
            title: `Brand opt-out applied: ${brandName}`,
            body,
            link: "/seller/brands/authorizations",
          },
          c,
        )
      }
    }

    await writeSellerAudit(c, {
      tenantId: tenant,
      actorId,
      ipAddress,
      action: `brand_opt_out.${act}`,
      entityType: "brand_opt_out",
      entityId: claimId,
      beforeState: { status: claim.status, strength: claim.strength },
      afterState: {
        status: TO_STATE[act],
        strength: claim.strength,
        brand_id: claim.brand_id,
        brand_name: claim.brand_name,
        ...(act === "reject" ? { reason } : {}),
        ...(act === "withdraw" && reason ? { reason } : {}),
        ...(act === "apply"
          ? { notified_sellers: notifiedSellerIds }
          : {}),
      },
    })

    const { rows: fresh } = await c.query(
      `SELECT ${CLAIM_COLS}
         FROM public.brand_opt_outs o
         JOIN public.brands b ON b.id = o.brand_id AND b.tenant_id = o.tenant_id
        WHERE o.tenant_id = $1 AND o.id = $2::uuid LIMIT 1`,
      [tenant, claimId],
    )
    return {
      ok: true as const,
      claim: mapClaim(fresh[0] as ClaimRow),
      ...(act === "apply"
        ? { notifiedSellers: notifiedSellerIds.length }
        : {}),
    }
  })

  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  if ("error" in out) {
    return NextResponse.json({ error: out.error }, { status: out.status })
  }
  return NextResponse.json(out)
}

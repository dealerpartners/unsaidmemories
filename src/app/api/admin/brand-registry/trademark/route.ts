import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// B4 · Trademark verification — the recorded-review workflow the census
// found missing (registrations were recorded/displayed; verification was
// attestation-only).
//
// WHAT THIS IS: a reviewer opens the registration number recorded on a
// brand (brands.trademark_registration, migration 20261083) or on an
// opt-out claim (brand_opt_outs.trademark_registration, filed at the
// public intake), checks it against the documents/evidence on file, and
// records the decision here: verified or rejected, WITH the registration
// number, the reviewer's identity, and the date — stamped on the row
// itself (trademark_verification_status / trademark_verified_by /
// trademark_verified_at / trademark_verification_notes) and in
// seller_audit_log.
//
// WHAT THIS IS NOT: no USPTO or any external registry call exists or is
// implied. The surface labels it a recorded review, exactly like the
// A2 tax-ID desk ("recorded-review only — no IRS call"). Anyone reading
// a 'verified' status reads "a named reviewer recorded this decision on
// this date", nothing more.
//
// POST actions:
//   verify_brand    { brand_id, registration?, notes? }
//   reject_brand    { brand_id, registration?, notes }  (notes required)
//   verify_claim    { claim_id, notes? }  — the claim's recorded
//                     registration number is the one verified; a claim
//                     with no recorded number cannot be verified.
//   reject_claim    { claim_id, notes }   (notes required)
// A verify requires a registration number: supplied in the request or
// already recorded on the row — never invented here.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read")
  if (denied) return denied
  const tenant = resolveTenantId(req)

  const out = await withPg(async (c) => {
    const brands = (
      await c.query(
        `SELECT id::text AS id, name, slug,
                trademark_registration,
                COALESCE(trademark_verification_status, 'not_submitted') AS trademark_verification_status,
                trademark_verified_by, trademark_verified_at::text AS trademark_verified_at,
                trademark_verification_notes
           FROM public.brands
          WHERE tenant_id = $1 AND trademark_registration IS NOT NULL AND trademark_registration <> ''
          ORDER BY CASE COALESCE(trademark_verification_status, 'not_submitted')
                     WHEN 'pending_review' THEN 0 WHEN 'not_submitted' THEN 1 ELSE 2 END,
                   name ASC
          LIMIT 200`,
        [tenant],
      )
    ).rows
    const claims = (
      await c.query(
        `SELECT o.id::text AS id, o.brand_id::text AS brand_id, b.name AS brand_name,
                o.trademark_registration, o.status AS claim_status,
                COALESCE(o.trademark_verification_status, 'pending_review') AS trademark_verification_status,
                o.trademark_verified_by, o.trademark_verified_at::text AS trademark_verified_at,
                o.trademark_verification_notes,
                o.claimant_name, o.claimant_company, o.created_at::text AS created_at
           FROM public.brand_opt_outs o
           JOIN public.brands b ON b.id = o.brand_id AND b.tenant_id = o.tenant_id
          WHERE o.tenant_id = $1 AND o.trademark_registration IS NOT NULL AND o.trademark_registration <> ''
          ORDER BY CASE COALESCE(o.trademark_verification_status, 'pending_review')
                     WHEN 'pending_review' THEN 0 ELSE 1 END,
                   o.created_at ASC
          LIMIT 200`,
        [tenant],
      )
    ).rows
    const all = [...brands, ...claims]
    return {
      brands,
      claims,
      counts: {
        pendingReview: all.filter(
          (r: any) => r.trademark_verification_status === "pending_review" || r.trademark_verification_status === "not_submitted",
        ).length,
        verified: all.filter((r: any) => r.trademark_verification_status === "verified").length,
        rejected: all.filter((r: any) => r.trademark_verification_status === "rejected").length,
        recorded: all.length,
      },
      method:
        "Recorded review only: a named reviewer checks the recorded registration number against the evidence on file and records the decision (reviewer + date + notes) on the row. No USPTO or external registry call is made or implied.",
      note:
        all.length === 0
          ? "No trademark registration numbers are recorded on any brand or opt-out claim for this tenant. Registrations arrive with opt-out claims filed on the public page (/brand-opt-out) or can be recorded on a brand from this desk."
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
  const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 1000) : ""
  const registrationInput =
    typeof b.registration === "string" ? b.registration.trim().slice(0, 120) : ""

  const isBrand = action === "verify_brand" || action === "reject_brand"
  const isClaim = action === "verify_claim" || action === "reject_claim"
  if (!isBrand && !isClaim) {
    return NextResponse.json(
      { error: "Action must be verify_brand, reject_brand, verify_claim or reject_claim" },
      { status: 400 },
    )
  }
  const decision = action.startsWith("verify") ? "verified" : "rejected"
  if (decision === "rejected" && !notes) {
    return NextResponse.json(
      { error: "Rejecting a trademark verification requires reviewer notes recording why" },
      { status: 400 },
    )
  }
  const id = typeof b.id === "string" ? b.id.trim() : ""
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Missing record id" }, { status: 400 })
  }
  const reviewer = actorId || "admin"

  const result = await withPg(async (c) => {
    if (isBrand) {
      const { rows } = await c.query(
        `SELECT id, name, trademark_registration, trademark_verification_status
           FROM public.brands WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
        [tenant, id],
      )
      const brand = rows[0]
      if (!brand) return { error: "Brand not found", status: 404 }
      const registration = registrationInput || brand.trademark_registration || ""
      if (decision === "verified" && !registration) {
        return {
          error: "No trademark registration number is recorded for this brand — record one before verifying.",
          status: 400,
        }
      }
      const { rows: updated } = await c.query(
        `UPDATE public.brands
            SET trademark_registration = COALESCE(NULLIF($3, ''), trademark_registration),
                trademark_verification_status = $4,
                trademark_verified_by = $5, trademark_verified_at = now(),
                trademark_verification_notes = $6, updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING id::text AS id, trademark_registration, trademark_verification_status,
                    trademark_verified_by, trademark_verified_at::text AS trademark_verified_at`,
        [tenant, id, registration, decision, reviewer, notes || null],
      )
      await writeSellerAudit(c, {
        tenantId: tenant, actorId, ipAddress,
        action: decision === "verified" ? "brand_trademark.verify" : "brand_trademark.reject",
        entityType: "brand", entityId: id,
        beforeState: { trademark_verification_status: brand.trademark_verification_status ?? null },
        afterState: {
          trademark_verification_status: decision,
          trademark_registration: registration || null,
          reviewer, method: "recorded_review_no_external_call", notes: notes || null,
        },
      })
      return { ok: true as const, brand: updated[0] }
    }

    const { rows } = await c.query(
      `SELECT o.id, o.brand_id, o.trademark_registration, o.trademark_verification_status,
              b.name AS brand_name
         FROM public.brand_opt_outs o
         JOIN public.brands b ON b.id = o.brand_id AND b.tenant_id = o.tenant_id
        WHERE o.tenant_id = $1 AND o.id = $2::uuid LIMIT 1`,
      [tenant, id],
    )
    const claim = rows[0]
    if (!claim) return { error: "Opt-out claim not found", status: 404 }
    if (decision === "verified" && !claim.trademark_registration) {
      return {
        error: "This claim records no trademark registration number — there is nothing to verify.",
        status: 400,
      }
    }
    const { rows: updated } = await c.query(
      `UPDATE public.brand_opt_outs
          SET trademark_verification_status = $3,
              trademark_verified_by = $4, trademark_verified_at = now(),
              trademark_verification_notes = $5, updated_at = now()
        WHERE tenant_id = $1 AND id = $2::uuid
        RETURNING id::text AS id, trademark_registration, trademark_verification_status,
                  trademark_verified_by, trademark_verified_at::text AS trademark_verified_at`,
      [tenant, id, decision, reviewer, notes || null],
    )
    await writeSellerAudit(c, {
      tenantId: tenant, actorId, ipAddress,
      action: decision === "verified" ? "brand_trademark.verify" : "brand_trademark.reject",
      entityType: "brand_opt_out", entityId: id,
      beforeState: { trademark_verification_status: claim.trademark_verification_status ?? null },
      afterState: {
        trademark_verification_status: decision,
        trademark_registration: claim.trademark_registration ?? null,
        brand_id: claim.brand_id, brand_name: claim.brand_name,
        reviewer, method: "recorded_review_no_external_call", notes: notes || null,
      },
    })
    return { ok: true as const, claim: updated[0] }
  })
  if (!result) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}

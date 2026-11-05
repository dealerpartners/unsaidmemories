import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit"

export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/sellers/violations — Trust Center violation log.
//
//   GET   ?seller_id=... — violations for one seller (newest first).
//   POST  { seller_id, violation_type, severity, description, suspend }
//         Records a violation; when suspend=true also flips the seller
//         status to 'suspended' in the same request.
// ============================================================================

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read")
  if (denied) return denied
  const tenant = resolveTenantId(req)
  const sellerId = (req.nextUrl.searchParams.get("seller_id") || "").trim()
  if (!sellerId) return NextResponse.json({ error: "seller_id required" }, { status: 400 })

  const out = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT id::text AS id, violation_type, severity, status, description,
              created_at::text AS created_at
         FROM public.seller_violations
        WHERE tenant_id = $1 AND seller_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT 100`,
      [tenant, sellerId],
    )
    return { rows }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write")
  if (denied) return denied
  const b = await req.json().catch(() => ({}))
  const tenant = resolveTenantId(req)
  const sellerId = String(b.seller_id || "").trim()
  const violationType = String(b.violation_type || "").trim() || "policy"
  const severity = ["low", "medium", "high", "critical"].includes(String(b.severity))
    ? String(b.severity)
    : "medium"
  const description = String(b.description || "").trim() || null
  const suspend = b.suspend === true
  if (!sellerId) return NextResponse.json({ error: "seller_id required" }, { status: 400 })
  const actorId = await getActorIdFromRequest(req)
  const ipAddress = requestIp(req)

  const out = await withPg(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO public.seller_violations
         (tenant_id, seller_id, violation_type, severity, status, description)
       VALUES ($1, $2::uuid, $3, $4, 'open', $5)
       RETURNING id::text AS id, violation_type, severity, status`,
      [tenant, sellerId, violationType, severity, description],
    )
    if (!rows[0]) throw new Error("Violation insert did not land");
    await writeSellerAudit(c, {
      tenantId: tenant, sellerId, actorId, ipAddress,
      action: "violation.flagged", entityType: "seller_violation", entityId: rows[0]?.id,
      afterState: { violation_type: violationType, severity, status: "open" },
    })
    let seller: any = null
    if (suspend) {
      const r = await c.query(
        `UPDATE public.sellers
            SET status = 'suspended', updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING id::text AS id, status`,
        [tenant, sellerId],
      )
      seller = r.rows[0] || null
      if (seller) {
        await writeSellerAudit(c, {
          tenantId: tenant, sellerId, actorId, ipAddress,
          action: "seller.suspend", entityType: "seller", entityId: sellerId,
          afterState: { status: "suspended", via: "violation_flag" },
        })
      }
    }
    return { ok: true, violation: rows[0], seller }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json(out, { status: 201 })
}

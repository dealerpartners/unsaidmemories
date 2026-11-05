import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop"
import {
  listCoupons,
  createCoupon,
  type CouponInput,
} from "@/lib/enterprise/promotions"

// ============================================================================
// /api/admin/coupons — admin-gated CRUD for commerce_coupons.
//
//   GET   /api/admin/coupons                  list all coupons
//   GET   /api/admin/coupons?promotionId=...  list coupons for a promotion
//   POST  /api/admin/coupons                  create a coupon
//
// PATCH + DELETE live in [id]/route.ts. Both write to the real
// commerce_coupons table via the enterprise layer (withPg + TENANT_ID).
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function toIso(v: any): string | null {
  if (v == null || v === "") return null
  const s = String(v).trim()
  if (isNaN(Date.parse(s))) return null
  return new Date(s).toISOString()
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("products_services", "read")
  if (gate) return gate

  const promotionId = req.nextUrl.searchParams.get("promotionId") || undefined
  try {
    const coupons = await listCoupons(promotionId)
    return NextResponse.json({ coupons })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `List failed: ${msg}` }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const code = String(body.code || "").trim()
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 })

  const input: CouponInput = {
    code,
    promotionId: body.promotion_id || body.promotionId || null,
    customerId: body.customer_id || body.customerId || null,
    usageLimit: body.usage_limit != null || body.usageLimit != null
      ? Number(body.usage_limit ?? body.usageLimit)
      : null,
    validFrom: toIso(body.valid_from ?? body.validFrom),
    validTo: toIso(body.valid_to ?? body.validTo),
    status: body.status || "active",
  }

  try {
    const created = await createCoupon(input)
    revalidateShop()
    return NextResponse.json({ coupon: created })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Create failed: ${msg}` }, { status: 502 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop"
import {
  updateCoupon,
  deleteCoupon,
  type CouponInput,
} from "@/lib/enterprise/promotions"

// ============================================================================
// /api/admin/coupons/[id] — admin-gated PATCH + DELETE for a single coupon.
// Writes to the real commerce_coupons table via the enterprise layer
// (withPg + TENANT_ID).
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function toIso(v: any): string | null {
  if (v == null || v === "") return null
  const s = String(v).trim()
  if (isNaN(Date.parse(s))) return null
  return new Date(s).toISOString()
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  const { id } = await ctx.params

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const patch: Partial<CouponInput> = {}

  if (body.promotion_id !== undefined || body.promotionId !== undefined) {
    const v = body.promotion_id ?? body.promotionId
    patch.promotionId = v === null || v === "" ? null : String(v)
  }
  if (body.customer_id !== undefined || body.customerId !== undefined) {
    const v = body.customer_id ?? body.customerId
    patch.customerId = v === null || v === "" ? null : String(v)
  }
  if (body.code != null) patch.code = String(body.code).trim()
  if (body.usage_limit !== undefined || body.usageLimit !== undefined) {
    const v = body.usage_limit ?? body.usageLimit
    patch.usageLimit = v == null || v === "" ? null : Number(v)
  }
  if (body.status != null) patch.status = String(body.status)
  if (body.valid_from !== undefined || body.validFrom !== undefined) {
    patch.validFrom = toIso(body.valid_from ?? body.validFrom)
  }
  if (body.valid_to !== undefined || body.validTo !== undefined) {
    patch.validTo = toIso(body.valid_to ?? body.validTo)
  }

  try {
    const updated = await updateCoupon(id, patch)
    if (!updated) return NextResponse.json({ error: "Coupon not found" }, { status: 404 })
    revalidateShop()
    return NextResponse.json({ coupon: updated })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Update failed: ${msg}` }, { status: 502 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  const { id } = await ctx.params

  try {
    const ok = await deleteCoupon(id)
    if (!ok) return NextResponse.json({ error: "Coupon not found" }, { status: 404 })
    revalidateShop()
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Delete failed: ${msg}` }, { status: 502 })
  }
}

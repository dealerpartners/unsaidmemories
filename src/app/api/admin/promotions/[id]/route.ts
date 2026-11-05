import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop"
import {
  updatePromotion,
  deletePromotion,
  type PromotionInput,
  type PromotionType,
} from "@/lib/enterprise/promotions"

// ============================================================================
// /api/admin/promotions/[id] — admin-gated PATCH + DELETE for a single
// promotion. Writes to the real commerce_promotions table via the enterprise
// layer (withPg + TENANT_ID).
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VALID_TYPES: PromotionType[] = ["percent_off", "amount_off", "bogo", "set_price"]

function toTargets(v: any): Array<{ kind: "product" | "taxonomy"; id: string; label: string | null }> | undefined {
  if (!Array.isArray(v)) return undefined
  const out: Array<{ kind: "product" | "taxonomy"; id: string; label: string | null }> = []
  for (const t of v) {
    if (!t || typeof t !== "object") continue
    const id = String((t as any).id || "").trim()
    if (!id) continue
    out.push({
      kind: (t as any).kind === "taxonomy" ? "taxonomy" : "product",
      id,
      label: (t as any).label ? String((t as any).label) : null,
    })
  }
  return out
}

function toNumber(v: any): number | null {
  if (v == null || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""))
  return Number.isFinite(n) ? n : null
}

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

  const patch: Partial<PromotionInput> = {}

  if (body.code != null) patch.code = String(body.code).trim()
  if (body.name != null) patch.name = String(body.name).trim()

  if (body.promotion_type != null || body.promotionType != null) {
    const pt = String(body.promotion_type ?? body.promotionType)
    if (!VALID_TYPES.includes(pt as PromotionType)) {
      return NextResponse.json(
        { error: `promotion_type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 },
      )
    }
    patch.promotionType = pt
  }

  if (body.value !== undefined) patch.value = toNumber(body.value)
  if (body.minimum_subtotal !== undefined || body.minimumSubtotal !== undefined) {
    patch.minimumSubtotal = toNumber(body.minimum_subtotal ?? body.minimumSubtotal)
  }
  if (body.maximum_discount !== undefined || body.maximumDiscount !== undefined) {
    patch.maximumDiscount = toNumber(body.maximum_discount ?? body.maximumDiscount)
  }
  if (body.start_at !== undefined || body.startAt !== undefined) {
    patch.startAt = toIso(body.start_at ?? body.startAt)
  }
  if (body.end_at !== undefined || body.endAt !== undefined) {
    patch.endAt = toIso(body.end_at ?? body.endAt)
  }
  if (body.usage_limit !== undefined || body.usageLimit !== undefined) {
    const v = body.usage_limit ?? body.usageLimit
    patch.usageLimit = v == null || v === "" ? null : Number(v)
  }
  if (body.active !== undefined) patch.active = body.active === true
  if (body.is_automatic !== undefined || body.isAutomatic !== undefined) {
    patch.isAutomatic = (body.is_automatic ?? body.isAutomatic) === true
  }
  if (body.targets !== undefined) {
    const t = toTargets(body.targets)
    if (t) patch.targets = t
  }
  if (body.rules !== undefined && typeof body.rules === "object") patch.rules = body.rules
  if (body.actions !== undefined && typeof body.actions === "object") patch.actions = body.actions

  try {
    const updated = await updatePromotion(id, patch)
    if (!updated) return NextResponse.json({ error: "Promotion not found" }, { status: 404 })
    revalidateShop()
    return NextResponse.json({ promotion: updated })
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
    const ok = await deletePromotion(id)
    if (!ok) return NextResponse.json({ error: "Promotion not found" }, { status: 404 })
    revalidateShop()
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Delete failed: ${msg}` }, { status: 502 })
  }
}

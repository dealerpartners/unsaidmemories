import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop"
import {
  listPromotions,
  createPromotion,
  type PromotionInput,
  type PromotionType,
} from "@/lib/enterprise/promotions"

// ============================================================================
// /api/admin/promotions — admin-gated CRUD for commerce_promotions.
//
//   GET   /api/admin/promotions      list every promotion (with coupon count)
//   POST  /api/admin/promotions      create a promotion
//
// PATCH + DELETE live in [id]/route.ts. Both write to the real
// commerce_promotions table via the enterprise layer (withPg + TENANT_ID).
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VALID_TYPES: PromotionType[] = ["percent_off", "amount_off", "bogo", "set_price"]

// Scope targets: a SET of { kind: 'product' | 'taxonomy', id, label? }.
// Products are commerce_catalog_items ids; taxonomy ids are
// taxonomy_nodes ids at any level (a node covers its subtree).
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
  // Accept "YYYY-MM-DD" or full ISO; reject obviously bad strings.
  if (isNaN(Date.parse(s))) return null
  return new Date(s).toISOString()
}

export async function GET(_req: NextRequest) {
  const gate = await requireModuleApi("products_services", "read")
  if (gate) return gate

  try {
    const promotions = await listPromotions()
    return NextResponse.json({ promotions })
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
  const name = String(body.name || "").trim()
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 })
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })

  const promotionType = String(body.promotion_type || body.promotionType || "percent_off")
  if (!VALID_TYPES.includes(promotionType as PromotionType)) {
    return NextResponse.json(
      { error: `promotion_type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    )
  }

  const input: PromotionInput = {
    code,
    name,
    promotionType,
    value: toNumber(body.value),
    minimumSubtotal: toNumber(body.minimum_subtotal ?? body.minimumSubtotal),
    maximumDiscount: toNumber(body.maximum_discount ?? body.maximumDiscount),
    startAt: toIso(body.start_at ?? body.startAt),
    endAt: toIso(body.end_at ?? body.endAt),
    usageLimit: body.usage_limit != null || body.usageLimit != null
      ? Number(body.usage_limit ?? body.usageLimit)
      : null,
    active: body.active !== false,
    isAutomatic: body.is_automatic === true || body.isAutomatic === true,
    targets: toTargets(body.targets) ?? [],
    rules: body.rules && typeof body.rules === "object" ? body.rules : {},
    actions: body.actions && typeof body.actions === "object" ? body.actions : {},
  }

  try {
    const created = await createPromotion(input)
    revalidateShop()
    return NextResponse.json({ promotion: created })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Create failed: ${msg}` }, { status: 502 })
  }
}

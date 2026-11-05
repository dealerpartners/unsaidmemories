import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { updatePromo, type PromoInput } from "@/lib/promos"

// ============================================================================
// PATCH /api/admin/promos/[id] — edit fields, publish/unpublish, change
// placements. The tenant scope + every validation lives in lib/promos.
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function toNum(v: any): number | null | undefined {
  if (v == null || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""))
  return Number.isFinite(n) ? n : undefined
}

function toIso(v: any): string | null | undefined {
  if (v == null || v === "") return null
  const s = String(v).trim()
  if (isNaN(Date.parse(s))) return undefined
  return new Date(s).toISOString()
}

function toStrArray(v: any): string[] | undefined {
  if (v == null) return undefined
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean)
  return undefined
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  const { id } = await params

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const patch: Partial<PromoInput> = {}
  if (body.name != null) patch.name = String(body.name)
  if (body.kind != null) patch.kind = body.kind === "cause" ? "cause" : "standard"
  if (body.promo_type != null || body.promoType != null) {
    const t = String(body.promo_type || body.promoType)
    if (!["percent_off", "dollars_off", "free_addon"].includes(t)) {
      return NextResponse.json({ error: "invalid promo_type" }, { status: 400 })
    }
    patch.promo_type = t as PromoInput["promo_type"]
  }
  if (body.value != null) patch.value = String(body.value)
  if (body.applies_to != null) patch.applies_to = toStrArray(body.applies_to) ?? []
  if (body.eligibility != null) {
    if (!["new", "existing", "all"].includes(String(body.eligibility))) {
      return NextResponse.json({ error: "invalid eligibility" }, { status: 400 })
    }
    patch.eligibility = body.eligibility
  }
  if (body.starts_at !== undefined) patch.starts_at = toIso(body.starts_at) ?? null
  if (body.ends_at !== undefined) patch.ends_at = toIso(body.ends_at) ?? null
  if (body.max_total_uses !== undefined) patch.max_total_uses = toNum(body.max_total_uses) ?? null
  if (body.max_uses_per_user != null) patch.max_uses_per_user = toNum(body.max_uses_per_user) ?? 1
  if (body.one_per_dependent != null) patch.one_per_dependent = !!body.one_per_dependent
  if (body.stackable != null) patch.stackable = !!body.stackable
  if (body.placements != null) patch.placements = (toStrArray(body.placements) ?? []) as PromoInput["placements"]
  if (body.status != null) {
    if (!["draft", "published"].includes(String(body.status))) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 })
    }
    patch.status = body.status
  }
  if (body.description !== undefined) patch.description = body.description ? String(body.description) : null
  if (body.fine_print !== undefined) patch.fine_print = body.fine_print ? String(body.fine_print) : null
  if (body.cta_label !== undefined) patch.cta_label = body.cta_label ? String(body.cta_label) : null
  if (body.qualifying_names !== undefined) patch.qualifying_names = toStrArray(body.qualifying_names) ?? null
  if (body.min_subtotal_cents !== undefined) patch.min_subtotal_cents = toNum(body.min_subtotal_cents) ?? null
  if (body.requires_recent_booking != null) patch.requires_recent_booking = !!body.requires_recent_booking
  if (body.requires_birthday_month != null) patch.requires_birthday_month = !!body.requires_birthday_month

  const updated = await updatePromo(id, patch)
  if ("error" in updated) {
    return NextResponse.json({ error: updated.error }, { status: 400 })
  }
  return NextResponse.json({ promo: updated })
}

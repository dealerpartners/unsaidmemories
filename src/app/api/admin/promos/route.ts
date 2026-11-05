import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import {
  listPromos, createPromo, redemptionStats,
  type PromoInput, type PromoType,
} from "@/lib/promos"

// ============================================================================
// /api/admin/promos — the Promo Builder's data API (permission-grid world:
// the admin gate runs first; the module-permission grid owns the deeper
// grants once every screen carries its module code).
//
//   GET  /api/admin/promos        list every promo (draft + published) + stats
//   POST /api/admin/promos        create (validates code uniqueness)
//
// PATCH lives in [id]/route.ts. Every route is tenant-scoped in the lib.
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VALID_TYPES: PromoType[] = ["percent_off", "dollars_off", "free_addon"]

function toNum(v: any): number | null {
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

function toStrArray(v: any): string[] | undefined {
  if (v == null) return undefined
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  if (typeof v === "string") {
    return v.split(",").map((s) => s.trim()).filter(Boolean)
  }
  return undefined
}

export async function GET() {
  const gate = await requireModuleApi("products_services", "read")
  if (gate) return gate

  try {
    const [promos, stats] = await Promise.all([listPromos(), redemptionStats()])
    return NextResponse.json({ promos, stats })
  } catch (e: any) {
    return NextResponse.json({ error: `List failed: ${e.message}` }, { status: 502 })
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

  const promoType = String(body.promo_type || body.promoType || "percent_off")
  if (!VALID_TYPES.includes(promoType as PromoType)) {
    return NextResponse.json(
      { error: `promo_type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    )
  }

  const input: PromoInput = {
    name,
    code,
    kind: body.kind === "cause" ? "cause" : "standard",
    promo_type: promoType as PromoType,
    value: String(body.value ?? "0"),
    applies_to: toStrArray(body.applies_to) ?? ["services"],
    eligibility: ["new", "existing", "all"].includes(String(body.eligibility))
      ? body.eligibility
      : "all",
    starts_at: toIso(body.starts_at),
    ends_at: toIso(body.ends_at),
    max_total_uses: toNum(body.max_total_uses),
    max_uses_per_user: toNum(body.max_uses_per_user) ?? 1,
    one_per_dependent: !!body.one_per_dependent,
    stackable: !!body.stackable,
    placements: (toStrArray(body.placements) ?? []) as PromoInput["placements"],
    status: body.status === "published" ? "published" : "draft",
    description: body.description ? String(body.description) : null,
    fine_print: body.fine_print ? String(body.fine_print) : null,
    cta_label: body.cta_label ? String(body.cta_label) : null,
    qualifying_names: toStrArray(body.qualifying_names) ?? null,
    min_subtotal_cents: toNum(body.min_subtotal_cents),
    requires_recent_booking: !!body.requires_recent_booking,
    requires_birthday_month: !!body.requires_birthday_month,
  }

  const created = await createPromo(input)
  if ("error" in created) {
    return NextResponse.json({ error: created.error }, { status: 400 })
  }
  return NextResponse.json({ promo: created })
}

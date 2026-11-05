import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { revalidatePath } from "next/cache"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { listGiftCardDesigns } from "@/lib/gift-card-designs"

export const dynamic = "force-dynamic"

const refresh = () => revalidatePath("/gift-cards")

export async function GET() {
  const gate = await requireModuleApi("gift_cards_credits", "read")
  if (gate) return gate
  return NextResponse.json({ designs: await listGiftCardDesigns(false) })
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("gift_cards_credits", "write")
  if (gate) return gate
  const b = await req.json().catch(() => ({}))
  const name = String(b.name || "").trim().slice(0, 80)
  const imageUrl = String(b.imageUrl || "").trim()
  if (!name || !/^https:\/\//.test(imageUrl)) {
    return NextResponse.json({ error: "Name and an uploaded image are required" }, { status: 400 })
  }
  const id = await withPg(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO public.commerce_gift_card_designs (tenant_id, name, image_url, published, sort_order)
       VALUES ($1,$2,$3,false,(SELECT COALESCE(MAX(sort_order),0)+1 FROM public.commerce_gift_card_designs WHERE tenant_id=$1))
       RETURNING id`,
      [resolveTenantId(req), name, imageUrl],
    )
    return rows[0].id as string
  })
  refresh()
  return NextResponse.json({ ok: true, id })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireModuleApi("gift_cards_credits", "write")
  if (gate) return gate
  const b = await req.json().catch(() => ({}))
  const id = String(b.id || "")
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  const sets: string[] = []
  const vals: unknown[] = [id, resolveTenantId(req)]
  if (typeof b.name === "string" && b.name.trim()) { vals.push(b.name.trim().slice(0, 80)); sets.push(`name=$${vals.length}`) }
  if (typeof b.published === "boolean") { vals.push(b.published); sets.push(`published=$${vals.length}`) }
  if (Number.isInteger(b.sortOrder)) { vals.push(b.sortOrder); sets.push(`sort_order=$${vals.length}`) }
  if (!sets.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  await withPg((c) =>
    c.query(`UPDATE public.commerce_gift_card_designs SET ${sets.join(",")}, updated_at=now() WHERE id=$1 AND tenant_id=$2`, vals),
  )
  refresh()
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const gate = await requireModuleApi("gift_cards_credits", "write")
  if (gate) return gate
  const id = req.nextUrl.searchParams.get("id") || ""
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  await withPg((c) => c.query(`DELETE FROM public.commerce_gift_card_designs WHERE id=$1 AND tenant_id=$2`, [id, resolveTenantId(req)]))
  refresh()
  return NextResponse.json({ ok: true })
}

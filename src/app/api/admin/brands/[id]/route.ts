import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop"
import { repo, supabaseConfig, supabaseReady } from "@/lib/repo"

// ============================================================================
// /api/admin/brands/[id] — admin-gated PATCH + DELETE.
//
// PATCH accepts JSON or multipart/form-data (for logo replacement).
// DELETE refuses if any commerce_products reference this brand via brand_id
// (returns 409).
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function uploadLogo(file: File): Promise<string | null> {
  if (!supabaseReady) return null
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png"
  const safeName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
  const path = `brands/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeName}.${ext}`
  const buf = Buffer.from(await file.arrayBuffer())
  const upRes = await fetch(`${supabaseConfig.url}/storage/v1/object/cms-media/${path}`, {
    method: "POST",
    headers: {
      apikey: supabaseConfig.key!,
      Authorization: `Bearer ${supabaseConfig.key}`,
      "Content-Type": file.type || "image/png",
      "x-upsert": "true",
    },
    body: buf,
  })
  if (!upRes.ok) return null
  return `${supabaseConfig.url}/storage/v1/object/public/cms-media/${path}`
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  const { id } = await ctx.params
  const ct = req.headers.get("content-type") || ""
  let fields: Record<string, any> = {}
  let logoFile: File | null = null

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
    for (const [k, v] of form.entries()) {
      if (k === "file") {
        if (v instanceof File) logoFile = v
        continue
      }
      fields[k] = typeof v === "string" ? v : String(v)
    }
  } else {
    try {
      fields = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
  }

  const payload: Record<string, any> = { ...fields, updated_at: new Date().toISOString() }
  if ("sort_order" in payload) payload.sort_order = Number(payload.sort_order)
  if ("is_active" in payload) payload.is_active = payload.is_active !== false
  delete payload.id
  delete payload.created_at
  delete payload.slug // slug is immutable — UPDATE would violate the UNIQUE constraint on conflict.

  if (logoFile) {
    const uploaded = await uploadLogo(logoFile)
    if (uploaded) payload.logo_url = uploaded
  }

  try {
    const updated = await repo.update("commerce_brands", id, payload)
    revalidateShop()
    return NextResponse.json({ brand: updated })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Update failed: ${msg}` }, { status: 502 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  const { id } = await ctx.params

  if (!supabaseReady) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 })
  }

  // Block if any product references this brand.
  const prodRes = await fetch(
    `${supabaseConfig.url}/rest/v1/commerce_products?select=id&brand_id=eq.${encodeURIComponent(id)}&limit=1`,
    { headers: { apikey: supabaseConfig.key!, Authorization: `Bearer ${supabaseConfig.key}` } },
  )
  if (prodRes.ok) {
    const arr = (await prodRes.json().catch(() => [])) as unknown[]
    if (arr.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete a brand that still has products assigned. Reassign or remove the products first." },
        { status: 409 },
      )
    }
  }

  try {
    await repo.remove("commerce_brands", id)
    revalidateShop()
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Delete failed: ${msg}` }, { status: 502 })
  }
}

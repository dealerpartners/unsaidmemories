import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop"
import { repo, supabaseConfig, supabaseReady } from "@/lib/repo"
import { resolveTenantId } from "@/lib/tenant-id";

// ============================================================================
// /api/admin/brands — admin-gated CRUD for commerce_brands.
//
//   GET   list every brand (sort_order asc, then name asc).
//   POST  create a brand. Body can be either:
//           - JSON: { name, slug?, logo_url?, description?, is_active?,
//                     sort_order? }
//           - multipart/form-data: { name, slug?, description?, is_active?,
//                     sort_order?, file? }  → file is uploaded to cms-media
//                     and the resulting URL is stored as logo_url.
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

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

export async function GET(_req: NextRequest) {
  const gate = await requireModuleApi("products_services", "read")
  if (gate) return gate
  const brands = await repo.list("commerce_brands")
  return NextResponse.json({ brands })
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  if (!supabaseReady) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 })
  }

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

  const name = String(fields.name || "").trim()
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })

  const slug = String(fields.slug || slugify(name))
  if (!slug) return NextResponse.json({ error: "Could not derive slug" }, { status: 400 })

  let logoUrl: string | null = fields.logo_url ?? null
  if (logoFile) {
    const uploaded = await uploadLogo(logoFile)
    if (uploaded) logoUrl = uploaded
  }

  const now = new Date().toISOString()
  const payload: Record<string, any> = {
    id: crypto.randomUUID(),
    tenant_id:
      resolveTenantId(),
    name,
    slug,
    logo_url: logoUrl,
    description: fields.description ?? null,
    is_active: fields.is_active !== false,
    sort_order: Number(fields.sort_order ?? 0),
    created_at: now,
    updated_at: now,
  }

  try {
    const created = await repo.create("commerce_brands", payload)
    revalidateShop()
    return NextResponse.json({ brand: created })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Create failed: ${msg}` }, { status: 502 })
  }
}

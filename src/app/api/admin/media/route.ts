import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { requireModuleApi } from "@/lib/admin/gate";
import { resolveTenantId } from "@/lib/admin-api"
import { withPg } from "@/lib/crm/enterprise"
import { supabaseConfig, supabaseReady } from "@/lib/repo"
import { listLibraryMedia } from "@/lib/media/library"

// ============================================================================
// /api/admin/media — canonical server-side image upload proxy + the media
// library faces.
//
//   POST  multipart/form-data:
//           file   (required, image/*, <= 10 MB)
//           path   (optional sub-folder, default "products")
//         Returns { url, path }.
//   GET   ?prefix=<folder> — list the cms-media bucket (blob storage):
//         the folder list plus the objects under the prefix (name, size,
//         updated_at, public URL).
//   GET   ?view=library[&q=] — the ONE shared media library chain
//         (BL-13, lib/media/library.ts): the governed listing-media
//         records (seller_listing_media, with moderation state) and the
//         storefront catalog-media records (commerce_product_media) —
//         the same records the seller portal's media surface reads. The
//         library face (/admin/media) renders both faces: bucket blobs
//         above, library records below.
//   DELETE { path } — remove one object from cms-media.
//
// Used by every admin page that needs a media URL (products, brands,
// categories' hero_image, etc.) so the browser anon key is never used for
// uploads — the service-role key is the only credential involved.
// ============================================================================

const MEDIA_BUCKET = "cms-media"

function sbHeaders(extra?: Record<string, string>): Record<string, string> {
  const k = supabaseConfig.key as string
  return { apikey: k, Authorization: "Bearer " + k, ...(extra ?? {}) }
}

type StorageEntry = {
  name: string
  id: string | null
  metadata?: { size?: number; mimetype?: string } | null
  updated_at?: string | null
  created_at?: string | null
}

async function storageList(prefix: string, limit = 200): Promise<StorageEntry[]> {
  const res = await fetch(`${supabaseConfig.url}/storage/v1/object/list/${MEDIA_BUCKET}`, {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      prefix,
      limit,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    }),
  })
  if (!res.ok) throw new Error(`Storage list failed (${res.status})`)
  const rows = (await res.json().catch(() => [])) as StorageEntry[]
  return Array.isArray(rows) ? rows : []
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("products_services", "read")
  if (gate) return gate

  // The shared library chain (records) — BL-13.
  if (req.nextUrl.searchParams.get("view") === "library") {
    const tenant = await resolveTenantId(req)
    if (!tenant) {
      return NextResponse.json({ error: "Tenant could not be resolved." }, { status: 400 })
    }
    const q = req.nextUrl.searchParams.get("q") || undefined
    const library = await withPg((c) => listLibraryMedia(c, tenant, { q }))
    if (!library) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    return NextResponse.json({ library })
  }

  if (!supabaseReady) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 })
  }
  const prefix = String(req.nextUrl.searchParams.get("prefix") || "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9_/-]+/g, "")
  try {
    // Root listing gives the folders; the prefix listing gives its files.
    const root = prefix ? null : await storageList("")
    const folders = (root ?? [])
      .filter((e) => e.id === null)
      .map((e) => e.name)
    const entries = await storageList(prefix)
    const items = entries
      .filter((e) => e.id !== null)
      .map((e) => {
        const path = prefix ? `${prefix}/${e.name}` : e.name
        return {
          path,
          name: e.name,
          size: e.metadata?.size ?? null,
          mimetype: e.metadata?.mimetype ?? null,
          updated_at: e.updated_at ?? e.created_at ?? null,
          url: `${supabaseConfig.url}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`,
        }
      })
    const subfolders = entries.filter((e) => e.id === null).map((e) => e.name)
    // G1 media bridge: the library's second store — seller listing media
    // (public.seller_listing_media, the governed rows behind seller
    // listings) — surfaced alongside the bucket on the root listing,
    // source-tagged, so the admin library reaches BOTH stores from one
    // face. Read-side bridge: moderation decisions stay with the
    // photo-moderation desk that owns moderation_status.
    let sellerMedia: Record<string, unknown>[] = []
    let sellerMediaCounts: Record<string, number> = {}
    if (!prefix) {
      const tenant = resolveTenantId(req)
      const bridged = await withPg(async (c) => {
        const { rows } = await c.query(
          `SELECT m.id::text AS id, m.listing_id::text AS listing_id,
                  l.title AS listing_title, s.display_name AS seller_name,
                  m.url, m.alt_text, m.is_primary, m.moderation_status, m.created_at
             FROM public.seller_listing_media m
             LEFT JOIN public.seller_listings l
               ON l.id = m.listing_id AND l.tenant_id = m.tenant_id
             LEFT JOIN public.sellers s
               ON s.id = l.seller_id AND s.tenant_id = m.tenant_id
            WHERE m.tenant_id = $1
            ORDER BY m.created_at DESC LIMIT 200`,
          [tenant],
        )
        const { rows: counts } = await c.query(
          `SELECT moderation_status, count(*)::int AS n
             FROM public.seller_listing_media WHERE tenant_id = $1
            GROUP BY moderation_status`,
          [tenant],
        )
        return { rows, counts }
      }).catch(() => null)
      if (bridged) {
        sellerMedia = bridged.rows.map((r: any) => ({ ...r, source: "seller_listing_media" }))
        for (const r of bridged.counts as any[]) sellerMediaCounts[String(r.moderation_status)] = Number(r.n)
      }
    }
    return NextResponse.json({
      prefix,
      folders,
      subfolders,
      items,
      seller_media: sellerMedia,
      seller_media_counts: sellerMediaCounts,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Media list failed" }, { status: 502 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate
  if (!supabaseReady) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 })
  }
  const body = await req.json().catch(() => ({}))
  const path = String(body.path || "").replace(/^\/+/, "")
  if (!path || path.includes("..")) {
    return NextResponse.json({ error: "path is required" }, { status: 400 })
  }
  const res = await fetch(`${supabaseConfig.url}/storage/v1/object/${MEDIA_BUCKET}`, {
    method: "DELETE",
    headers: sbHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: [path] }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText)
    return NextResponse.json({ error: `Delete failed (${res.status}): ${t}` }, { status: 502 })
  }
  return NextResponse.json({ deleted: path })
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  if (!supabaseReady) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 })

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No 'file' field provided" }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Image too large (10 MB max)" }, { status: 413 })
  }
  if (!/^image\//.test(file.type || "")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 415 })
  }

  const subFolder = String(form.get("path") || "products")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "products"
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg"
  const safeName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
  const storagePath = `${subFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeName}.${ext}`

  const buf = Buffer.from(await file.arrayBuffer())
  const upRes = await fetch(`${supabaseConfig.url}/storage/v1/object/cms-media/${storagePath}`, {
    method: "POST",
    headers: {
      apikey: supabaseConfig.key!,
      Authorization: `Bearer ${supabaseConfig.key}`,
      "Content-Type": file.type || "image/jpeg",
      "x-upsert": "true",
    },
    body: buf,
  })
  if (!upRes.ok) {
    const t = await upRes.text().catch(() => upRes.statusText)
    return NextResponse.json({ error: `Upload failed (${upRes.status}): ${t}` }, { status: 502 })
  }

  const url = `${supabaseConfig.url}/storage/v1/object/public/cms-media/${storagePath}`
  revalidatePath("/shop")
  revalidatePath("/shop/[...slug]", "page")
  revalidatePath("/products/[slug]", "page")
  return NextResponse.json({ url, path: storagePath })
}
